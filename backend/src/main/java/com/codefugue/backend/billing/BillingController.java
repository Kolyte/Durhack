package com.codefugue.backend.billing;

import com.codefugue.backend.account.AccountService;
import com.codefugue.backend.account.AppUser;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

import java.security.Principal;
import java.util.Map;

@RestController
public class BillingController {

    private final BillingService billing;
    private final BillingSettings settings;
    private final AccountService accounts;

    public BillingController(BillingService billing, BillingSettings settings, AccountService accounts) {
        this.billing = billing;
        this.settings = settings;
        this.accounts = accounts;
    }

    /** POST /api/billing/checkout → { url } of a Stripe Checkout page for Pro. */
    @PostMapping("/api/billing/checkout")
    public ResponseEntity<?> checkout(Principal principal) {
        return withUser(principal, u -> Map.of("url", billing.checkoutUrl(u, baseUrl())));
    }

    /** POST /api/billing/portal → { url } of the Stripe Customer Portal (change card, cancel, invoices). */
    @PostMapping("/api/billing/portal")
    public ResponseEntity<?> portal(Principal principal) {
        return withUser(principal, u -> Map.of("url", billing.portalUrl(u, baseUrl())));
    }

    /** Stripe → us. Authenticated by the Stripe-Signature header (CSRF is disabled for this path only). */
    @PostMapping("/api/stripe/webhook")
    public ResponseEntity<?> webhook(@RequestBody String payload,
                                     @RequestHeader(name = "Stripe-Signature", required = false) String signature) {
        try {
            billing.handleWebhook(payload, signature == null ? "" : signature);
            return ResponseEntity.ok(Map.of("received", true));
        } catch (BillingException e) {
            return error(e);
        }
    }

    private ResponseEntity<?> withUser(Principal principal, java.util.function.Function<AppUser, Object> action) {
        AppUser user = accounts.current(principal).orElse(null);
        if (user == null) {
            return ResponseEntity.status(401).body(Map.of("error", "sign_in", "message", "Please sign in first"));
        }
        try {
            return ResponseEntity.ok(action.apply(user));
        } catch (BillingException e) {
            return error(e);
        }
    }

    private static ResponseEntity<?> error(BillingException e) {
        return ResponseEntity.status(e.status()).body(Map.of("error", e.reason(), "message", e.getMessage()));
    }

    private String baseUrl() {
        if (!settings.appBaseUrl().isEmpty()) return settings.appBaseUrl();
        return ServletUriComponentsBuilder.fromCurrentContextPath().build().toUriString();
    }
}
