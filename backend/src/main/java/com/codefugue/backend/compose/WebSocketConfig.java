package com.codefugue.backend.compose;

import com.codefugue.backend.account.GitHubTokens;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.http.server.ServletServerHttpRequest;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.server.HandshakeInterceptor;
import java.security.Principal;
import java.util.Map;

import com.codefugue.backend.ranking.RecentAnalyses;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;
import org.springframework.web.socket.handler.TextWebSocketHandler;
import tools.jackson.databind.json.JsonMapper;
import com.codefugue.backend.account.AccountService;
import org.springframework.beans.factory.annotation.Value;

import java.util.Arrays;

import java.util.concurrent.atomic.AtomicReference;

@Configuration
@EnableWebSocket
public class WebSocketConfig implements WebSocketConfigurer {

    private final GitHubAnalyzerService analyzer;
    private final RecentAnalyses recentAnalyses;
    private static final String PRIVATE_TOKEN = "sonyx.githubToken";
    private final AccountService accounts;
    private final GitHubTokens tokens;
    private final String[] allowedOrigins;
    private final JsonMapper mapper = JsonMapper.builder().build();

    public WebSocketConfig(GitHubAnalyzerService analyzer, RecentAnalyses recentAnalyses, AccountService accounts,
                           GitHubTokens tokens, @Value("${ALLOWED_ORIGINS:}") String allowedOrigins) {
        this.tokens = tokens;
        this.analyzer = analyzer;
        this.recentAnalyses = recentAnalyses;
        this.accounts = accounts;
        this.allowedOrigins = Arrays.stream(allowedOrigins.split(",")).map(String::trim).filter(o -> !o.isEmpty())
                .toArray(String[]::new);
    }

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        var registration = registry.addHandler(new TextWebSocketHandler() {
            @Override
            protected void handleTextMessage(WebSocketSession session, TextMessage message) {
                String repoUrl = mapper.readTree(message.getPayload()).path("repoUrl").asString();
                // Pro subscribers (signed in via the session cookie on the handshake) get bigger repos analysed.
                int maxFiles = accounts.isProSubscriber(session.getPrincipal())
                        ? GitHubAnalyzerService.PRO_MAX_CODE_FILES : GitHubAnalyzerService.MAX_CODE_FILES;
                AtomicReference<ComposeEvent.RepoTree> tree = new AtomicReference<>();
                // Private repos: the user's own token, captured at the handshake (Pro, opted in).
                String userToken = (String) session.getAttributes().get(PRIVATE_TOKEN);
                Thread.startVirtualThread(() -> analyzer.analyzeAndStream(repoUrl, maxFiles, userToken, event -> {
                    // Remember finished public analyses so the browser may submit their scores to the ranking.
                    // Private repos are never ranked (their names must not leak).
                    if (event instanceof ComposeEvent.RepoTree t) tree.set(t);
                    if (event instanceof ComposeEvent.CompositionReady && tree.get() != null && !tree.get().privateRepo()) {
                        recentAnalyses.markFinished(tree.get().repoName(), tree.get().stars(), tree.get().totalCodeFiles());
                    }
                    try {
                        // WebSocketSession is not thread-safe; analysis threads emit concurrently.
                        synchronized (session) {
                            if (session.isOpen()) {
                                session.sendMessage(new TextMessage(mapper.writeValueAsString(event)));
                            }
                        }
                    } catch (Exception ignored) {
                    }
                }));
            }
        }, "/ws/compose").addInterceptors(new HandshakeInterceptor() {
            @Override
            public boolean beforeHandshake(ServerHttpRequest request, ServerHttpResponse response, WebSocketHandler h,
                                           Map<String, Object> attributes) {
                if (request instanceof ServletServerHttpRequest servlet) {
                    HttpServletRequest req = servlet.getServletRequest();
                    Principal user = req.getUserPrincipal();
                    if (user != null && accounts.canUsePro(user)) {
                        tokens.privateToken(user, req).ifPresent(t -> attributes.put(PRIVATE_TOKEN, t));
                    }
                }
                return true;
            }

            @Override
            public void afterHandshake(ServerHttpRequest request, ServerHttpResponse response, WebSocketHandler h, Exception e) {
            }
        });
        // Same-origin only by default: the socket carries the session cookie, so other sites mustn't open it.
        // Set ALLOWED_ORIGINS (comma-separated) if the frontend is served from a different origin.
        if (allowedOrigins.length > 0) registration.setAllowedOrigins(allowedOrigins);
    }
}
