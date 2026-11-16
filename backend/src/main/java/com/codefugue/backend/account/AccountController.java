package com.codefugue.backend.account;

import com.codefugue.backend.billing.BillingSettings;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.security.Principal;
import java.util.LinkedHashMap;
import java.util.Map;

/** GET /api/me: who is signed in, their plan, and which account features this server has enabled. */
@RestController
public class AccountController {

    private final AccountService accounts;
    private final BillingSettings billing;
    private final boolean signInAvailable;

    public AccountController(AccountService accounts, BillingSettings billing,
                             ObjectProvider<ClientRegistrationRepository> clients) {
        this.accounts = accounts;
        this.billing = billing;
        this.signInAvailable = clients.getIfAvailable() != null;
    }

    @GetMapping("/api/me")
    public Map<String, Object> me(Principal principal) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("signInAvailable", signInAvailable);
        out.put("billingEnabled", billing.enabled());
        out.put("priceLabel", billing.priceLabel());
        out.put("canUsePro", accounts.canUsePro(principal));
        out.put("signedIn", principal != null && AccountService.githubId(principal).isPresent());
        accounts.current(principal).ifPresent(u -> {
            out.put("login", u.login());
            out.put("name", u.name());
            out.put("avatarUrl", u.avatarUrl());
            out.put("pro", u.pro());
            out.put("subscriptionStatus", u.subscriptionStatus());
            out.put("currentPeriodEnd", u.currentPeriodEnd() == null ? null : u.currentPeriodEnd().toString());
            out.put("hasBillingAccount", u.stripeCustomerId() != null);
        });
        return out;
    }
}
