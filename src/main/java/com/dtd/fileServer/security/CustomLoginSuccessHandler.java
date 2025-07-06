package com.dtd.fileServer.security;

import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import java.io.IOException;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.core.Authentication;
import org.springframework.security.web.authentication.AuthenticationSuccessHandler; // ✅ make sure this is correct
import org.springframework.stereotype.Component;


@Component
public class CustomLoginSuccessHandler implements AuthenticationSuccessHandler {

    private static final Logger log = LoggerFactory.getLogger(CustomLoginSuccessHandler.class);
    private static final Logger auditLog = LoggerFactory.getLogger("com.dtd.fileServer.audit");
    @Override
    public void onAuthenticationSuccess(HttpServletRequest request,
                                        HttpServletResponse response,
                                        Authentication authentication) throws IOException, ServletException {
        String username = authentication.getName();
        String ip = request.getHeader("X-Forwarded-For");
        if (ip == null) ip = request.getRemoteAddr();
        String userAgent = request.getHeader("User-Agent");

        log.info("LOGIN: user={}, ip={}, agent={}", username, ip, userAgent);
        auditLog.info("User Login: user={}, ip={}", username, ip);
        // Redirect to default success URL manually
        response.sendRedirect("/index.html");
    }
}