package com.dtd.fileServer.services;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.InputStreamResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.bind.annotation.RequestParam;

import java.io.*;
import java.nio.file.FileVisitOption;
import java.nio.file.FileVisitResult;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.SimpleFileVisitor;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.List;

@Service
public class MediaService {

    @Value("${media.dir}")
    private String mediaDir;

    public ResponseEntity<Resource> getMedia(String filename, String rangeHeader, @RequestParam(required = false) Boolean fromPlaylist) throws IOException {

        // If the media request is from a playlist, prepend "Music/" folder to the filename path
        if (Boolean.TRUE.equals(fromPlaylist)) {
            filename = "Music/" + filename;
        }

        // Resolve the absolute path of the media directory and requested file
        Path mediaRoot = Paths.get(mediaDir).toAbsolutePath().normalize();
        Path resolvedPath = mediaRoot.resolve(filename).normalize();

        // 🚫 Security check to prevent path traversal attacks outside the media directory
        if (!resolvedPath.startsWith(mediaRoot)) {
            System.err.println("[MediaService] Invalid file path (path traversal attempt): " + filename);
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).build();
        }

        // ❌ Return 404 if file does not exist or is not a regular file
        if (!Files.exists(resolvedPath) || !Files.isRegularFile(resolvedPath)) {
            System.err.println("[MediaService] File not found: " + resolvedPath);
            return ResponseEntity.notFound().build();
        }

        long fileLength = Files.size(resolvedPath);
        InputStream inputStream = Files.newInputStream(resolvedPath);
        InputStreamResource resource = new InputStreamResource(inputStream);

        HttpHeaders headers = new HttpHeaders();
        headers.set(HttpHeaders.ACCEPT_RANGES, "bytes"); // Support partial content requests (streaming)
        headers.setContentType(getMediaType(filename));

        // 🎯 Handle HTTP Range header for streaming partial content (e.g., video/audio seeking)
        if (rangeHeader != null && rangeHeader.startsWith("bytes=")) {
            String rangeValue = rangeHeader.substring("bytes=".length());
            String[] rangeParts = rangeValue.split("-", 2);
            long rangeStart = 0;
            long rangeEnd = fileLength - 1;

            try {
                if (!rangeParts[0].isEmpty()) {
                    rangeStart = Long.parseLong(rangeParts[0]);
                }
                if (rangeParts.length > 1 && !rangeParts[1].isEmpty()) {
                    rangeEnd = Long.parseLong(rangeParts[1]);
                }
            } catch (NumberFormatException e) {
                // Malformed Range header; respond with 416 Requested Range Not Satisfiable
                return ResponseEntity.status(HttpStatus.REQUESTED_RANGE_NOT_SATISFIABLE).build();
            }

            // Validate the requested range values
            if (rangeStart > rangeEnd || rangeEnd >= fileLength) {
                return ResponseEntity.status(HttpStatus.REQUESTED_RANGE_NOT_SATISFIABLE).build();
            }

            long contentLength = rangeEnd - rangeStart + 1;
            long skipped = inputStream.skip(rangeStart); // Skip to range start in input stream
            if (skipped < rangeStart) {
                // Failed to skip properly; internal error
                return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
            }

            headers.setContentLength(contentLength);
            headers.set("Content-Range", "bytes " + rangeStart + "-" + rangeEnd + "/" + fileLength);
            // Return partial content (206) with appropriate headers
            return new ResponseEntity<>(resource, headers, HttpStatus.PARTIAL_CONTENT);
        }

