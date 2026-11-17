package com.codefugue.backend.account;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.Optional;

/**
 * Users and their subscription state, in the same PostgreSQL / TimescaleDB as the leaderboard.
 * The table is created lazily, so the app still starts (and composes music) while the database is down.
 */
@Repository
public class UserRepository {

    private static final Logger log = LoggerFactory.getLogger(UserRepository.class);

    private final JdbcClient jdbc;
    private volatile boolean schemaReady;

    public UserRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    synchronized void ensureSchema() {
        if (schemaReady) return;
        jdbc.sql("""
                CREATE TABLE IF NOT EXISTS app_users (
                    id                  BIGSERIAL   PRIMARY KEY,
                    github_id           BIGINT      NOT NULL UNIQUE,
                    login               TEXT        NOT NULL,
                    name                TEXT,
                    avatar_url          TEXT,
                    email               TEXT,
                    stripe_customer_id  TEXT        UNIQUE,
                    subscription_id     TEXT,
                    subscription_status TEXT,
                    current_period_end  TIMESTAMPTZ,
                    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
                    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
                )""").update();
        log.info("User schema ready");
        schemaReady = true;
    }

    /** Creates the user on first sign-in, or refreshes their GitHub profile details. */
    public AppUser upsertFromGitHub(long githubId, String login, String name, String avatarUrl, String email) {
        ensureSchema();
        return jdbc.sql("""
                        INSERT INTO app_users (github_id, login, name, avatar_url, email)
                        VALUES (:githubId, :login, :name, :avatarUrl, :email)
                        ON CONFLICT (github_id) DO UPDATE SET
                            login = EXCLUDED.login, name = EXCLUDED.name, avatar_url = EXCLUDED.avatar_url,
                            email = COALESCE(EXCLUDED.email, app_users.email), updated_at = now()
                        RETURNING *""")
                .param("githubId", githubId).param("login", login).param("name", name)
                .param("avatarUrl", avatarUrl).param("email", email)
                .query(UserRepository::map).single();
    }

    public Optional<AppUser> findByGithubId(long githubId) {
        ensureSchema();
        return jdbc.sql("SELECT * FROM app_users WHERE github_id = :id").param("id", githubId)
                .query(UserRepository::map).optional();
    }

    public void setStripeCustomerId(long userId, String customerId) {
        ensureSchema();
        jdbc.sql("UPDATE app_users SET stripe_customer_id = :c, updated_at = now() WHERE id = :id")
                .param("c", customerId).param("id", userId).update();
    }

    /** Applies a Stripe subscription change. Returns false if no user has that Stripe customer. */
    public boolean updateSubscription(String customerId, String subscriptionId, String status, Instant periodEnd) {
        ensureSchema();
        return jdbc.sql("""
                        UPDATE app_users SET subscription_id = :sid, subscription_status = :status,
                            current_period_end = :end, updated_at = now()
                        WHERE stripe_customer_id = :customer""")
                .param("sid", subscriptionId).param("status", status)
                .param("end", periodEnd == null ? null : Timestamp.from(periodEnd)).param("customer", customerId)
                .update() > 0;
    }

    static AppUser map(ResultSet rs, int row) throws SQLException {
        Timestamp end = rs.getTimestamp("current_period_end");
        return new AppUser(rs.getLong("id"), rs.getLong("github_id"), rs.getString("login"), rs.getString("name"),
                rs.getString("avatar_url"), rs.getString("email"), rs.getString("stripe_customer_id"),
                rs.getString("subscription_id"), rs.getString("subscription_status"),
                end == null ? null : end.toInstant());
    }
}
