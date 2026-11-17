package com.codefugue.backend.wrapped;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import tools.jackson.databind.JsonNode;

import java.time.Clock;
import java.time.Instant;
import java.time.Month;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.format.TextStyle;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Pattern;

/**
 * Sonyx Wrapped: a GitHub profile turned into a "year in sound". Uses only public data (the profile and
 * public repositories) and caches each result for an hour, so sharing a link doesn't burn the API quota.
 */
@Service
public class WrappedService {

    private static final Logger log = LoggerFactory.getLogger(WrappedService.class);
    private static final Pattern LOGIN = Pattern.compile("^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$");
    private static final long CACHE_MS = 60 * 60 * 1000;

    /** Language → the genre it sounds like in Sonyx, and the music preset that plays it. */
    record Sound(String genre, String instrument, String preset) {
    }

    private static final Map<String, Sound> SOUNDS = new HashMap<>();
    private static final Sound DEFAULT_SOUND = new Sound("Experimental", "modular synth", "electronic");

    static {
        SOUNDS.put("JavaScript", new Sound("Electro-pop", "bright synth lead", "electronic"));
        SOUNDS.put("TypeScript", new Sound("Synthwave", "analog arpeggiator", "synthwave"));
        SOUNDS.put("Python", new Sound("Lo-fi hip hop", "dusty Rhodes piano", "lofi"));
        SOUNDS.put("Java", new Sound("Orchestral", "string section", "cinematic"));
        SOUNDS.put("Kotlin", new Sound("Dream pop", "shimmering guitar", "ambient"));
        SOUNDS.put("Go", new Sound("Minimal techno", "tight 909 kick", "techno"));
        SOUNDS.put("Rust", new Sound("Industrial techno", "distorted bass", "techno"));
        SOUNDS.put("C", new Sound("Drum & bass", "breakbeat", "electronic"));
        SOUNDS.put("C++", new Sound("Drum & bass", "reese bass", "electronic"));
        SOUNDS.put("C#", new Sound("Cinematic", "brass", "cinematic"));
        SOUNDS.put("Ruby", new Sound("Indie pop", "jangly guitar", "lofi"));
        SOUNDS.put("PHP", new Sound("Funk", "slap bass", "house"));
        SOUNDS.put("Swift", new Sound("Dream pop", "glass pad", "ambient"));
        SOUNDS.put("Dart", new Sound("Future bass", "supersaw chords", "electronic"));
        SOUNDS.put("Shell", new Sound("Ambient", "drone", "ambient"));
        SOUNDS.put("HTML", new Sound("City pop", "electric piano", "house"));
        SOUNDS.put("CSS", new Sound("City pop", "chorus guitar", "house"));
        SOUNDS.put("Vue", new Sound("Bedroom pop", "soft keys", "lofi"));
        SOUNDS.put("Jupyter Notebook", new Sound("Jazz", "upright bass", "lofi"));
        SOUNDS.put("Haskell", new Sound("Math rock", "tapped guitar", "cinematic"));
        SOUNDS.put("Lua", new Sound("Chiptune", "square wave", "synthwave"));
        SOUNDS.put("Scala", new Sound("Progressive house", "plucked lead", "house"));
        SOUNDS.put("Elixir", new Sound("Neo-soul", "warm organ", "lofi"));
    }

    private static final String[] KEYS = {"C major", "A minor", "D minor", "G major", "E minor", "F major", "B♭ major", "F♯ minor", "E♭ major", "C minor", "A major", "D major"};

    private final GitHubApi github;
    private final Clock clock;
    private final Map<String, Map.Entry<Long, Map<String, Object>>> cache = new ConcurrentHashMap<>();

    @Autowired
    public WrappedService(GitHubApi github) {
        this(github, Clock.systemUTC());
    }

    WrappedService(GitHubApi github, Clock clock) {
        this.github = github;
        this.clock = clock;
    }

    public static boolean validLogin(String login) {
        return login != null && LOGIN.matcher(login).matches();
    }

    public Map<String, Object> wrap(String login) throws Exception {
        String key = login.toLowerCase(Locale.ROOT);
        var hit = cache.get(key);
        long now = clock.millis();
        if (hit != null && now - hit.getKey() < CACHE_MS) return hit.getValue();
        Map<String, Object> result = compute(login);
        cache.put(key, Map.entry(now, result));
        if (cache.size() > 2000) cache.clear(); // crude bound; plenty for a hobby deployment
        return result;
    }