        // If no Range header, return entire file with 200 OK
        headers.setContentLength(fileLength);
        return new ResponseEntity<>(resource, headers, HttpStatus.OK);
    }

    // Determine MediaType from filename extension for proper HTTP Content-Type header
    private MediaType getMediaType(String filename) {
        String lower = filename.toLowerCase();

        if (lower.endsWith(".mp4")) return MediaType.valueOf("video/mp4");
        if (lower.endsWith(".webm")) return MediaType.valueOf("video/webm");
        if (lower.endsWith(".ogg")) return MediaType.valueOf("video/ogg");
        if (lower.endsWith(".avi")) return MediaType.valueOf("video/x-msvideo");
        if (lower.endsWith(".mkv")) return MediaType.valueOf("video/x-matroska");

        if (lower.endsWith(".mp3")) return MediaType.valueOf("audio/mpeg");
        if (lower.endsWith(".wav")) return MediaType.valueOf("audio/wav");
        if (lower.endsWith(".flac")) return MediaType.valueOf("audio/flac");
        if (lower.endsWith(".ogg")) return MediaType.valueOf("audio/ogg");

        // Default binary stream if unknown type
        return MediaType.APPLICATION_OCTET_STREAM;
    }

    // Recursively list media files under mediaDir with supported extensions
    public List<String> listMediaFiles() {
        Path basePath = Paths.get(mediaDir);
        if (!Files.exists(basePath) || !Files.isDirectory(basePath)) {
            System.out.println("Invalid media directory: " + mediaDir);
            return List.of();
        }

        List<String> results = new ArrayList<>();
        try {
            Files.walkFileTree(
                basePath,
                EnumSet.noneOf(FileVisitOption.class),  // Do NOT follow symbolic links
                Integer.MAX_VALUE,
                new SimpleFileVisitor<>() {
                    @Override
                    public FileVisitResult preVisitDirectory(Path dir, BasicFileAttributes attrs) {
                        Path rel = basePath.relativize(dir);
                        // Skip "lost+found" directory if present
                        if (rel.getNameCount() > 0 && rel.getName(0).toString().equals("lost+found")) {
                            return FileVisitResult.SKIP_SUBTREE;
                        }
                        return FileVisitResult.CONTINUE;
                    }

                    @Override
                    public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) {
                        String name = basePath.relativize(file).toString().replace("\\", "/");
                        // Check for supported media file extensions, keep original case
                        if (name.endsWith(".mp3")
                                || name.endsWith(".mp4")
                                || name.endsWith(".wav")
                                || name.endsWith(".avi")
                                || name.endsWith(".mkv")
                                || name.endsWith(".webm")
                                || name.endsWith(".ogg")
                                || name.endsWith(".flac")
                                || name.endsWith(".m3u")) {
                            results.add(name);
                        }
                        return FileVisitResult.CONTINUE;
                    }

                    @Override
                    public FileVisitResult visitFileFailed(Path file, IOException exc) {
                        // Log and skip files/directories that cannot be accessed
                        System.err.println("Failed to visit file: " + file + " - " + exc.getMessage());
                        return FileVisitResult.CONTINUE;
                    }
                }
            );
        } catch (IOException e) {
            e.printStackTrace();
            return List.of();
        }

        // Sort media files alphabetically before returning
        results.sort(String::compareTo);
        return results;
    }

    // List all playlist names (without .m3u extension) in the playlists subfolder of mediaDir
    public List<String> listPlaylists() {
        List<String> names = new ArrayList<>();
        Path playlistsDir = Paths.get(mediaDir, "playlists"); // playlist folder is directly under mediaDir

        if (!Files.exists(playlistsDir) || !Files.isDirectory(playlistsDir)) {
            return names;
        }

        try (var stream = Files.list(playlistsDir)) {
            stream.filter(Files::isRegularFile)
                  .filter(f -> f.getFileName().toString().endsWith(".m3u"))
                  .forEach(f -> {
                      String name = f.getFileName().toString();
                      if (name.endsWith(".m3u")) {
                          name = name.substring(0, name.length() - 4); // remove extension
                      }
                      names.add(name);
                  });
        } catch (IOException e) {
            e.printStackTrace();
        }

        return names;
    }

    // Load entire playlist by name, delegating to offset/limit method with no limit
    public List<String> loadPlaylist(String name) {
        return loadPlaylist(name, 0, Integer.MAX_VALUE);
    }

    // Load playlist with pagination (offset and limit)
    public List<String> loadPlaylist(String name, int offset, int limit) {
        List<String> playlist = new ArrayList<>();
        Path playlistPath = Paths.get(mediaDir, name + ".m3u").normalize();
        // musicDir is assumed two levels up from playlist file (e.g. mediaDir/music)
        Path musicDir = playlistPath.getParent().getParent();

        // Validate playlist file existence
        if (!Files.exists(playlistPath) || !Files.isRegularFile(playlistPath)) {
            System.err.println("[MediaService] Playlist file not found: " + playlistPath);
            return playlist;
        }

        int skipped = 0;
        int collected = 0;

        try (BufferedReader reader = Files.newBufferedReader(playlistPath)) {
            String line;
            while ((line = reader.readLine()) != null) {
                line = line.trim();
                // Skip empty lines and comments
                if (line.isEmpty() || line.startsWith("#")) continue;

                // Decode URL-encoded paths and normalize separators
                String decoded = java.net.URLDecoder.decode(line, java.nio.charset.StandardCharsets.UTF_8);
                decoded = decoded.replace("\\", "/");

                // Resolve path against music directory
                Path resolved = musicDir.resolve(decoded).normalize();

                // Validate resolved path is inside musicDir and file exists
                if (resolved.startsWith(musicDir) && Files.exists(resolved) && Files.isRegularFile(resolved)) {
                    // Skip entries before offset
                    if (skipped < offset) {
                        skipped++;
                        continue;
                    }
                    // Stop if limit reached
                    if (collected >= limit) break;

                    // Add relative path from musicDir to playlist result
                    String relativePath = musicDir.relativize(resolved).toString().replace("\\", "/");
                    playlist.add(relativePath);
                    collected++;
                } else {
                    System.out.println("[MediaService] Skipping invalid or missing path in playlist: " + decoded);
                }
            }
        } catch (IOException e) {
            e.printStackTrace();
        }

        return playlist;
    }
}