package com.codefugue.backend.explain;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.net.ProxySelector;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayDeque;
import java.util.Arrays;
import java.util.Deque;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Explains a file with Gemini. The API key stays on the server (env var GEMINI_API_KEY); the browser
 * only ever talks to our /api/explain endpoint.
 *
 * Quota protection (the free tier allows only a limited number of requests per day):
 *  - answers are cached per repo/branch/file/model, so clicking a building twice costs nothing;
 *  - a global limit of requests per minute stops one visitor from draining the quota.
 */
@Service
public class GeminiExplainService {

    /** Minimal HTTP abstraction so tests can run without network access or a real key. */
    interface Http {
        Result get(String url) throws Exception;

        default Result get(String url, Map<String, String> headers) throws Exception {
            return get(url);
        }

        Result postJson(String url, Map<String, String> headers, String body) throws Exception;

        record Result(int status, String body) {}
    }

    private static final org.slf4j.Logger LOG = org.slf4j.LoggerFactory.getLogger(GeminiExplainService.class);
    private static final int CACHE_SIZE = 500;

    private final String apiKey;
    private final String model;
    private final String baseUrl;
    private final int perMinute;
    private final Http http;
    private final JsonMapper mapper = JsonMapper.builder().build();
    private final Deque<Long> recentCalls = new ArrayDeque<>();
    private final Map<String, ExplainResponse> cache = new LinkedHashMap<>(64, 0.75f, true) {
        @Override
        protected boolean removeEldestEntry(Map.Entry<String, ExplainResponse> eldest) {
            return size() > CACHE_SIZE;
        }
    };

    @Autowired
    public GeminiExplainService(
            @Value("${GEMINI_API_KEY:}") String apiKey,
            @Value("${GEMINI_MODEL:gemini-3.5-flash-lite}") String model,
            @Value("${GEMINI_BASE_URL:https://generativelanguage.googleapis.com/v1beta}") String baseUrl,
            @Value("${GEMINI_MAX_PER_MINUTE:15}") int perMinute) {
        this(apiKey, model, baseUrl, perMinute, new JdkHttp());
    }

    GeminiExplainService(String apiKey, String model, String baseUrl, int perMinute, Http http) {
        this.apiKey = apiKey == null ? "" : apiKey.trim();
        this.model = model.trim();
        this.baseUrl = baseUrl.replaceAll("/+$", "");
        this.perMinute = perMinute;
        this.http = http;
        // Logged at startup so "why is the Gemini button missing?" is answered in the backend output.
        // (Only whether a key is present, never the key itself.)
        if (enabled()) LOG.info("Gemini explanations enabled (model {})", this.model);
        else LOG.info("Gemini explanations disabled: set GEMINI_API_KEY (environment variable or backend/.env)");
    }

    public boolean enabled() {
        return !apiKey.isEmpty();
    }

    public String model() {
        return model;
    }

    public ExplainResponse explain(ExplainRequest req) {
        return explain(req, null);
    }

    /**
     * @param githubToken the user's token when the file may be in a private repo. Such answers are never cached,
     *                    because the cache is shared between users.
     */
    public ExplainResponse explain(ExplainRequest req, String githubToken) {
        GeminiPrompt.validate(req);
        boolean shareable = githubToken == null;
        if (!enabled()) {
            throw new ExplainException(503, "not_configured", "Gemini is not configured on this server (GEMINI_API_KEY is not set)");
        }
        String key = req.owner() + "/" + req.repo() + "@" + req.branch() + ":" + req.path() + "#" + model;
        if (shareable) {
            synchronized (cache) {
                ExplainResponse hit = cache.get(key);
                if (hit != null) return new ExplainResponse(hit.purpose(), hit.details(), hit.model(), true);
            }
        }
        takeRateSlot();

        String code = fetchCode(req, githubToken);
        String body = GeminiPrompt.requestBody(mapper, GeminiPrompt.userPrompt(req, code)).toString();
        Http.Result res;
        try {
            res = http.postJson(baseUrl + "/models/" + model + ":generateContent",
                    Map.of("x-goog-api-key", apiKey, "Content-Type", "application/json"), body);
        } catch (Exception e) {
            throw new ExplainException(502, "unreachable", "Could not reach Gemini: " + e.getMessage());
        }
        if (res.status() == 429) {
            throw new ExplainException(429, "quota", "Gemini's free quota is used up for now. Try again later.");
        }
        if (res.status() == 404) {
            throw new ExplainException(502, "model_not_found",
                    "Gemini model '" + model + "' was not found. Set GEMINI_MODEL to a model listed in AI Studio.");
        }
        if (res.status() >= 400) {
            throw new ExplainException(502, "gemini_error", "Gemini error " + res.status() + ": " + errorMessage(res.body()));
        }
        ExplainResponse out = GeminiPrompt.parse(mapper, res.body(), model);
        if (shareable) {
            synchronized (cache) {
                cache.put(key, out);
            }
        }
        return out;
    }

