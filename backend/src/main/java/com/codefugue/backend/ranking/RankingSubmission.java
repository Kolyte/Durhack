package com.codefugue.backend.ranking;

import java.util.Locale;
import java.util.regex.Pattern;

/**
 * Code DNA scores the browser computed for a finished analysis (see frontend/src/model/codeDna.ts).
 * Each score is 0–1; anything outside that range is clamped.
 */
public record RankingSubmission(
        String repoName,
        double complexity,
        double connectivity,
        double modularity,
        double concurrency,
        double size,
        int analyzedFiles
) {
    private static final Pattern REPO_NAME = Pattern.compile("[\\w.-]{1,100}/[\\w.-]{1,100}");

    /** "Owner/Repo" → "owner/repo" (GitHub names are case-insensitive), or null if malformed. */
    public static String normalizeRepoName(String raw) {
        if (raw == null) return null;
        String name = raw.trim().toLowerCase(Locale.ROOT);
        return REPO_NAME.matcher(name).matches() ? name : null;
    }

    /** Copy with every score clamped to 0–1 and a sane file count. */
    public RankingSubmission sanitized() {
        return new RankingSubmission(normalizeRepoName(repoName), clamp(complexity), clamp(connectivity),
                clamp(modularity), clamp(concurrency), clamp(size), Math.clamp(analyzedFiles, 0, 10_000));
    }

    /** Overall "CodeFugue score", 0–100: the mean of the five Code DNA axes. */
    public double score() {
        return Math.round((complexity + connectivity + modularity + concurrency + size) / 5 * 1000) / 10.0;
    }

    private static double clamp(double v) {
        return Double.isFinite(v) ? Math.clamp(v, 0.0, 1.0) : 0.0;
    }
}
