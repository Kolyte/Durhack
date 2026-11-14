package com.codefugue.backend;

import com.codefugue.backend.ranking.DatabaseUrl;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class BackendApplication {

    public static void main(String[] args) {
        DatabaseUrl.applyFromEnvironment(); // accept postgres://user:pass@host/db as well as jdbc: URLs
        SpringApplication.run(BackendApplication.class, args);
    }
}
