package com.codefugue.backend.compose;

public record FileNode(
        String id,
        String path,
        String directory,
        int depth,
        double x,
        double y,
        double z,
        int loc,
        int complexity,
        int concurrency,
        boolean analyzed
) {}
