package com.codefugue.backend.account;

import java.time.Instant;
import java.util.Set;

/** A signed-in Sonyx user (created on first "Sign in with GitHub"). */
public record AppUser(
        long id,
        long githubId,
        String login,
        String name,
        String avatarUrl,
        String email,
        String stripeCustomerId,
        String subscriptionId,
        String subscriptionStatus,
        Instant currentPeriodEnd
) {
    /** Stripe statuses that keep Pro active. past_due keeps access while Stripe retries the payment. */
    private static final Set<String> PRO_STATUSES = Set.of("active", "trialing", "past_due");

    public boolean pro() {
        return subscriptionStatus != null && PRO_STATUSES.contains(subscriptionStatus);
    }
}
