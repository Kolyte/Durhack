package com.codefugue.backend.ranking;

import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Repositories this server finished analysing recently, with the facts the server itself fetched from GitHub.
 * A ranking submission is only accepted for a repo listed here, so scores can't be posted for arbitrary repos,
 * and stars / file counts never come from the client.
 */
@Component
public class RecentAnalyses {

    static final Duration TTL = Duration.ofMinutes(30);

    public record Facts(int stars, int totalCodeFiles, Instant finishedAt) {}

    private final Map<String, Facts> byRepo = new ConcurrentHashMap<>();
    private final Clock clock;

    public RecentAnalyses() {
        this(Clock.systemUTC());
    }

    RecentAnalyses(Clock clock) {
        this.clock = clock;
    }

    public void markFinished(String repoName, int stars, int totalCodeFiles) {
        String key = RankingSubmission.normalizeRepoName(repoName);
        if (key == null) return;
        Instant now = clock.instant();
        byRepo.values().removeIf(f -> f.finishedAt().isBefore(now.minus(TTL)));
        byRepo.put(key, new Facts(stars, totalCodeFiles, now));
    }

    public Optional<Facts> lookup(String normalizedRepoName) {
        Facts f = normalizedRepoName == null ? null : byRepo.get(normalizedRepoName);
        if (f == null || f.finishedAt().isBefore(clock.instant().minus(TTL))) return Optional.empty();
        return Optional.of(f);
    }
}
