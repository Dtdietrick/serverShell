package com.dtd.serverShell.controller;


import java.io.IOException;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

import com.dtd.serverShell.services.MediaService;
import com.dtd.serverShell.services.VideoService;
import com.dtd.serverShell.config.VideoSession;

@RestController
@RequestMapping("/video")
public class VideoController {
    private final VideoService video;

    @Value("${media.dir}") String mediaDir;

    public VideoController(VideoService video) { this.video = video; }

    private static final Logger logger = LoggerFactory.getLogger(VideoController.class);
    
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
        Path resolved   = mediaRoot.resolve(filename).normalize();
        if (!resolved.startsWith(mediaRoot)) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).build();
        }

        VideoSession session = video.start(username, resolved);
        
        String absM3u8 = ServletUriComponentsBuilder
                .fromCurrentContextPath()
                .path(session.m3u8Url())    // e.g. "/streams/<sid>/index.m3u8"
                .toUriString();
        
        logger.info("Started session {} and m3u8 {}", session.sid(), absM3u8);
        // IMPORTANT: This m3u8 matches the on-disk folder exactly
        return ResponseEntity.ok(Map.of(
            "sessionId", session.sid(),
            "m3u8",absM3u8
        ));
    }

    @DeleteMapping("/hls/{sid}")
    public ResponseEntity<Void> stop(@PathVariable String sid) {
        var auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated() || auth instanceof AnonymousAuthenticationToken) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        var ses = video.getSession(sid);
        if (ses != null && ses.username().equals(auth.getName())) {
            video.stop(sid);
        }
        // Always 204, even if already gone or not your session (idempotent + unload-friendly)
        return ResponseEntity.noContent().build();
    }
}
