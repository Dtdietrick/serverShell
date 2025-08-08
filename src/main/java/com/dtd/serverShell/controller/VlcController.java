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
        int httpVlcPort = ServerUtil.findFreePortInRange(33200, 33600);

        System.out.printf("[VLC-PRELOAD] Preloading VLC on port: %d%n", httpVlcPort);

        try {
            List<String> cmd = List.of(
                "bash", "/opt/serverShell/scripts/preload.sh",
                String.valueOf(httpVlcPort) // Only pass HTTP port
            );

            ProcessBuilder pb = new ProcessBuilder(cmd);
            pb.redirectErrorStream(true);
            Process process = pb.start();

            new Thread(() -> {
                try (BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream()))) {
                    String line;
                    while ((line = reader.readLine()) != null) {
                        System.out.println("[PRELOAD] " + line);
                    }
                } catch (IOException e) {
                    e.printStackTrace();
                }
            }).start();

            boolean ready = ServerUtil.waitForPort("localhost", httpVlcPort, 5000);
            if (!ready) {
                return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body("VLC preload timeout");
            }

            String sessionId = VlcSessionManager.registerSession( httpVlcPort); // No VNC/Websockify ports
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
        String inputPath = resolvedPath.toAbsolutePath().toString();

        try {
            // Construct media URI with proper escaping for VLC
            String mediaUri = "file://" + inputPath.replace(" ", "%20");

            // Optional subtitle (e.g. .srt)
            String subtitleParam = "";
            Path subtitlePath = resolvedPath.resolveSibling(
                resolvedPath.getFileName().toString().replaceFirst("\\.[^.]+$", ".srt")
            );
            if (Files.exists(subtitlePath)) {
                String subtitleUri = "file://" + subtitlePath.toString().replace(" ", "%20");
                subtitleParam = "&input-slave=" + URLEncoder.encode(subtitleUri, StandardCharsets.UTF_8);
            }

            // Don't double encode the input path — VLC expects raw file URI encoding
            String targetUrl = String.format(
                "http://localhost:%d/requests/status.xml?command=in_play&input=%s%s",
                vlcPort,
                URLEncoder.encode(mediaUri, StandardCharsets.UTF_8),
                subtitleParam
            );

            System.out.println("[VLC-PLAY] Sending playback request to: " + targetUrl);

            HttpURLConnection conn = (HttpURLConnection) new URL(targetUrl).openConnection();
            conn.setRequestMethod("GET");
            String auth = Base64.getEncoder().encodeToString((":" + "thepass").getBytes());
            conn.setRequestProperty("Authorization", "Basic " + auth);

            int responseCode = conn.getResponseCode();
            if (responseCode != 200) {
                System.err.printf("[VLC-PLAY] HTTP %d from VLC\n", responseCode);
                return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body("VLC HTTP control failed");
            }

            return ResponseEntity.ok("Playback started");

        } catch (IOException e) {
            e.printStackTrace();
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body("Error sending play command");
        }
    }
    
}
