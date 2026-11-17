package com.codefugue.backend.account;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.client.OAuth2AuthorizedClient;
import org.springframework.security.oauth2.client.web.OAuth2AuthorizedClientRepository;
import org.springframework.stereotype.Component;

import java.security.Principal;
import java.util.Arrays;
import java.util.Optional;

/**
 * The signed-in user's GitHub access token, used only to read their private repositories (a Pro feature they
 * opt into with "Connect private repos"). Tokens live in the HTTP session and are never written to the database;
 * signing out or a server restart forgets them.
 */
@Component
public class GitHubTokens {

    public static final String REGISTRATION = "github";
    private final ObjectProvider<OAuth2AuthorizedClientRepository> clients;

    public GitHubTokens(ObjectProvider<OAuth2AuthorizedClientRepository> clients) {
        this.clients = clients;
    }

    private Optional<OAuth2AuthorizedClient> client(Principal principal, HttpServletRequest request) {
        OAuth2AuthorizedClientRepository repo = clients.getIfAvailable();
        if (repo == null || !(principal instanceof Authentication auth) || request == null) return Optional.empty();
        return Optional.ofNullable(repo.loadAuthorizedClient(REGISTRATION, auth, request));
    }

    /** True when the token includes GitHub's "repo" scope (private repositories). */
    static boolean hasRepoScope(OAuth2AuthorizedClient c) {
        // GitHub reports granted scopes comma-separated ("read:user,repo"); Spring splits on spaces only.
        return c.getAccessToken().getScopes().stream()
                .flatMap(s -> Arrays.stream(s.split("[,\\s]+")))
                .anyMatch("repo"::equals);
    }

    public boolean privateConnected(Principal principal, HttpServletRequest request) {
        return client(principal, request).map(GitHubTokens::hasRepoScope).orElse(false);
    }

    /** The token for private repositories, if connected. Callers must also check the user may use Pro. */
    public Optional<String> privateToken(Principal principal, HttpServletRequest request) {
        return client(principal, request).filter(GitHubTokens::hasRepoScope).map(c -> c.getAccessToken().getTokenValue());
    }

    /** Forgets the token for this session (it can also be revoked on GitHub: Settings → Applications). */
    public void disconnect(Principal principal, HttpServletRequest request, HttpServletResponse response) {
        OAuth2AuthorizedClientRepository repo = clients.getIfAvailable();
        if (repo != null && principal instanceof Authentication auth) {
            repo.removeAuthorizedClient(REGISTRATION, auth, request, response);
        }
    }
}
