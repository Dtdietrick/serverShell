package com.dtd.serverShell.controller;

import java.security.Principal;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

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
    private static final com.dtd.serverShell.logging.ssLogger log =
            com.dtd.serverShell.logging.serverShellLoggerFactory
                .getServerLogger("com.dtd.serverShell.serverShell-full", /*alsoDebug=*/true);
    
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

        Optional<AppUser> userOpt = userRepository.findByUsername(principal.getName());
        return userOpt.map(user -> {
            Map<String, Object> dashboard = new HashMap<>();
            dashboard.put("recentViews", user.getRecentViews());
            dashboard.put("recentRomSaves", user.getRecentRomSaves());
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
}