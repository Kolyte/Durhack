package com.codefugue.backend.compose;

import org.springframework.stereotype.Service;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.net.ProxySelector;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.Executors;
import java.util.concurrent.Semaphore;
import java.util.function.Consumer;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class GitHubAnalyzerService {

    static final int MAX_CODE_FILES = 48;
    static final int MAX_CONFIG_FILES = 8;
    static final int MAX_DOC_FILES = 6;
    private static final int MAX_CONCURRENT_FETCHES = 12;
    private static final int MAX_EDGES_PER_FILE = 6;

    private static final Set<String> CODE_EXTS = Set.of(
            ".java", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".py", ".go", ".rs", ".cpp", ".cc", ".h", ".hpp",
            ".c", ".cs", ".kt", ".swift", ".rb", ".php", ".scala"
    );
    private static final Set<String> CONFIG_EXTS = Set.of(
            ".json", ".yml", ".yaml", ".toml", ".xml", ".gradle", ".properties", ".ini", ".cfg"
    );
    private static final Set<String> CONFIG_NAMES = Set.of(
            "dockerfile", "makefile", "pom.xml", "package.json", "build.gradle", "cargo.toml", "go.mod",
            "pyproject.toml", "setup.py", "tsconfig.json", "requirements.txt", ".eslintrc", ".babelrc"
    );
    private static final Set<String> LOCK_FILES = Set.of(
            "package-lock.json", "yarn.lock", "pnpm-lock.yaml", "cargo.lock", "poetry.lock", "go.sum", "composer.lock"
    );
    private static final Set<String> DOC_EXTS = Set.of(".md", ".mdx", ".rst", ".adoc");

    private static final Pattern COMPLEXITY_PATTERN =
            Pattern.compile("\\b(if|else|for|while|switch|case|catch)\\b|&&|\\|\\||\\?\\s*[^:?]+:");
    private static final Pattern CONCURRENCY_PATTERN =
            Pattern.compile("\\b(async|await|CompletableFuture|Thread|Executor\\w*|synchronized|WebSocket|Flux|Mono"
                    + "|Promise|goroutine|go\\s+func|chan|Mutex|tokio|asyncio|threading|Worker)\\b");
    /** Captures the imported module/path in JS/TS, Python, Java/Kotlin, Go, Rust, C/C++ and C#. */
    private static final Pattern IMPORT_PATTERN = Pattern.compile(
            "(?m)^\\s*(?:import\\s+(?:static\\s+)?(?:[\\w*{}\\s,]+\\s+from\\s+)?[\"']?([\\w./@-]+)"
                    + "|from\\s+([\\w.]+)\\s+import"
                    + "|#include\\s+[\"<]([\\w./-]+)"
                    + "|use\\s+([\\w:]+)"
                    + "|using\\s+([\\w.]+);)"
                    + "|require\\(\\s*[\"']([\\w./@-]+)[\"']\\s*\\)");

    private final HttpClient http = HttpClient.newBuilder()
            .followRedirects(HttpClient.Redirect.NORMAL)
            .proxy(ProxySelector.getDefault()) // honour -Dhttps.proxyHost etc. if set
            .build();
    private final JsonMapper mapper = JsonMapper.builder().build();
    private final String githubToken = System.getenv("GITHUB_TOKEN");

    public void analyzeAndStream(String repoUrl, Consumer<ComposeEvent> emit) {
        try {
            String[] parts = parseOwnerRepo(repoUrl);
            String owner = parts[0], repo = parts[1];

            JsonNode meta = fetchJson("https://api.github.com/repos/" + owner + "/" + repo);
            String branch = meta.path("default_branch").asString("main");
            int stars = meta.path("stargazers_count").asInt(0);
            int bpm = Math.clamp(76 + (int) (Math.log10(stars + 1) * 4), 76, 96);

            JsonNode treeRoot = fetchJson(
                    "https://api.github.com/repos/" + owner + "/" + repo + "/git/trees/" + branch + "?recursive=1");

            List<JsonNode> code = new ArrayList<>(), config = new ArrayList<>(), docs = new ArrayList<>();
            for (JsonNode item : treeRoot.path("tree")) {
                if (!"blob".equals(item.path("type").asString())) continue;
                String path = item.path("path").asString();
                if (isIgnored(path)) continue;
                switch (classifyRole(path)) {
                    case "config" -> config.add(item);
                    case "docs" -> docs.add(item);
                    case "source", "test" -> code.add(item);
                    default -> { }
                }
            }

            Comparator<JsonNode> bySizeDesc = Comparator.comparingInt((JsonNode n) -> n.path("size").asInt()).reversed();
            code.sort(bySizeDesc);
            // Shallow config/doc files first (root README, package.json…), then the largest.
            Comparator<JsonNode> byShallowThenSize = Comparator
                    .comparingLong((JsonNode n) -> n.path("path").asString().chars().filter(c -> c == '/').count())
                    .thenComparing(bySizeDesc);
            config.sort(byShallowThenSize);
            docs.sort(byShallowThenSize);

            List<JsonNode> selected = new ArrayList<>();
            selected.addAll(code.stream().limit(MAX_CODE_FILES).toList());
            selected.addAll(config.stream().limit(MAX_CONFIG_FILES).toList());
            selected.addAll(docs.stream().limit(MAX_DOC_FILES).toList());

            List<FileNode> initialNodes = new ArrayList<>();
            for (JsonNode item : selected) {
                String path = item.path("path").asString();
                String dir = path.contains("/") ? path.substring(0, path.lastIndexOf('/')) : "";
                int depth = (int) path.chars().filter(ch -> ch == '/').count();
                int approxLoc = Math.max(5, item.path("size").asInt() / 35);
                initialNodes.add(new FileNode(path, path, dir, depth, approxLoc, 1, 0, 0, classifyRole(path), false));
            }

            int sampledCode = Math.min(code.size(), MAX_CODE_FILES);
            emit.accept(new ComposeEvent.RepoTree(owner + "/" + repo, branch, bpm, stars, code.size(), sampledCode,
                    treeRoot.path("truncated").asBoolean(false), initialNodes));

            Semaphore limiter = new Semaphore(MAX_CONCURRENT_FETCHES);
            try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
                for (FileNode node : initialNodes) {
                    executor.submit(() -> {
                        limiter.acquire();
                        try {
                            String rawUrl = "https://raw.githubusercontent.com/" + owner + "/" + repo + "/"
                                    + branch + "/" + node.path();
                            String text = fetchText(rawUrl);
                            emit.accept(new ComposeEvent.NodeMetrics(scanFile(node, text)));

                            if (isCode(node)) {
                                for (String targetId : resolveImports(text, initialNodes, node.id())) {
                                    emit.accept(new ComposeEvent.EdgeFound(node.id(), targetId));
                                }
                            }
                        } catch (Exception ignored) {
                            // One unreadable file shouldn't stop the composition.
                        } finally {
                            limiter.release();
                        }
                        return null;
                    });
                }
            }

            emit.accept(new ComposeEvent.CompositionReady(initialNodes.size()));
        } catch (Exception e) {
            emit.accept(new ComposeEvent.ErrorEvent("Failed to analyze repo: " + e.getMessage()));
        }
    }

    FileNode scanFile(FileNode base, String text) {
        int loc = (int) text.lines().filter(l -> !l.isBlank()).count();
        boolean code = isCode(base);
        int complexity = code ? 1 + countMatches(COMPLEXITY_PATTERN, text) : 1;
        int concurrency = code ? countMatches(CONCURRENCY_PATTERN, text) : 0;
        int imports = code ? countMatches(IMPORT_PATTERN, text) : 0;
        return new FileNode(base.id(), base.path(), base.directory(), base.depth(),
                Math.max(1, loc), complexity, concurrency, imports, base.role(), true);
    }

    /** Resolves import statements to other sampled files by matching the imported module's leaf name. */
    List<String> resolveImports(String code, List<FileNode> allNodes, String selfId) {
        List<String> targets = new ArrayList<>();
        Matcher m = IMPORT_PATTERN.matcher(code);
        while (m.find() && targets.size() < MAX_EDGES_PER_FILE) {
            String token = firstGroup(m);
            if (token == null) continue;
            String leaf = leafName(token);
            if (leaf.length() < 2) continue;
            for (FileNode candidate : allNodes) {
                if (candidate.id().equals(selfId) || !isCode(candidate) || targets.contains(candidate.id())) continue;
                if (matchesLeaf(candidate.path(), leaf)) {
                    targets.add(candidate.id());
                    break;
                }
            }
        }
        return targets;
    }

    private static String firstGroup(Matcher m) {
        for (int g = 1; g <= m.groupCount(); g++) {
            if (m.group(g) != null) return m.group(g);
        }
        return null;
    }

    /** "./router" → "router", "com.foo.UserService" → "UserService", "crate::net::conn" → "conn". */
    static String leafName(String token) {
        String t = token.replace("::", "/").replaceAll("[/.]+$", "");
        // Strip a file extension on path-style imports ("./a/b.js", "util.h").
        if (t.contains("/") || t.startsWith(".")) {
            t = t.replaceAll("\\.(js|jsx|ts|tsx|mjs|h|hpp)$", "");
            return t.substring(t.lastIndexOf('/') + 1);
        }
        t = t.replaceAll("\\.(h|hpp)$", "");
        return t.contains(".") ? t.substring(t.lastIndexOf('.') + 1) : t;
    }

    /** True if the file's base name is the leaf, or it is an index/__init__/mod file inside a folder named leaf. */
    static boolean matchesLeaf(String path, String leaf) {
        String file = path.substring(path.lastIndexOf('/') + 1);
        int dot = file.lastIndexOf('.');
        String base = dot > 0 ? file.substring(0, dot) : file;
        if (base.equals(leaf)) return true;
        if (base.equals("index") || base.equals("__init__") || base.equals("mod")) {
            String parent = path.contains("/") ? path.substring(0, path.lastIndexOf('/')) : "";
            return parent.endsWith("/" + leaf) || parent.equals(leaf);
        }
        return false;
    }

    static String classifyRole(String path) {
        String lower = path.toLowerCase(Locale.ROOT);
        String file = lower.substring(lower.lastIndexOf('/') + 1);
        String ext = file.contains(".") ? file.substring(file.lastIndexOf('.')) : "";
        if (LOCK_FILES.contains(file)) return "ignored";
        if (DOC_EXTS.contains(ext) || file.equals("license")) return "docs";
        if (CODE_EXTS.contains(ext)) {
            boolean test = lower.contains("/test/") || lower.contains("/tests/") || lower.startsWith("test/")
                    || lower.startsWith("tests/") || lower.contains("__tests__") || lower.contains("/spec/")
                    || file.contains(".test.") || file.contains(".spec.") || file.startsWith("test_")
                    || file.endsWith("_test.go") || file.matches(".*tests?\\.(java|kt|cs|scala)$");
            if (test) return "test";
            if (file.startsWith("setup.") || file.contains(".config.")) return "config";
            return "source";
        }
        if (CONFIG_NAMES.contains(file) || CONFIG_EXTS.contains(ext)) return "config";
        return "ignored";
    }

    private static boolean isCode(FileNode n) {
        return n.role().equals("source") || n.role().equals("test");
    }

    private int countMatches(Pattern p, String text) {
        int count = 0;
        Matcher m = p.matcher(text);
        while (m.find()) count++;
        return count;
    }

    private JsonNode fetchJson(String url) throws Exception {
        return mapper.readTree(fetchText(url));
    }

    private String fetchText(String url) throws Exception {
        HttpRequest.Builder req = HttpRequest.newBuilder(URI.create(url))
                .header("User-Agent", "Sonyx");
        if (githubToken != null && !githubToken.isBlank() && url.contains("api.github.com")) {
            req.header("Authorization", "Bearer " + githubToken);
        }
        HttpResponse<String> res = http.send(req.build(), HttpResponse.BodyHandlers.ofString());
        if (res.statusCode() >= 400) {
            throw new RuntimeException("GitHub HTTP " + res.statusCode() + " for " + url);
        }
        return res.body();
    }

    static String[] parseOwnerRepo(String input) {
        String cleaned = input.trim()
                .replaceAll("^https?://(www\\.)?github\\.com/", "")
                .replaceAll("\\.git$", "")
                .replaceAll("/+$", "");
        String[] segs = cleaned.split("/");
        if (segs.length < 2) throw new IllegalArgumentException("Use format https://github.com/owner/repo");
        return new String[]{segs[0], segs[1]};
    }

    private boolean isIgnored(String p) {
        return p.contains("node_modules/") || p.contains(".min.") || p.contains("dist/") || p.contains("build/")
                || p.contains("vendor/") || p.contains("third_party/") || p.startsWith(".github/");
    }
}
