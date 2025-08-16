package com.dtd.serverShell.controller;

import java.security.Principal;
import java.util.Map;
import java.util.Optional;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.dtd.serverShell.model.AppUser;
import com.dtd.serverShell.repository.AppUserRepository;
import com.dtd.serverShell.services.UserService;

import passwordHasher.passwordHasher;

@RestController
@RequestMapping("/admin")
public class AdminController {
    
    private final UserService userService;
    private final AppUserRepository userRepository;
    
    public AdminController(UserService userService, AppUserRepository userRepository ) {
        this.userService = userService;
        this.userRepository = userRepository;
    }
    
    @PostMapping("/add")
    public ResponseEntity<AppUser> addUser(@RequestBody AppUser user) {
        AppUser savedUser = userService.addUser(user.getUsername(),passwordHasher.hash(user.getPassword()) , user.getRole());
        return ResponseEntity.ok(savedUser);
    }
    
    @DeleteMapping("/remove/{username}")
    public ResponseEntity<?> removeUser(@PathVariable String username) {
        Optional<AppUser> user = userRepository.findByUsername(username);
        if (user.isEmpty()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body("User not found.");
        }

        userRepository.delete(user.get());
        return ResponseEntity.ok("User deleted.");
    }
   
}
