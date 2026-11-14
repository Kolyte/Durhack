package com.codefugue.backend.explain;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/** POST /api/explain → Gemini's explanation of one file. GET /api/explain/status → whether it's available. */
@RestController
@RequestMapping("/api/explain")
public class ExplainController {

    private final GeminiExplainService gemini;

    public ExplainController(GeminiExplainService gemini) {
        this.gemini = gemini;
    }

    @GetMapping("/status")
    public Map<String, Object> status() {
        return Map.of("enabled", gemini.enabled(), "model", gemini.model());
    }

    @PostMapping
    public ResponseEntity<?> explain(@RequestBody ExplainRequest request) {
        try {
            return ResponseEntity.ok(gemini.explain(request));
        } catch (ExplainException e) {
            return ResponseEntity.status(e.status()).body(Map.of("error", e.reason(), "message", e.getMessage()));
        }
    }
}
