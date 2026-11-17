package com.codefugue.backend.shop;

import com.codefugue.backend.account.AppUser;
import com.codefugue.backend.account.UserRepository;
import com.codefugue.backend.billing.BillingException;
import com.codefugue.backend.billing.BillingService;
import com.codefugue.backend.billing.BillingSettings;
import com.codefugue.backend.billing.StripeGateway;
import com.codefugue.backend.billing.StripeSignatures;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ShopServiceTest {

    private static final String SECRET = "whsec_shop";
    private final BillingSettings settings = new BillingSettings("sk_test_x", "", SECRET, "", "", "gbp");
    private final StripeGateway stripe = mock(StripeGateway.class);
    private final ShopRepository repo = mock(ShopRepository.class);
    private final UserRepository users = mock(UserRepository.class);
    private final ShopService shop = new ShopService(settings, stripe, repo, users);
    private final BillingService billing = new BillingService(settings, stripe, users, shop);

    private static final AppUser USER = new AppUser(7, 42, "octocat", null, null, null, "cus_1", null, null, null);

    private static String completed(String mode, String paymentStatus, String itemId) {
        return """
                {"id":"evt_s","object":"event","type":"checkout.session.completed","api_version":"2025-01-27.acacia",
                 "data":{"object":{"id":"cs_1","object":"checkout.session","mode":"%s","payment_status":"%s",
                   "metadata":{"sonyx_user_id":"7","sonyx_item_id":"%s"}}}}""".formatted(mode, paymentStatus, itemId);
    }

    private void deliver(String payload) throws Exception {
        billing.handleWebhook(payload, StripeSignatures.sign(SECRET, payload, Instant.now().getEpochSecond()));
    }

    @Test
    void checkoutChargesTheCataloguePriceForTheItem() throws Exception {
        when(repo.owned(7)).thenReturn(Set.of());
        when(stripe.createPaymentCheckout(any(), any(), any(), anyLong(), any(), any(), any(), any())).thenReturn("https://checkout.stripe.com/x");

        assertEquals("https://checkout.stripe.com/x", shop.checkoutUrl(USER, "skin.gold", "https://sonyx.example"));
        verify(stripe).createPaymentCheckout(eq("cus_1"), eq("Sonyx · Gold Rush"), any(), eq(199L), eq("gbp"),
                eq("https://sonyx.example/?shop=skin.gold&purchase=success"),
                eq("https://sonyx.example/?shop=skin.gold&purchase=cancelled"),
                eq(Map.of("sonyx_user_id", "7", "sonyx_item_id", "skin.gold")));
    }

    @Test
    void refusesUnknownFreeAndAlreadyOwnedItems() {
        when(repo.owned(7)).thenReturn(Set.of("skin.gold"));
        assertEquals(404, assertThrows(BillingException.class, () -> shop.checkoutUrl(USER, "skin.nope", "x")).status());
        assertEquals(400, assertThrows(BillingException.class, () -> shop.checkoutUrl(USER, "skin.neon", "x")).status());
        assertEquals(409, assertThrows(BillingException.class, () -> shop.checkoutUrl(USER, "skin.gold", "x")).status());
    }

    @Test
    void paidCheckoutWebhookGrantsTheItem() throws Exception {
        deliver(completed("payment", "paid", "world.aurora"));
        verify(repo).grant(7, List.of("world.aurora"), "cs_1");
    }

    @Test
    void bundleGrantsEverythingInIt() throws Exception {
        deliver(completed("payment", "paid", "bundle.everything"));
        ShopItem bundle = ShopCatalog.find("bundle.everything").orElseThrow();
        verify(repo).grant(7, ShopCatalog.unlocks(bundle), "cs_1");
        assertTrue(ShopCatalog.unlocks(bundle).containsAll(List.of("skin.matrix", "style.kingdom", "world.lunar")));
        assertFalse(ShopCatalog.unlocks(bundle).contains("skin.neon")); // free items aren't "bought"
    }

    @Test
    void unpaidOrSubscriptionSessionsGrantNothing() throws Exception {
        deliver(completed("payment", "unpaid", "skin.gold"));
        deliver(completed("subscription", "paid", "skin.gold"));
        verify(repo, never()).grant(anyLong(), any(), any());
    }

    @Test
    void forgedPurchaseWebhookIsRejected() {
        String payload = completed("payment", "paid", "bundle.everything");
        assertEquals(400, assertThrows(BillingException.class, () -> billing.handleWebhook(payload, "t=1,v1=00")).status());
        verify(repo, never()).grant(anyLong(), any(), any());
    }

    @Test
    void canOnlyEquipOwnedItems() {
        when(repo.owned(7)).thenReturn(Set.of("world.aurora"));
        shop.equip(USER, new ShopRepository.Loadout("skin.neon", "style.classic", "world.aurora"));
        verify(repo).saveLoadout(7, new ShopRepository.Loadout("skin.neon", "style.classic", "world.aurora"));
        assertEquals(403, assertThrows(BillingException.class,
                () -> shop.equip(USER, new ShopRepository.Loadout("skin.matrix", "style.classic", "world.night"))).status());
        assertEquals(400, assertThrows(BillingException.class,
                () -> shop.equip(USER, new ShopRepository.Loadout("world.aurora", "style.classic", "world.night"))).status());
    }

    @Test
    void demoModeUnlocksEverythingWithoutKeys() {
        ShopService demo = new ShopService(new BillingSettings("", "", "", "", "", ""), stripe, repo, users);
        assertEquals(ShopCatalog.all().size(), demo.unlocked(USER).size());
        assertEquals(503, assertThrows(BillingException.class, () -> demo.checkoutUrl(USER, "skin.gold", "x")).status());
        when(repo.loadout(7)).thenReturn(Optional.empty());
        assertEquals(ShopRepository.Loadout.DEFAULT, demo.loadout(USER));
    }
}
