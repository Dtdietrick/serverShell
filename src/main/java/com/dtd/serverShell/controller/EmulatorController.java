package com.dtd.serverShell.controller;

import com.dtd.serverShell.model.AppUser;
import com.dtd.serverShell.repository.AppUserRepository;

import jakarta.servlet.http.HttpServletRequest;

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
import java.net.HttpURLConnection;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.URL;
import java.nio.file.*;
import java.nio.file.attribute.PosixFilePermissions;
import java.security.Principal;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/emulator")
public class EmulatorController {

    @Value("${rom.save.dir}")
    private String romSaveDir;

    @Value("${pulse.dir}")
    private String pulseDir;
    
    @Value("${pulse.cookie.path:}")
    private String pulseCookieOverride;
    
    @Value("${retroarch.image}")
    private String retroImage;

    private static final com.dtd.serverShell.logging.ssLogger log =
            com.dtd.serverShell.logging.serverShellLoggerFactory
                .getServerLogger("com.dtd.serverShell.serverShell-full", /*alsoDebug=*/true);
    
    private static final class UserPaths {
        // public on purpose so you can assign exactly like before
        public Path configPath;   // was: userConfigPath
        public Path savePath;     // was: userSavePath
        public Path cookieDir;    // was: userCookieDir
    }

    private final Logger logger = LoggerFactory.getLogger(EmulatorController.class);
    private final AppUserRepository appUserRepository;

    public EmulatorController(AppUserRepository appUserRepository, Environment env) {
        this.appUserRepository = appUserRepository;
    }

    //userDirs
    private final UserPaths userPaths = new UserPaths();

    @PostMapping("/launch")
    public ResponseEntity<Map<String, String>>launchEmulator(@RequestParam String rom, Principal principal,HttpServletRequest romRequest) {
        if (principal == null) return errorResponse("Unauthorized access");
        Map<String, String> error = new HashMap<>();
        try {
            // only allow approved roms
            if (!isLinux()) {
              return errorResponse("Requires linux server");
            }

            // user logic
            String username = principal.getName();
            log.info("[INIT DIR] ROM Save Dir Root: " + romSaveDir);
            log.info("[INIT DIR]  Username: " + username);
            // pre-warm user directory if needed
            initializeUserRetroarchIfMissing(username);
            // set paths
            Files.createDirectories(userPaths.configPath.toAbsolutePath());
            Files.createDirectories(userPaths.savePath.toAbsolutePath() );
            log.info("[INIT DIR] Config path: " + userPaths.configPath.toAbsolutePath());
            log.info("[INIT DIR] save path: " + userPaths.savePath.toAbsolutePath() );
            //decide ports
            int vncPort   = findFreePortInRange(33000, 33100);
            int audioPort = vncPort + 1;
            //audio setup
            Path pulseSocketPath = Paths.get(pulseDir);
            if (!Files.exists(pulseSocketPath)) {
               return errorResponse("PulseAudio socket not found at " + pulseSocketPath + " (check host path and permissions)");
            }
            Path hostCookie = sourcePulseCookie();
            if (!Files.isReadable(hostCookie)) {
                return errorResponse("[INIT AUDIO ERR] cookie not readable at {}" + hostCookie);
            }
            
           // startup commands   
            List<String> cmd = new ArrayList<>(List.of(
                 
                "docker", "run", "--rm",
                 //bind save & config paths
                 "-v", userPaths.configPath.toAbsolutePath().toAbsolutePath() + ":/config",
                 "-v", userPaths.savePath.toAbsolutePath()  + ":/save",
                 //bind & mount ports
                 "--mount", "type=bind,source=" + pulseSocketPath + ",target=/tmp/pulseaudio.socket,readonly",
                 "-p", vncPort + ":52300",
                 "-p", audioPort + ":8081",
                 "-e", "PULSE_SERVER=unix:/tmp/pulseaudio.socket",
                 //cookie is prewarmed in host dir
                 "-e", "PULSE_COOKIE=/config/pulse/cookie",
                 //host audio config
                 "-e", "PULSE_SINK=retro_null",
                 "-e", "PULSE_SOURCE=retro_null.monitor",
                 //set base path (sanity)
                 "-e", "HOME=/config",
                 "-e", "XDG_CONFIG_HOME=/config"
                 
            ));
                 
            Integer socketUid = extractUidFromSocketOwner(pulseSocketPath);
            if (socketUid == null) {
                return errorResponse("[PULSE AUDIO ERR] Prod audio requires /run/user/<uid>/pulse/native (got: " + pulseSocketPath + ")");
            }
            
            String gid = hostGid(); // existing helper
            cmd.addAll(List.of("--user", socketUid.toString() + ":" + gid));
            // set ROM
            cmd.addAll(List.of(retroImage, rom));
            //run command
            ProcessBuilder pb = new ProcessBuilder(cmd);
            pb.inheritIO();
            System.out.println("Launching emulator: " + String.join(" ", cmd));
            pb.start();

            String serverIp = InetAddress.getLocalHost().getHostAddress();
            String vncUrl = "http://" + serverIp + ":" + vncPort + "/vnc.html?autoconnect=true&resize=scale&path=websockify";
            String audioUrl = "ws://" + serverIp + ":" + audioPort + "/";
            log.info("[CONTAINER WAIT] Waiting for container to be ready...");
            if (waitForContainerReady(vncUrl, 90)) {
                log.info("[CONTAINER WAIT] Container ready, returning URLs to frontend");
            } else {
                log.warn("[CONTAINER WAIT] Container not ready after 90s, returning URLs anyway");
            }
            
            Map<String, String> response = new HashMap<>();
            response.put("vncUrl", vncUrl);
            response.put("audioUrl", audioUrl);
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            return errorResponse("[INIT ERR] Failed to launch emulator: " + e.getMessage());
        }
    }
    
