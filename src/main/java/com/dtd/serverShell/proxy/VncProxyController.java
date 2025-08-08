// FILE: VncProxyController.java

package com.dtd.serverShell.proxy;

import org.apache.tomcat.util.http.fileupload.IOUtils;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import com.dtd.serverShell.controller.AdminController;
import com.dtd.serverShell.proxy.VlcSessionManager;
import com.dtd.serverShell.util.ServerUtil;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import java.io.IOException;
import java.io.InputStream;
import java.net.ConnectException;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Collections;

@RestController
@RequestMapping("/proxy")
public class VncProxyController {

	@GetMapping("/vnc/{session}/**")
	public void proxyVlc(
	    @PathVariable String session,
	    HttpServletRequest request,
	    HttpServletResponse response) throws IOException, InterruptedException {

	    String fullPath = request.getRequestURI();
	    String basePath = "/proxy/vnc/" + session;
	    String path = fullPath.length() > basePath.length() ? fullPath.substring(basePath.length()) : "/";

	    if ("/websockify".equals(path)) {
	        response.sendError(426, "WebSocket Upgrade Required");
	        return;
	    }

	    int websockPort = VlcSessionManager.getWebsockifyPort(session);
	    String targetUrl = "http://" + ServerUtil.getServerHost() + ":" + websockPort + path +
	        (request.getQueryString() != null ? "?" + request.getQueryString() : "");

	    System.out.printf("[VNC-PROXY] Session: %s%n", session);
	    System.out.printf("[VNC-PROXY] Proxy target: %s%n", targetUrl);

	    int attempts = 0;
	    boolean success = false;

	    while (attempts < 5) {
	        try {
	            HttpURLConnection conn = (HttpURLConnection) new URL(targetUrl).openConnection();
	            conn.setRequestMethod("GET");

	            response.setStatus(conn.getResponseCode());
	            String contentType = conn.getHeaderField("Content-Type");
	            if (contentType != null) response.setContentType(contentType);

	            try (InputStream in = conn.getInputStream()) {
	                IOUtils.copy(in, response.getOutputStream());
	            }

	            success = true;
	            System.out.printf("[VNC-PROXY] Proxy success after %d attempt(s)%n", attempts + 1);
	            break;

	        } catch (Exception e) {
	            attempts++;
	            System.out.printf("[VNC-PROXY] Attempt %d failed: %s%n", attempts, e.getMessage());
	            Thread.sleep(500);
	        }
	    }

	    if (!success) {
	        System.err.printf("[VNC-PROXY] Failed to reach backend after %d attempts: %s%n", attempts, targetUrl);
	        response.sendError(504, "Proxy target unreachable");
	    }
	}
}