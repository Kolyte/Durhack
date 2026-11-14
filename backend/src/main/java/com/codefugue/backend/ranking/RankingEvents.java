package com.codefugue.backend.ranking;

import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;

/** Server-Sent Events fan-out: tells open ranking pages that the leaderboard changed. */
@Component
public class RankingEvents {

    private final List<SseEmitter> emitters = new CopyOnWriteArrayList<>();

    public SseEmitter subscribe() {
        SseEmitter emitter = new SseEmitter(0L); // no timeout; the browser's EventSource reconnects if dropped
        emitters.add(emitter);
        emitter.onCompletion(() -> emitters.remove(emitter));
        emitter.onTimeout(() -> emitters.remove(emitter));
        emitter.onError(e -> emitters.remove(emitter));
        send(emitter, "hello", Map.of());
        return emitter;
    }

    public void publishUpdate(String repoName) {
        for (SseEmitter emitter : emitters) send(emitter, "ranking", Map.of("repoName", repoName));
    }

    private void send(SseEmitter emitter, String name, Object data) {
        try {
            emitter.send(SseEmitter.event().name(name).data(data));
        } catch (IOException | IllegalStateException e) {
            emitters.remove(emitter);
        }
    }
}