    //wait for container before giving frontend return
    private boolean waitForContainerReady(String vncUrl, int timeoutSeconds) {
        long deadline = System.currentTimeMillis() + (timeoutSeconds * 1000L);
        int attempts = 0;
        
        while (System.currentTimeMillis() < deadline) {
            attempts++;
            try {
                // Try to connect to the VNC URL
                URL url = new URL(vncUrl);
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("HEAD");
                conn.setConnectTimeout(5000);
                conn.setReadTimeout(5000);
                
                int responseCode = conn.getResponseCode();
                if (responseCode == 200) {
                    log.info("[CONTAINER WAIT] Container ready after {} attempts ({} seconds)", 
                        attempts, (System.currentTimeMillis() - (deadline - timeoutSeconds * 1000L)) / 1000);
                    return true;
                }
                
            } catch (Exception e) {
                // Expected while container is booting, just continue
            }
            
            // Progress logging every 10 seconds
            if (attempts % 20 == 0) { // 20 attempts * 500ms = 10 seconds
                long elapsed = (System.currentTimeMillis() - (deadline - timeoutSeconds * 1000L)) / 1000;
                log.info("[CONTAINER WAIT] Still waiting for container... ({}s elapsed)", elapsed);
            }
            
            try {
                Thread.sleep(500); // Check every 500ms
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return false;
            }
        }
        
        return false;
    }
    private static Integer extractUidFromSocketOwner(Path pulseSocketPath) {
        try {
            Object uid = Files.getAttribute(pulseSocketPath, "unix:uid");
            if (uid instanceof Number) return ((Number) uid).intValue();
        } catch (Exception ignore) {}
        // fallback to path-based extraction if attribute view unsupported
        return extractUidFromPulsePath(pulseSocketPath);
    }
    
    private static Integer extractUidFromPulsePath(Path pulseSocketPath) {
        java.util.regex.Matcher m = java.util.regex.Pattern
            .compile("/run/user/(\\d+)/pulse/native")
            .matcher(pulseSocketPath.toString());
        return m.find() ? Integer.valueOf(m.group(1)) : null;
    }
    
    public static int findFreePortInRange(int minPort, int maxPort) {
        for (int port = minPort; port <= maxPort; port++) {
            try (ServerSocket socket = new ServerSocket()) {
                socket.bind(new InetSocketAddress(InetAddress.getLoopbackAddress(), port));
                return port; // try-with-resources closes the socket right here
            } catch (IOException ignored) {
                // Port in use, try next
            }
        }
        throw new IllegalStateException("No available port in range " + minPort + "-" + maxPort);
    }

    //linux user setup
    private static String hostUid() { String s = runAndTrim("id","-u"); return s.isEmpty() ? "1000" : s; }
    private static String hostGid() { String s = runAndTrim("id","-g"); return s.isEmpty() ? "1000" : s; }
    private static boolean isLinux() {
        String os = System.getProperty("os.name", "").toLowerCase();
        return os.contains("linux");
    }
  
    private Path sourcePulseCookie() throws IOException {
        Path canonical = Paths.get(pulseCookieOverride, "cookie").toAbsolutePath().normalize();
        if (Files.isRegularFile(canonical) && Files.isReadable(canonical)) return canonical;
        throw new IOException("[PULSE COOKIE ERR] No readable cookie found in store=" + canonical);
    }
    
    private ResponseEntity<Map<String, String>> errorResponse(String message) {
        Map<String, String> error = new HashMap<>();
        log.error(message);
        error.put("error", message);
        return ResponseEntity.badRequest().body(error);
    }
    
    //prewarm logic
    private void initializeUserRetroarchIfMissing(String username) throws IOException {
        Path userRoot = Paths.get(romSaveDir, "users", username);
        Path configPath = userRoot.resolve("config");
        Path savePath = userRoot.resolve("save");

        userPaths.configPath = configPath;
        userPaths.savePath = savePath;
        
        boolean needsInit = !Files.exists(configPath) || !Files.exists(savePath);

        if (needsInit) {
            logger.info("Initializing config/save for new user '{}'", username);

            // Copy default template files
            Path defaultRoot = Paths.get(romSaveDir, "default");
            Path defaultConfig = defaultRoot.resolve("config");
            Path defaultsave  = defaultRoot.resolve("save");

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

            Files.walk(defaultsave).forEach(source -> {
                try {
                    Path relative = defaultsave.relativize(source);
                    Path destination = savePath.resolve(relative);
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
            logger.info(" Default config/save initialized for user '{}'", username);
        }
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
    
    @PostMapping("/save/")
    public ResponseEntity<?> uploadSave(@PathVariable String romFileName,
                                        @RequestParam("file") MultipartFile file,
                                        Principal principal) throws IOException {
        if (principal == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();

        String username = principal.getName();
        Path userSaveDir = Paths.get(romSaveDir, "users", username, "save");
      
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

    @GetMapping("/save/{romFileName:.+}")
    public ResponseEntity<Resource> downloadSave(@PathVariable String romFileName,
                                                 Principal principal) throws IOException {
        if (principal == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();

        String username = principal.getName();
        Path userSaveDir = Paths.get(romSaveDir, "users", username, "save");
      
        //Sanitize
        Path savePath = userSaveDir.resolve(romFileName).normalize();

        if (!savePath.startsWith(userSaveDir)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }

        if (!Files.exists(savePath)) {
            logger.warn("Save not found for user {}, checking default", username);

            Path fallbackPath = Paths.get(romSaveDir, "default", "save", romFileName).normalize();
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
}