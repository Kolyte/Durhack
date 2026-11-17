package com.codefugue.backend.wrapped;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.net.ProxySelector;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;

/** GitHub REST over the JDK HTTP client, with GITHUB_TOKEN when set (5,000 requests/hour instead of 60). */
@Component
public class HttpGitHubApi implements GitHubApi {

    private final HttpClient http = HttpClient.newBuilder()
            .followRedirects(HttpClient.Redirect.NORMAL)
            .proxy(ProxySelector.getDefault())
            .connectTimeout(Duration.ofSeconds(10))
            .build();
    private final JsonMapper mapper = JsonMapper.builder().build();
    private final String token;

    public HttpGitHubApi(@Value("${GITHUB_TOKEN:}") String token) {
        this.token = token.trim();
    }

    @Override
    public JsonNode get(String path) throws Exception {
        return page(path, null).body();
    }

    @Override
    public Page page(String path, String userToken) throws Exception {
        HttpRequest.Builder req = HttpRequest.newBuilder(URI.create("https://api.github.com" + path))
                .header("User-Agent", "Sonyx")
                .header("Accept", "application/vnd.github+json")
                .timeout(Duration.ofSeconds(15));
        String auth = userToken != null && !userToken.isBlank() ? userToken : token;
        if (!auth.isEmpty()) req.header("Authorization", "Bearer " + auth);
        HttpResponse<String> res = http.send(req.build(), HttpResponse.BodyHandlers.ofString());
        if (res.statusCode() >= 400) throw new GitHubException(res.statusCode(), "GitHub HTTP " + res.statusCode());
        return new Page(mapper.readTree(res.body()), res.headers().firstValue("Link").orElse(null));
    }
}
