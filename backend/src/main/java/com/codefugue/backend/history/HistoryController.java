package com.codefugue.backend.history;

import com.codefugue.backend.account.AccountService;
import com.codefugue.backend.account.GitHubTokens;
import com.codefugue.backend.share.RepoRef;
import com.codefugue.backend.wrapped.GitHubApi;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.security.Principal;
import java.util.List;
import java.util.Map;

@RestController
public class HistoryController {

    /** What the browser asks for: the repo, the files currently drawn, and how many points in time. */
    public record HistoryRequest(String repo, List<String> paths, Integer points, Boolean privateRepo) {
    }

    private final HistoryService history;
    private final AccountService accounts;
    private final GitHubTokens tokens;

    public HistoryController(HistoryService history, AccountService accounts, GitHubTokens tokens) {
        this.history = history;
        this.accounts = accounts;
        this.tokens = tokens;
    }

    @PostMapping("/api/history")
    public ResponseEntity<?> timeline(@RequestBody HistoryRequest body, Principal principal, HttpServletRequest http) {
        String[] parts = body.repo() == null ? new String[0] : body.repo().split("/");
        RepoRef ref = parts.length == 2 ? RepoRef.parse(parts[0], parts[1]) : null;
        List<String> paths = body.paths() == null ? List.of()
                : body.paths().stream().filter(p -> p != null && !p.isBlank() && p.length() <= 300).distinct().limit(HistoryService.MAX_PATHS).toList();
        if (ref == null || paths.isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("error", "bad_request", "message", "Need a repo and the files to track"));
        }
        int points = Math.clamp(body.points() == null ? 12 : body.points(), 2, 24);
        String token = Boolean.TRUE.equals(body.privateRepo()) && accounts.canUsePro(principal)
                ? tokens.privateToken(principal, http).orElse(null) : null;
        try {
            return ResponseEntity.ok(history.timeline(ref.owner(), ref.name(), paths, points, token));
        } catch (GitHubApi.GitHubException e) {
            return ResponseEntity.status(e.status() == 404 ? 404 : 503).body(Map.of("error", "github",
                    "message", e.status() == 404 ? "Repository not found" : "GitHub is busy right now. Try again in a few minutes."));
        } catch (Exception e) {
            return ResponseEntity.status(502).body(Map.of("error", "github", "message", "Couldn't load the history. Try again."));
        }
    }
}
