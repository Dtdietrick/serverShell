package com.dtd.serverShell.services;

import com.dtd.serverShell.model.AppUser;
import com.dtd.serverShell.repository.AppUserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

@Service
public class UserProfileService {

    @Autowired
    private AppUserRepository userRepository;

    public void recordView(String username, String filename) {
        Optional<AppUser> userOpt = userRepository.findByUsername(username);
        userOpt.ifPresent(user -> {
            List<String> history = user.getRecentViews();
            if (history == null) history = new ArrayList<>();

            history.remove(filename); // Remove if already in list
            history.add(0, filename); // Add to front
            if (history.size() > 10) {
                history = history.subList(0, 10);
            }

            user.setRecentViews(history);
            userRepository.save(user);
        });
    }
}