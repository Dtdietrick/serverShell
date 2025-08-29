//FILE:MediaController.java
package com.dtd.serverShell.controller;

import java.io.IOException;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.List;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.util.AntPathMatcher;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.HandlerMapping;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

import com.dtd.serverShell.config.allowedMediaType;
import com.dtd.serverShell.services.MediaService;
import com.dtd.serverShell.services.UserService;

import jakarta.servlet.http.HttpServletRequest;

@RestController
@RequestMapping("/media")
public class MediaController {
     
    @Value("${media.dir}")
    private String mediaDir;
    
    private static final Logger log = LoggerFactory.getLogger(MediaController.class);
    private final MediaService mediaService;
    private final allowedMediaType allowedmediaType;
    private final AntPathMatcher pathMatcher = new AntPathMatcher(); // Used for pattern matching URI paths
    private final UserService userProfileService;
    private static final AntPathMatcher PATH_MATCHER = new AntPathMatcher();
    
    public MediaController(MediaService mediaService, UserService userProfileService, allowedMediaType allowedmediaType) {
        this.mediaService = mediaService;
        this.userProfileService = userProfileService;
        this.allowedmediaType = allowedmediaType;
    }
    
    @GetMapping("/list")
    public ResponseEntity<List<String>> listMediaFiles(@RequestParam(name = "path", defaultValue = "") String currentPath) {
        return ResponseEntity.ok(mediaService.listMediaFiles(currentPath));
    }
    
    @GetMapping("/allowedType")
    public ResponseEntity<Boolean> isAllowedType(@RequestParam(name = "path", defaultValue = "") String currentType) {
        return ResponseEntity.ok(allowedMediaType.isSupportedMediaFile(currentType));
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
    
    @GetMapping("/allowedMedia")
    public List<String> getSupportedExtensions() {
        return allowedMediaType.SUPPORTED_EXTENSIONS;
    }
    
    @PostMapping("/vod")
    public ResponseEntity<Map<String, String>> startVod(@RequestBody Map<String, String> payload) {
        String rel = payload == null ? null : payload.get("path");
        try {
            Path manifest = mediaService.resolveVodManifest(rel);

            // Build a URL to our static-file passthrough below
            // We’ll serve via /media/vod/fs/** which maps inside mediaDir
            Path mediaRoot = Paths.get(mediaDir).toAbsolutePath().normalize();
            String remainder = mediaRoot.relativize(manifest).toString().replace('\\', '/');

            String url = ServletUriComponentsBuilder
                    .fromCurrentContextPath()
                    .path("/media/vod/fs/")
                    .path(remainder)                    // e.g. Movies/Files/index.m3u8
                    .toUriString();

            String folderRel;
            if (remainder.endsWith("/index.m3u8")) {
                folderRel = remainder.substring(0, remainder.length() - "/index.m3u8".length());
            } else {
                // if caller gave folder, ensure it's folder-like
                folderRel = remainder.endsWith("/") ? remainder.substring(0, remainder.length() - 1) : remainder;
                // If remainder is a file (rare), fall back to parent
                if (!folderRel.isEmpty() && folderRel.contains("/") && !folderRel.equals(remainder)) {
                    // ok
                } else {
                    folderRel = mediaRoot.relativize(manifest.getParent()).toString().replace('\\', '/');
                }
            }
            
            Authentication auth = SecurityContextHolder.getContext().getAuthentication();
            if (auth != null && auth.isAuthenticated() && !(auth instanceof AnonymousAuthenticationToken)) {
                String username = auth.getName();
                userProfileService.recordView(username, folderRel); // <-- inject this service
            }
            
            log.info("[VOD] Resolved manifest: {} -> {}", manifest, url);
            return ResponseEntity.ok(Map.of("m3u8", url));
        } catch (IOException e) {
            log.error("[VOD] {}", e.getMessage());
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("error", e.getMessage()));
        }
    }
    
    @GetMapping("/vod/fs/**")
    public ResponseEntity<FileSystemResource> serveVodAsset(HttpServletRequest req) {
        try {
            String full    = (String) req.getAttribute(HandlerMapping.PATH_WITHIN_HANDLER_MAPPING_ATTRIBUTE);
            String pattern = (String) req.getAttribute(HandlerMapping.BEST_MATCHING_PATTERN_ATTRIBUTE);
            String tail    = PATH_MATCHER.extractPathWithinPattern(pattern, full);

            String decodedTail = URLDecoder.decode(tail, StandardCharsets.UTF_8);
            
            Path mediaRoot = Paths.get(mediaDir).toAbsolutePath().normalize();
            Path file      = mediaRoot.resolve(decodedTail).normalize();

            if (!file.startsWith(mediaRoot) || !Files.isRegularFile(file)) {
                return ResponseEntity.status(HttpStatus.NOT_FOUND).build();
            }

            // Lightweight content-type mapping
            String name = file.getFileName().toString().toLowerCase();
            MediaType type;
            if (name.endsWith(".m3u8")) {
                // HLS manifest
                type = MediaType.parseMediaType("application/vnd.apple.mpegurl");
            } else if (name.endsWith(".m4s")) {
                // HLS fMP4 segment
                // Some players prefer application/octet-stream; both generally work.
                type = MediaType.APPLICATION_OCTET_STREAM;
            } else if (name.endsWith(".mp4")) {
                type = MediaType.valueOf("video/mp4");
            } else {
                type = MediaType.APPLICATION_OCTET_STREAM;
            }

            FileSystemResource resource = new FileSystemResource(file.toFile());
            return ResponseEntity.ok()
                    .contentType(type)
                    .cacheControl(CacheControl.noCache()) // VOD index often updates during encode; safe default
                    .body(resource);

        } catch (Exception e) {
            log.error("[VOD/fs] {}", e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }
}
