package com.codefugue.backend.shop;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.Optional;
import java.util.Set;

/** Purchased items and each user's chosen look. Tables are created lazily, like the rest of the schema. */
@Repository
public class ShopRepository {

    private static final Logger log = LoggerFactory.getLogger(ShopRepository.class);

    public record Loadout(String skin, String style, String world) {
        public static final Loadout DEFAULT = new Loadout(ShopCatalog.DEFAULT_SKIN, ShopCatalog.DEFAULT_STYLE, ShopCatalog.DEFAULT_WORLD);
    }

    private final JdbcClient jdbc;
    private volatile boolean schemaReady;

    public ShopRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    synchronized void ensureSchema() {
        if (schemaReady) return;
        jdbc.sql("""
                CREATE TABLE IF NOT EXISTS user_items (
                    user_id           BIGINT      NOT NULL,
                    item_id           TEXT        NOT NULL,
                    stripe_session_id TEXT,
                    acquired_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
                    PRIMARY KEY (user_id, item_id)
                )""").update();
        jdbc.sql("""
                CREATE TABLE IF NOT EXISTS user_loadout (
                    user_id    BIGINT      PRIMARY KEY,
                    skin       TEXT        NOT NULL,
                    style      TEXT        NOT NULL,
                    world      TEXT        NOT NULL,
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
                )""").update();
        log.info("Shop schema ready");
        schemaReady = true;
    }

    public Set<String> owned(long userId) {
        ensureSchema();
        return new LinkedHashSet<>(jdbc.sql("SELECT item_id FROM user_items WHERE user_id = :u ORDER BY acquired_at")
                .param("u", userId).query(String.class).list());
    }

    /** Grants items; idempotent (Stripe may deliver the same webhook more than once). */
    public void grant(long userId, Collection<String> itemIds, String stripeSessionId) {
        ensureSchema();
        for (String id : itemIds) {
            jdbc.sql("""
                            INSERT INTO user_items (user_id, item_id, stripe_session_id) VALUES (:u, :i, :s)
                            ON CONFLICT (user_id, item_id) DO NOTHING""")
                    .param("u", userId).param("i", id).param("s", stripeSessionId).update();
        }
    }

    public Optional<Loadout> loadout(long userId) {
        ensureSchema();
        return jdbc.sql("SELECT skin, style, world FROM user_loadout WHERE user_id = :u").param("u", userId)
                .query((rs, n) -> new Loadout(rs.getString("skin"), rs.getString("style"), rs.getString("world")))
                .optional();
    }

    public void saveLoadout(long userId, Loadout l) {
        ensureSchema();
        jdbc.sql("""
                        INSERT INTO user_loadout (user_id, skin, style, world) VALUES (:u, :sk, :st, :w)
                        ON CONFLICT (user_id) DO UPDATE SET skin = EXCLUDED.skin, style = EXCLUDED.style,
                            world = EXCLUDED.world, updated_at = now()""")
                .param("u", userId).param("sk", l.skin()).param("st", l.style()).param("w", l.world()).update();
    }
}
