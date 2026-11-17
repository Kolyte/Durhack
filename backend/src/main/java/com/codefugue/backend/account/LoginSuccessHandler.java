package com.codefugue.backend.account;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.security.web.authentication.SimpleUrlAuthenticationSuccessHandler;
import org.springframework.stereotype.Component;

import java.io.IOException;

/** After "Sign in with GitHub": create or refresh the user row, then go back to the app. */
@Component
public class LoginSuccessHandler extends SimpleUrlAuthenticationSuccessHandler {

    private static final Logger log = LoggerFactory.getLogger(LoginSuccessHandler.class);

    private final UserRepository users;

    public LoginSuccessHandler(UserRepository users) {
        super("/");
        this.users = users;
    }

    @Override
    public void onAuthenticationSuccess(HttpServletRequest request, HttpServletResponse response, Authentication auth)
            throws IOException, jakarta.servlet.ServletException {
        if (auth.getPrincipal() instanceof OAuth2User gh) {
            AccountService.githubId(gh).ifPresent(id -> {
                try {
                    AppUser u = users.upsertFromGitHub(id, gh.getAttribute("login"), gh.getAttribute("name"),
                            gh.getAttribute("avatar_url"), gh.getAttribute("email"));
                    log.info("Signed in: {} (user {})", u.login(), u.id());
                } catch (DataAccessException e) {
                    // Still signed in; the account row is created on a later sign-in once the database is back.
                    log.warn("Could not save user {}: {}", id, e.getMostSpecificCause().getMessage());
                }
            });
        }
        super.onAuthenticationSuccess(request, response, auth);
    }
}
