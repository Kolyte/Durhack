package com.codefugue.backend.account;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnExpression;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpStatus;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.oauth2.client.CommonOAuth2Provider;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.security.oauth2.client.registration.InMemoryClientRegistrationRepository;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.security.oauth2.client.web.DefaultOAuth2AuthorizationRequestResolver;
import org.springframework.security.oauth2.client.web.HttpSessionOAuth2AuthorizedClientRepository;
import org.springframework.security.oauth2.client.web.OAuth2AuthorizationRequestResolver;
import org.springframework.security.oauth2.client.web.OAuth2AuthorizedClientRepository;
import org.springframework.security.oauth2.core.endpoint.OAuth2AuthorizationRequest;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.HttpStatusEntryPoint;
import org.springframework.security.web.authentication.logout.HttpStatusReturningLogoutSuccessHandler;
import org.springframework.security.web.header.writers.DelegatingRequestMatcherHeaderWriter;
import org.springframework.security.web.header.writers.frameoptions.XFrameOptionsHeaderWriter;
import org.springframework.security.web.servlet.util.matcher.PathPatternRequestMatcher;
import org.springframework.security.web.util.matcher.NegatedRequestMatcher;

/**
 * Accounts are optional: everything public stays open (composing public repos, the leaderboard). Only billing
 * endpoints need a signed-in user, and Pro features are checked where they are used.
 *
 * Sign-in is "Sign in with GitHub" (OAuth2), enabled when GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET are set.
 * Sessions are cookies; state-changing requests carry a CSRF token (XSRF-TOKEN cookie → X-XSRF-TOKEN header),
 * except Stripe's webhook, which is authenticated by its signature instead.
 */
@Configuration
public class SecurityConfig {

    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http, ObjectProvider<ClientRegistrationRepository> clients,
                                            LoginSuccessHandler onLogin) throws Exception {
        http
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers("/api/billing/checkout", "/api/billing/portal", "/api/shop/checkout", "/api/shop/loadout")
                        .authenticated()
                        .anyRequest().permitAll())
                .csrf(csrf -> csrf.spa().ignoringRequestMatchers("/api/stripe/webhook"))
                // Pages may not be framed (clickjacking), except the embeddable player (?embed=1), which
                // shows no account, shop or payment controls.
                .headers(h -> h
                        .frameOptions(f -> f.disable())
                        .addHeaderWriter(new DelegatingRequestMatcherHeaderWriter(
                                new NegatedRequestMatcher(req -> req.getParameter("embed") != null),
                                new XFrameOptionsHeaderWriter(XFrameOptionsHeaderWriter.XFrameOptionsMode.DENY))))
                // APIs answer 401 instead of redirecting to a login page.
                .exceptionHandling(e -> e.defaultAuthenticationEntryPointFor(
                        new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED),
                        PathPatternRequestMatcher.withDefaults().matcher("/api/**")))
                .logout(l -> l.logoutUrl("/api/auth/logout")
                        .logoutSuccessHandler(new HttpStatusReturningLogoutSuccessHandler(HttpStatus.NO_CONTENT)));
        ClientRegistrationRepository registrations = clients.getIfAvailable();
        if (registrations != null) {
            http.oauth2Login(o -> o
                    .successHandler(onLogin)
                    .authorizationEndpoint(a -> a.authorizationRequestResolver(new PrivateReposScopeResolver(registrations))));
        }
        return http.build();
    }

    /** GitHub OAuth app, only when configured (otherwise the app runs without accounts). */
    @Bean
    @ConditionalOnExpression("!'${GITHUB_CLIENT_ID:}'.isBlank()")
    ClientRegistrationRepository clientRegistrationRepository(@Value("${GITHUB_CLIENT_ID}") String clientId,
                                                              @Value("${GITHUB_CLIENT_SECRET:}") String clientSecret) {
        return new InMemoryClientRegistrationRepository(CommonOAuth2Provider.GITHUB.getBuilder("github")
                .clientId(clientId.trim())
                .clientSecret(clientSecret.trim())
                .scope("read:user", "user:email")
                .build());
    }

    /**
     * GitHub tokens are kept in the user's HTTP session only (not in memory per user or in the database), so they
     * disappear when the session ends.
     */
    @Bean
    OAuth2AuthorizedClientRepository authorizedClientRepository() {
        return new HttpSessionOAuth2AuthorizedClientRepository();
    }

    /**
     * Normal sign-in asks GitHub only for the public profile. "Connect private repos" sends people to
     * /oauth2/authorization/github?private=1, which additionally asks for the "repo" scope.
     */
    static final class PrivateReposScopeResolver implements OAuth2AuthorizationRequestResolver {
        private final DefaultOAuth2AuthorizationRequestResolver delegate;

        PrivateReposScopeResolver(ClientRegistrationRepository registrations) {
            this.delegate = new DefaultOAuth2AuthorizationRequestResolver(registrations, "/oauth2/authorization");
        }

        @Override
        public OAuth2AuthorizationRequest resolve(HttpServletRequest request) {
            return widen(request, delegate.resolve(request));
        }

        @Override
        public OAuth2AuthorizationRequest resolve(HttpServletRequest request, String clientRegistrationId) {
            return widen(request, delegate.resolve(request, clientRegistrationId));
        }

        private static OAuth2AuthorizationRequest widen(HttpServletRequest request, OAuth2AuthorizationRequest r) {
            if (r == null || request.getParameter("private") == null) return r;
            java.util.Set<String> scopes = new java.util.LinkedHashSet<>(r.getScopes());
            scopes.add("repo");
            return OAuth2AuthorizationRequest.from(r).scopes(scopes).build();
        }
    }

    /** No username/password accounts: stops Spring Boot creating a default user with a generated password. */
    @Bean
    UserDetailsService noPasswordUsers() {
        return username -> {
            throw new UsernameNotFoundException("Sonyx only supports Sign in with GitHub");
        };
    }
}
