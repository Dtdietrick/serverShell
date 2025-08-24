package com.dtd.serverShell.services;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.InputStreamResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.bind.annotation.RequestParam;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import com.dtd.serverShell.config.allowedMediaType;

@Service
public class MediaService {

    @Value("${media.dir}")
    private String mediaDir;
    private static final Logger log = LoggerFactory.getLogger(MediaService.class);
    
    // Recursively list media files under mediaDir with supported extensions
    public List<String> listMediaFiles(String currentPath) {
        Path basePath = Paths.get(mediaDir);
        Path targetPath = currentPath.isEmpty() ? basePath : basePath.resolve(currentPath);

        if (!Files.exists(targetPath) || !Files.isDirectory(targetPath)) {
            log.warn("Invalid media path: " + targetPath);
            return List.of();
        }
        System.out.println("[MediaScan] media.dir = " + mediaDir);
        System.out.println("MediaScan] currentPath = " + currentPath);
        System.out.println("[MediaScan] Resolved targetPath = " + targetPath.toAbsolutePath());
        try (Stream<Path> stream = Files.list(targetPath)) {
            List<String> items = stream
                // Skip the root folder itself
                .filter(p -> !p.equals(targetPath))
                // Filter only supported files or directories
                .filter(p -> {
                    if (Files.isDirectory(p)) {
                        String folderName = p.getFileName().toString();
                        return !folderName.equalsIgnoreCase("lost+found");
                    } else {
                        return allowedMediaType.isSupportedMediaFile(p.getFileName().toString());
                    }
                })
                // Map to relative path from basePath, normalized with '/' separator
                .map(p -> basePath.relativize(p).toString().replace("\\", "/"))
                .filter(relPath -> !relPath.isBlank() && !relPath.equals("/") && !relPath.equals("."))
                .map(relPath -> {
                    Path absPath = basePath.resolve(relPath);
                    if (Files.isDirectory(absPath)) {
                        return relPath.endsWith("/") ? relPath : relPath + "/";
                    }
                    return relPath;
                })
                .sorted(String::compareToIgnoreCase)
                .collect(Collectors.toList());

            items.forEach(item -> {
                if (item.isBlank()) {
                    log.warn("Empty or blank virtual item detected!");
                }
            });
            
            return items;

        } catch (IOException e) {
            log.error("Failed listing media path: " + targetPath, e);
            return List.of();
        }
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
           log.error("Error during listPlaylists", e);
        }

        return names;
    }

    // Load entire playlist by name, delegating to offset/limit method with no limit
    public List<String> loadPlaylist(String name) {
        return loadPlaylist(name, 0, Integer.MAX_VALUE);
    }

    // Load playlist with pagination (offset and limit)
    public List<String> loadPlaylist(String name, int offset, int limit) 
    {
        List<String> playlist = new ArrayList<>();
        Path playlistPath = Paths.get(mediaDir, name + ".m3u").normalize();
        // musicDir is assumed two levels up from playlist file (e.g. mediaDir/music)
        Path musicDir = playlistPath.getParent().getParent();

        // Validate playlist file existence
        if (!Files.exists(playlistPath) || !Files.isRegularFile(playlistPath))
        {
            log.error("[MediaService] Playlist file not found: " + playlistPath);
            return playlist;
        }

        int skipped = 0;
        int collected = 0;

        try (BufferedReader reader = Files.newBufferedReader(playlistPath, StandardCharsets.UTF_8))
        {
            String line;
            while ((line = reader.readLine()) != null) {
                line = line.trim();
                // Skip empty lines and comments
                if (line.isEmpty() || line.startsWith("#")) continue;

                // Decode URL-encoded paths and normalize separators
                String decoded = java.net.URLDecoder.decode(line, StandardCharsets.UTF_8);
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
                    log.warn("[MediaService] Skipping invalid or missing path in playlist: " + decoded);
                }
            }
        } catch (IOException e) {
            log.error("Error during load playlists", e);
        }

        return playlist;
    }
}