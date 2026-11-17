package com.codefugue.backend.share;

import java.util.Locale;

/** A shields.io-style README badge: "🎧 sonyx | score 74.2 · #12". Plain SVG, no external fonts. */
final class Badge {

    private Badge() {
    }

    /** Approximate text width in Verdana 11px (what shields.io uses), so the badge sizes itself. */
    static int textWidth(String s) {
        double w = 0;
        for (char c : s.toCharArray()) {
            if ("ilI.,:;|!'".indexOf(c) >= 0) w += 3.2;
            else if ("mwMW@".indexOf(c) >= 0) w += 9.5;
            else if (Character.isUpperCase(c) || Character.isDigit(c)) w += 7.4;
            else if (c == ' ') w += 3.6;
            else if (c > 0x2000) w += 11; // emoji / symbols
            else w += 6.4;
        }
        return (int) Math.ceil(w);
    }

    static String svg(String label, String value, String color) {
        int lw = textWidth(label) + 14;
        int vw = textWidth(value) + 14;
        int total = lw + vw;
        String l = RepoRef.escape(label);
        String v = RepoRef.escape(value);
        return String.format(Locale.ROOT, """
                <svg xmlns="http://www.w3.org/2000/svg" width="%1$d" height="20" role="img" aria-label="%2$s: %3$s">
                  <title>%2$s: %3$s</title>
                  <linearGradient id="s" x2="0" y2="100%%"><stop offset="0" stop-color="#bbb" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient>
                  <clipPath id="r"><rect width="%1$d" height="20" rx="3" fill="#fff"/></clipPath>
                  <g clip-path="url(#r)">
                    <rect width="%4$d" height="20" fill="#0b1226"/>
                    <rect x="%4$d" width="%5$d" height="20" fill="%6$s"/>
                    <rect width="%1$d" height="20" fill="url(#s)"/>
                  </g>
                  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">
                    <text x="%7$.1f" y="15" fill="#010101" fill-opacity=".3">%2$s</text>
                    <text x="%7$.1f" y="14">%2$s</text>
                    <text x="%8$.1f" y="15" fill="#010101" fill-opacity=".3">%3$s</text>
                    <text x="%8$.1f" y="14">%3$s</text>
                  </g>
                </svg>
                """, total, l, v, lw, vw, color, lw / 2.0, lw + vw / 2.0);
    }
}