    private String fetchCode(ExplainRequest r, String githubToken) {
        String path = Arrays.stream(r.path().split("/"))
                .map(seg -> URLEncoder.encode(seg, StandardCharsets.UTF_8).replace("+", "%20"))
                .collect(Collectors.joining("/"));
        String url = "https://raw.githubusercontent.com/" + r.owner() + "/" + r.repo() + "/" + r.branch() + "/" + path;
        try {
            Http.Result res = githubToken == null ? http.get(url) : http.get(url, Map.of("Authorization", "Bearer " + githubToken));
            if (res.status() == 404) throw new ExplainException(404, "file_not_found", "File not found on GitHub: " + r.path());
            if (res.status() >= 400) throw new ExplainException(502, "github_error", "GitHub returned " + res.status());
            return res.body();
        } catch (ExplainException e) {
            throw e;
        } catch (Exception e) {
            throw new ExplainException(502, "github_unreachable", "Could not fetch the file from GitHub: " + e.getMessage());
        }
    }

    private void takeRateSlot() {
        long now = System.currentTimeMillis();
        synchronized (recentCalls) {
            while (!recentCalls.isEmpty() && now - recentCalls.peekFirst() > 60_000) recentCalls.pollFirst();
            if (recentCalls.size() >= perMinute) {
                throw new ExplainException(429, "busy", "Too many Gemini requests right now. Try again in a minute.");
            }
            recentCalls.addLast(now);
        }
    }

    private String errorMessage(String body) {
        try {
            JsonNode msg = mapper.readTree(body).path("error").path("message");
            if (!msg.isMissingNode()) return msg.asString("");
        } catch (Exception ignored) {
            // fall through
        }
        return body.length() > 200 ? body.substring(0, 200) : body;
    }

    /** Real HTTP via the JDK client (honours proxy settings, like the GitHub analyser). */
    static final class JdkHttp implements Http {
        private final HttpClient client = HttpClient.newBuilder()
                .followRedirects(HttpClient.Redirect.NORMAL)
                .proxy(ProxySelector.getDefault())
                .connectTimeout(Duration.ofSeconds(10))
                .build();

        @Override
        public Result get(String url) throws Exception {
            return get(url, Map.of());
        }

        @Override
        public Result get(String url, Map<String, String> headers) throws Exception {
            HttpRequest.Builder b = HttpRequest.newBuilder(URI.create(url)).timeout(Duration.ofSeconds(15))
                    .header("User-Agent", "Sonyx");
            headers.forEach(b::header);
            HttpResponse<String> res = client.send(b.build(), HttpResponse.BodyHandlers.ofString());
            return new Result(res.statusCode(), res.body());
        }

        @Override
        public Result postJson(String url, Map<String, String> headers, String body) throws Exception {
            HttpRequest.Builder b = HttpRequest.newBuilder(URI.create(url)).timeout(Duration.ofSeconds(30))
                    .POST(HttpRequest.BodyPublishers.ofString(body));
            headers.forEach(b::header);
            HttpResponse<String> res = client.send(b.build(), HttpResponse.BodyHandlers.ofString());
            return new Result(res.statusCode(), res.body());
        }
    }
}
