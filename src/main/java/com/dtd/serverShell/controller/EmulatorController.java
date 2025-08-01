package com.dtd.serverShell.controller;

import com.dtd.serverShell.config.RomRegistry;
import com.dtd.serverShell.model.AppUser;
import com.dtd.serverShell.repository.AppUserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.Resource;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.net.ServerSocket;
import java.nio.file.*;
import java.security.Principal;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/emulator")
public class EmulatorController {

    @Value("${rom.save.dir}")
    private String romSaveDir;

    @Value("${pulse.dir}")
    private String pulseDir;
    
    private final Logger logger = LoggerFactory.getLogger(EmulatorController.class);
    private final AppUserRepository appUserRepository;

    public EmulatorController(AppUserRepository appUserRepository) {
        this.appUserRepository = appUserRepository;
    }

    @PostMapping("/launch")
    public ResponseEntity<String> launchEmulator(@RequestParam String rom, Principal principal) {
        if (principal == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();

        try {
            if (!RomRegistry.isAllowed(rom)) {
                return ResponseEntity.badRequest().body("Invalid ROM requested.");
            }

            String username = principal.getName();
            System.out.println("🧩 [RetroInit] ROM Save Dir Root: " + romSaveDir);
            System.out.println("👤 [RetroInit] Username: " + username);
            
            initializeUserRetroarchIfMissing(username);
            Path configPath = Paths.get(romSaveDir, "users", username, "config");
            Path savesPath = Paths.get(romSaveDir, "users", username, "saves"); 


            System.out.println("📁 [RetroInit] Config path: " + configPath.toAbsolutePath());
            System.out.println("📁 [RetroInit] Saves path: " + savesPath.toAbsolutePath());
            Files.createDirectories(configPath);
            Files.createDirectories(savesPath);

    
            int hostPort = findFreePort();

            List<String> cmd = List.of(
            	    "docker", "run", "--rm", "-it",

            	    // Mount config and save dirs
            	    "-v", configPath.toAbsolutePath() + ":/config",
            	    "-v", savesPath.toAbsolutePath() + ":/saves",

            	    // Mount PulseAudio socket from host
            	    "--mount", "type=bind,source=" + pulseDir + ",target=/tmp/pulseaudio.socket",
            	    "-e", "PULSE_SERVER=unix:/tmp/pulseaudio.socket",

            	    // VNC port
            	    "-p", hostPort + ":52300",

            	    // Image + ROM
            	    "retroarch-linux",
            	    rom
            	);
            
            ProcessBuilder pb = new ProcessBuilder(cmd);
            pb.inheritIO();
            System.out.println("Launching emulator: " + String.join(" ", cmd));
            pb.start();

            String vncUrl = "http://localhost:" + hostPort + "/vnc.html?autoconnect=true&resize=scale";
            return ResponseEntity.ok(vncUrl);
        } catch (IOException e) {
            logger.error("❌ Emulator launch failed", e);
            return ResponseEntity.status(500).body("Failed to launch emulator: " + e.getMessage());
        }
    }
    @PostMapping("/saves/")
    public ResponseEntity<?> uploadSave(@PathVariable String romFileName,
                                        @RequestParam("file") MultipartFile file,
                                        Principal principal) throws IOException {
        if (principal == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();

        String username = principal.getName();
        Path userSaveDir = Paths.get(romSaveDir, "users", username, "saves");
      
        //Sanitize
        Path savePath = userSaveDir.resolve(romFileName).normalize();
     
        if (!savePath.startsWith(userSaveDir)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body("Invalid save path");
        }

        Files.createDirectories(savePath.getParent());
        Files.copy(file.getInputStream(), savePath, StandardCopyOption.REPLACE_EXISTING);

        logger.info("💾 Uploaded save for user {}: {}", username, savePath);
        return ResponseEntity.ok("Save uploaded");
    }

    @GetMapping("/saves/{romFileName:.+}")
    public ResponseEntity<Resource> downloadSave(@PathVariable String romFileName,
                                                 Principal principal) throws IOException {
        if (principal == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();

        String username = principal.getName();
        Path userSaveDir = Paths.get(romSaveDir, "users", username, "saves");
      
        //Sanitize
        Path savePath = userSaveDir.resolve(romFileName).normalize();

        if (!savePath.startsWith(userSaveDir)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }

        if (!Files.exists(savePath)) {
            logger.warn("🔍 Save not found for user {}, checking default", username);

            Path fallbackPath = Paths.get(romSaveDir, "default", "saves", romFileName).normalize();
            if (Files.exists(fallbackPath)) {
                logger.info(" Serving default save: {}", fallbackPath);
                return ResponseEntity.ok()
                        .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + romFileName + "\"")
                        .contentType(MediaType.APPLICATION_OCTET_STREAM)
                        .body(new org.springframework.core.io.PathResource(fallbackPath));
            }

            logger.info("❌ No default save found for {}", romFileName);
            return ResponseEntity.status(HttpStatus.NOT_FOUND).build();
        }

        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + romFileName + "\"")
                .contentType(MediaType.APPLICATION_OCTET_STREAM)
                .body(new org.springframework.core.io.PathResource(savePath));
    }
    public int findFreePort() throws IOException {
        try (ServerSocket socket = new ServerSocket(0)) {
            socket.setReuseAddress(true);
            return socket.getLocalPort();
        }
    }
    private void initializeUserRetroarchIfMissing(String username) throws IOException {
        Path userRoot = Paths.get(romSaveDir, "users", username);
        Path configPath = userRoot.resolve("config");
        Path savesPath = userRoot.resolve("saves");

        boolean needsInit = !Files.exists(configPath) || !Files.exists(savesPath);

        if (needsInit) {
            logger.info("🧪 Initializing config/saves for new user '{}'", username);

            // Copy default template files
            Path defaultRoot = Paths.get(romSaveDir, "default");
            Path defaultConfig = defaultRoot.resolve("config");
            Path defaultSaves  = defaultRoot.resolve("saves");

            Files.walk(defaultConfig).forEach(source -> {
                try {
                    Path relative = defaultConfig.relativize(source);
                    Path destination = configPath.resolve(relative);
                    if (Files.isDirectory(source)) {
                        Files.createDirectories(destination);
                    } else {
                        Files.createDirectories(destination.getParent());
                        Files.copy(source, destination, StandardCopyOption.REPLACE_EXISTING);
                    }
                } catch (IOException e) {
                    logger.error("❌ Failed to copy default config file '{}'", source, e);
                }
            });

            Files.walk(defaultSaves).forEach(source -> {
                try {
                    Path relative = defaultSaves.relativize(source);
                    Path destination = savesPath.resolve(relative);
                    if (Files.isDirectory(source)) {
                        Files.createDirectories(destination);
                    } else {
                        Files.createDirectories(destination.getParent());
                        Files.copy(source, destination, StandardCopyOption.REPLACE_EXISTING);
                    }
                } catch (IOException e) {
                    logger.error("❌ Failed to copy default save file '{}'", source, e);
                }
            });
            logger.info(" Default config/saves initialized for user '{}'", username);
        }
    }
}