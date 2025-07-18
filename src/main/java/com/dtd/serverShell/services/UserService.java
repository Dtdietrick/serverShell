package com.dtd.serverShell.services;

import org.springframework.stereotype.Service;

import com.dtd.serverShell.model.AppUser;
import com.dtd.serverShell.repository.AppUserRepository;

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
}
