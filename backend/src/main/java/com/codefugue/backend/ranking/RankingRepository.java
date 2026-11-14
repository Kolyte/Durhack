package com.codefugue.backend.ranking;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.util.List;

/**
 * Every finished analysis is appended to {@code repo_analyses}; the leaderboard is each repo's latest row.
 * On TimescaleDB (Tiger Data) the table becomes a hypertable partitioned by {@code analyzed_at}.
 * The schema is created lazily, so the app still starts while the database is down.
 */
@Repository
public class RankingRepository {

    private static final Logger log = LoggerFactory.getLogger(RankingRepository.class);

    private final JdbcClient jdbc;
    private volatile boolean schemaReady;

    public RankingRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    synchronized void ensureSchema() {
        if (schemaReady) return;
        jdbc.sql("""
                CREATE TABLE IF NOT EXISTS repo_analyses (
                    analyzed_at      TIMESTAMPTZ      NOT NULL DEFAULT now(),
                    repo_name        TEXT             NOT NULL,
                    score            DOUBLE PRECISION NOT NULL,
                    complexity       DOUBLE PRECISION NOT NULL,
                    connectivity     DOUBLE PRECISION NOT NULL,
                    modularity       DOUBLE PRECISION NOT NULL,
                    concurrency      DOUBLE PRECISION NOT NULL,
                    size             DOUBLE PRECISION NOT NULL,
                    stars            INTEGER          NOT NULL,
                    analyzed_files   INTEGER          NOT NULL,
                    total_code_files INTEGER          NOT NULL
                )""").update();
        jdbc.sql("CREATE INDEX IF NOT EXISTS repo_analyses_repo_time ON repo_analyses (repo_name, analyzed_at DESC)")
                .update();
        boolean timescale = jdbc.sql("SELECT count(*) FROM pg_extension WHERE extname = 'timescaledb'")
                .query(Integer.class).single() > 0;
        if (timescale) {
            jdbc.sql("SELECT create_hypertable('repo_analyses', 'analyzed_at', if_not_exists => TRUE, migrate_data => TRUE)")
                    .query().singleRow();
        }
        log.info("Ranking schema ready (TimescaleDB hypertable: {})", timescale);
        schemaReady = true;
    }

    public void insert(RankingSubmission s, RecentAnalyses.Facts facts) {
        ensureSchema();
        jdbc.sql("""
                        INSERT INTO repo_analyses (repo_name, score, complexity, connectivity, modularity, concurrency,
                                                   size, stars, analyzed_files, total_code_files)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""")
                .params(s.repoName(), s.score(), s.complexity(), s.connectivity(), s.modularity(), s.concurrency(),
                        s.size(), facts.stars(), s.analyzedFiles(), facts.totalCodeFiles())
                .update();
    }

    /** Latest analysis per repository, best overall score first. */
    public List<RankingEntry> top(int limit) {
        ensureSchema();
        return jdbc.sql("""
                        SELECT * FROM (
                            SELECT DISTINCT ON (repo_name)
                                   repo_name, score, complexity, connectivity, modularity, concurrency, size,
                                   stars, analyzed_files, total_code_files, analyzed_at,
                                   count(*) OVER (PARTITION BY repo_name) AS runs
                            FROM repo_analyses
                            ORDER BY repo_name, analyzed_at DESC
                        ) latest
                        ORDER BY score DESC, analyzed_at DESC
                        LIMIT ?""")
                .param(limit)
                .query((rs, i) -> new RankingEntry(
                        rs.getString("repo_name"),
                        rs.getDouble("score"),
                        rs.getDouble("complexity"),
                        rs.getDouble("connectivity"),
                        rs.getDouble("modularity"),
                        rs.getDouble("concurrency"),
                        rs.getDouble("size"),
                        rs.getInt("stars"),
                        rs.getInt("analyzed_files"),
                        rs.getInt("total_code_files"),
                        rs.getInt("runs"),
                        rs.getObject("analyzed_at", Timestamp.class).toInstant()))
                .list();
    }
}
