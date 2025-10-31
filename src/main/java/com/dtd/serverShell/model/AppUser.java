package com.dtd.serverShell.model;

import java.util.List;
import java.util.Map;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;
import org.springframework.data.mongodb.core.mapping.Field;

@Document(collection = "users")  // Maps to the 'users' collection in MongoDB
public class AppUser {

    @Id
    private String id; // MongoDB document _id field

    private String username;

    private String password;

    private String role;

    private List<String> recentMovies;
    private List<String> recentMusic;
    private List<String> recentTV;
    
    // Constructors
    public AppUser() {}

    public AppUser(String username, String password, String role) {
        this.username = username;
        this.password = password;
        this.role = role;
    }

    // Getters and setters
    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getUsername() {
        return username;
    }

    public void setUsername(String username) {
        this.username = username;
    }

    public String getPassword() {
        return password;
    }

    public void setPassword(String password) {
        this.password = password;
    }

    public String getRole() {
        return role;
    }

    public void setRole(String role) {
        this.role = role;
    }
    
    //User Profile Settings
    private List<String> recentViews;

    public List<String> getRecentViews() {
        return recentViews;
    }

    public void setRecentViews(List<String> recentViews) {
        this.recentViews = recentViews;
    }
    
    public List<String> getRecentMovies() {
        return recentMovies == null ? (recentMovies = new java.util.ArrayList<>()) : recentMovies;
    }
    public void setRecentMovies(List<String> recentMovies) {
        this.recentMovies = recentMovies;
    }

    public List<String> getRecentMusic() {
        return recentMusic == null ? (recentMusic = new java.util.ArrayList<>()) : recentMusic;
    }
    public void setRecentMusic(List<String> recentMusic) {
        this.recentMusic = recentMusic;
    }

    public List<String> getRecentTV() {
        return recentTV == null ? (recentTV = new java.util.ArrayList<>()) : recentTV;
    }
    public void setRecentTV(List<String> recentTV) {
        this.recentTV = recentTV;
    }
    //ROM Data
    private Map<String, String> recentRomSaves; // key: rom name, value: save path or timestamp
    
    public Map<String, String> getRecentRomSaves() {
        return recentRomSaves;
    }

    public void setRecentRomSaves(Map<String, String> recentRomSaves) {
        this.recentRomSaves = recentRomSaves;
    }
    
}