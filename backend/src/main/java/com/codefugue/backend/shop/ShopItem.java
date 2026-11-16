package com.codefugue.backend.shop;

import java.util.List;

/**
 * Something you can buy in the shop. Prices live here, on the server: the browser only ever sends an item id,
 * so nobody can change what they pay.
 *
 * @param kind     "skin" (building materials), "style" (building shapes), "world" (city background) or "bundle"
 * @param price    in the currency's smallest unit (pence); 0 means free for everyone
 * @param includes for bundles: the items it unlocks
 */
public record ShopItem(String id, String kind, String name, String description, long price, List<String> includes) {

    public boolean free() {
        return price == 0;
    }

    public boolean bundle() {
        return "bundle".equals(kind);
    }
}
