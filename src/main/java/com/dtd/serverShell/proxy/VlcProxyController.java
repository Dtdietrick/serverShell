package com.dtd.serverShell.proxy;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.apache.tomcat.util.http.fileupload.IOUtils;
import org.springframework.web.bind.annotation.*;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Base64;

@RestController
@RequestMapping("/proxy")
public class VlcProxyController {

    @GetMapping("/vlc/{session}/**")
    public void proxyVlc(
        @PathVariable String session,
        HttpServletRequest request,
        HttpServletResponse response) throws IOException, InterruptedException {

        String fullPath = request.getRequestURI();
        String basePath = "/proxy/vlc/" + session;
        String path = fullPath.length() > basePath.length() ? fullPath.substring(basePath.length()) : "/";

        int httpVlcPort = VlcSessionManager.getHttpVlcPort(session);
        String targetUrl = "http://localhost:" + httpVlcPort + path +
            (request.getQueryString() != null ? "?" + request.getQueryString() : "");

        System.out.printf("[VLC-PROXY] Session: %s%n", session);
        System.out.printf("[VLC-PROXY] Target URL: %s%n", targetUrl);

        int attempts = 0;
        boolean success = false;

        while (attempts < 5) {
            try {
                HttpURLConnection conn = (HttpURLConnection) new URL(targetUrl).openConnection();
                conn.setRequestMethod("GET");
                String auth = Base64.getEncoder().encodeToString((":" + "thepass").getBytes());
                conn.setRequestProperty("Authorization", "Basic " + auth);
                response.setStatus(conn.getResponseCode());

                String contentType = conn.getHeaderField("Content-Type");
                if (contentType != null) {
                    response.setContentType(contentType);
                }

                try (InputStream in = conn.getInputStream()) {
                    IOUtils.copy(in, response.getOutputStream());
                }

                success = true;
                System.out.printf("[VLC-PROXY] Proxy success after %d attempt(s)%n", attempts + 1);
                break;

            } catch (Exception e) {
                attempts++;
                System.out.printf("[VLC-PROXY] Attempt %d failed: %s%n", attempts, e.getMessage());
                Thread.sleep(500);
            }
        }

        if (!success) {
            System.err.printf("[VLC-PROXY] Failed to reach backend after %d attempts: %s%n", attempts, targetUrl);
            response.sendError(504, "Proxy target unreachable");
        }
    }
}