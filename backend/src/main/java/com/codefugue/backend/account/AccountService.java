package com.codefugue.backend.account;

import com.codefugue.backend.billing.BillingSettings;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.stereotype.Service;

import java.security.Principal;
import java.util.Optional;

/** Who is signed in, and what they are entitled to. */
@Service
public class AccountService {

    private static final Logger log = LoggerFactory.getLogger(AccountService.class);

    private final UserRepository users;
    private final BillingSettings billing;

    public AccountService(UserRepository users, BillingSettings billing) {
        this.users = users;
        this.billing = billing;
    }

    /** GitHub's numeric user id for a signed-in principal, if it is a GitHub sign-in. */
    public static Optional<Long> githubId(Principal principal) {
        if (principal instanceof OAuth2AuthenticationToken token) return githubId(token.getPrincipal());
        return Optional.empty();
    }

    static Optional<Long> githubId(OAuth2User user) {
        Object id = user.getAttribute("id");
        return id instanceof Number n ? Optional.of(n.longValue()) : Optional.empty();
    }

    /** The stored user for a principal. Empty when signed out, or (logged) when the database is unreachable. */
    public Optional<AppUser> current(Principal principal) {
        Optional<Long> id = githubId(principal);
        if (id.isEmpty()) return Optional.empty();
        try {
            return users.findByGithubId(id.get());
        } catch (DataAccessException e) {
            log.warn("User database unavailable: {}", e.getMostSpecificCause().getMessage());
            return Optional.empty();
        }
    }

    /** Has an active paid Pro subscription. */
    public boolean isProSubscriber(Principal principal) {
        return current(principal).map(AppUser::pro).orElse(false);
    }

    /**
     * May use Pro features. When billing isn't configured (local development, the hackathon demo) everything stays
     * open, so the app behaves exactly as before; once Stripe is set up, Pro features need a subscription.
     */
    public boolean canUsePro(Principal principal) {
        return !billing.enabled() || isProSubscriber(principal);
    }

    public boolean billingEnabled() {
        return billing.enabled();
    }
}
