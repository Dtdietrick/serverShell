package com.dtd.fileServer.controller;

import com.dtd.fileServer.model.AppUser;
import com.dtd.fileServer.repository.AppUserRepository;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

import java.security.Principal;
import java.util.*;

@RestController
@RequestMapping("/user")
public class UserProfileController {

    private final AppUserRepository userRepository;

    public UserProfileController(AppUserRepository userRepository) {
        this.userRepository = userRepository;
    }

    @GetMapping("/dashboard")
    public ResponseEntity<Map<String, Object>> getDashboard(Principal principal) {
        if (principal == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();

        Optional<AppUser> userOpt = userRepository.findByUsername(principal.getName());
        return userOpt.map(user -> {
            Map<String, Object> dashboard = new HashMap<>();
            dashboard.put("recentViews", user.getRecentViews());
            dashboard.put("recentRomSaves", user.getRecentRomSaves());
            return ResponseEntity.ok(dashboard);
        }).orElse(ResponseEntity.notFound().build());
    }
    // 🔜 Future features: change password, update preferences, delete account, etc.
}