package com.dtd.fileServer.controller;

import com.dtd.fileServer.model.AppUser;
import com.dtd.fileServer.repository.AppUserRepository;
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
import java.util.Map;

@RestController
public class RomController {

    @Value("${rom.save.dir}")
    private String romSaveDir;

    private final Logger logger = LoggerFactory.getLogger(RomController.class);
    private final AppUserRepository appUserRepository;

    public RomController(AppUserRepository appUserRepository) {
        this.appUserRepository = appUserRepository;
    }

    /** 🎮 Serve ROMs from static resources (used by feed-based launcher) */
    @GetMapping("/roms/{romName:.+}")
    public ResponseEntity<Resource> serveRom(@PathVariable String romName) throws IOException {
        String resourcePath = "static/roms/" + romName;
        ClassPathResource resource = new ClassPathResource(resourcePath);

        logger.info("Requested ROM: {}", resourcePath);

        if (!resource.exists() || !resource.isReadable()) {
            return ResponseEntity.notFound().build();
        }

        String mimeType = Files.probeContentType(resource.getFile().toPath());
        if (mimeType == null) mimeType = MediaType.APPLICATION_OCTET_STREAM_VALUE;

        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "inline; filename=\"" + romName + "\"")
                .contentType(MediaType.parseMediaType(mimeType))
                .body(resource);
    }

    /** 💾 Upload save file for a given ROM (stored as username-ROM.sav) */
    @PostMapping("/saves/{romFileName:.+}")
    public ResponseEntity<?> uploadSave(@PathVariable String romFileName,
                                        @RequestParam("file") MultipartFile file,
                                        Principal principal) throws IOException {
        if (principal == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();

        String username = principal.getName();
        String diskSaveFileName = username + "-" + romFileName;

        Path saveDir = Paths.get(romSaveDir);
        Files.createDirectories(saveDir);
        Path savePath = saveDir.resolve(diskSaveFileName);

        Files.copy(file.getInputStream(), savePath, StandardCopyOption.REPLACE_EXISTING);

        // Record save mapping
        String safeRomKey = romFileName.replace(".", "_dot_");
        appUserRepository.findByUsername(username).ifPresent(user -> {
            Map<String, String> saves = user.getRecentRomSaves();
            if (saves == null) saves = new HashMap<>();
            saves.put(safeRomKey, diskSaveFileName);
            user.setRecentRomSaves(saves);
            appUserRepository.save(user);
        });

        return ResponseEntity.ok("✅ Save uploaded");
    }

    /** 💾 Serve save file based on user and requested ROM */
    @GetMapping("/saves/{romFileName:.+}")
    public ResponseEntity<Resource> downloadSave(@PathVariable String romFileName, Principal principal) throws IOException {
        if (principal == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();

        String username = principal.getName();
        String diskSaveFileName = username + "-" + romFileName;
        Path savePath = Paths.get(romSaveDir, diskSaveFileName);

        if (!Files.exists(savePath)) {
            logger.warn("🔍 Save not found for user {}, falling back to default", username);

            Path defaultSave = Paths.get(romSaveDir, "default", romFileName);
            if (Files.exists(defaultSave)) {
                logger.info("✅ Serving default save: {}", defaultSave);
                Resource fallback = new org.springframework.core.io.PathResource(defaultSave);

                return ResponseEntity.ok()
                        .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + romFileName + "\"")
                        .contentType(MediaType.APPLICATION_OCTET_STREAM)
                        .body(fallback);
            }

            logger.info("❌ No default save found either: {}", defaultSave);
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(null);
        }
        Resource resource = new org.springframework.core.io.PathResource(savePath);

        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + romFileName + "\"")
                .contentType(MediaType.APPLICATION_OCTET_STREAM)
                .body(resource);
    }
}