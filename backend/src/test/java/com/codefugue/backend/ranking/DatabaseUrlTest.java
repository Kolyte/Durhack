package com.codefugue.backend.ranking;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

class DatabaseUrlTest {

    @Test
    void convertsTigerDataConnectionString() {
        var s = DatabaseUrl.parse("postgres://tsdbadmin:s3cr%40t@abc.def.tsdb.cloud.timescale.com:39100/tsdb?sslmode=require");
        assertEquals("jdbc:postgresql://abc.def.tsdb.cloud.timescale.com:39100/tsdb?sslmode=require", s.jdbcUrl());
        assertEquals("tsdbadmin", s.username());
        assertEquals("s3cr@t", s.password());
    }

    @Test
    void defaultsPortAndAcceptsPostgresqlScheme() {
        var s = DatabaseUrl.parse("postgresql://u:p@localhost/codefugue");
        assertEquals("jdbc:postgresql://localhost:5432/codefugue", s.jdbcUrl());
    }

    @Test
    void leavesJdbcUrlsAlone() {
        assertNull(DatabaseUrl.parse("jdbc:postgresql://localhost:5432/codefugue"));
        assertNull(DatabaseUrl.parse(null));
    }
}
