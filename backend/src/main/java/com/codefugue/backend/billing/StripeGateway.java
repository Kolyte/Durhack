package com.codefugue.backend.billing;

import com.codefugue.backend.account.AppUser;

/** The Stripe calls Sonyx makes. An interface so tests can run without network access or real keys. */
public interface StripeGateway {

    /** Creates a Stripe customer for a user; returns its id (cus_…). */
    String createCustomer(AppUser user) throws Exception;

    /** Creates a subscription Checkout Session; returns the URL to send the browser to. */
    String createCheckoutSession(String customerId, String priceId, String successUrl, String cancelUrl,
                                 String clientReferenceId) throws Exception;

    /**
     * Creates a one-time payment Checkout Session for a single item with an inline price; returns its URL.
     * The metadata is copied onto the session so the webhook knows what was bought, and by whom.
     */
    String createPaymentCheckout(String customerId, String productName, String description, long amount, String currency,
                                 String successUrl, String cancelUrl, java.util.Map<String, String> metadata) throws Exception;

    /** Creates a Customer Portal session (manage card, cancel, invoices); returns its URL. */
    String createPortalSession(String customerId, String returnUrl) throws Exception;
}
