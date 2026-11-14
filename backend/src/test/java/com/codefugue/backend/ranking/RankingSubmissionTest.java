package com.codefugue.backend.ranking;

import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class RankingSubmissionTest {

    @Test
    void normalizesRepoNames() {
        assertEquals("expressjs/express", RankingSubmission.normalizeRepoName(" ExpressJS/Express "));
        assertEquals("spring-projects/spring-petclinic",
                RankingSubmission.normalizeRepoName("spring-projects/spring-petclinic"));
        assertNull(RankingSubmission.normalizeRepoName("https://github.com/a/b"));
        assertNull(RankingSubmission.normalizeRepoName("a/b/c"));
        assertNull(RankingSubmission.normalizeRepoName("a'; DROP TABLE x;--/b"));
        assertNull(RankingSubmission.normalizeRepoName(null));
    }

    @Test
    void clampsScoresAndComputesOverallScore() {
        var s = new RankingSubmission("Foo/Bar", 1.7, -0.2, 0.5, Double.NaN, 0.5, 99_999).sanitized();
        assertEquals("foo/bar", s.repoName());
        assertEquals(1.0, s.complexity());
        assertEquals(0.0, s.connectivity());
        assertEquals(0.0, s.concurrency());
        assertEquals(10_000, s.analyzedFiles());
        assertEquals(40.0, s.score()); // (1 + 0 + 0.5 + 0 + 0.5) / 5 * 100
    }

    @Test
    void onlyRecentlyAnalysedReposAreAccepted() {
        var clock = new MutableClock(Instant.parse("2026-11-14T12:00:00Z"));
        var recent = new RecentAnalyses(clock);
        recent.markFinished("ExpressJS/express", 69_000, 140);

        var facts = recent.lookup("expressjs/express");
        assertTrue(facts.isPresent());
        assertEquals(69_000, facts.get().stars());
        assertFalse(recent.lookup("someone/else").isPresent());

        clock.now = clock.now.plus(RecentAnalyses.TTL).plus(Duration.ofSeconds(1));
        assertFalse(recent.lookup("expressjs/express").isPresent());
    }

    private static final class MutableClock extends Clock {
        Instant now;

        MutableClock(Instant now) {
            this.now = now;
        }

        @Override
        public ZoneOffset getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(java.time.ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return now;
        }
    }
}
