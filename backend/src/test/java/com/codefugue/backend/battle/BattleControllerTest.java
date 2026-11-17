package com.codefugue.backend.battle;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

class BattleControllerTest {

    @Test
    void pairsAreNormalisedAndOrderIndependent() {
        String[] p = BattleController.pair("https://github.com/Facebook/React", "vuejs/core");
        assertArrayEquals(new String[]{"facebook/react", "vuejs/core"}, p);
        assertArrayEquals(p, BattleController.pair("vuejs/core", "facebook/react"));
    }

    @Test
    void rejectsSameRepoAndJunk() {
        assertNull(BattleController.pair("a/b", "A/B"));
        assertNull(BattleController.pair("a/b", "not a repo"));
        assertNull(BattleController.pair("a/b/c", "d/e"));
        assertNull(BattleController.pair(null, "d/e"));
    }

    @Test
    void votersAreStoredHashed() {
        String h = BattleController.hash("cookie-value");
        assertEquals(64, h.length());
        assertNotEquals("cookie-value", h);
    }
}
