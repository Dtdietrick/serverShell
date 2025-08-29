package com.dtd.serverShell.services;

import java.util.ArrayList;
import java.util.List;
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
    
    private static String normalizeRecentPath(String p) {
        if (p == null) return null;
        String s = p.replace('\\', '/');
        if (s.endsWith("/index.m3u8")) s = s.substring(0, s.length() - "/index.m3u8".length());
        if (s.endsWith("/"))          s = s.substring(0, s.length() - 1);
        return s;
    }

    public void recordView(String username, String filenameOrFolder) {
        final String key = normalizeRecentPath(filenameOrFolder);

        Optional<AppUser> userOpt = userRepository.findByUsername(username);
        userOpt.ifPresent(user -> {
            List<String> history = user.getRecentViews();
            if (history == null) history = new ArrayList<>();

            history.remove(key);
            history.add(0, key);
            if (history.size() > 10) {
                history = history.subList(0, 10);
            }

            user.setRecentViews(history);
            userRepository.save(user);
        });
    }
}
