package com.codefugue.backend.shop;

import com.codefugue.backend.account.AppUser;
import com.codefugue.backend.account.UserRepository;
import com.codefugue.backend.billing.BillingException;
import com.codefugue.backend.billing.BillingSettings;
import com.codefugue.backend.billing.StripeGateway;
import com.stripe.model.checkout.Session;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;

/**
 * Cosmetics shop: one-time purchases through Stripe Checkout.
 *  - The price comes from {@link ShopCatalog}, never from the browser.
 *  - Items are granted only by the signed checkout.session.completed webhook, once Stripe says it is paid.
 *  - Without Stripe keys the shop runs in demo mode: every item is unlocked for everyone.
 */
@Service
public class ShopService {

    private static final Logger log = LoggerFactory.getLogger(ShopService.class);
    static final String META_USER = "sonyx_user_id";
    static final String META_ITEM = "sonyx_item_id";

    private final BillingSettings settings;
    private final StripeGateway stripe;
    private final ShopRepository repo;
    private final UserRepository users;

    public ShopService(BillingSettings settings, StripeGateway stripe, ShopRepository repo, UserRepository users) {
        this.settings = settings;
        this.stripe = stripe;
        this.repo = repo;
        this.users = users;
    }

    /** Payments are possible: a Stripe key and webhook secret are set (a Pro price is not required). */
    public boolean enabled() {
        return settings.paymentsEnabled();
    }

    /** Ids this user may use: free items, plus purchases (or everything in demo mode). */
    public Set<String> unlocked(AppUser user) {
        Set<String> ids = new LinkedHashSet<>();
        for (ShopItem i : ShopCatalog.all()) {
            if (i.free() || !enabled()) ids.add(i.id());
        }
        if (user != null && enabled()) ids.addAll(repo.owned(user.id()));
        return ids;
    }

    public ShopRepository.Loadout loadout(AppUser user) {
        if (user == null) return ShopRepository.Loadout.DEFAULT;
        return repo.loadout(user.id()).orElse(ShopRepository.Loadout.DEFAULT);
    }

    public ShopRepository.Loadout equip(AppUser user, ShopRepository.Loadout wanted) {
        Set<String> mine = unlocked(user);
        check(wanted.skin(), "skin", mine);
        check(wanted.style(), "style", mine);
        check(wanted.world(), "world", mine);
        repo.saveLoadout(user.id(), wanted);
        return wanted;
    }

    private static void check(String id, String kind, Set<String> mine) {
        if (!ShopCatalog.isKind(id, kind)) throw new BillingException(400, "unknown_item", "Unknown " + kind + ": " + id);
        if (!mine.contains(id)) throw new BillingException(403, "not_owned", "You don't own that yet");
    }

    /** Starts a one-time Stripe Checkout for an item; returns the URL to send the browser to. */
    public String checkoutUrl(AppUser user, String itemId, String baseUrl) {
        if (!enabled()) throw new BillingException(503, "billing_disabled", "Payments are not set up on this server");
        ShopItem item = ShopCatalog.find(itemId)
                .orElseThrow(() -> new BillingException(404, "unknown_item", "That item doesn't exist"));
        if (item.free()) throw new BillingException(400, "free_item", "That item is free");
        Set<String> mine = unlocked(user);
        if (ShopCatalog.unlocks(item).stream().allMatch(mine::contains)) {
            throw new BillingException(409, "already_owned", "You already own that");
        }
        try {
            String customer = user.stripeCustomerId();
            if (customer == null) {
                customer = stripe.createCustomer(user);
                users.setStripeCustomerId(user.id(), customer);
            }
            String back = baseUrl + "/?shop=" + item.id();
            return stripe.createPaymentCheckout(customer, "Sonyx · " + item.name(), item.description(), item.price(),
                    settings.currency(), back + "&purchase=success", back + "&purchase=cancelled",
                    Map.of(META_USER, Long.toString(user.id()), META_ITEM, item.id()));
        } catch (BillingException e) {
            throw e;
        } catch (Exception e) {
            log.warn("Stripe shop checkout failed for user {}: {}", user.id(), e.getMessage());
            throw new BillingException(502, "stripe_error", "Could not start checkout. Please try again.");
        }
    }

    /** checkout.session.completed / async_payment_succeeded: grant the item once the payment is confirmed. */
    public void fulfil(Session session) {
        if (!"payment".equals(session.getMode())) return; // subscriptions are handled elsewhere
        if (!"paid".equals(session.getPaymentStatus()) && !"no_payment_required".equals(session.getPaymentStatus())) {
            log.info("Shop session {} not paid yet ({})", session.getId(), session.getPaymentStatus());
            return;
        }
        Map<String, String> meta = session.getMetadata();
        String userId = meta == null ? null : meta.get(META_USER);
        ShopItem item = ShopCatalog.find(meta == null ? null : meta.get(META_ITEM)).orElse(null);
        if (userId == null || item == null) {
            log.warn("Shop session {} has no usable Sonyx metadata", session.getId());
            return;
        }
        repo.grant(Long.parseLong(userId), ShopCatalog.unlocks(item), session.getId());
        log.info("Shop: user {} bought {} (session {})", userId, item.id(), session.getId());
    }
}
