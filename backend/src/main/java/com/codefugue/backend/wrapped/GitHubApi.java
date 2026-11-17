package com.codefugue.backend.wrapped;

import tools.jackson.databind.JsonNode;

/** The GitHub REST calls Wrapped makes. An interface so tests run without the network. */
public interface GitHubApi {

    /** GET https://api.github.com{path}; throws {@link GitHubException} on HTTP errors. */
    JsonNode get(String path) throws Exception;

    class GitHubException extends RuntimeException {
        private final int status;

        public GitHubException(int status, String message) {
            super(message);
            this.status = status;
        }

        public int status() {
            return status;
        }
    }
}
