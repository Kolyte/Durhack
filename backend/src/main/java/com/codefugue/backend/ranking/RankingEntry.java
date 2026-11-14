package com.codefugue.backend.ranking;

import java.time.Instant;

/** One row of the leaderboard: the latest analysis of a repository. */
public record RankingEntry(
        String repoName,
        double score,
        double complexity,
        double connectivity,
        double modularity,
        double concurrency,
        double size,
        int stars,
        int analyzedFiles,
        int totalCodeFiles,
        int runs,
        Instant analyzedAt
) {}
