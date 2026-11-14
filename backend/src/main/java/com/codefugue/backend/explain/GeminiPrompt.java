package com.codefugue.backend.explain;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

/** Builds the Gemini request and parses its reply. Pure functions, so they are easy to test. */
final class GeminiPrompt {

    /** Only the start of a file is sent: enough to explain it, small enough to stay fast and cheap. */
    static final int MAX_CODE_CHARS = 12_000;

    private static final Pattern SAFE_SEGMENT = Pattern.compile("[A-Za-z0-9_.-]{1,100}");
    private static final Pattern SAFE_BRANCH = Pattern.compile("[A-Za-z0-9_./-]{1,200}");
    private static final Pattern SAFE_PATH = Pattern.compile("[A-Za-z0-9_./@+ -]{1,400}");

    private static final String SYSTEM_INSTRUCTION = """
            You explain source files to people exploring a codebase visualisation at a hackathon.
            Given a file from a public GitHub repository, say what the file is for and what it does,
            in plain English that a second-year computer science student understands.
            Rules: base everything on the code shown; do not invent features; no markdown; be concise.
            "purpose" is one or two sentences. "details" has 2 to 4 short points (each under 25 words)
            about its main responsibilities or how it fits into the project.""";

    private GeminiPrompt() {}

    /** Rejects anything that isn't a plain GitHub owner/repo/branch/path (no URL tricks, no "..""). */
    static void validate(ExplainRequest r) {
        if (r == null
                || r.owner() == null || !SAFE_SEGMENT.matcher(r.owner()).matches()
                || r.repo() == null || !SAFE_SEGMENT.matcher(r.repo()).matches()
                || r.branch() == null || !SAFE_BRANCH.matcher(r.branch()).matches() || r.branch().contains("..")
                || r.path() == null || !SAFE_PATH.matcher(r.path()).matches() || r.path().contains("..")
                || r.path().startsWith("/")) {
            throw new ExplainException(400, "bad_request", "Invalid repository or file path");
        }
    }

    static String userPrompt(ExplainRequest r, String code) {
        String trimmed = code.length() > MAX_CODE_CHARS
                ? code.substring(0, MAX_CODE_CHARS) + "\n… (file truncated)"
                : code;
        return """
                Repository: %s/%s
                File: %s
                Role: %s · %d lines · complexity %d · %d concurrency markers · %d imports · imported by %d sampled files

                ```
                %s
                ```""".formatted(r.owner(), r.repo(), r.path(), r.role(), r.loc(), r.complexity(), r.concurrency(),
                r.imports(), r.importedBy(), trimmed);
    }

    /** generateContent body with a JSON response schema, so the reply always has the shape we need. */
    static ObjectNode requestBody(JsonMapper mapper, String userPrompt) {
        ObjectNode body = mapper.createObjectNode();
        body.putObject("systemInstruction").putArray("parts").addObject().put("text", SYSTEM_INSTRUCTION);
        ObjectNode content = body.putArray("contents").addObject();
        content.put("role", "user");
        content.putArray("parts").addObject().put("text", userPrompt);

        ObjectNode config = body.putObject("generationConfig");
        config.put("temperature", 0.3);
        config.put("maxOutputTokens", 2048);
        config.put("responseMimeType", "application/json");
        ObjectNode schema = config.putObject("responseSchema");
        schema.put("type", "OBJECT");
        ObjectNode props = schema.putObject("properties");
        props.putObject("purpose").put("type", "STRING");
        ObjectNode details = props.putObject("details");
        details.put("type", "ARRAY");
        details.putObject("items").put("type", "STRING");
        ArrayNode required = schema.putArray("required");
        required.add("purpose");
        required.add("details");
        return body;
    }

    /** Extracts {purpose, details} from a generateContent response. */
    static ExplainResponse parse(JsonMapper mapper, String responseJson, String model) {
        JsonNode root = mapper.readTree(responseJson);
        StringBuilder text = new StringBuilder();
        for (JsonNode part : root.path("candidates").path(0).path("content").path("parts")) {
            if (!part.path("thought").asBoolean(false)) text.append(part.path("text").asString(""));
        }
        String raw = text.toString().trim();
        if (raw.isEmpty()) {
            String finish = root.path("candidates").path(0).path("finishReason").asString("unknown");
            throw new ExplainException(502, "empty_reply", "Gemini returned no text (finish reason: " + finish + ")");
        }
        // Tolerate a ```json fence if a model adds one.
        raw = raw.replaceFirst("^```(?:json)?\\s*", "").replaceFirst("\\s*```$", "");
        JsonNode parsed;
        try {
            parsed = mapper.readTree(raw);
        } catch (Exception e) {
            // Not JSON: fall back to using the whole text as the purpose.
            return new ExplainResponse(raw, List.of(), model, false);
        }
        List<String> details = new ArrayList<>();
        for (JsonNode d : parsed.path("details")) {
            String s = d.asString("").trim();
            if (!s.isEmpty() && details.size() < 4) details.add(s);
        }
        String purpose = parsed.path("purpose").asString("").trim();
        if (purpose.isEmpty()) throw new ExplainException(502, "bad_reply", "Gemini's reply had no purpose");
        return new ExplainResponse(purpose, details, model, false);
    }
}
