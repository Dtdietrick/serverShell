package com.dtd.serverShell.controller;

import java.security.Principal;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.dtd.serverShell.model.AppUser;
import com.dtd.serverShell.repository.AppUserRepository;
import com.dtd.serverShell.services.UserService;
import passwordHasher.passwordHasher;
@RestController
@RequestMapping("/user")
public class UserController {

    private final UserService userService;
    private final AppUserRepository userRepository;
    private static final Logger log = LoggerFactory.getLogger(UserController.class);
    
    public UserController(UserService userService, AppUserRepository userRepository ) {
        this.userService = userService;
        this.userRepository = userRepository;
    }
    
    @PostMapping("/password")
    public ResponseEntity<?> changePassword(@RequestBody Map<String, String> body, Principal principal) {
        String currentPassword = body.get("currentPassword");
        String newPassword = body.get("newPassword");

        AppUser user = userRepository.findByUsername(principal.getName()).orElse(null);
        if (user == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("User not found.");
        }

        if (!passwordHasher.matches(currentPassword, user.getPassword())) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body("Incorrect current password.");
        }

        boolean changed = userService.changePassword(user.getUsername(), newPassword);
        if (!changed) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body("Could not update password.");
        }

        return ResponseEntity.ok("Password updated.");
    }
    


    @GetMapping("/dashboard")
    public ResponseEntity<Map<String, Object>> getDashboard(Principal principal) {
        if (principal == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();

        return userRepository.findByUsername(principal.getName()).map(user -> {
            Map<String, Object> dashboard = new HashMap<>();

        // Only per-category lists for the UI
        dashboard.put("recentMovies", user.getRecentMovies());
        dashboard.put("recentMusic",  user.getRecentMusic());
        dashboard.put("recentTV",     user.getRecentTV());

        // not using currently
        //dashboard.put("recentRomSaves", user.getRecentRomSaves());

        return ResponseEntity.ok(dashboard);
        }).orElse(ResponseEntity.notFound().build());
    }
    
    @GetMapping("/role")
    public ResponseEntity<?> getCurrentUser(Principal principal) {
        Optional<AppUser> userOpt = userRepository.findByUsername(principal.getName());
        if (userOpt.isEmpty()) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("User not found");
        }

        AppUser user = userOpt.get();
        return ResponseEntity.ok(Map.of("username", user.getUsername(), "role", user.getRole()));
    }
    
    private static Map<String, String> toDetailedViewRow(String raw) {
        String path = normalize(raw);
        String folderName = extractSecondSegment(path);    
        String itemName   = extractDisplayItem(path);       
        return Map.of(
            "path", path,
            "folderName", folderName == null ? "" : folderName,
            "itemName", itemName == null ? "" : itemName
        );
    }
    
    private static String normalize(String p) {
        if (p == null) return "";
        String s = p.replace('\\', '/');
        if (s.endsWith("/index.m3u8")) s = s.substring(0, s.length() - "/index.m3u8".length());
        if (s.endsWith("/")) s = s.substring(0, s.length() - 1);
        return s;
    }

    private static String extractSecondSegment(String p) {
        String[] parts = p.split("/"); 
        return parts.length >= 2 ? parts[1] : "";
    }

    private static String extractDisplayItem(String p) {
        String[] parts = p.split("/");
        if (parts.length == 0) return "";
        return parts[parts.length - 1];
    }
}