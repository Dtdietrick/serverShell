package com.dtd.serverShell.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.dtd.serverShell.repository.AppUserRepository;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.util.Map;

@RestController
@RequestMapping("/feeds")
public class FeedController {

    private final AppUserRepository userRepository;
    private final Logger logger = LoggerFactory.getLogger(FeedController.class);
    private final ObjectMapper objectMapper = new ObjectMapper();

    public FeedController(AppUserRepository userRepository) {
        this.userRepository = userRepository;
    }

    @GetMapping("/user-feed.json")
    public ResponseEntity<Map<String, Object>> getUserFeed() {
        try {
            // Load the JSON file from classpath (inside the jar)
            ClassPathResource resource = new ClassPathResource("static/feeds/user-feed.json");

            ObjectMapper mapper = new ObjectMapper();
            Map<String, Object> feed = mapper.readValue(resource.getInputStream(), Map.class);

            return ResponseEntity
                    .ok()
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(feed);
        } catch (IOException e) {
            e.printStackTrace(); // for debugging
            return ResponseEntity.status(500).body(Map.of("error", "Could not load feed"));
        }
    }
}