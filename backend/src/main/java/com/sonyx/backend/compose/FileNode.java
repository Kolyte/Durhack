package com.sonyx.backend.compose;

/**
 * One sampled file. Layout/positions are computed by the frontend (it owns the views).
 *
 * @param role        "source", "test", "config" or "docs" (the frontend may upgrade source → "module")
 * @param imports     number of import/require/include statements found in the file
 * @param analyzed    false until the file's contents were fetched and scanned
 */
public record FileNode(
        String id,
        String path,
        String directory,
        int depth,
        int loc,
        int complexity,
        int concurrency,
        int imports,
        String role,
        boolean analyzed
) {}
