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
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
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
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

import com.dtd.serverShell.config.allowedMediaType;
import com.dtd.serverShell.model.StreamSession;
import com.dtd.serverShell.services.MediaService;
import com.dtd.serverShell.services.StreamService;
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
    private final StreamService stream;
    
    public MediaController(MediaService mediaService, UserService userProfileService, allowedMediaType allowedmediaType,StreamService stream) {
        this.mediaService = mediaService;
        this.userProfileService = userProfileService;
        this.allowedmediaType = allowedmediaType;
        this.stream = stream;
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
    
    @PostMapping("/hls")
    public ResponseEntity<Map<String, String>> start(@RequestBody Map<String, String> payload) throws IOException {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated() || auth instanceof AnonymousAuthenticationToken) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        String username = auth.getName();

        String filename = payload.get("filename");
        if (filename == null || filename.isBlank()) {
            return ResponseEntity.badRequest().build();
        }

        Path mediaRoot = Paths.get(mediaDir).toAbsolutePath().normalize();
        Path resolved  = mediaRoot.resolve(filename).normalize();
        if (!resolved.startsWith(mediaRoot)) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).build();
        }

        // Decide MUSIC vs VIDEO strictly by top-level folder: starts with "Music/"
        // Using relativize avoids false positives (e.g., "MyMusic/...")
        Path relative = mediaRoot.relativize(resolved);
        boolean isMusic = (relative.getNameCount() > 0) && "Music".equals(relative.getName(0).toString());

        // Renamed service: use StreamService and StreamSession
        // (Assumes you have: @Autowired private StreamService stream;)
        StreamSession session = isMusic
            ? stream.startMusic(username, resolved)
            : stream.startVideo(username, resolved);

        String absM3u8 = ServletUriComponentsBuilder
                .fromCurrentContextPath()
                .path(session.m3u8Url())    // e.g. "/streams/<sid>/index.m3u8"
                .toUriString();

        
        log.info("Started {} session {} for user {} -> {}", (isMusic ? "music" : "video"), session.sid(), username, absM3u8);

        userProfileService.recordView(username, resolved.toString());
        return ResponseEntity.ok(Map.of(
            "sessionId", session.sid(),
            "m3u8", absM3u8
        ));
    }

    @DeleteMapping("/hls/{sid}")
    public ResponseEntity<Void> stop(@PathVariable String sid) {
        var auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated() || auth instanceof AnonymousAuthenticationToken) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        var ses = stream.getSession(sid); // StreamService now tracks StreamSession
        if (ses != null && ses.username().equals(auth.getName())) {
            stream.stop(sid);
        }
        // Always 204 (idempotent)
        return ResponseEntity.noContent().build();
    }
}