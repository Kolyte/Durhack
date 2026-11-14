package com.codefugue.backend.explain;

import java.util.List;

/** Gemini's explanation, in the same shape as the frontend's built-in explanations. */
public record ExplainResponse(String purpose, List<String> details, String model, boolean cached) {}
