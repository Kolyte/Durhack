package com.codefugue.backend.share;

import com.codefugue.backend.ranking.RankingEntry;
import org.junit.jupiter.api.Test;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.time.Instant;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ShareTest {

    @Test
    void onlyAcceptsRealLookingRepoNames() {
        assertNotNull(RepoRef.parse("facebook", "react"));
        assertNotNull(RepoRef.parse("spring-projects", "spring-petclinic"));
        assertNotNull(RepoRef.parse("vercel", "next.js"));
        assertNull(RepoRef.parse("a", ".."));
        assertNull(RepoRef.parse("<script>", "x"));
        assertNull(RepoRef.parse("owner", "na me"));
        assertNull(RepoRef.parse("owner", "x\"onload=\"y"));
    }

    @Test
    void badgeIsValidSvgAndEscapesText() {
        String svg = Badge.svg("🎧 sonyx", "score <1> & \"2\"", "#0d9488");
        assertTrue(svg.startsWith("<svg"));
        assertTrue(svg.contains("score &lt;1&gt; &amp; &quot;2&quot;"));
        assertFalse(svg.contains("<1>"));
        assertTrue(Badge.textWidth("score 99.9 · #1") > Badge.textWidth("score"));
    }

    @Test
    void sharePageEscapesEverythingAndRedirects() {
        String html = ShareController.page("Hear <b> & \"x\"", "desc", "https://s/og.png", "https://s/r/a/b", "/?repo=a/b");
        assertTrue(html.contains("<meta property=\"og:title\" content=\"Hear &lt;b&gt; &amp; &quot;x&quot;\">"));
        assertTrue(html.contains("twitter:card\" content=\"summary_large_image"));
        assertTrue(html.contains("url=/?repo=a/b"));
        // Script strings can't close the tag or break out of the literal.
        assertEquals("\"/?repo=a/b\\u003c/script\\u003e\"", ShareController.jsString("/?repo=a/b</script>"));
        assertFalse(ShareController.jsString("x</script>").contains("<"));
    }

    @Test
    void previewImagesAre1200x630Pngs() throws Exception {
        RankingEntry e = new RankingEntry("facebook/react", 74.2, 60, 80, 70, 30, 90, 230000, 48, 1200, 3, Instant.now());
        for (byte[] png : new byte[][]{
                OgImages.repoCard("facebook/react", e, 3),
                OgImages.repoCard("someone/unknown", null, 0),
                OgImages.wrappedCard("octocat", "The Octocat", "Synthwave", "The Headliner", 87, 3100, 42)}) {
            BufferedImage img = ImageIO.read(new ByteArrayInputStream(png));
            assertEquals(1200, img.getWidth());
            assertEquals(630, img.getHeight());
        }
    }
}
