package com.codefugue.backend.history;

import com.codefugue.backend.wrapped.GitHubApi;
import org.springframework.stereotype.Service;
import tools.jackson.databind.JsonNode;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeSet;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Time-lapse: how a repository's files grew over its history. Samples commits evenly across the default
 * branch (oldest → newest) and reports, for each sample, the size of every requested file (−1 = not there yet).
 * About 2 + 2×points GitHub requests; public results are cached for six hours.
 */
@Service
public class HistoryService {

    public static final int MAX_PATHS = 400;
    private static final long CACHE_MS = 6 * 60 * 60 * 1000;
    private static final Pattern LAST_PAGE = Pattern.compile("[?&]page=(\\d+)>;\\s*rel=\"last\"");

    private final GitHubApi github;
    private final Map<String, Map.Entry<Long, Map<String, Object>>> cache = new ConcurrentHashMap<>();

    public HistoryService(GitHubApi github) {
        this.github = github;
    }

    /** Commit pages to sample (1 = newest … total = oldest), returned oldest first, without duplicates. */
    static List<Integer> samplePages(int total, int points) {
        TreeSet<Integer> pages = new TreeSet<>(java.util.Comparator.reverseOrder());
        int n = Math.max(1, Math.min(points, total));
        for (int j = 0; j < n; j++) {
            pages.add((int) Math.round(total - (double) j * (total - 1) / Math.max(1, n - 1)));
        }
        return new ArrayList<>(pages);
    }

    static int lastPage(String link) {
        if (link == null) return 1;
        Matcher m = LAST_PAGE.matcher(link);
        return m.find() ? Integer.parseInt(m.group(1)) : 1;
    }

    public Map<String, Object> timeline(String owner, String repo, List<String> paths, int points, String userToken) throws Exception {
        String key = (owner + "/" + repo).toLowerCase() + "#" + points + "#" + paths.hashCode();
        if (userToken == null) {
            var hit = cache.get(key);
            if (hit != null && System.currentTimeMillis() - hit.getKey() < CACHE_MS) return hit.getValue();
        }
        String base = "/repos/" + owner + "/" + repo;
        String branch = github.page(base, userToken).body().path("default_branch").asString("main");
        String commits = base + "/commits?sha=" + URLEncoder.encode(branch, StandardCharsets.UTF_8) + "&per_page=1";
        int total = lastPage(github.page(commits, userToken).link());

        List<Integer> pages = samplePages(total, points);
        List<Map<String, Object>> snapshots = new ArrayList<>();
        try (var pool = Executors.newVirtualThreadPerTaskExecutor()) {
            List<Future<Map<String, Object>>> jobs = new ArrayList<>();
            for (int page : pages) {
                jobs.add(pool.submit(() -> snapshot(base, commits + "&page=" + page, paths, userToken)));
            }
            for (Future<Map<String, Object>> f : jobs) {
                Map<String, Object> s = f.get();
                if (s != null) snapshots.add(s);
            }
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("repo", owner + "/" + repo);
        out.put("branch", branch);
        out.put("totalCommits", total);
        out.put("paths", paths);
        out.put("snapshots", snapshots);
        if (userToken == null) {
            cache.put(key, Map.entry(System.currentTimeMillis(), out));
            if (cache.size() > 500) cache.clear();
        }
        return out;
    }

    private Map<String, Object> snapshot(String base, String commitPage, List<String> paths, String token) throws Exception {
        JsonNode list = github.page(commitPage, token).body();
        if (!list.isArray() || list.isEmpty()) return null;
        JsonNode c = list.get(0);
        String treeSha = c.path("commit").path("tree").path("sha").asString("");
        JsonNode tree = github.page(base + "/git/trees/" + treeSha + "?recursive=1", token).body();
        Map<String, Integer> sizes = new HashMap<>();
        for (JsonNode item : tree.path("tree")) {
            if ("blob".equals(item.path("type").asString())) sizes.put(item.path("path").asString(), item.path("size").asInt());
        }
        List<Integer> aligned = paths.stream().map(p -> sizes.getOrDefault(p, -1)).toList();
        String message = c.path("commit").path("message").asString("");
        int nl = message.indexOf('\n');
        Map<String, Object> s = new LinkedHashMap<>();
        s.put("sha", c.path("sha").asString(""));
        s.put("date", c.path("commit").path("committer").path("date").asString(""));
        s.put("message", (nl >= 0 ? message.substring(0, nl) : message).strip());
        s.put("files", sizes.size());
        s.put("sizes", aligned);
        return s;
    }
}
