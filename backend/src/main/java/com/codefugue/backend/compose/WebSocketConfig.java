package com.codefugue.backend.compose;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;
import org.springframework.web.socket.handler.TextWebSocketHandler;
import tools.jackson.databind.json.JsonMapper;

@Configuration
@EnableWebSocket
public class WebSocketConfig implements WebSocketConfigurer {

    private final GitHubAnalyzerService analyzer;
    private final JsonMapper mapper = JsonMapper.builder().build();

    public WebSocketConfig(GitHubAnalyzerService analyzer) {
        this.analyzer = analyzer;
    }

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(new TextWebSocketHandler() {
            @Override
            protected void handleTextMessage(WebSocketSession session, TextMessage message) {
                String repoUrl = mapper.readTree(message.getPayload()).path("repoUrl").asString();
                Thread.startVirtualThread(() -> analyzer.analyzeAndStream(repoUrl, event -> {
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
