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
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.Executors;
import java.util.concurrent.Semaphore;
import java.util.function.Consumer;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class GitHubAnalyzerService {

    private static final int MAX_FILES = 45;
    private static final int MAX_CONCURRENT_FETCHES = 12;

    private static final Set<String> CODE_EXTS = Set.of(
            ".java", ".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs", ".cpp", ".c", ".cs", ".kt"
    );
    private static final Pattern COMPLEXITY_PATTERN =
            Pattern.compile("\\b(if|else|for|while|switch|catch)\\b|&&|\\|\\|");
    private static final Pattern CONCURRENCY_PATTERN =
            Pattern.compile("\\b(async|await|CompletableFuture|Thread|WebSocket|Flux|Mono|Promise|go\\s+func)\\b");
    private static final Pattern IMPORT_PATTERN =
            Pattern.compile("(?:import|from|require)\\s*\\(?\\s*[\"']?([\\w./-]+)[\"']?");

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
            int stargazers = meta.path("stargazers_count").asInt(10);
            int bpm = Math.clamp(92 + (int) (Math.log10(stargazers + 1) * 10), 85, 134);

            JsonNode treeRoot = fetchJson(
                    "https://api.github.com/repos/" + owner + "/" + repo + "/git/trees/" + branch + "?recursive=1");

            List<JsonNode> candidates = new ArrayList<>();
            for (JsonNode item : treeRoot.path("tree")) {
                if (!"blob".equals(item.path("type").asString())) continue;
                String path = item.path("path").asString();
                if (isIgnored(path) || !hasCodeExt(path)) continue;
                candidates.add(item);
            }

            candidates.sort((a, b) -> Integer.compare(b.path("size").asInt(), a.path("size").asInt()));
            List<JsonNode> selected = candidates.stream().limit(MAX_FILES).toList();

            // Lay out files as radial clusters, one hub per top-level directory (golden-angle spread).
            Map<String, Integer> dirIndex = new LinkedHashMap<>();
            List<FileNode> initialNodes = new ArrayList<>();
            for (JsonNode item : selected) {
                String path = item.path("path").asString();
                String dir = path.contains("/") ? path.substring(0, path.indexOf('/')) : "root";
                int hubIdx = dirIndex.computeIfAbsent(dir, k -> dirIndex.size());
                int depth = (int) path.chars().filter(ch -> ch == '/').count();

                double hubAngle = hubIdx * 2.39996;
                double hubRadius = 4.0 + (hubIdx % 4) * 2.5;
                double localAngle = initialNodes.size() * 1.7;
                double localSpread = 1.2 + depth * 0.45;

                double x = Math.cos(hubAngle) * hubRadius + Math.cos(localAngle) * localSpread;
                double z = Math.sin(hubAngle) * hubRadius + Math.sin(localAngle) * localSpread;
                double y = (depth - 1.5) * 1.4;

                int approxLoc = Math.max(15, item.path("size").asInt() / 35);
                initialNodes.add(new FileNode(path, path, dir, depth, x, y, z, approxLoc, 1, 0, false));
            }

            emit.accept(new ComposeEvent.RepoTree(owner + "/" + repo, bpm, initialNodes));

            Semaphore limiter = new Semaphore(MAX_CONCURRENT_FETCHES);
            try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
                for (FileNode node : initialNodes) {
                    executor.submit(() -> {
                        limiter.acquire();
                        try {
                            String rawUrl = "https://raw.githubusercontent.com/" + owner + "/" + repo + "/"
                                    + branch + "/" + node.path();
                            String code = fetchText(rawUrl);
                            FileNode enriched = scanFile(node, code);
                            emit.accept(new ComposeEvent.NodeMetrics(enriched));

                            for (String targetId : resolveImports(code, initialNodes, node.id())) {
                                emit.accept(new ComposeEvent.EdgeFound(node.id(), targetId));
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

    FileNode scanFile(FileNode base, String code) {
        int loc = (int) code.lines().filter(l -> !l.isBlank()).count();
        int complexity = 1 + countMatches(COMPLEXITY_PATTERN, code);
        int concurrency = countMatches(CONCURRENCY_PATTERN, code);
        return new FileNode(
                base.id(), base.path(), base.directory(), base.depth(),
                base.x(), base.y(), base.z(), Math.max(10, loc), complexity, concurrency, true
        );
    }

    List<String> resolveImports(String code, List<FileNode> allNodes, String selfId) {
        List<String> targets = new ArrayList<>();
        Matcher m = IMPORT_PATTERN.matcher(code);
        while (m.find() && targets.size() < 4) {
            String token = m.group(1);
            String leaf = token.contains("/") ? token.substring(token.lastIndexOf('/') + 1)
                    : token.contains(".") ? token.substring(token.lastIndexOf('.') + 1) : token;
            if (leaf.length() < 3) continue;
            for (FileNode candidate : allNodes) {
                if (!candidate.id().equals(selfId) && candidate.path().contains("/" + leaf)
                        && !targets.contains(candidate.id())) {
                    targets.add(candidate.id());
                    break;
                }
            }
        }
        return targets;
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
                .header("User-Agent", "CodeFugue-DurHack");
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
        return p.contains("node_modules/") || p.contains(".min.") || p.contains("dist/") || p.contains("build/");
    }

    private boolean hasCodeExt(String p) {
        int dot = p.lastIndexOf('.');
        return dot >= 0 && CODE_EXTS.contains(p.substring(dot).toLowerCase());
    }
}
