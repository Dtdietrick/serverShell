package com.dtd.serverShell.controller;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.InputStreamResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpRange;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.List;
import java.util.stream.Collectors;
import java.util.stream.Stream;

@RestController
@RequestMapping("/epub")

public class EpubController {
    
    @Value("${media.dir}")
    private String mediaDir;
    
    private final Logger log = LoggerFactory.getLogger(EpubController.class);



    @GetMapping("/download")
    public ResponseEntity<Resource> downloadEpub(
            @RequestParam String file,
            @RequestHeader(value = HttpHeaders.RANGE, required = false) String rangeHeader) {
        
        // Authentication check
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated() || auth instanceof AnonymousAuthenticationToken) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        // Input validation
        if (file == null || file.isBlank()) {
            return ResponseEntity.badRequest().build();
        }

        // Path traversal protection
        Path mediaRoot = Paths.get(mediaDir).toAbsolutePath().normalize();
        Path resolved = mediaRoot.resolve(file).normalize();
        if (!resolved.startsWith(mediaRoot)) {
            log.warn("Path traversal attempt: {}", file);
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).build();
        }

        // Check file exists
        if (!Files.exists(resolved)) {
            return ResponseEntity.notFound().build();
        }

        try {
            long fileLength = Files.size(resolved);

            // If no range header, serve full file
            if (rangeHeader == null) {
                log.info("No Range header, serving full EPUB: {} ({} bytes)", file, fileLength);
                InputStreamResource fullResource = new InputStreamResource(Files.newInputStream(resolved));
                return ResponseEntity.ok()
                        .header(HttpHeaders.ACCEPT_RANGES, "bytes")
                        .contentLength(fileLength)
                        .contentType(MediaType.parseMediaType("application/epub+zip"))
                        .body(fullResource);
            }

            // Range header present - parse and serve requested range
            try {
                HttpRange httpRange = HttpRange.parseRanges(rangeHeader).get(0);
                long start = httpRange.getRangeStart(fileLength);
                long end = httpRange.getRangeEnd(fileLength);
                long rangeLength = end - start + 1;

                log.info("Range header: {} — serving bytes {} to {} ({} bytes)", rangeHeader, start, end, rangeLength);

                InputStream inputStream = Files.newInputStream(resolved);
                if (inputStream.skip(start) != start) {
                    log.warn("Unable to skip to requested start position in file");
                    inputStream.close();
                    return ResponseEntity.status(HttpStatus.REQUESTED_RANGE_NOT_SATISFIABLE).build();
                }

                InputStreamResource resource = new InputStreamResource(new LimitedInputStream(inputStream, rangeLength));

                return ResponseEntity.status(HttpStatus.PARTIAL_CONTENT)
                        .header(HttpHeaders.CONTENT_TYPE, "application/epub+zip")
                        .header(HttpHeaders.ACCEPT_RANGES, "bytes")
                        .header(HttpHeaders.CONTENT_LENGTH, String.valueOf(rangeLength))
                        .header(HttpHeaders.CONTENT_RANGE, "bytes " + start + "-" + end + "/" + fileLength)
                        .body(resource);

            } catch (Exception e) {
                log.error("Invalid Range header: {}", rangeHeader, e);
                // Fall back to full file on range parsing errors
                InputStreamResource resource = new InputStreamResource(Files.newInputStream(resolved));
                return ResponseEntity.ok()
                        .header(HttpHeaders.ACCEPT_RANGES, "bytes")
                        .contentLength(fileLength)
                        .contentType(MediaType.parseMediaType("application/epub+zip"))
                        .body(resource);
            }

        } catch (IOException e) {
            log.error("Error serving EPUB: {}", file, e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }
    // Helper InputStream that limits bytes read to rangeLength
    private static class LimitedInputStream extends InputStream {
        private final InputStream delegate;
        private long remaining;

        public LimitedInputStream(InputStream delegate, long limit) {
            this.delegate = delegate;
            this.remaining = limit;
        }

        @Override
        public int read() throws IOException {
            if (remaining <= 0) return -1;
            int result = delegate.read();
            if (result != -1) remaining--;
            return result;
        }

        @Override
        public int read(byte[] b, int off, int len) throws IOException {
            if (remaining <= 0) return -1;
            int toRead = (int) Math.min(len, remaining);
            int count = delegate.read(b, off, toRead);
            if (count != -1) remaining -= count;
            return count;
        }

        @Override
        public void close() throws IOException {
            delegate.close();
        }
    }
}