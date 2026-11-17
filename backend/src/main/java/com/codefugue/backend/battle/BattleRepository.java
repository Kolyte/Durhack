package com.codefugue.backend.battle;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Map;

/** Votes in repo battles: one per visitor per pair (changing your mind updates your vote). */
@Repository
public class BattleRepository {

    public record Tally(String a, String b, long votesA, long votesB) {
    }

    private final JdbcClient jdbc;
    private volatile boolean schemaReady;

    public BattleRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    synchronized void ensureSchema() {
        if (schemaReady) return;
        jdbc.sql("""
                CREATE TABLE IF NOT EXISTS battle_votes (
                    repo_a     TEXT        NOT NULL,
                    repo_b     TEXT        NOT NULL,
                    voter      TEXT        NOT NULL,
                    choice     TEXT        NOT NULL,
                    voted_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
                    PRIMARY KEY (repo_a, repo_b, voter)
                )""").update();
        schemaReady = true;
    }

    /** a and b must already be normalised and ordered (a < b). */
    public void vote(String a, String b, String voter, String choice) {
        ensureSchema();
        jdbc.sql("""
                        INSERT INTO battle_votes (repo_a, repo_b, voter, choice) VALUES (:a, :b, :v, :c)
                        ON CONFLICT (repo_a, repo_b, voter) DO UPDATE SET choice = EXCLUDED.choice, voted_at = now()""")
                .param("a", a).param("b", b).param("v", voter).param("c", choice).update();
    }

    public Map<String, Long> counts(String a, String b) {
        ensureSchema();
        Map<String, Long> out = new java.util.HashMap<>(Map.of(a, 0L, b, 0L));
        jdbc.sql("SELECT choice, count(*) AS n FROM battle_votes WHERE repo_a = :a AND repo_b = :b GROUP BY choice")
                .param("a", a).param("b", b)
                .query((rs, i) -> Map.entry(rs.getString("choice"), rs.getLong("n")))
                .list()
                .forEach(e -> out.put(e.getKey(), e.getValue()));
        return out;
    }

    public String myVote(String a, String b, String voter) {
        ensureSchema();
        return jdbc.sql("SELECT choice FROM battle_votes WHERE repo_a = :a AND repo_b = :b AND voter = :v")
                .param("a", a).param("b", b).param("v", voter).query(String.class).optional().orElse(null);
    }

    /** Most-voted battles recently, for the battle page's "popular" list. */
    public List<Tally> popular(int limit) {
        ensureSchema();
        return jdbc.sql("""
                        SELECT repo_a, repo_b,
                               count(*) FILTER (WHERE choice = repo_a) AS va,
                               count(*) FILTER (WHERE choice = repo_b) AS vb
                        FROM battle_votes
                        WHERE voted_at > now() - interval '30 days'
                        GROUP BY repo_a, repo_b
                        ORDER BY count(*) DESC
                        LIMIT :n""")
                .param("n", limit)
                .query((rs, i) -> new Tally(rs.getString("repo_a"), rs.getString("repo_b"), rs.getLong("va"), rs.getLong("vb")))
                .list();
    }
}
