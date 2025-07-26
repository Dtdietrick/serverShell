package com.dtd.serverShell.controller;

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

    private final Logger logger = LoggerFactory.getLogger(EmulatorController.class);
    private final AppUserRepository appUserRepository;

    public EmulatorController(AppUserRepository appUserRepository) {
        this.appUserRepository = appUserRepository;
    }

    @PostMapping("/launch")
    public ResponseEntity<String> launchEmulator(@RequestParam String rom, Principal principal) {
        if (principal == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();

        try {
            List<String> allowedRoms = List.of("Pokemon-Emerald.gba", "Pokemon-Red.gb");
            if (!allowedRoms.contains(rom)) {
                return ResponseEntity.badRequest().body("Invalid ROM requested.");
            }

            String username = principal.getName();

            // 🔽 INSERT THIS
            initializeUserRetroarchIfMissing(username);

            String displayEnv = System.getenv("DISPLAY");
            if (displayEnv == null) {
                return ResponseEntity.status(500).body("DISPLAY environment variable not set.");
            }

            Path configPath = Paths.get(romSaveDir, "users", username, "config");
            Path savesPath = Paths.get(romSaveDir, "users", username, "saves");

            Files.createDirectories(configPath);
            Files.createDirectories(savesPath);

            ProcessBuilder pb = new ProcessBuilder(
                "docker", "run", "--rm", "-it",
                "-e", "DISPLAY=" + displayEnv,
                "-v", "/tmp/.X11-unix:/tmp/.X11-unix",
                "-v", configPath.toAbsolutePath() + ":/config",
                "-v", savesPath.toAbsolutePath() + ":/saves",
                "retroarch-linux",
                "-L", "cores/mgba_libretro.so",
                "roms/" + rom
            );

            pb.inheritIO();
            pb.start();

            return ResponseEntity.ok("Launching emulator for ROM: " + rom);
        } catch (IOException e) {
            logger.error("❌ Emulator launch failed", e);
            return ResponseEntity.status(500).body("Failed to launch emulator: " + e.getMessage());
        }
    }
    /** 💾 Upload save file for a given ROM (stored as username-ROM.sav) */
    @PostMapping("/saves/{romFileName:.+}")
    public ResponseEntity<?> uploadSave(@PathVariable String romFileName,
                                        @RequestParam("file") MultipartFile file,
                                        Principal principal) throws IOException {
        if (principal == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();

        String username = principal.getName();
        Path userSaveDir = Paths.get(romSaveDir, "users", username, "saves");
        Files.createDirectories(userSaveDir);

        Path savePath = userSaveDir.resolve(romFileName);
        Files.copy(file.getInputStream(), savePath, StandardCopyOption.REPLACE_EXISTING);

        logger.info("💾 Uploaded save for user {}: {}", username, savePath);

        return ResponseEntity.ok("✅ Save uploaded");
    }

    @GetMapping("/saves/{romFileName:.+}")
    public ResponseEntity<Resource> downloadSave(@PathVariable String romFileName,
                                                 Principal principal) throws IOException {
        if (principal == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();

        String username = principal.getName();
        Path savePath = Paths.get(romSaveDir, "users", username, "saves", romFileName);

        if (!Files.exists(savePath)) {
            logger.warn("🔍 Save not found for user {}, checking default", username);
            Path fallbackPath = Paths.get(romSaveDir, "default", "saves", romFileName);

            if (Files.exists(fallbackPath)) {
                logger.info("✅ Serving default save: {}", fallbackPath);
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
            logger.info("✅ Default config/saves initialized for user '{}'", username);
        }
    }
}