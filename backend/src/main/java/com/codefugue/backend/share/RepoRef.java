package com.codefugue.backend.share;

import java.util.regex.Pattern;

/** A validated "owner/name" GitHub repository reference (safe to put in URLs, HTML and SVG). */
public record RepoRef(String owner, String name) {

    private static final Pattern OWNER = Pattern.compile("^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$");
    private static final Pattern NAME = Pattern.compile("^[A-Za-z0-9._-]{1,100}$");

    public static RepoRef parse(String owner, String name) {
        if (owner == null || name == null || !OWNER.matcher(owner).matches() || !NAME.matcher(name).matches()
                || name.equals(".") || name.equals("..")) {
            return null;
        }
        return new RepoRef(owner, name);
    }

    public String full() {
        return owner + "/" + name;
    }

    /** Leaderboard key (lower case). */
    public String key() {
        return full().toLowerCase(java.util.Locale.ROOT);
    }

    static String escape(String s) {
        if (s == null) return "";
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;").replace("'", "&#39;");
    }
}
