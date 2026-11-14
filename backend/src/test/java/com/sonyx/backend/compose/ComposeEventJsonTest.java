package com.sonyx.backend.compose;

import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;

/** The frontend switches on these exact JSON shapes (see frontend/src/types.ts). */
class ComposeEventJsonTest {

    private final JsonMapper mapper = JsonMapper.builder().build();

    @Test
    void repoTreeSerializesWithTypeAndNodes() {
        FileNode n = new FileNode("src/a.js", "src/a.js", "src", 1, 40, 3, 1, 2, "source", false);
        JsonNode json = mapper.readTree(mapper.writeValueAsString(
                new ComposeEvent.RepoTree("o/r", 110, 5, 300, 48, false, List.of(n))));
        assertEquals("REPO_TREE", json.path("type").asString());
        assertEquals("o/r", json.path("repoName").asString());
        assertEquals(110, json.path("bpm").asInt());
        assertEquals("src/a.js", json.path("nodes").get(0).path("id").asString());
        assertEquals("source", json.path("nodes").get(0).path("role").asString());
        assertEquals(300, json.path("totalCodeFiles").asInt());
    }

    @Test
    void edgeAndReadyEventsSerialize() {
        JsonNode edge = mapper.readTree(mapper.writeValueAsString(new ComposeEvent.EdgeFound("a", "b")));
        assertEquals("EDGE_FOUND", edge.path("type").asString());
        assertEquals("b", edge.path("targetId").asString());
        JsonNode ready = mapper.readTree(mapper.writeValueAsString(new ComposeEvent.CompositionReady(7)));
        assertEquals("COMPOSITION_READY", ready.path("type").asString());
        assertEquals(7, ready.path("totalAnalyzed").asInt());
    }
}
