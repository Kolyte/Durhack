package com.codefugue.backend.explain;

import org.springframework.http.ResponseEntity;
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

    public ExplainController(GeminiExplainService gemini, AccountService accounts) {
        this.gemini = gemini;
        this.accounts = accounts;
    }

    @GetMapping("/status")
    public Map<String, Object> status() {
        return Map.of("enabled", gemini.enabled(), "model", gemini.model());
    }

    @PostMapping
    public ResponseEntity<?> explain(@RequestBody ExplainRequest request, Principal principal) {
        // Gemini explanations are a Pro feature (open to everyone while billing isn't configured).
        if (!accounts.canUsePro(principal)) {
            return principal == null
                    ? ResponseEntity.status(401).body(Map.of("error", "sign_in", "message", "Sign in and upgrade to Pro to use Gemini explanations."))
                    : ResponseEntity.status(402).body(Map.of("error", "pro_required", "message", "Gemini explanations are part of Sonyx Pro."));
        }
        try {
            return ResponseEntity.ok(gemini.explain(request));
        } catch (ExplainException e) {
            return ResponseEntity.status(e.status()).body(Map.of("error", e.reason(), "message", e.getMessage()));
        }
    }
}
