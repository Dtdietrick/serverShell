//FILE:MediaController.java
package com.dtd.serverShell.controller;

import java.io.BufferedReader;
import java.io.File;
import java.io.IOException;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.InetAddress;
import java.net.Socket;
import java.net.URI;
import java.net.URL;
import java.net.URLDecoder;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Scanner;

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
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

import com.dtd.serverShell.config.allowedMediaType;
import com.dtd.serverShell.proxy.VlcSessionManager;
import com.dtd.serverShell.proxy.VlcSessionManager.VlcSession;
import com.dtd.serverShell.services.MediaService;
import com.dtd.serverShell.services.UserProfileService;
import com.dtd.serverShell.util.ServerUtil;

import jakarta.servlet.http.HttpServletRequest;

@RestController
@RequestMapping("/media/api")
public class MediaController {
	
    @Value("${media.dir}")
    private String mediaDir;
   
    @Value("${pulse.dir}")
    private String pulseDir;
        
	private static final Logger log = LoggerFactory.getLogger(MediaController.class);
	private static final Logger auditLog = LoggerFactory.getLogger("com.dtd.serverShell.audit");
    private final MediaService mediaService;
    private final allowedMediaType allowedmediaType;
    private final UserProfileService userProfileService;
    
    public MediaController(MediaService mediaService, UserProfileService userProfileService, allowedMediaType allowedmediaType) {
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
    
    private String stripExtension(String filename) {
        int idx = filename.lastIndexOf('.');
        return (idx > 0) ? filename.substring(0, idx) : filename;
    }

    private String getFileExtension(String filename) {
        int idx = filename.lastIndexOf('.');
        return (idx > 0 && idx < filename.length() - 1) ? filename.substring(idx + 1) : "";
    }
}