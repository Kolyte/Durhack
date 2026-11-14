package com.codefugue.backend.ranking;

import java.net.URI;

/**
 * Accepts the connection string Tiger Data (and most Postgres hosts) hand out,
 * {@code postgres://user:pass@host:port/db?sslmode=require}, and turns it into Spring datasource settings.
 * A {@code jdbc:postgresql://...} URL is left to application.properties as-is.
 */
public final class DatabaseUrl {

    public record Settings(String jdbcUrl, String username, String password) {}

    private DatabaseUrl() {}

    /** Null if {@code raw} isn't a postgres:// / postgresql:// URL. */
    public static Settings parse(String raw) {
        if (raw == null) return null;
        String url = raw.trim();
        if (!url.startsWith("postgres://") && !url.startsWith("postgresql://")) return null;
        URI uri = URI.create(url);
        String user = null, pass = null;
        if (uri.getUserInfo() != null) {
            String[] up = uri.getUserInfo().split(":", 2);
            user = up[0];
            pass = up.length > 1 ? up[1] : null;
        }
        int port = uri.getPort() > 0 ? uri.getPort() : 5432;
        String path = uri.getRawPath() == null || uri.getRawPath().isEmpty() ? "/postgres" : uri.getRawPath();
        String query = uri.getRawQuery() == null ? "" : "?" + uri.getRawQuery();
        return new Settings("jdbc:postgresql://" + uri.getHost() + ":" + port + path + query, user, pass);
    }

    /** Called before Spring starts: system properties override application.properties. */
    public static void applyFromEnvironment() {
        Settings s = parse(System.getenv("DATABASE_URL"));
        if (s == null) return;
        System.setProperty("spring.datasource.url", s.jdbcUrl());
        // An explicit DATABASE_USER / DATABASE_PASSWORD still wins.
        if (s.username() != null && isBlank(System.getenv("DATABASE_USER"))) {
            System.setProperty("spring.datasource.username", s.username());
        }
        if (s.password() != null && isBlank(System.getenv("DATABASE_PASSWORD"))) {
            System.setProperty("spring.datasource.password", s.password());
        }
    }

    private static boolean isBlank(String v) {
        return v == null || v.isBlank();
    }
}
