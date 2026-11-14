package com.codefugue.backend.explain;

/**
 * What the frontend sends when you ask Gemini to explain a file. The code itself is fetched by the
 * backend from GitHub (so the request stays small and can't inject arbitrary text as "code").
 */
public record ExplainRequest(
        String owner,
        String repo,
        String branch,
        String path,
        String role,
        int loc,
        int complexity,
        int concurrency,
        int imports,
        int importedBy
) {}
