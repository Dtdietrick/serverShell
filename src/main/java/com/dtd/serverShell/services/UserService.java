package com.dtd.serverShell.services;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import com.dtd.serverShell.model.AppUser;
import com.dtd.serverShell.repository.AppUserRepository;

import passwordHasher.passwordHasher;

@Service
public class UserService {

    private final AppUserRepository userRepository;

    @Value("${pixelart.dir}")
    private String pixelartDir;
    
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
        if (key == null) return;

        // Normalize to forward slashes and strip a single leading slash if present
        final String norm = key.replace('\\', '/');                         // [UserProfileService.java]
        final String noLead = norm.startsWith("/") ? norm.substring(1) : norm;

        // Skip PIXELART_DIR
        if (noLead.startsWith(pixelartDir.endsWith("/") ? pixelartDir : (pixelartDir + "/"))) {
            return;
        }

        // Category = first path segment (Movies|Music|TV)
        final int slash = noLead.indexOf('/');
        final String firstSeg = (slash == -1) ? noLead : noLead.substring(0, slash);

        enum Cat { MOVIES, MUSIC, TV, NONE }
        final Cat cat = switch (firstSeg) {
            case "Movies" -> Cat.MOVIES;
            case "Music"  -> Cat.MUSIC;
            case "TV"     -> Cat.TV;
            default       -> Cat.NONE;
        };

        userRepository.findByUsername(username).ifPresent(user -> {
            // Copy-on-write: read existing list, copy it, mutate the copy, then set it back.
            switch (cat) {                                                  // [UserProfileService.java]
                case MOVIES -> {
                    List<String> src = user.getRecentMovies();
                    List<String> updated = moveToFrontWithCapCopy(src, norm, 10);
                    user.setRecentMovies(updated);
                }
                case MUSIC -> {
                    List<String> src = user.getRecentMusic();
                    List<String> updated = moveToFrontWithCapCopy(src, norm, 10);
                    user.setRecentMusic(updated);
                }
                case TV -> {
                    List<String> src = user.getRecentTV();
                    List<String> updated = moveToFrontWithCapCopy(src, norm, 10);
                    user.setRecentTV(updated);
                }
                case NONE -> { /* ignore anything outside our three roots */ }
            }

            userRepository.save(user);
        });
    }

    // [UserProfileService.java] CHANGE: return a fresh list; never mutate the caller's list.
    private static List<String> moveToFrontWithCapCopy(List<String> src, String value, int max) {
        List<String> list = (src == null) ? new ArrayList<>() : new ArrayList<>(src);   // copy  // [UserProfileService.java]
        list.remove(value);
        list.add(0, value);
        if (list.size() > max) {
            // Keep first 'max' items — return as a brand-new list to avoid subList view issues
            list = new ArrayList<>(list.subList(0, max));
        }
        return list;
    }
}
