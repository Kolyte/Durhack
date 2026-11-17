package com.codefugue.backend.battle;

import com.codefugue.backend.share.RepoRef;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.dao.DataAccessException;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

/**
 * Repo battles: "which codebase sounds better?" The analysis itself runs in the browser (the same pipeline
 * as the composer); the server only keeps the votes. Voters are identified by an anonymous cookie, stored hashed.
 */
@RestController
public class BattleController {

    static final String COOKIE = "sonyx_voter";
    private final BattleRepository votes;

    public BattleController(BattleRepository votes) {
        this.votes = votes;
    }

    /** Normalised, ordered pair, or null if either side isn't a valid "owner/name". */
    static String[] pair(String a, String b) {
        String x = norm(a);
        String y = norm(b);
        if (x == null || y == null || x.equals(y)) return null;
        return x.compareTo(y) < 0 ? new String[]{x, y} : new String[]{y, x};
    }

    static String norm(String s) {
        if (s == null) return null;
        String[] parts = s.trim().replaceFirst("^https?://(www\\.)?github\\.com/", "").replaceAll("/+$", "").split("/");
        if (parts.length != 2) return null;
        RepoRef ref = RepoRef.parse(parts[0], parts[1]);
        return ref == null ? null : ref.key();
    }

    @GetMapping("/api/battles/votes")
    public ResponseEntity<?> tally(@RequestParam String a, @RequestParam String b, HttpServletRequest req) {
        String[] p = pair(a, b);
        if (p == null) return bad();
        try {
            return ResponseEntity.ok(body(p, voterFrom(req)));
        } catch (DataAccessException e) {
            return offline();
        }
    }

    @PostMapping("/api/battles/vote")
    public ResponseEntity<?> vote(@RequestBody Map<String, String> in, HttpServletRequest req, HttpServletResponse res) {
        String[] p = pair(in.get("a"), in.get("b"));
        String choice = norm(in.get("choice"));
        if (p == null || choice == null || (!choice.equals(p[0]) && !choice.equals(p[1]))) return bad();
        String voter = voterFrom(req);
        if (voter == null) {
            String raw = UUID.randomUUID().toString();
            Cookie c = new Cookie(COOKIE, raw);
            c.setHttpOnly(true);
            c.setPath("/");
            c.setMaxAge(60 * 60 * 24 * 365);
            c.setSecure(req.isSecure());
            c.setAttribute("SameSite", "Lax");
            res.addCookie(c);
            voter = hash(raw);
        }
        try {
            votes.vote(p[0], p[1], voter, choice);
            return ResponseEntity.ok(body(p, voter));
        } catch (DataAccessException e) {
            return offline();
        }
    }

    @GetMapping("/api/battles/popular")
    public ResponseEntity<?> popular() {
        try {
            return ResponseEntity.ok(votes.popular(8));
        } catch (DataAccessException e) {
            return offline();
        }
    }

    private Map<String, Object> body(String[] p, String voter) {
        Map<String, Long> counts = votes.counts(p[0], p[1]);
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("votes", counts);
        m.put("mine", voter == null ? null : votes.myVote(p[0], p[1], voter));
        return m;
    }

    private static String voterFrom(HttpServletRequest req) {
        if (req.getCookies() == null) return null;
        for (Cookie c : req.getCookies()) {
            if (COOKIE.equals(c.getName()) && c.getValue() != null && c.getValue().length() <= 64) return hash(c.getValue());
        }
        return null;
    }

    static String hash(String s) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(s.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private static ResponseEntity<?> bad() {
        return ResponseEntity.badRequest().body(Map.of("error", "bad_battle", "message", "Pick two different public repos (owner/name)"));
    }

    private static ResponseEntity<?> offline() {
        return ResponseEntity.status(503).body(Map.of("error", "offline", "message", "Voting is offline right now"));
    }
}
