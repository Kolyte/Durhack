package com.codefugue.backend.explain;

import com.codefugue.backend.account.GitHubTokens;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.codefugue.backend.account.AccountService;

import java.security.Principal;
import java.util.Map;

/** POST /api/explain → Gemini's explanation of one file. GET /api/explain/status → whether it's available. */
@RestController
@RequestMapping("/api/explain")
public class ExplainController {

    private final GeminiExplainService gemini;
    private final AccountService accounts;
    private final GitHubTokens tokens;

    public ExplainController(GeminiExplainService gemini, AccountService accounts, GitHubTokens tokens) {
        this.gemini = gemini;
        this.accounts = accounts;
        this.tokens = tokens;
    }

    @GetMapping("/status")
    public Map<String, Object> status() {
        return Map.of("enabled", gemini.enabled(), "model", gemini.model());
    }

    @PostMapping
    public ResponseEntity<?> explain(@RequestBody ExplainRequest request, Principal principal, HttpServletRequest http,
                                     @RequestParam(name = "private", defaultValue = "false") boolean privateRepo) {
        // Gemini explanations are a Pro feature (open to everyone while billing isn't configured).
        if (!accounts.canUsePro(principal)) {
            return principal == null
                    ? ResponseEntity.status(401).body(Map.of("error", "sign_in", "message", "Sign in and upgrade to Pro to use Gemini explanations."))
                    : ResponseEntity.status(402).body(Map.of("error", "pro_required", "message", "Gemini explanations are part of Sonyx Pro."));
        }
        try {
            // Files in private repos are fetched with the user's own token (and never cached for others).
            String token = privateRepo ? tokens.privateToken(principal, http).orElse(null) : null;
            return ResponseEntity.ok(gemini.explain(request, token));
        } catch (ExplainException e) {
            return ResponseEntity.status(e.status()).body(Map.of("error", e.reason(), "message", e.getMessage()));
        }
    }
}
