package com.codefugue.backend.shop;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/** Everything in the shop. The ids match the cosmetics the frontend knows how to draw (frontend/src/cosmetics). */
public final class ShopCatalog {

    public static final String DEFAULT_SKIN = "skin.neon";
    public static final String DEFAULT_STYLE = "style.classic";
    public static final String DEFAULT_WORLD = "world.night";

    private static final Map<String, ShopItem> ITEMS = new LinkedHashMap<>();

    static {
        // Building skins: materials, colours and window patterns.
        add("skin.neon", "skin", "Neon", "The classic Sonyx glow.", 0);
        add("skin.cyberpunk", "skin", "Cyberpunk", "Magenta and cyan holo-glass with scanline windows.", 199);
        add("skin.gold", "skin", "Gold Rush", "Polished gold towers with warm amber windows.", 199);
        add("skin.glacier", "skin", "Glacier", "Frosted ice towers with cold blue light.", 199);
        add("skin.volcanic", "skin", "Volcanic", "Obsidian blocks split by glowing lava cracks.", 249);
        add("skin.matrix", "skin", "Matrix", "Black monoliths with falling green code.", 249);
        add("skin.candy", "skin", "Candy", "Pastel sugar towers with sprinkle windows.", 149);
        // Building styles: shapes.
        add("style.classic", "style", "Classic Skyline", "Offices, spires and landmarks.", 0);
        add("style.future", "style", "Future City", "Twisted towers, domes and floating rings.", 299);
        add("style.kingdom", "style", "Kingdom", "Castle keeps, turrets and battlements.", 299);
        add("style.pagoda", "style", "Pagoda", "Tiered towers with sweeping roofs.", 299);
        // Worlds: the city's sky, ground, water and weather.
        add("world.night", "world", "Night City", "Deep space over a quiet city.", 0);
        add("world.synthwave", "world", "Synthwave Sunset", "A striped retro sun over a neon grid.", 249);
        add("world.aurora", "world", "Arctic Aurora", "Snowfall and dancing northern lights.", 249);
        add("world.neonrain", "world", "Neon Rain", "Rain-soaked streets under a pink haze.", 249);
        add("world.desert", "world", "Desert Dusk", "Warm dunes under a huge setting sun.", 199);
        add("world.sakura", "world", "Sakura Spring", "Cherry blossoms drifting over a pastel dawn.", 199);
        add("world.lunar", "world", "Lunar Base", "A moon colony with Earth rising.", 299);

        List<String> everything = new ArrayList<>();
        ITEMS.values().forEach(i -> { if (!i.free()) everything.add(i.id()); });
        ITEMS.put("bundle.everything", new ShopItem("bundle.everything", "bundle", "Everything Pack",
                "Every skin, style and world in the shop, for less than half the price.", 999, List.copyOf(everything)));
    }

    private static void add(String id, String kind, String name, String description, long price) {
        ITEMS.put(id, new ShopItem(id, kind, name, description, price, List.of()));
    }

    private ShopCatalog() {
    }

    public static List<ShopItem> all() {
        return List.copyOf(ITEMS.values());
    }

    public static Optional<ShopItem> find(String id) {
        return Optional.ofNullable(id == null ? null : ITEMS.get(id));
    }

    /** The item ids a purchase unlocks (a bundle unlocks its contents too). */
    public static List<String> unlocks(ShopItem item) {
        if (!item.bundle()) return List.of(item.id());
        List<String> ids = new ArrayList<>(item.includes());
        ids.add(item.id());
        return ids;
    }

    public static boolean isKind(String id, String kind) {
        return find(id).map(i -> i.kind().equals(kind)).orElse(false);
    }
}
