package com.codefugue.backend.account;

import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.util.Map;
import java.util.Optional;

import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.is;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.oauth2Login;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.cookie;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class SecurityRulesTest {

    private static final String EXPLAIN_BODY = """
            {"owner":"expressjs","repo":"express","branch":"master","path":"lib/express.js","role":"source",
             "loc":10,"complexity":1,"concurrency":0,"imports":0,"importedBy":0}""";

    /** No Stripe keys: accounts optional, Pro features open to everyone (the current behaviour). */
    @Nested
    @SpringBootTest(properties = {"GITHUB_CLIENT_ID=test-client", "GITHUB_CLIENT_SECRET=test-secret", "GEMINI_API_KEY="})
    @AutoConfigureMockMvc
    class BillingDisabled {
        @Autowired MockMvc mvc;
        @MockitoBean UserRepository users;

        @Test
        void publicEndpointsStayOpenAndMeReportsSignedOut() throws Exception {
            mvc.perform(get("/api/me")).andExpect(status().isOk())
                    .andExpect(jsonPath("$.signedIn", is(false)))
                    .andExpect(jsonPath("$.signInAvailable", is(true)))
                    .andExpect(jsonPath("$.billingEnabled", is(false)))
                    .andExpect(jsonPath("$.canUsePro", is(true)))
                    .andExpect(cookie().exists("XSRF-TOKEN"));
            mvc.perform(get("/api/explain/status")).andExpect(status().isOk());
        }

        @Test
        void signInStartsTheGitHubOAuthFlow() throws Exception {
            mvc.perform(get("/oauth2/authorization/github")).andExpect(status().is3xxRedirection())
                    .andExpect(header().string("Location", not(containsString("repo"))));
        }

        @Test
        void connectingPrivateReposAsksGitHubForTheRepoScope() throws Exception {
            mvc.perform(get("/oauth2/authorization/github").param("private", "1")).andExpect(status().is3xxRedirection())
                    .andExpect(header().string("Location", containsString("scope=read:user%20user:email%20repo")));
        }

        @Test
        void postsWithoutCsrfTokenAreRejected() throws Exception {
            mvc.perform(post("/api/explain").contentType(MediaType.APPLICATION_JSON).content(EXPLAIN_BODY))
                    .andExpect(status().isForbidden());
        }

        @Test
        void geminiIsNotPaywalledWhileBillingIsOff() throws Exception {
            // Passes the Pro gate; fails later only because no Gemini key is configured in this test.
            mvc.perform(post("/api/explain").with(csrf()).contentType(MediaType.APPLICATION_JSON).content(EXPLAIN_BODY))
                    .andExpect(status().isServiceUnavailable())
                    .andExpect(jsonPath("$.error", is("not_configured")));
        }

        @Test
        void billingNeedsSignIn() throws Exception {
            mvc.perform(post("/api/billing/checkout").with(csrf())).andExpect(status().isUnauthorized());
        }

        @Test
        void stripeWebhookIsNotBlockedByCsrf() throws Exception {
            mvc.perform(post("/api/stripe/webhook").content("{}")).andExpect(status().isServiceUnavailable());
        }

        @Test
        void onlyTheEmbedPlayerMayBeFramed() throws Exception {
            mvc.perform(get("/api/me")).andExpect(header().string("X-Frame-Options", "DENY"));
            mvc.perform(get("/api/me").param("embed", "1")).andExpect(header().doesNotExist("X-Frame-Options"));
        }

        @Test
        void landingPageRankingsStayQuietWhenTheDatabaseIsDown() throws Exception {
            // No database in tests: the leaderboard says 503, the landing page's list is just empty.
            mvc.perform(get("/api/rankings")).andExpect(status().isServiceUnavailable());
            mvc.perform(get("/api/rankings/featured")).andExpect(status().isOk()).andExpect(content().json("[]"));
        }

        @Test
        void shopCatalogueIsPublicAndUnlockedInDemoMode() throws Exception {
            mvc.perform(get("/api/shop")).andExpect(status().isOk())
                    .andExpect(jsonPath("$.demo", is(true)))
                    .andExpect(jsonPath("$.items[?(@.id == 'skin.matrix')].owned", contains(true)));
        }

        @Test
        void shopPurchasesAndLoadoutNeedSignIn() throws Exception {
            mvc.perform(post("/api/shop/checkout").with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{\"itemId\":\"skin.gold\"}"))
                    .andExpect(status().isUnauthorized());
            mvc.perform(put("/api/shop/loadout").with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{}"))
                    .andExpect(status().isUnauthorized());
            mvc.perform(post("/api/shop/checkout").contentType(MediaType.APPLICATION_JSON).content("{\"itemId\":\"skin.gold\"}"))
                    .andExpect(status().isForbidden()); // no CSRF token
        }
    }

    /** Stripe configured: Gemini needs Pro. */
    @Nested
    @SpringBootTest(properties = {"GITHUB_CLIENT_ID=test-client", "GITHUB_CLIENT_SECRET=test-secret", "GEMINI_API_KEY=",
            "STRIPE_SECRET_KEY=sk_test_x", "STRIPE_PRICE_ID=price_1", "STRIPE_WEBHOOK_SECRET=whsec_x", "STRIPE_PRICE_LABEL=£4 / month"})
    @AutoConfigureMockMvc
    class BillingEnabled {
        @Autowired MockMvc mvc;
        @MockitoBean UserRepository users;

        private static AppUser user(String status) {
            return new AppUser(1, 42, "octocat", "Octo", "https://avatars/1", null, "cus_1", "sub_1", status, null);
        }

        @Test
        void anonymousUsersAreAskedToSignIn() throws Exception {
            mvc.perform(post("/api/explain").with(csrf()).contentType(MediaType.APPLICATION_JSON).content(EXPLAIN_BODY))
                    .andExpect(status().isUnauthorized()).andExpect(jsonPath("$.error", is("sign_in")));
        }

        @Test
        void freeUsersAreAskedToUpgrade() throws Exception {
            when(users.findByGithubId(42)).thenReturn(Optional.of(user(null)));
            mvc.perform(post("/api/explain").with(csrf()).with(oauth2Login().attributes(a -> a.putAll(Map.of("id", 42, "login", "octocat"))))
                            .contentType(MediaType.APPLICATION_JSON).content(EXPLAIN_BODY))
                    .andExpect(status().isPaymentRequired()).andExpect(jsonPath("$.error", is("pro_required")));
        }

        @Test
        void proUsersGetThrough() throws Exception {
            when(users.findByGithubId(42)).thenReturn(Optional.of(user("active")));
            mvc.perform(post("/api/explain").with(csrf()).with(oauth2Login().attributes(a -> a.putAll(Map.of("id", 42, "login", "octocat"))))
                            .contentType(MediaType.APPLICATION_JSON).content(EXPLAIN_BODY))
                    .andExpect(status().isServiceUnavailable()); // gate passed; no Gemini key in tests
        }

        @Test
        void meShowsThePlan() throws Exception {
            when(users.findByGithubId(42)).thenReturn(Optional.of(user("active")));
            mvc.perform(get("/api/me").with(oauth2Login().attributes(a -> a.putAll(Map.of("id", 42, "login", "octocat")))))
                    .andExpect(jsonPath("$.signedIn", is(true)))
                    .andExpect(jsonPath("$.login", is("octocat")))
                    .andExpect(jsonPath("$.pro", is(true)))
                    .andExpect(jsonPath("$.billingEnabled", is(true)))
                    .andExpect(jsonPath("$.priceLabel", is("£4 / month")));
        }

        @Test
        void webhookWithBadSignatureIsRejected() throws Exception {
            mvc.perform(post("/api/stripe/webhook").header("Stripe-Signature", "t=1,v1=bad").content("{}"))
                    .andExpect(status().isBadRequest());
        }
    }
}
