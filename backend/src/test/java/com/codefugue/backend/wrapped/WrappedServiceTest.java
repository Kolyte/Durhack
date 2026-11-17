package com.codefugue.backend.wrapped;

import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class WrappedServiceTest {

    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final Clock NOV_2026 = Clock.fixed(Instant.parse("2026-11-16T12:00:00Z"), ZoneOffset.UTC);

    private static final String USER = """
            {"login":"octocat","name":"The Octocat","avatar_url":"https://a/u.png","followers":120,"created_at":"2015-03-01T00:00:00Z"}""";
    private static final String REPOS = """
            [
             {"name":"api","full_name":"octocat/api","language":"Go","stargazers_count":40,"forks_count":3,"size":800,"fork":false,
              "created_at":"2026-03-02T00:00:00Z","pushed_at":"2026-03-20T00:00:00Z","description":"An API"},
             {"name":"web","full_name":"octocat/web","language":"TypeScript","stargazers_count":250,"forks_count":20,"size":2000,"fork":false,
              "created_at":"2024-01-01T00:00:00Z","pushed_at":"2026-10-01T00:00:00Z","description":"The site"},
             {"name":"cli","full_name":"octocat/cli","language":"Go","stargazers_count":5,"forks_count":0,"size":100,"fork":false,
              "created_at":"2022-01-01T00:00:00Z","pushed_at":"2026-03-05T00:00:00Z"},
             {"name":"someone-elses","full_name":"octocat/someone-elses","language":"Rust","stargazers_count":9999,"fork":true,
              "created_at":"2026-01-01T00:00:00Z","pushed_at":"2026-01-01T00:00:00Z"}
            ]""";

    private static GitHubApi fake(AtomicInteger calls) {
        return path -> {
            calls.incrementAndGet();
            if (path.equals("/users/octocat")) return JSON.readTree(USER);
            if (path.startsWith("/users/octocat/repos")) return JSON.readTree(REPOS);
            throw new GitHubApi.GitHubException(404, "not found");
        };
    }

    @Test
    @SuppressWarnings("unchecked")
    void summarisesPublicReposIntoAYearInSound() throws Exception {
        Map<String, Object> w = new WrappedService(fake(new AtomicInteger()), NOV_2026).wrap("octocat");

        assertEquals(2026, w.get("year"));
        assertEquals(3, w.get("repos"), "forks are not your own music");
        assertEquals(295L, w.get("stars"));
        assertEquals(11, w.get("memberYears"));
        assertEquals(3, w.get("activeThisYear"));
        assertEquals(1, w.get("newThisYear"));
        assertEquals("March", w.get("busiestMonth"));

        List<Map<String, Object>> langs = (List<Map<String, Object>>) w.get("languages");
        assertEquals("Go", langs.get(0).get("name"));
        assertEquals(67L, langs.get(0).get("share"));
        assertEquals("Minimal techno", w.get("genre"));
        assertEquals("techno", w.get("preset"));

        assertEquals("octocat/web", ((Map<String, Object>) w.get("topRepo")).get("fullName"));
        assertEquals("octocat/web", ((Map<String, Object>) w.get("latestRepo")).get("fullName"));
        int score = (int) w.get("score");
        assertTrue(score > 0 && score <= 100);
        assertFalse(((Map<String, String>) w.get("persona")).get("title").isBlank());
    }

    @Test
    void cachesResultsSoSharedLinksDontBurnTheApiQuota() throws Exception {
        AtomicInteger calls = new AtomicInteger();
        WrappedService service = new WrappedService(fake(calls), NOV_2026);
        service.wrap("octocat");
        service.wrap("OctoCat");
        assertEquals(2, calls.get());
    }

    @Test
    void unknownUsersSurfaceGitHubsStatus() {
        WrappedService service = new WrappedService(fake(new AtomicInteger()), NOV_2026);
        assertEquals(404, assertThrows(GitHubApi.GitHubException.class, () -> service.wrap("nobody")).status());
    }

    @Test
    void rejectsLoginsThatCouldEscapeTheApiPath() {
        assertTrue(WrappedService.validLogin("octo-cat"));
        assertFalse(WrappedService.validLogin("../orgs/x"));
        assertFalse(WrappedService.validLogin("a?b=c"));
        assertFalse(WrappedService.validLogin(""));
    }

    @Test
    void personaAndScoreScaleWithTheProfile() {
        assertEquals("The Headliner", WrappedService.persona(10, 5000, 2, 3, 2).get("title"));
        assertEquals("The Rising Star", WrappedService.persona(2, 0, 1, 1, 0).get("title"));
        assertTrue(WrappedService.score(100000, 200, 10, 30, 50000) <= 100);
        assertTrue(WrappedService.score(0, 1, 1, 0, 0) >= 1);
    }
}
