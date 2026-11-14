package com.codefugue.backend.ranking;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/rankings")
public class RankingController {

    private static final Logger log = LoggerFactory.getLogger(RankingController.class);

    private final RankingRepository repository;
    private final RecentAnalyses recent;
    private final RankingEvents events;

    public RankingController(RankingRepository repository, RecentAnalyses recent, RankingEvents events) {
        this.repository = repository;
        this.recent = recent;
        this.events = events;
    }

    @GetMapping
    public List<RankingEntry> list(@RequestParam(defaultValue = "100") int limit) {
        return repository.top(Math.clamp(limit, 1, 500));
    }

    @PostMapping
    public ResponseEntity<Map<String, Object>> submit(@RequestBody RankingSubmission body) {
        RankingSubmission s = body.sanitized();
        if (s.repoName() == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "repoName must look like owner/repo"));
        }
        var facts = recent.lookup(s.repoName());
        if (facts.isEmpty()) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(Map.of("error", "Analyse this repository on the main page first"));
        }
        repository.insert(s, facts.get());
        events.publishUpdate(s.repoName());
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("repoName", s.repoName(), "score", s.score()));
    }

    @GetMapping(path = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter stream() {
        return events.subscribe();
    }

    @ExceptionHandler(DataAccessException.class)
    public ResponseEntity<Map<String, String>> databaseDown(DataAccessException e) {
        log.warn("Ranking database unavailable: {}", e.getMostSpecificCause().getMessage());
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                .body(Map.of("error", "Ranking database is not reachable"));
    }
}
