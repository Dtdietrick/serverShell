package com.dtd.serverShell.services;

import java.util.Optional;

import org.springframework.stereotype.Service;

import com.dtd.serverShell.model.AppUser;
import com.dtd.serverShell.repository.AppUserRepository;

import passwordHasher.passwordHasher;

@Service
public class UserService {

    private final AppUserRepository userRepository;

    public UserService(AppUserRepository userRepository) {
        this.userRepository = userRepository;
    }

    public AppUser addUser(String username, String password, String role) {
        AppUser user = new AppUser(username, password, role);
        return userRepository.save(user);
    }
    
    public boolean changePassword(String username, String rawNewPassword) {
        Optional<AppUser> optionalUser = userRepository.findByUsername(username);
        if (optionalUser.isEmpty()) return false;

        AppUser user = optionalUser.get();
        String hashed = passwordHasher.hash(rawNewPassword); 
        user.setPassword(hashed);
        userRepository.save(user);
        return true;
    }
}
