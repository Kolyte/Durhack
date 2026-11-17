package com.codefugue.backend.explain;

import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class GeminiExplainServiceTest {

    private static final String GEMINI_OK = """
            {"candidates":[{"content":{"parts":[{"text":"{\\"purpose\\":\\"Routes requests.\\",\\"details\\":[\\"Matches paths\\",\\"Runs handlers\\"]}"}]},"finishReason":"STOP"}]}""";

    /** Fake HTTP: records calls, serves canned GitHub and Gemini responses. */
    static class FakeHttp implements GeminiExplainService.Http {
        final List<String> gets = new ArrayList<>();
        final List<String> posts = new ArrayList<>();
        final List<String> bodies = new ArrayList<>();
        final List<Map<String, String>> headers = new ArrayList<>();
        int geminiStatus = 200;
        String geminiBody = GEMINI_OK;

        @Override
        public Result get(String url) {
            gets.add(url);
            return url.contains("missing") ? new Result(404, "") : new Result(200, "module.exports = function router() {}");
        }

        @Override
        public Result postJson(String url, Map<String, String> h, String body) {
            posts.add(url);
            headers.add(h);
            bodies.add(body);
            return new Result(geminiStatus, geminiBody);
        }
    }

    private static ExplainRequest req(String path) {
        return new ExplainRequest("expressjs", "express", "master", path, "source", 120, 14, 0, 3, 5);
    }

    @Test
    void privateRepoAnswersAreNeverSharedThroughTheCache() {
        FakeHttp http = new FakeHttp();
        GeminiExplainService s = new GeminiExplainService("test-key", "gemini-test", "https://g.example/v1beta", 15, http);
        s.explain(req("lib/secret.js"), "user-token");
        s.explain(req("lib/secret.js"), "user-token");
        s.explain(req("lib/secret.js"));
        assertEquals(3, http.posts.size(), "nothing private was cached, so every call went to Gemini");
    }

    @Test
    void explainsAFileAndCachesTheAnswer() {
        FakeHttp http = new FakeHttp();
        GeminiExplainService s = new GeminiExplainService("test-key", "gemini-test", "https://g.example/v1beta", 15, http);

        ExplainResponse first = s.explain(req("lib/router/index.js"));
        assertEquals("Routes requests.", first.purpose());
        assertEquals(List.of("Matches paths", "Runs handlers"), first.details());
        assertFalse(first.cached());
        assertEquals("https://raw.githubusercontent.com/expressjs/express/master/lib/router/index.js", http.gets.get(0));
        assertEquals("https://g.example/v1beta/models/gemini-test:generateContent", http.posts.get(0));
        assertEquals("test-key", http.headers.get(0).get("x-goog-api-key"));
        assertTrue(http.bodies.get(0).contains("module.exports = function router()"));

        ExplainResponse second = s.explain(req("lib/router/index.js"));
        assertTrue(second.cached());
        assertEquals(1, http.posts.size(), "cached answer must not call Gemini again");
    }

    @Test
    void requestBodyAsksForStructuredJson() {
        JsonMapper mapper = JsonMapper.builder().build();
        JsonNode body = GeminiPrompt.requestBody(mapper, "hello");
        assertEquals("application/json", body.path("generationConfig").path("responseMimeType").asString());
        assertEquals("ARRAY", body.path("generationConfig").path("responseSchema").path("properties").path("details").path("type").asString());
        assertEquals("hello", body.path("contents").path(0).path("parts").path(0).path("text").asString());
    }

    @Test
    void notConfiguredWithoutAKey() {
        GeminiExplainService s = new GeminiExplainService("", "m", "https://g.example", 15, new FakeHttp());
        assertFalse(s.enabled());
        ExplainException e = assertThrows(ExplainException.class, () -> s.explain(req("a.js")));
        assertEquals(503, e.status());
    }

    @Test
    void mapsQuotaAndMissingModelErrors() {
        FakeHttp http = new FakeHttp();
        GeminiExplainService s = new GeminiExplainService("k", "nope", "https://g.example", 15, http);
        http.geminiStatus = 429;
        assertEquals("quota", assertThrows(ExplainException.class, () -> s.explain(req("a.js"))).reason());
        http.geminiStatus = 404;
        assertEquals("model_not_found", assertThrows(ExplainException.class, () -> s.explain(req("b.js"))).reason());
        http.geminiStatus = 400;
        http.geminiBody = "{\"error\":{\"message\":\"API key not valid\"}}";
        ExplainException e = assertThrows(ExplainException.class, () -> s.explain(req("c.js")));
        assertTrue(e.getMessage().contains("API key not valid"));
    }

    @Test
    void reportsMissingFilesAndRejectsUnsafePaths() {
        GeminiExplainService s = new GeminiExplainService("k", "m", "https://g.example", 15, new FakeHttp());
        assertEquals(404, assertThrows(ExplainException.class, () -> s.explain(req("missing.js"))).status());
        for (String bad : List.of("../secret", "/etc/passwd", "a/../../b", "x?y=1", "https://evil")) {
            assertEquals(400, assertThrows(ExplainException.class, () -> s.explain(req(bad))).status(), bad);
        }
        ExplainRequest badOwner = new ExplainRequest("evil.com/x", "r", "main", "a.js", "source", 1, 1, 0, 0, 0);
        assertEquals(400, assertThrows(ExplainException.class, () -> s.explain(badOwner)).status());
    }

    @Test
    void rateLimitsPerMinute() {
        GeminiExplainService s = new GeminiExplainService("k", "m", "https://g.example", 2, new FakeHttp());
        s.explain(req("a.js"));
        s.explain(req("b.js"));
        assertEquals("busy", assertThrows(ExplainException.class, () -> s.explain(req("c.js"))).reason());
        s.explain(req("a.js")); // cached answers don't count
    }

    @Test
    void parsesFencedJsonAndSkipsThoughtParts() {
        JsonMapper mapper = JsonMapper.builder().build();
        String fenced = """
                {"candidates":[{"content":{"parts":[{"text":"thinking...","thought":true},{"text":"```json\\n{\\"purpose\\":\\"P\\",\\"details\\":[\\"a\\"]}\\n```"}]}}]}""";
        ExplainResponse r = GeminiPrompt.parse(mapper, fenced, "m");
        assertEquals("P", r.purpose());
        assertEquals(List.of("a"), r.details());
    }
}
