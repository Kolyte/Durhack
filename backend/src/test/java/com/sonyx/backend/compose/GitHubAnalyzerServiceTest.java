package com.sonyx.backend.compose;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class GitHubAnalyzerServiceTest {

    private final GitHubAnalyzerService service = new GitHubAnalyzerService();

    private FileNode node(String path) {
        return new FileNode(path, path, "src", 1, 10, 1, 0, 0, GitHubAnalyzerService.classifyRole(path), false);
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
    void scanFileCountsComplexityConcurrencyAndImports() {
        String code = """
                import fs from 'fs';
                const x = require('./util');
                async function go(a, b) {
                  if (a && b) { await thing(); }
                  for (const x of xs) {}
                }
                """;
        FileNode scanned = service.scanFile(node("src/a.js"), code);
        assertEquals(4, scanned.complexity()); // 1 + if + && + for
        assertEquals(2, scanned.concurrency()); // async + await
        assertEquals(2, scanned.imports());
        assertEquals(6, scanned.loc());
        assertTrue(scanned.analyzed());
    }

    @Test
    void docsAndConfigAreNotScoredForComplexity() {
        FileNode readme = service.scanFile(node("README.md"), "# Title\nif you want, async things\n");
        assertEquals("docs", readme.role());
        assertEquals(1, readme.complexity());
        assertEquals(0, readme.concurrency());
    }

    @Test
    void resolvesImportsByExactBaseName() {
        List<FileNode> nodes = List.of(node("src/app.js"), node("src/router.js"), node("src/routerUtils.js"),
                node("src/view/index.js"));
        String code = "const r = require('./router');\nimport v from './view';";
        assertEquals(List.of("src/router.js", "src/view/index.js"),
                service.resolveImports(code, nodes, "src/app.js"));
    }

    @Test
    void resolvesJavaAndPythonImports() {
        List<FileNode> nodes = List.of(node("src/main/java/a/App.java"), node("src/main/java/a/UserService.java"),
                node("pkg/models.py"));
        assertEquals(List.of("src/main/java/a/UserService.java"),
                service.resolveImports("import com.a.UserService;\n", nodes, "src/main/java/a/App.java"));
        assertEquals(List.of("pkg/models.py"),
                service.resolveImports("from pkg.models import User\n", nodes, "src/main/java/a/App.java"));
    }

    @Test
    void classifiesRoles() {
        assertEquals("source", GitHubAnalyzerService.classifyRole("lib/router/index.js"));
        assertEquals("test", GitHubAnalyzerService.classifyRole("test/app.router.js"));
        assertEquals("test", GitHubAnalyzerService.classifyRole("src/test/java/a/AppTests.java"));
        assertEquals("test", GitHubAnalyzerService.classifyRole("src/foo.spec.ts"));
        assertEquals("config", GitHubAnalyzerService.classifyRole("package.json"));
        assertEquals("config", GitHubAnalyzerService.classifyRole("vite.config.ts"));
        assertEquals("config", GitHubAnalyzerService.classifyRole("Dockerfile"));
        assertEquals("docs", GitHubAnalyzerService.classifyRole("docs/Guide.md"));
        assertEquals("ignored", GitHubAnalyzerService.classifyRole("package-lock.json"));
        assertEquals("ignored", GitHubAnalyzerService.classifyRole("logo.png"));
    }

    @Test
    void leafNames() {
        assertEquals("router", GitHubAnalyzerService.leafName("./router"));
        assertEquals("b", GitHubAnalyzerService.leafName("../a/b.js"));
        assertEquals("UserService", GitHubAnalyzerService.leafName("com.a.UserService"));
        assertEquals("conn", GitHubAnalyzerService.leafName("crate::net::conn"));
        assertFalse(GitHubAnalyzerService.matchesLeaf("src/routerUtils.js", "router"));
    }
}
