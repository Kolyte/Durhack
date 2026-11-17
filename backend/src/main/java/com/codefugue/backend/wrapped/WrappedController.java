package com.codefugue.backend.wrapped;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
public class WrappedController {

    private final WrappedService wrapped;

    public WrappedController(WrappedService wrapped) {
        this.wrapped = wrapped;
    }

    /** GET /api/wrapped/{login} → a GitHub profile's year in sound (public data only). */
    @GetMapping("/api/wrapped/{login}")
    public ResponseEntity<?> wrap(@PathVariable String login) {
        if (!WrappedService.validLogin(login)) {
            return ResponseEntity.badRequest().body(Map.of("error", "bad_login", "message", "That isn't a valid GitHub username"));
        }
        try {
            return ResponseEntity.ok(wrapped.wrap(login));
        } catch (GitHubApi.GitHubException e) {
            if (e.status() == 404) {
                return ResponseEntity.status(404).body(Map.of("error", "not_found", "message", "No GitHub user called " + login));
            }
            return ResponseEntity.status(503).body(Map.of("error", "github_unavailable",
                    "message", "GitHub is busy right now (rate limit). Try again in a few minutes."));
        } catch (Exception e) {
            return ResponseEntity.status(502).body(Map.of("error", "github_error", "message", "Couldn't reach GitHub. Try again."));
        }
    }
}
