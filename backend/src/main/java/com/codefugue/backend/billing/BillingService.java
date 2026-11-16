package com.codefugue.backend.billing;

import com.codefugue.backend.account.AppUser;
import com.codefugue.backend.account.UserRepository;
import com.codefugue.backend.shop.ShopService;
import com.stripe.exception.EventDataObjectDeserializationException;
import com.stripe.exception.SignatureVerificationException;
import com.stripe.model.Event;
import com.stripe.model.EventDataObjectDeserializer;
import com.stripe.model.StripeObject;
import com.stripe.model.Subscription;
import com.stripe.model.SubscriptionItem;
import com.stripe.model.checkout.Session;
import com.stripe.net.Webhook;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.List;

/**
 * Subscriptions with Stripe:
 *  - Upgrade: a Stripe Checkout page (Stripe hosts the card form, so card details never touch our server).
 *  - Manage / cancel: the Stripe Customer Portal.
 *  - Source of truth: signed webhooks (customer.subscription.*) update the user's subscription status.
 */
@Service
public class BillingService {

    private static final Logger log = LoggerFactory.getLogger(BillingService.class);

    private final BillingSettings settings;
    private final StripeGateway stripe;
    private final UserRepository users;
    private final ShopService shop;

    public BillingService(BillingSettings settings, StripeGateway stripe, UserRepository users, ShopService shop) {
        this.settings = settings;
        this.stripe = stripe;
        this.users = users;
        this.shop = shop;
        if (settings.enabled()) log.info("Billing enabled (Stripe): Pro features require a subscription");
        else log.info("Billing disabled: set STRIPE_SECRET_KEY, STRIPE_PRICE_ID and STRIPE_WEBHOOK_SECRET to enable it."
                + " Until then Pro features are open to everyone.");
    }

    public String checkoutUrl(AppUser user, String baseUrl) {
        requireEnabled();
        if (user.pro()) throw new BillingException(409, "already_pro", "You already have Pro");
        try {
            String customer = ensureCustomer(user);
            return stripe.createCheckoutSession(customer, settings.priceId(), baseUrl + "/?checkout=success",
                    baseUrl + "/?checkout=cancelled", Long.toString(user.id()));
        } catch (BillingException e) {
            throw e;
        } catch (Exception e) {
            log.warn("Stripe checkout failed for user {}: {}", user.id(), e.getMessage());
            throw new BillingException(502, "stripe_error", "Could not start checkout. Please try again.");
        }
    }

    public String portalUrl(AppUser user, String baseUrl) {
        requireEnabled();
        if (user.stripeCustomerId() == null) {
            throw new BillingException(404, "no_billing_account", "You don't have a subscription yet");
        }
        try {
            return stripe.createPortalSession(user.stripeCustomerId(), baseUrl + "/");
        } catch (Exception e) {
            log.warn("Stripe portal failed for user {}: {}", user.id(), e.getMessage());
            throw new BillingException(502, "stripe_error", "Could not open the billing portal. Please try again.");
        }
    }

    private String ensureCustomer(AppUser user) throws Exception {
        if (user.stripeCustomerId() != null) return user.stripeCustomerId();
        String id = stripe.createCustomer(user);
        users.setStripeCustomerId(user.id(), id);
        return id;
    }

    /** Verifies the Stripe-Signature header, then applies subscription changes and shop purchases. */
    public void handleWebhook(String payload, String signatureHeader) {
        if (!settings.paymentsEnabled()) {
            throw new BillingException(503, "billing_disabled", "Payments are not set up on this server");
        }
        Event event;
        try {
            event = Webhook.constructEvent(payload, signatureHeader, settings.webhookSecret());
        } catch (SignatureVerificationException e) {
            throw new BillingException(400, "bad_signature", "Invalid Stripe signature");
        } catch (Exception e) {
            throw new BillingException(400, "bad_payload", "Invalid webhook payload");
        }
        switch (event.getType()) {
            case "customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted" -> {
                Subscription sub = (Subscription) dataObject(event);
                String status = event.getType().endsWith(".deleted") ? "canceled" : sub.getStatus();
                boolean matched = users.updateSubscription(sub.getCustomer(), sub.getId(), status, periodEnd(sub));
                log.info("Stripe {}: customer {} → {}{}", event.getType(), sub.getCustomer(), status,
                        matched ? "" : " (no matching user)");
            }
            case "checkout.session.completed", "checkout.session.async_payment_succeeded" ->
                    shop.fulfil((Session) dataObject(event));
            default -> log.debug("Ignoring Stripe event {}", event.getType());
        }
    }

    /** The event's object, even if Stripe's API version differs from the one this library was built for. */
    private static StripeObject dataObject(Event event) {
        EventDataObjectDeserializer d = event.getDataObjectDeserializer();
        return d.getObject().orElseGet(() -> {
            try {
                return d.deserializeUnsafe();
            } catch (EventDataObjectDeserializationException e) {
                throw new BillingException(400, "bad_payload", "Unreadable Stripe event");
            }
        });
    }

    /** End of the current billing period (Stripe reports it per subscription item). */
    static Instant periodEnd(Subscription sub) {
        if (sub.getItems() == null) return null;
        List<SubscriptionItem> items = sub.getItems().getData();
        if (items == null || items.isEmpty() || items.get(0).getCurrentPeriodEnd() == null) return null;
        return Instant.ofEpochSecond(items.get(0).getCurrentPeriodEnd());
    }

    private void requireEnabled() {
        if (!settings.enabled()) throw new BillingException(503, "billing_disabled", "Payments are not set up on this server");
    }
}
