package com.codefugue.backend.compose;

import com.codefugue.backend.ranking.RecentAnalyses;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;
import org.springframework.web.socket.handler.TextWebSocketHandler;
import tools.jackson.databind.json.JsonMapper;

import java.util.concurrent.atomic.AtomicReference;

@Configuration
@EnableWebSocket
public class WebSocketConfig implements WebSocketConfigurer {

    private final GitHubAnalyzerService analyzer;
    private final RecentAnalyses recentAnalyses;
    private final JsonMapper mapper = JsonMapper.builder().build();

    public WebSocketConfig(GitHubAnalyzerService analyzer, RecentAnalyses recentAnalyses) {
        this.analyzer = analyzer;
        this.recentAnalyses = recentAnalyses;
    }

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(new TextWebSocketHandler() {
            @Override
            protected void handleTextMessage(WebSocketSession session, TextMessage message) {
                String repoUrl = mapper.readTree(message.getPayload()).path("repoUrl").asString();
                AtomicReference<ComposeEvent.RepoTree> tree = new AtomicReference<>();
                Thread.startVirtualThread(() -> analyzer.analyzeAndStream(repoUrl, event -> {
                    // Remember finished analyses so the browser may submit their scores to the ranking.
                    if (event instanceof ComposeEvent.RepoTree t) tree.set(t);
                    if (event instanceof ComposeEvent.CompositionReady && tree.get() != null) {
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
        }, "/ws/compose").setAllowedOrigins("*");
    }
}
