package com.codefugue.backend.shop;

import com.codefugue.backend.account.AccountService;
import com.codefugue.backend.account.AppUser;
import com.codefugue.backend.billing.BillingException;
import com.codefugue.backend.billing.BillingSettings;
import org.springframework.dao.DataAccessException;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

import java.security.Principal;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

@RestController
public class ShopController {

    private final ShopService shop;
    private final AccountService accounts;
    private final BillingSettings settings;

    public ShopController(ShopService shop, AccountService accounts, BillingSettings settings) {
        this.shop = shop;
        this.accounts = accounts;
        this.settings = settings;
    }

    /** GET /api/shop → catalogue with prices, what you own, and your saved look. */
    @GetMapping("/api/shop")
    public Map<String, Object> catalogue(Principal principal) {
        AppUser user = accounts.current(principal).orElse(null);
        Set<String> unlocked;
        ShopRepository.Loadout loadout;
        try {
            unlocked = shop.unlocked(user);
            loadout = shop.loadout(user);
        } catch (DataAccessException e) {
            unlocked = shop.unlocked(null);
            loadout = ShopRepository.Loadout.DEFAULT;
        }
        Set<String> mine = unlocked;
        List<Map<String, Object>> items = ShopCatalog.all().stream().map(i -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", i.id());
            m.put("kind", i.kind());
            m.put("name", i.name());
            m.put("description", i.description());
            m.put("price", i.price());
            m.put("includes", i.includes());
            m.put("owned", mine.contains(i.id()));
            return m;
        }).toList();
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("demo", !shop.enabled());
        body.put("currency", settings.currency());
        body.put("items", items);
        body.put("loadout", user == null ? null : loadout);
        return body;
    }

    /** POST /api/shop/checkout { itemId } → { url } of a Stripe Checkout page. */
    @PostMapping("/api/shop/checkout")
    public ResponseEntity<?> checkout(@RequestBody Map<String, String> body, Principal principal) {
        return withUser(principal, u -> Map.of("url", shop.checkoutUrl(u, body.get("itemId"), baseUrl())));
    }

    /** PUT /api/shop/loadout { skin, style, world } → saves the look you picked (only items you own). */
    @PutMapping("/api/shop/loadout")
    public ResponseEntity<?> equip(@RequestBody ShopRepository.Loadout body, Principal principal) {
        return withUser(principal, u -> shop.equip(u, body));
    }

    private ResponseEntity<?> withUser(Principal principal, java.util.function.Function<AppUser, Object> action) {
        AppUser user = accounts.current(principal).orElse(null);
        if (user == null) {
            return ResponseEntity.status(401).body(Map.of("error", "sign_in", "message", "Please sign in first"));
        }
        try {
            return ResponseEntity.ok(action.apply(user));
        } catch (BillingException e) {
            return ResponseEntity.status(e.status()).body(Map.of("error", e.reason(), "message", e.getMessage()));
        }
    }

    private String baseUrl() {
        if (!settings.appBaseUrl().isEmpty()) return settings.appBaseUrl();
        return ServletUriComponentsBuilder.fromCurrentContextPath().build().toUriString();
    }
}
