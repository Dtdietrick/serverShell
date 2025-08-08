package com.dtd.serverShell.controller;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Base64;
import java.util.List;
import java.util.Map;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.dtd.serverShell.proxy.VlcSessionManager;
import com.dtd.serverShell.proxy.VlcSessionManager.VlcSession;
import com.dtd.serverShell.util.ServerUtil;

@RestController
@RequestMapping("/vlc")
public class VlcController {
	
    @Value("${media.dir}")
    private String mediaDir;
	
	@PostMapping("/preload")
    public ResponseEntity<String> preloadVlcSession() {
        int basePort = ServerUtil.findFreePortInRange(33200, 33600 - 3);
        int websockifyPort = basePort;
        int httpVlcPort = basePort + 1;
        int vncPort = basePort + 2;

        System.out.printf("[VLC-PRELOAD] Preloading ports: %d/%d/%d%n", websockifyPort, httpVlcPort, vncPort);

        try {
            List<String> cmd = List.of(
                "bash", "/opt/serverShell/scripts/preload.sh",
                String.valueOf(websockifyPort),
                String.valueOf(httpVlcPort),
                String.valueOf(vncPort)
            );

            ProcessBuilder pb = new ProcessBuilder(cmd);
            pb.redirectErrorStream(true);
            Process process = pb.start();

            new Thread(() -> {
                try (BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream()))) {
                    String line;
                    while ((line = reader.readLine()) != null) {
                        System.out.println("[PRELOAD-CONTAINER] " + line);
                    }
                } catch (IOException e) {
                    e.printStackTrace();
                }
            }).start();

            boolean ready = ServerUtil.waitForPort("localhost", websockifyPort, 5000);
            if (!ready) {
                return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body("Preload timeout");
            }

            String sessionId = VlcSessionManager.registerSession(websockifyPort, httpVlcPort, vncPort);
            return ResponseEntity.ok(sessionId);

        } catch (Exception e) {
            e.printStackTrace();
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body("Failed to preload VLC");
        }
    }
    @PostMapping("/play")
    public ResponseEntity<String> playMediaInExistingVlc(@RequestBody Map<String, String> payload) {
        String filename = payload.get("filename");
        if (filename == null || filename.isBlank()) {
            return ResponseEntity.badRequest().body("Missing filename");
        }

        Path mediaRoot = Paths.get(mediaDir).toAbsolutePath().normalize();
        Path resolvedPath = mediaRoot.resolve(filename).normalize();

        if (!resolvedPath.startsWith(mediaRoot) || !Files.exists(resolvedPath)) {
            return ResponseEntity.badRequest().body("Invalid file");
        }

        VlcSession session = VlcSessionManager.getActiveSession();
        if (session == null) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body("No active VLC session");
        }

        int vlcPort = session.getHttpVlcPort();
        String inputPath = resolvedPath.toString();

        try {
            // VLC requires file:// URI
            String mediaUri = "file://" + inputPath.replace(" ", "%20");

            // Optional subtitle detection
            Path subtitlePath = resolvedPath.resolveSibling(
                resolvedPath.getFileName().toString().replaceFirst("\\.[^.]+$", ".srt")
            );
            String subtitleParam = "";

            if (Files.exists(subtitlePath)) {
                String subtitleUri = "file://" + subtitlePath.toString().replace(" ", "%20");
                subtitleParam = "&input-slave=" + subtitleUri;
            }

            String targetUrl = String.format(
                "http://localhost:%d/requests/status.xml?command=in_play&input=%s%s",
                vlcPort,
                URLEncoder.encode(mediaUri, StandardCharsets.UTF_8),
                subtitleParam
            );

            System.out.println("[VLC-PLAY] Triggering media play: " + targetUrl);

            HttpURLConnection conn = (HttpURLConnection) new URL(targetUrl).openConnection();
            conn.setRequestMethod("GET");
            String auth = Base64.getEncoder().encodeToString((":" + "thepass").getBytes());
            conn.setRequestProperty("Authorization", "Basic " + auth);

            int responseCode = conn.getResponseCode();
            if (responseCode != 200) {
                System.err.println("[VLC-PLAY] VLC rejected request, status: " + responseCode);
                return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                                     .body("VLC HTTP control failed");
            }

            return ResponseEntity.ok("Playback started");

        } catch (IOException e) {
            e.printStackTrace();
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body("Error sending play command");
        }
    }
    
}
