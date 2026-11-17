package com.codefugue.backend.share;

import com.codefugue.backend.ranking.RankingEntry;
import com.codefugue.backend.ranking.RankingRepository;
import com.codefugue.backend.wrapped.WrappedService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

import java.time.Duration;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

/**
 * Sharing, for growth:
 *  - /badge/{owner}/{repo}.svg: a README badge with the repo's Code DNA score and leaderboard rank.
 *  - /r/{owner}/{repo} and /w/{login}: share links. Chat apps and social sites read their Open Graph tags
 *    (title, description, preview image) without running JavaScript; people are sent straight on to the app.
 *  - /og/...png: the preview images.
 */
@RestController
public class ShareController {

    private static final Logger log = LoggerFactory.getLogger(ShareController.class);
    private static final MediaType SVG = MediaType.valueOf("image/svg+xml");

    private final RankingRepository rankings;
    private final WrappedService wrapped;

    public ShareController(RankingRepository rankings, WrappedService wrapped) {
        this.rankings = rankings;
        this.wrapped = wrapped;
    }

    @GetMapping("/badge/{owner}/{repo}.svg")
    public ResponseEntity<String> badge(@PathVariable String owner, @PathVariable String repo) {
        RepoRef ref = RepoRef.parse(owner, repo);
        String value;
        String color;
        if (ref == null) {
            value = "invalid repo";
            color = "#9f1239";
        } else {
            Optional<RankingEntry> entry = lookup(ref);
            if (entry.isPresent()) {
                double score = entry.get().score();
                int rank = rank(score);
                value = String.format(Locale.ROOT, "score %.1f", score) + (rank > 0 ? " · #" + rank : "");
                color = score >= 70 ? "#db2777" : score >= 40 ? "#7c3aed" : "#0d9488";
            } else {
                value = "▶ listen";
                color = "#0d9488";
            }
        }
        return ResponseEntity.ok()
                .contentType(SVG)
                .cacheControl(CacheControl.maxAge(Duration.ofHours(1)).cachePublic())
                .body(Badge.svg("🎧 sonyx", value, color));
    }

    @GetMapping(value = "/r/{owner}/{repo}", produces = MediaType.TEXT_HTML_VALUE)
    public ResponseEntity<String> repoPage(@PathVariable String owner, @PathVariable String repo) {
        RepoRef ref = RepoRef.parse(owner, repo);
        if (ref == null) return ResponseEntity.status(302).header("Location", "/").build();
        Optional<RankingEntry> entry = lookup(ref);
        String title = "Hear " + ref.full() + " as music · Sonyx";
        String description = entry
                .map(e -> String.format(Locale.ROOT, "Code DNA score %.1f. Explore %s as a 3D city, galaxy and tree, with music generated from its structure.", e.score(), ref.full()))
                .orElse("Explore " + ref.full() + " as a 3D city, galaxy and tree, with ambient music generated from its structure.");
        String target = "/?repo=" + ref.full();
        String image = origin() + "/og/r/" + ref.full() + ".png";
        return html(page(title, description, image, origin() + "/r/" + ref.full(), target));
    }

    @GetMapping(value = "/w/{login}", produces = MediaType.TEXT_HTML_VALUE)
    public ResponseEntity<String> wrappedPage(@PathVariable String login) {
        if (!WrappedService.validLogin(login)) return ResponseEntity.status(302).header("Location", "/wrapped.html").build();
        String title = "@" + login + "'s Sonyx Wrapped: their GitHub year as music";
        String description = "Top languages become genres, the biggest repo becomes the hit single. Get yours.";
        return html(page(title, description, origin() + "/og/w/" + login + ".png", origin() + "/w/" + login,
                "/wrapped.html?u=" + login));
    }

    @GetMapping("/og/r/{owner}/{repo}.png")
    public ResponseEntity<byte[]> repoImage(@PathVariable String owner, @PathVariable String repo) throws Exception {
        RepoRef ref = RepoRef.parse(owner, repo);
        if (ref == null) return ResponseEntity.notFound().build();
        RankingEntry entry = lookup(ref).orElse(null);
        return png(OgImages.repoCard(ref.full(), entry, entry == null ? 0 : rank(entry.score())));
    }

