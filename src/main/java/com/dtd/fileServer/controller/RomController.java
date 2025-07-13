package com.dtd.fileServer.controller;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.net.URLConnection;

@RestController
@RequestMapping("/roms")
public class RomController {

    private final Logger logger = LoggerFactory.getLogger(RomController.class);

    /**
     * Serve ROM files located under src/main/resources/static/roms/
     * Example: GET /roms/Pokemon-Red.gb → loads classpath:/static/roms/Pokemon-Red.gb
     */
    @GetMapping("/{romName:.+}")
    public ResponseEntity<Resource> serveRom(@PathVariable String romName) throws IOException {
        String resourcePath = "static/roms/" + romName;
        ClassPathResource resource = new ClassPathResource(resourcePath);

        logger.info("Requested ROM resource path: {}", resourcePath);

        if (!resource.exists() || !resource.isReadable()) {
            logger.warn("ROM not found or unreadable in classpath: {}", resourcePath);
            return ResponseEntity.notFound().build();
        }

        String mimeType = null;
        try {
            mimeType = resource.getURL().openConnection().getContentType();
        } catch (Exception e) {
            // ignore
        }
        if (mimeType == null) {
            mimeType = MediaType.APPLICATION_OCTET_STREAM_VALUE;
        }

        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "inline; filename=\"" + romName + "\"")
                .contentType(MediaType.parseMediaType(mimeType))
                .body(resource);
    }
}