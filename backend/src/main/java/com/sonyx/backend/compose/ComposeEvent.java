package com.sonyx.backend.compose;

import java.util.List;

/** Events streamed to the frontend over /ws/compose. The {@code type} field drives the client's switch. */
public sealed interface ComposeEvent {

    /**
     * Sent first, before any file is fetched.
     *
     * @param totalCodeFiles   source files in the whole repo (after ignoring vendored/build output)
     * @param sampledCodeFiles source files actually included in {@code nodes} (largest first)
     * @param treeTruncated    true if GitHub truncated the recursive tree (very large repos)
     */
    record RepoTree(String type, String repoName, int bpm, int stars, int totalCodeFiles, int sampledCodeFiles,
                    boolean treeTruncated, List<FileNode> nodes) implements ComposeEvent {
        public RepoTree(String repoName, int bpm, int stars, int totalCodeFiles, int sampledCodeFiles,
                        boolean treeTruncated, List<FileNode> nodes) {
            this("REPO_TREE", repoName, bpm, stars, totalCodeFiles, sampledCodeFiles, treeTruncated, nodes);
        }
    }

    record NodeMetrics(String type, FileNode node) implements ComposeEvent {
        public NodeMetrics(FileNode node) {
            this("NODE_METRICS", node);
        }
    }

    record EdgeFound(String type, String sourceId, String targetId) implements ComposeEvent {
        public EdgeFound(String sourceId, String targetId) {
            this("EDGE_FOUND", sourceId, targetId);
        }
    }

    record CompositionReady(String type, int totalAnalyzed) implements ComposeEvent {
        public CompositionReady(int totalAnalyzed) {
            this("COMPOSITION_READY", totalAnalyzed);
        }
    }

    record ErrorEvent(String type, String message) implements ComposeEvent {
        public ErrorEvent(String message) {
            this("ERROR", message);
        }
    }
}
