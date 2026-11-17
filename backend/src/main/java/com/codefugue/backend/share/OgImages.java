package com.codefugue.backend.share;

import com.codefugue.backend.ranking.RankingEntry;

import javax.imageio.ImageIO;
import java.awt.BasicStroke;
import java.awt.Color;
import java.awt.Font;
import java.awt.GradientPaint;
import java.awt.Graphics2D;
import java.awt.RadialGradientPaint;
import java.awt.RenderingHints;
import java.awt.geom.Path2D;
import java.awt.geom.RoundRectangle2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.util.Locale;

/**
 * Link-preview images (1200×630, the size X, Discord, Slack and LinkedIn expect), drawn with Java2D so no
 * browser is needed on the server. The repo card shows the name, score and the Code DNA radar.
 */
final class OgImages {

    static final int W = 1200;
    static final int H = 630;
    private static final Color TEAL = new Color(0x2dd4bf);
    private static final Color PINK = new Color(0xf472b6);
    private static final Color LAVENDER = new Color(0xa78bfa);
    private static final Color MUTED = new Color(0x94a3b8);

    private OgImages() {
    }

    static byte[] repoCard(String repo, RankingEntry entry, int rank) throws Exception {
        BufferedImage img = new BufferedImage(W, H, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = canvas(img);

        g.setColor(TEAL);
        g.setFont(font(Font.BOLD, 30));
        g.drawString("◈ SONYX", 70, 95);
        g.setColor(MUTED);
        g.setFont(font(Font.PLAIN, 28));
        g.drawString("Hear this codebase as music", 70, 140);

        g.setColor(Color.WHITE);
        g.setFont(fit(g, repo, Font.BOLD, 74, 640));
        g.drawString(repo, 70, 250);

        if (entry != null) {
            g.setColor(new Color(0xfbcfe8));
            g.setFont(font(Font.BOLD, 30));
            g.drawString("CODE DNA SCORE", 70, 340);
            g.setColor(Color.WHITE);
            g.setFont(font(Font.BOLD, 120));
            g.drawString(String.format(Locale.ROOT, "%.1f", entry.score()), 62, 460);
            g.setColor(MUTED);
            g.setFont(font(Font.PLAIN, 30));
            String sub = (rank > 0 ? "#" + rank + " on the leaderboard · " : "") + compact(entry.stars()) + " ★";
            g.drawString(sub, 70, 515);
            radar(g, 930, 330, 190, new double[]{entry.complexity(), entry.connectivity(), entry.modularity(),
                    entry.concurrency(), entry.size()});
        } else {
            g.setColor(Color.WHITE);
            g.setFont(font(Font.BOLD, 54));
            g.drawString("▶ Press play", 70, 380);
            g.setColor(MUTED);
            g.setFont(font(Font.PLAIN, 30));
            g.drawString("Directories become instruments,", 70, 440);
            g.drawString("imports become melodies.", 70, 482);
            equalizer(g, 760, 520, 360, 240);
        }
        footer(g);
        return png(img);
    }

    static byte[] wrappedCard(String login, String name, String genre, String persona, int score, long stars, int repos) throws Exception {
        BufferedImage img = new BufferedImage(W, H, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = canvas(img);
        g.setColor(TEAL);
        g.setFont(font(Font.BOLD, 30));
        g.drawString("◈ SONYX WRAPPED", 70, 95);
        g.setColor(Color.WHITE);
        String who = name == null || name.isBlank() ? "@" + login : name;
        g.setFont(fit(g, who, Font.BOLD, 56, 1000));
        g.drawString(who, 70, 180);
        boolean known = genre != null;
        g.setColor(new Color(0xfbcfe8));
        g.setFont(font(Font.BOLD, 32));
        g.drawString(known ? "My code sounds like" : "What does your code sound like?", 70, 280);
        g.setColor(Color.WHITE);
        String headline = known ? genre : "Your year in sound";
        g.setFont(fit(g, headline, Font.BOLD, 110, 1060));
        g.drawString(headline, 64, 400);
        g.setColor(MUTED);
        g.setFont(font(Font.PLAIN, 32));
        g.drawString(known ? persona + " · " + repos + " repos · " + compact(stars) + " ★ · score " + score
                : "Languages become genres. Your biggest repo is the hit.", 70, 460);
        equalizer(g, 70, 560, 1060, 60);
        footer(g);
        return png(img);
    }

    private static Graphics2D canvas(BufferedImage img) {
        Graphics2D g = img.createGraphics();
        g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        g.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON);
        g.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
        g.setPaint(new GradientPaint(0, 0, new Color(0x060914), W, H, new Color(0x2e1065)));
        g.fillRect(0, 0, W, H);
        glow(g, 180, 120, 420, new Color(45, 212, 191, 70));
        glow(g, 1050, 560, 520, new Color(244, 114, 182, 70));
        return g;
    }

    private static void glow(Graphics2D g, float x, float y, float r, Color c) {
        g.setPaint(new RadialGradientPaint(x, y, r, new float[]{0f, 1f}, new Color[]{c, new Color(c.getRed(), c.getGreen(), c.getBlue(), 0)}));
        g.fillRect(0, 0, W, H);
    }

    /** The five Code DNA axes as a filled pentagon. */
    private static void radar(Graphics2D g, int cx, int cy, int r, double[] values) {
        int n = values.length;
        g.setStroke(new BasicStroke(1.5f));
        for (int ring = 1; ring <= 4; ring++) {
            g.setColor(new Color(148, 163, 184, 60));
            g.draw(polygon(cx, cy, r * ring / 4.0, n, null));
        }
        Path2D shape = polygon(cx, cy, r, n, values);
        g.setPaint(new GradientPaint(cx - r, cy - r, new Color(45, 212, 191, 170), cx + r, cy + r, new Color(244, 114, 182, 170)));
        g.fill(shape);
        g.setColor(TEAL);
        g.setStroke(new BasicStroke(3f));
        g.draw(shape);
        String[] labels = {"Complexity", "Connectivity", "Modularity", "Concurrency", "Size"};
        g.setFont(font(Font.PLAIN, 20));
        g.setColor(MUTED);
        for (int i = 0; i < n; i++) {
            double a = -Math.PI / 2 + i * 2 * Math.PI / n;
            int lx = (int) (cx + Math.cos(a) * (r + 34));
            int ly = (int) (cy + Math.sin(a) * (r + 30));
            int w = g.getFontMetrics().stringWidth(labels[i]);
            g.drawString(labels[i], lx - w / 2, ly + 7);
        }
    }

    private static Path2D polygon(int cx, int cy, double r, int n, double[] values) {
        Path2D p = new Path2D.Double();
        for (int i = 0; i < n; i++) {
            double a = -Math.PI / 2 + i * 2 * Math.PI / n;
            double v = values == null ? 1 : Math.max(0.06, Math.min(1, values[i] / 100.0));
            double x = cx + Math.cos(a) * r * v;
            double y = cy + Math.sin(a) * r * v;
            if (i == 0) p.moveTo(x, y);
            else p.lineTo(x, y);
        }
        p.closePath();
        return p;
    }

    private static void equalizer(Graphics2D g, int x, int baseY, int width, int height) {
        int bars = 24;
        double step = width / (double) bars;
        for (int i = 0; i < bars; i++) {
            double h = height * (0.25 + 0.75 * Math.abs(Math.sin(i * 1.3) * Math.cos(i * 0.37)));
            g.setPaint(new GradientPaint(0, baseY - (float) h, PINK, 0, baseY, TEAL));
            g.fill(new RoundRectangle2D.Double(x + i * step, baseY - h, step * 0.6, h, 8, 8));
        }
    }

    private static void footer(Graphics2D g) {
        g.setColor(LAVENDER);
        g.setFont(font(Font.BOLD, 24));
        g.drawString("City · Galaxy · Tree · 7 music styles", 70, H - 40);
    }

    private static Font font(int style, int size) {
        return new Font(Font.SANS_SERIF, style, size);
    }

    /** Largest font size (up to max) at which the text fits the width. */
    private static Font fit(Graphics2D g, String text, int style, int max, int width) {
        for (int size = max; size > 24; size -= 2) {
            Font f = font(style, size);
            if (g.getFontMetrics(f).stringWidth(text) <= width) return f;
        }
        return font(style, 24);
    }

    private static String compact(long n) {
        if (n >= 1_000_000) return String.format(Locale.ROOT, "%.1fM", n / 1e6);
        if (n >= 1_000) return String.format(Locale.ROOT, "%.1fk", n / 1e3);
        return Long.toString(n);
    }

    private static byte[] png(BufferedImage img) throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        ImageIO.write(img, "png", out);
        return out.toByteArray();
    }
}
