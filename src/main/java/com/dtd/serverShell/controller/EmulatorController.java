package com.dtd.serverShell.controller;

import com.dtd.serverShell.config.RomRegistry;
import com.dtd.serverShell.model.AppUser;
import com.dtd.serverShell.repository.AppUserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.Resource;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.nio.file.*;
import java.security.Principal;
import java.util.ArrayList;
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
    
    private final Environment env;
    private final Logger logger = LoggerFactory.getLogger(EmulatorController.class);
    private final AppUserRepository appUserRepository;

    public EmulatorController(AppUserRepository appUserRepository, Environment env) {
        this.appUserRepository = appUserRepository;
        this.env = env;
    }

    private static String hostUid() { String s = runAndTrim("id","-u"); return s.isEmpty() ? "1000" : s; }
    private static String hostGid() { String s = runAndTrim("id","-g"); return s.isEmpty() ? "1000" : s; }
    private static boolean isLinux() {
        String os = System.getProperty("os.name", "").toLowerCase();
        return os.contains("linux");
    }
    
    @PostMapping("/launch")
    public ResponseEntity<String> launchEmulator(@RequestParam String rom, Principal principal) {
        if (principal == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();

        try {
            if (!RomRegistry.isAllowed(rom)) {
                return ResponseEntity.badRequest().body("Invalid ROM requested.");
            }

            String username = principal.getName();
            System.out.println("[RetroInit] ROM Save Dir Root: " + romSaveDir);
            System.out.println("[RetroInit] Username: " + username);
            
            initializeUserRetroarchIfMissing(username);
            Path configPath = Paths.get(romSaveDir, "users", username, "config");
            Path savesPath = Paths.get(romSaveDir, "users", username, "saves"); 


            System.out.println("[RetroInit] Config path: " + configPath.toAbsolutePath());
            System.out.println("[RetroInit] Saves path: " + savesPath.toAbsolutePath());
            Files.createDirectories(configPath);
            Files.createDirectories(savesPath);

    
            boolean prodAudio = useProdAudio();
            String pulseSocketPath = resolvePulseSocketPath(pulseDir);
            int hostPort = findFreePortInRange(33000, 33100);
            
            List<String> cmd = new ArrayList<>(List.of(
                "docker", "run", "--rm",
                //saves and config are outside container
                "-v", configPath.toAbsolutePath() + ":/config",
                "-v", savesPath.toAbsolutePath()  + ":/saves",
                //mount audio
                "--mount", "type=bind,source=" + pulseSocketPath + ",target=/tmp/pulseaudio.socket,readonly",
                //mount vnc port
                "-p", hostPort + ":52300",
                //audio switch for prod
                "-e", "RETRO_USE_PROD_AUDIO=" + (prodAudio ? "true" : "false")
            ));

                // prod specific for headless linux (pain brought me here)
            if (isLinux()) {
                cmd.addAll(List.of("--user", hostUid() + ":" + hostGid()));
            }
            
            if (prodAudio) {
                Path userCookie = configPath.resolve("pulse").resolve("cookie");
                cmd.addAll(List.of(
                //solve the cookie permission issue     
                "-v", userCookie.toAbsolutePath() + ":/config/pulse/cookie:ro",
                "-e", "PULSE_COOKIE=/config/pulse/cookie",
                //set host locations for container
                "-e", "PULSE_SERVER=unix:/tmp/pulseaudio.socket",
                "-e", "PULSE_SINK=retro_null",
                "-e", "PULSE_SOURCE=retro_null.monitor",
                //set home for container
                "-e", "HOME=/config",
                "-e", "XDG_CONFIG_HOME=/config"
            ));
            }
                
            else {
               // legacy path — keeps original logic
               cmd.addAll(List.of(
                      "-e", "PULSE_SERVER=unix:/tmp/pulseaudio.socket" 
               ));
            }
            
             //set rom
            cmd.addAll(List.of("retroarch-linux", rom));

            ProcessBuilder pb = new ProcessBuilder(cmd);
            pb.inheritIO();
            System.out.println("[RetroInit] Audio mode: " + (prodAudio ? "PROD" : "LEGACY"));
            System.out.println("Launching emulator: " + String.join(" ", cmd));
            pb.start();

            String serverIp = InetAddress.getLocalHost().getHostAddress();
            String vncUrl = "http://"+serverIp+":" + hostPort + "/vnc.html?autoconnect=true&resize=scale";
            return ResponseEntity.ok(vncUrl);
        }
        catch (IOException e) {
            logger.error("Emulator launch failed", e);
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

        logger.info("Uploaded save for user {}: {}", username, savePath);
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

            logger.info("No default save found for {}", romFileName);
            return ResponseEntity.status(HttpStatus.NOT_FOUND).build();
        }

        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + romFileName + "\"")
                .contentType(MediaType.APPLICATION_OCTET_STREAM)
                .body(new org.springframework.core.io.PathResource(savePath));
    }
    
    public static int findFreePortInRange(int minPort, int maxPort) {
        for (int port = minPort; port <= maxPort; port++) {
            try (ServerSocket socket = new ServerSocket()) {
                socket.setReuseAddress(true);
                socket.bind(new InetSocketAddress("0.0.0.0", port));
                return port;
            } catch (IOException ignored) {
                // Port is in use, try next
            }
        }
        throw new IllegalStateException("No available port in range " + minPort + "-" + maxPort);
    }
    
    private void initializeUserRetroarchIfMissing(String username) throws IOException {
        Path userRoot = Paths.get(romSaveDir, "users", username);
        Path configPath = userRoot.resolve("config");
        Path savesPath = userRoot.resolve("saves");

        boolean needsInit = !Files.exists(configPath) || !Files.exists(savesPath);

        if (needsInit) {
            logger.info("Initializing config/saves for new user '{}'", username);

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
                    logger.error("Failed to copy default config file '{}'", source, e);
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
                    logger.error("Failed to copy default save file '{}'", source, e);
                }
            });
            logger.info(" Default config/saves initialized for user '{}'", username);
        }
    }
    
    private boolean useProdAudio() {
        return env != null && env.acceptsProfiles(Profiles.of("prod"));
    }
   
    private String resolvePulseSocketPath(String pulseDir) {
        java.nio.file.Path p = java.nio.file.Paths.get(pulseDir);
        try {
            if (java.nio.file.Files.isDirectory(p)) {
                return p.resolve("native").toString(); // e.g., /run/user/1000/pulse/native
            }
        } catch (Exception ignore) {}
        return p.toString(); // already a socket file path
    }
    //helpers for permissions errors
    private static String runAndTrim(String... args) {
        try {
            Process p = new ProcessBuilder(args).redirectErrorStream(true).start();
            try (java.io.InputStream is = p.getInputStream()) {
                String out = new String(is.readAllBytes());
                p.waitFor();
                return out.trim();
            }
        } catch (Exception e) { return ""; }
    }
}