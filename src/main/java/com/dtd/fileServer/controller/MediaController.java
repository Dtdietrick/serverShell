package com.dtd.fileServer.controller;

import java.io.IOException;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.util.AntPathMatcher;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.dtd.fileServer.services.MediaService;

import jakarta.servlet.http.HttpServletRequest;

@RestController
@RequestMapping("/media")
public class MediaController {
	
    @Value("${media.dir}")
    private String mediaDir;
    
	private static final Logger log = LoggerFactory.getLogger(MediaController.class);
	private static final Logger auditLog = LoggerFactory.getLogger("com.dtd.fileServer.audit");
    private final MediaService mediaService;
    private final AntPathMatcher pathMatcher = new AntPathMatcher(); // Used for pattern matching URI paths

    public MediaController(MediaService mediaService) {
        this.mediaService = mediaService; // Inject MediaService dependency
    }
    @GetMapping("/list")
    public ResponseEntity<List<String>> listMediaFiles(@RequestParam(name = "path", defaultValue = "") String currentPath) {
        return ResponseEntity.ok(mediaService.listMediaFiles(currentPath));
    }

    @GetMapping("/playlists")
    public ResponseEntity<List<String>> listPlaylists() {
        // Endpoint to list all playlists available; returns list from MediaService
        return ResponseEntity.ok(mediaService.listPlaylists());
    }

    
    @GetMapping("/playlist")
    public ResponseEntity<List<String>> getPlaylist(
            @RequestParam("name") String name,
            @RequestParam(defaultValue = "0") int offset,
            @RequestParam(defaultValue = "10") int limit) {

        // Endpoint to get a paginated playlist by name, with offset and limit parameters
        return ResponseEntity.ok(mediaService.loadPlaylist(name, offset, limit));
    }

    @GetMapping("/**")
    public ResponseEntity<Resource> getMedia(
            HttpServletRequest request,
            @RequestHeader(value = "Range", required = false) String rangeHeader,
            @RequestParam(value = "fromPlaylist", required = false) Boolean fromPlaylist) throws IOException {

        // Log the requested file path
    	Authentication auth = SecurityContextHolder.getContext().getAuthentication();
    	String username = auth != null ? auth.getName() : "anonymous";

    	String ip = request.getHeader("X-Forwarded-For");
    	if (ip == null) ip = request.getRemoteAddr();

    	String userAgent = request.getHeader("User-Agent");
    	String requestedPath = request.getRequestURI(); // e.g., /media/movies/12_monkeys.mp4

    	log.info("MEDIA ACCESS: user={}, path={}, ip={}, agent={}", username, requestedPath, ip, userAgent);
    	auditLog.info("MEDIA ACCESS: user={}, path={}, ip={}, agent={}", username, requestedPath, ip, userAgent);
        // Matches any GET request starting with /media/ to serve media files
        String pattern = "/media/**";

        if (auth == null || !auth.isAuthenticated() || auth instanceof AnonymousAuthenticationToken) {
            log.warn("Unauthorized media access attempt for path: {}", requestedPath);
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        // Get the full request URI
        String fullPath = request.getRequestURI();

        // Extract the part of the URI after /media/ using AntPathMatcher
        String encodedPath = pathMatcher.extractPathWithinPattern(pattern, fullPath);

        // URL-decode the extracted path to handle encoded characters
        String path = URLDecoder.decode(encodedPath, StandardCharsets.UTF_8);

        // Assume mediaRoot is the base directory on disk where media files reside
        Path mediaRoot = Paths.get(mediaDir).normalize();
        Path requestedFile = mediaRoot.resolve(path).normalize();
        
        if (!requestedFile.startsWith(mediaRoot) || !Files.exists(requestedFile)) {
            log.warn("Invalid or missing media file request: {}", requestedFile);
            return ResponseEntity.notFound().build();
        }
        
        // Delegate to MediaService to serve the media file with support for range requests and playlist context
        return mediaService.getMedia(path, rangeHeader, fromPlaylist);
    }
}