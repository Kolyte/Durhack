package com.codefugue.backend.compose;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class GitHubAnalyzerServiceTest {

    private final GitHubAnalyzerService service = new GitHubAnalyzerService();

    private FileNode node(String path) {
        return new FileNode(path, path, "src", 1, 0, 0, 0, 10, 1, 0, false);
    }

    @Test
    void parsesOwnerAndRepoFromUrlVariants() {
        String[] expected = {"expressjs", "express"};
        assertArrayEquals(expected, GitHubAnalyzerService.parseOwnerRepo("https://github.com/expressjs/express"));
        assertArrayEquals(expected, GitHubAnalyzerService.parseOwnerRepo("https://github.com/expressjs/express.git"));
        assertArrayEquals(expected, GitHubAnalyzerService.parseOwnerRepo("https://github.com/expressjs/express/"));
        assertArrayEquals(expected, GitHubAnalyzerService.parseOwnerRepo("expressjs/express"));
    }

    @Test
    void scanFileCountsComplexityAndConcurrency() {
        String code = """
                async function go(a, b) {
                  if (a && b) { await thing(); }
                  for (const x of xs) {}
                }
                """;
        FileNode scanned = service.scanFile(node("src/a.js"), code);
        assertEquals(4, scanned.complexity()); // 1 + if + && + for
        assertEquals(2, scanned.concurrency()); // async + await
        assertTrue(scanned.analyzed());
    }

    @Test
    void resolvesImportsToOtherNodes() {
        List<FileNode> nodes = List.of(node("src/app.js"), node("src/router.js"), node("src/view.js"));
        String code = "const r = require('./router');\nimport v from './view';";
        assertEquals(List.of("src/router.js", "src/view.js"),
                service.resolveImports(code, nodes, "src/app.js"));
    }
}
