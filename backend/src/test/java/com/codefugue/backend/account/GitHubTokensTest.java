package com.codefugue.backend.account;

import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.client.OAuth2AuthorizedClient;
import org.springframework.security.oauth2.client.registration.ClientRegistration;
import org.springframework.security.oauth2.core.AuthorizationGrantType;
import org.springframework.security.oauth2.core.OAuth2AccessToken;

import java.time.Instant;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class GitHubTokensTest {

    private static OAuth2AuthorizedClient client(Set<String> scopes) {
        ClientRegistration reg = ClientRegistration.withRegistrationId("github").clientId("id")
                .authorizationGrantType(AuthorizationGrantType.AUTHORIZATION_CODE)
                .redirectUri("{baseUrl}/login/oauth2/code/{registrationId}")
                .authorizationUri("https://github.com/login/oauth/authorize")
                .tokenUri("https://github.com/login/oauth/access_token").build();
        OAuth2AccessToken token = new OAuth2AccessToken(OAuth2AccessToken.TokenType.BEARER, "t", Instant.now(), Instant.now().plusSeconds(60), scopes);
        return new OAuth2AuthorizedClient(reg, "octocat", token);
    }

    @Test
    void detectsTheRepoScopeEvenWhenGitHubCommaSeparatesIt() {
        assertTrue(GitHubTokens.hasRepoScope(client(Set.of("read:user,repo,user:email"))));
        assertTrue(GitHubTokens.hasRepoScope(client(Set.of("read:user", "repo"))));
        assertFalse(GitHubTokens.hasRepoScope(client(Set.of("read:user,user:email"))));
        assertFalse(GitHubTokens.hasRepoScope(client(Set.of("public_repo"))));
    }
}
