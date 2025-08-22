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
@RequestMapping("/epubs")
public class EpubController {

    private final Path baseDir;
    private static final Logger log = LoggerFactory.getLogger(EpubController.class);

    public EpubController(@Value("${media.dir}") String mediaDir) {
        this.baseDir = Paths.get(mediaDir);
    }

    @GetMapping
    public List<String> listEpubs() throws IOException {
        try (Stream<Path> files = Files.walk(baseDir.resolve("Books"))) {
            return files
                    .filter(path -> path.toString().toLowerCase().endsWith(".epub"))
                    .map(baseDir::relativize)
                    .map(Path::toString)
                    .collect(Collectors.toList());
        }
    }

    @GetMapping("/download")
    public ResponseEntity<Resource> downloadEpub(
            @RequestParam String file,
            @RequestHeader(value = HttpHeaders.RANGE, required = false) String rangeHeader
    ) throws IOException {
        Path filePath = baseDir.resolve(file).normalize();

        if (!filePath.startsWith(baseDir) || !Files.exists(filePath)) {
            return ResponseEntity.notFound().build();
        }

        long fileLength = Files.size(filePath);

        // If no range header, serve first 64KB chunk to trigger range requests on client
        if (rangeHeader == null) {
            log.info("No Range header, serving full EPUB: {} ({} bytes)", file, fileLength);
            InputStreamResource fullResource = new InputStreamResource(Files.newInputStream(filePath));
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

            InputStream inputStream = Files.newInputStream(filePath);

            if (inputStream.skip(start) != start) {
                log.warn("Unable to skip to requested start position in file");
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

            // Fall back: serve first 64KB chunk instead of whole file
            InputStream inputStream = Files.newInputStream(filePath);
            InputStreamResource resource = new InputStreamResource(new LimitedInputStream(inputStream, 64 * 1024));

            return ResponseEntity.status(HttpStatus.PARTIAL_CONTENT)
                    .header(HttpHeaders.CONTENT_TYPE, "application/epub+zip")
                    .header(HttpHeaders.ACCEPT_RANGES, "bytes")
                    .header(HttpHeaders.CONTENT_RANGE, "bytes 0-" + (64 * 1024 - 1) + "/" + fileLength)
                    .contentLength(64 * 1024)
                    .body(resource);
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