    Map<String, Object> compute(String login) throws Exception {
        JsonNode user = github.get("/users/" + login);
        JsonNode reposJson = github.get("/users/" + login + "/repos?per_page=100&type=owner&sort=pushed");
        int year = OffsetDateTime.now(clock).getYear();

        List<JsonNode> repos = new ArrayList<>();
        for (JsonNode r : reposJson) if (!r.path("fork").asBoolean(false)) repos.add(r);

        long stars = 0, forks = 0, sizeKb = 0;
        Map<String, Integer> langCount = new LinkedHashMap<>();
        Map<String, Long> langSize = new HashMap<>();
        Map<Month, Integer> months = new HashMap<>();
        int activeThisYear = 0, newThisYear = 0;
        for (JsonNode r : repos) {
            stars += r.path("stargazers_count").asLong(0);
            forks += r.path("forks_count").asLong(0);
            long size = r.path("size").asLong(0);
            sizeKb += size;
            String lang = r.path("language").asString("");
            if (!lang.isEmpty()) {
                langCount.merge(lang, 1, Integer::sum);
                langSize.merge(lang, Math.max(1, size), Long::sum);
            }
            OffsetDateTime pushed = date(r.path("pushed_at").asString(""));
            OffsetDateTime created = date(r.path("created_at").asString(""));
            if (pushed != null && pushed.getYear() == year) {
                activeThisYear++;
                months.merge(pushed.getMonth(), 1, Integer::sum);
            }
            if (created != null && created.getYear() == year) {
                newThisYear++;
                months.merge(created.getMonth(), 1, Integer::sum);
            }
        }

        // Top languages: by number of repos, ties broken by code size.
        long totalLangRepos = langCount.values().stream().mapToLong(Integer::longValue).sum();
        List<Map<String, Object>> languages = langCount.entrySet().stream()
                .sorted(Comparator.<Map.Entry<String, Integer>>comparingInt(Map.Entry::getValue).reversed()
                        .thenComparing(e -> -langSize.getOrDefault(e.getKey(), 0L)))
                .limit(5)
                .map(e -> {
                    Sound s = SOUNDS.getOrDefault(e.getKey(), DEFAULT_SOUND);
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("name", e.getKey());
                    m.put("repos", e.getValue());
                    m.put("share", Math.round(100.0 * e.getValue() / Math.max(1, totalLangRepos)));
                    m.put("genre", s.genre());
                    return m;
                })
                .toList();
        String topLang = languages.isEmpty() ? null : (String) languages.get(0).get("name");
        Sound sound = topLang == null ? DEFAULT_SOUND : SOUNDS.getOrDefault(topLang, DEFAULT_SOUND);

        JsonNode top = repos.stream().max(Comparator.comparingLong(r -> r.path("stargazers_count").asLong(0))).orElse(null);
        JsonNode latest = repos.stream().max(Comparator.comparing(r -> r.path("pushed_at").asString(""))).orElse(null);
        Month busiest = months.entrySet().stream().max(Map.Entry.comparingByValue()).map(Map.Entry::getKey).orElse(null);

        OffsetDateTime joined = date(user.path("created_at").asString(""));
        int years = joined == null ? 0 : Math.max(0, year - joined.getYear());
        int bpm = (int) Math.min(160, 72 + activeThisYear * 4L + newThisYear * 2L);
        String musicalKey = KEYS[Math.floorMod(login.toLowerCase(Locale.ROOT).hashCode(), KEYS.length)];

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("login", user.path("login").asString(login));
        out.put("name", user.path("name").asString(""));
        out.put("avatarUrl", user.path("avatar_url").asString(""));
        out.put("year", year);
        out.put("followers", user.path("followers").asLong(0));
        out.put("memberYears", years);
        out.put("repos", repos.size());
        out.put("stars", stars);
        out.put("forks", forks);
        out.put("linesEstimate", sizeKb * 25); // GitHub reports size in KB; ~25 lines per KB of source
        out.put("activeThisYear", activeThisYear);
        out.put("newThisYear", newThisYear);
        out.put("busiestMonth", busiest == null ? null : busiest.getDisplayName(TextStyle.FULL, Locale.ENGLISH));
        out.put("languages", languages);
        out.put("genre", sound.genre());
        out.put("instrument", sound.instrument());
        out.put("preset", sound.preset());
        out.put("bpm", bpm);
        out.put("key", musicalKey);
        out.put("topRepo", repoSummary(top));
        out.put("latestRepo", repoSummary(latest));
        out.put("persona", persona(repos.size(), stars, langCount.size(), activeThisYear, years));
        out.put("score", score(stars, repos.size(), langCount.size(), activeThisYear, user.path("followers").asLong(0)));
        log.info("Wrapped {}: {} repos, {} stars, top language {}", login, repos.size(), stars, topLang);
        return out;
    }

    private static Map<String, Object> repoSummary(JsonNode r) {
        if (r == null) return null;
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("name", r.path("name").asString(""));
        m.put("fullName", r.path("full_name").asString(""));
        m.put("description", r.path("description").asString(""));
        m.put("language", r.path("language").asString(""));
        m.put("stars", r.path("stargazers_count").asLong(0));
        return m;
    }

    /** A playful headline for the profile. */
    static Map<String, String> persona(int repos, long stars, int languages, int active, int years) {
        String title;
        String line;
        if (stars >= 1000) {
            title = "The Headliner";
            line = "Thousands of people know your songs by heart.";
        } else if (languages >= 6) {
            title = "The Polyglot";
            line = "You switch genres like a festival DJ.";
        } else if (active >= 15) {
            title = "The Machine";
            line = "Release after release: your studio never sleeps.";
        } else if (repos >= 30) {
            title = "The Collector";
            line = "A huge back catalogue of B-sides and experiments.";
        } else if (years >= 8) {
            title = "The Veteran";
            line = "You were making music before it was cool.";
        } else if (repos <= 3) {
            title = "The Rising Star";
            line = "A small, carefully crafted debut. The best is still ahead.";
        } else {
            title = "The Builder";
            line = "Steady grooves and solid foundations.";
        }
        return Map.of("title", title, "line", line);
    }

    /** 0–100, roughly logarithmic so both newcomers and maintainers of huge projects land somewhere fun. */
    static int score(long stars, int repos, int languages, int active, long followers) {
        double s = 18 * Math.log10(1 + stars) + 10 * Math.log10(1 + repos) + 3 * Math.min(languages, 8)
                + 2.2 * Math.min(active, 15) + 6 * Math.log10(1 + followers);
        return (int) Math.max(1, Math.min(100, Math.round(s)));
    }

    private static OffsetDateTime date(String iso) {
        if (iso == null || iso.isEmpty()) return null;
        try {
            return Instant.parse(iso).atOffset(ZoneOffset.UTC);
        } catch (Exception e) {
            return null;
        }
    }
}