    @GetMapping("/og/w/{login}.png")
    public ResponseEntity<byte[]> wrappedImage(@PathVariable String login) throws Exception {
        if (!WrappedService.validLogin(login)) return ResponseEntity.notFound().build();
        try {
            Map<String, Object> w = wrapped.wrap(login);
            @SuppressWarnings("unchecked")
            Map<String, String> persona = (Map<String, String>) w.get("persona");
            return png(OgImages.wrappedCard((String) w.get("login"), (String) w.get("name"), (String) w.get("genre"),
                    persona.get("title"), (int) w.get("score"), (long) w.get("stars"), (int) w.get("repos")));
        } catch (Exception e) {
            // GitHub unavailable: a generic Wrapped card still makes a nice preview.
            return png(OgImages.wrappedCard(login, "@" + login, null, null, 0, 0, 0));
        }
    }

    private Optional<RankingEntry> lookup(RepoRef ref) {
        try {
            return rankings.latest(ref.key());
        } catch (Exception e) {
            log.debug("Leaderboard unavailable for {}: {}", ref.full(), e.getMessage());
            return Optional.empty();
        }
    }

    private int rank(double score) {
        try {
            return rankings.rankOf(score);
        } catch (Exception e) {
            return 0;
        }
    }

    private static ResponseEntity<String> html(String body) {
        return ResponseEntity.ok().contentType(MediaType.TEXT_HTML)
                .cacheControl(CacheControl.maxAge(Duration.ofMinutes(10)).cachePublic()).body(body);
    }

    private static ResponseEntity<byte[]> png(byte[] bytes) {
        return ResponseEntity.ok().contentType(MediaType.IMAGE_PNG)
                .cacheControl(CacheControl.maxAge(Duration.ofHours(6)).cachePublic()).body(bytes);
    }

    private static String origin() {
        return ServletUriComponentsBuilder.fromCurrentContextPath().build().toUriString();
    }

    /** A tiny page: Open Graph / Twitter tags for link previews, then straight on to the app. */
    static String page(String title, String description, String image, String url, String target) {
        String t = RepoRef.escape(title);
        String d = RepoRef.escape(description);
        String i = RepoRef.escape(image);
        String u = RepoRef.escape(url);
        String go = RepoRef.escape(target);
        return """
                <!doctype html>
                <html lang="en"><head>
                <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
                <title>%1$s</title>
                <meta name="description" content="%2$s">
                <meta property="og:type" content="website">
                <meta property="og:site_name" content="Sonyx">
                <meta property="og:title" content="%1$s">
                <meta property="og:description" content="%2$s">
                <meta property="og:image" content="%3$s">
                <meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
                <meta property="og:url" content="%4$s">
                <meta name="twitter:card" content="summary_large_image">
                <meta name="twitter:title" content="%1$s">
                <meta name="twitter:description" content="%2$s">
                <meta name="twitter:image" content="%3$s">
                <meta http-equiv="refresh" content="0; url=%5$s">
                <link rel="canonical" href="%4$s">
                <style>body{margin:0;display:grid;place-items:center;height:100vh;background:#060914;color:#e2e8f0;font:16px system-ui,sans-serif}a{color:#2dd4bf}</style>
                </head><body><p>Opening <a href="%5$s">Sonyx</a>…</p>
                <script>location.replace(%6$s)</script></body></html>
                """.formatted(t, d, i, u, go, jsString(target));
    }

    /** A JavaScript string literal that cannot break out of the script tag. */
    static String jsString(String s) {
        StringBuilder b = new StringBuilder("\"");
        for (char c : s.toCharArray()) {
            if (Character.isLetterOrDigit(c) || "/?=._-&".indexOf(c) >= 0) b.append(c);
            else b.append(String.format("\\u%04x", (int) c));
        }
        return b.append('"').toString();
    }
}
