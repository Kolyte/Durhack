package com.codefugue.backend.billing;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Stripe settings, from environment variables or backend/.env. Billing (and with it, Pro-only gating) is enabled
 * only when the secret key, the price and the webhook secret are all set.
 */
@Component
public class BillingSettings {

    private final String secretKey;
    private final String priceId;
    private final String webhookSecret;
    private final String priceLabel;
    private final String appBaseUrl;

    public BillingSettings(
            @Value("${STRIPE_SECRET_KEY:}") String secretKey,
            @Value("${STRIPE_PRICE_ID:}") String priceId,
            @Value("${STRIPE_WEBHOOK_SECRET:}") String webhookSecret,
            @Value("${STRIPE_PRICE_LABEL:}") String priceLabel,
            @Value("${APP_BASE_URL:}") String appBaseUrl) {
        this.secretKey = secretKey.trim();
        this.priceId = priceId.trim();
        this.webhookSecret = webhookSecret.trim();
        this.priceLabel = priceLabel.trim();
        this.appBaseUrl = appBaseUrl.trim().replaceAll("/+$", "");
    }

    public boolean enabled() {
        return !secretKey.isEmpty() && !priceId.isEmpty() && !webhookSecret.isEmpty();
    }

    public String secretKey() {
        return secretKey;
    }

    public String priceId() {
        return priceId;
    }

    public String webhookSecret() {
        return webhookSecret;
    }

    /** Shown on the upgrade button, e.g. "£4 / month". Empty means the UI just says "Upgrade". */
    public String priceLabel() {
        return priceLabel;
    }

    /** Public URL of the site (e.g. https://sonyx.example). Empty means "derive from the request". */
    public String appBaseUrl() {
        return appBaseUrl;
    }
}
