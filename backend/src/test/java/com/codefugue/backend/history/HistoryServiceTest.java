package com.codefugue.backend.history;

import com.codefugue.backend.wrapped.GitHubApi;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;

class HistoryServiceTest {

    private static final JsonMapper JSON = JsonMapper.builder().build();

    @Test
    void samplesCommitsEvenlyOldestFirst() {
        assertEquals(List.of(100, 67, 34, 1), HistoryService.samplePages(100, 4));
        assertEquals(List.of(3, 2, 1), HistoryService.samplePages(3, 12));
        assertEquals(List.of(1), HistoryService.samplePages(1, 12));
    }

    @Test
    void readsTheCommitCountFromTheLinkHeader() {
        String link = "<https://api.github.com/repositories/1/commits?sha=main&per_page=1&page=2>; rel=\"next\", "
                + "<https://api.github.com/repositories/1/commits?sha=main&per_page=1&page=4821>; rel=\"last\"";
        assertEquals(4821, HistoryService.lastPage(link));
        assertEquals(1, HistoryService.lastPage(null));
    }

    @Test
    @SuppressWarnings("unchecked")
    void reportsEachFilesSizeAtEachPointInTime() throws Exception {
        // Three commits: a.js is added first, b.js later, a.js grows.
        Map<Integer, String> trees = Map.of(
                3, "{\"tree\":[{\"type\":\"blob\",\"path\":\"a.js\",\"size\":100}]}",
                2, "{\"tree\":[{\"type\":\"blob\",\"path\":\"a.js\",\"size\":150},{\"type\":\"blob\",\"path\":\"b.js\",\"size\":40}]}",
                1, "{\"tree\":[{\"type\":\"blob\",\"path\":\"a.js\",\"size\":300},{\"type\":\"blob\",\"path\":\"b.js\",\"size\":90},{\"type\":\"tree\",\"path\":\"src\"}]}");
        GitHubApi fake = new GitHubApi() {
            @Override
            public tools.jackson.databind.JsonNode get(String path) {
                throw new UnsupportedOperationException();
            }

            @Override
            public Page page(String path, String token) throws Exception {
                if (path.equals("/repos/o/r")) return new Page(JSON.readTree("{\"default_branch\":\"main\"}"), null);
                if (path.endsWith("per_page=1")) return new Page(JSON.readTree("[]"), "<x?page=3>; rel=\"last\"");
                if (path.contains("/commits?")) {
                    int page = Integer.parseInt(path.replaceAll(".*page=", ""));
                    return new Page(JSON.readTree("[{\"sha\":\"s" + page + "\",\"commit\":{\"message\":\"Commit " + page + "\\nbody\",\"tree\":{\"sha\":\"t" + page + "\"},\"committer\":{\"date\":\"2020-0" + (4 - page) + "-01T00:00:00Z\"}}}]"), null);
                }
                int page = Integer.parseInt(path.replaceAll(".*/git/trees/t(\\d+).*", "$1"));
                return new Page(JSON.readTree(trees.get(page)), null);
            }
        };
        Map<String, Object> out = new HistoryService(fake).timeline("o", "r", List.of("a.js", "b.js", "c.js"), 12, null);
        assertEquals(3, out.get("totalCommits"));
        List<Map<String, Object>> snaps = (List<Map<String, Object>>) out.get("snapshots");
        assertEquals(List.of(100, -1, -1), snaps.get(0).get("sizes"));
        assertEquals(List.of(150, 40, -1), snaps.get(1).get("sizes"));
        assertEquals(List.of(300, 90, -1), snaps.get(2).get("sizes"));
        assertEquals("Commit 3", snaps.get(0).get("message"));
        assertEquals("2020-01-01T00:00:00Z", snaps.get(0).get("date"));
    }
}
