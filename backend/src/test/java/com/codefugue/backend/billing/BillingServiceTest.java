package com.codefugue.backend.billing;

import com.codefugue.backend.account.AppUser;
import com.codefugue.backend.account.UserRepository;
import org.junit.jupiter.api.Test;

import com.codefugue.backend.shop.ShopService;

import java.time.Instant;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class BillingServiceTest {

    private static final String WEBHOOK_SECRET = "whsec_test_secret";
    private final BillingSettings settings = new BillingSettings("sk_test_x", "price_123", WEBHOOK_SECRET, "£4 / month", "", "gbp");
    private final StripeGateway stripe = mock(StripeGateway.class);
    private final UserRepository users = mock(UserRepository.class);
    private final ShopService shop = mock(ShopService.class);
    private final BillingService billing = new BillingService(settings, stripe, users, shop);

    private static AppUser user(String customer, String status) {
        return new AppUser(7, 42, "octocat", "Octo Cat", null, "octo@example.com", customer, null, status, null);
    }

    /** Signs a payload exactly like Stripe does: v1 = HMAC-SHA256(secret, "t.payload"). */
    private static String sign(String payload, long t) throws Exception {
        return StripeSignatures.sign(WEBHOOK_SECRET, payload, t);
    }

    private static String subscriptionEvent(String type, String status) {
        return """
                {"id":"evt_1","object":"event","type":"%s","api_version":"2025-01-27.acacia",
                 "data":{"object":{"id":"sub_1","object":"subscription","customer":"cus_9","status":"%s",
                   "items":{"object":"list","data":[{"id":"si_1","object":"subscription_item","current_period_end":1893456000}]}}}}"""
                .formatted(type, status);
    }

    @Test
    void checkoutCreatesTheStripeCustomerOnceAndReturnsTheCheckoutUrl() throws Exception {
        when(stripe.createCustomer(any())).thenReturn("cus_new");
        when(stripe.createCheckoutSession(any(), any(), any(), any(), any())).thenReturn("https://checkout.stripe.com/c/abc");

        String url = billing.checkoutUrl(user(null, null), "https://sonyx.example");

        assertEquals("https://checkout.stripe.com/c/abc", url);
        verify(users).setStripeCustomerId(7, "cus_new");
        verify(stripe).createCheckoutSession("cus_new", "price_123", "https://sonyx.example/?checkout=success",
                "https://sonyx.example/?checkout=cancelled", "7");

        billing.checkoutUrl(user("cus_existing", "canceled"), "https://sonyx.example");
        verify(stripe, times(1)).createCustomer(any()); // existing customer is reused
    }

    @Test
    void proUsersCannotCheckOutAgain() {
        BillingException e = assertThrows(BillingException.class, () -> billing.checkoutUrl(user("cus_1", "active"), "x"));
        assertEquals(409, e.status());
    }

    @Test
    void signedSubscriptionWebhookUpdatesTheUser() throws Exception {
        when(users.updateSubscription(any(), any(), any(), any())).thenReturn(true);
        String payload = subscriptionEvent("customer.subscription.updated", "active");
        billing.handleWebhook(payload, sign(payload, Instant.now().getEpochSecond()));
        verify(users).updateSubscription("cus_9", "sub_1", "active", Instant.ofEpochSecond(1893456000L));
    }

    @Test
    void deletedSubscriptionMarksItCanceled() throws Exception {
        String payload = subscriptionEvent("customer.subscription.deleted", "active");
        billing.handleWebhook(payload, sign(payload, Instant.now().getEpochSecond()));
        verify(users).updateSubscription(eq("cus_9"), eq("sub_1"), eq("canceled"), any());
    }

    @Test
    void rejectsForgedOrStaleWebhooks() throws Exception {
        String payload = subscriptionEvent("customer.subscription.updated", "active");
        assertEquals(400, assertThrows(BillingException.class, () -> billing.handleWebhook(payload, "t=1,v1=deadbeef")).status());
        String tampered = payload.replace("cus_9", "cus_attacker");
        String goodSigForOriginal = sign(payload, Instant.now().getEpochSecond());
        assertEquals(400, assertThrows(BillingException.class, () -> billing.handleWebhook(tampered, goodSigForOriginal)).status());
        String stale = sign(payload, Instant.now().getEpochSecond() - 3600);
        assertEquals(400, assertThrows(BillingException.class, () -> billing.handleWebhook(payload, stale)).status());
        verify(users, never()).updateSubscription(any(), any(), any(), any());
    }

    @Test
    void everythingIsDisabledWithoutKeys() {
        BillingService off = new BillingService(new BillingSettings("", "", "", "", "", ""), stripe, users, shop);
        assertEquals(503, assertThrows(BillingException.class, () -> off.checkoutUrl(user(null, null), "x")).status());
        assertEquals(503, assertThrows(BillingException.class, () -> off.handleWebhook("{}", "")).status());
    }
}
