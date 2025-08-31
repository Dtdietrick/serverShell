package com.dtd.serverShell.services;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import com.dtd.serverShell.config.allowedMediaType;

@Service
public class MediaService {

    @Value("${media.dir}")
    private String mediaDir;
    private static final Logger log = LoggerFactory.getLogger(MediaService.class);

    public List<String> listMediaFiles(String currentPath) {
        Path basePath = Paths.get(mediaDir);
        Path targetPath = currentPath.isEmpty() ? basePath : basePath.resolve(currentPath);

        if (!Files.exists(targetPath) || !Files.isDirectory(targetPath)) {
            log.warn("Invalid media path: " + targetPath);
            return List.of();
        }

        System.out.println("[MediaScan] media.dir = " + mediaDir);
        System.out.println("[MediaScan] currentPath = " + currentPath);
        System.out.println("[MediaScan] Resolved targetPath = " + targetPath.toAbsolutePath());

        try (Stream<Path> stream = Files.list(targetPath)) {
            // Collect immediate children (folders + supported files)
            List<Path> children = stream
                .filter(p -> !p.equals(targetPath))
                .filter(p -> {
                    if (Files.isDirectory(p)) {
                        String name = String.valueOf(p.getFileName());
                        return !name.equalsIgnoreCase("lost+found");
                    } else {
                        return isSupportedByConfig(p); // strict filter for files
                    }
                })
                .sorted(Comparator.comparing(p -> String.valueOf(p.getFileName()).toLowerCase()))
                .collect(Collectors.toList());

            // Partition children into dirs and files
            List<Path> childDirs  = new ArrayList<>();
            List<Path> childFiles = new ArrayList<>();
            for (Path c : children) {
                if (Files.isDirectory(c)) childDirs.add(c);
                else                     childFiles.add(c);
            }

            // Look for DIRECT indexes inside IMMEDIATE child dirs (episode folders)
            Map<Path, Path> directIndexes = new LinkedHashMap<>();
            for (Path d : childDirs) {
                directIndex(d).ifPresent(idx -> {
                    if (isSupportedByConfig(idx)) {
                        directIndexes.put(d, idx);
                    }
                });
            }

            List<String> items = new ArrayList<>();

            if (!directIndexes.isEmpty()) {
                // We are in a "Season" folder (episodes as immediate children):
                // Return ALL episode indexes as files; also include any supported files directly in Season.
                childFiles.forEach(f -> items.add(rel(basePath, f)));
                // Keep order stable by child dir name
                childDirs.stream()
                    .sorted(Comparator.comparing(p -> String.valueOf(p.getFileName()).toLowerCase()))
                    .forEach(d -> {
                        Path idx = directIndexes.get(d);
                        if (idx != null) {
                            items.add(rel(basePath, idx)); // EpisodeX/index.m3u8
                        } else {
                            // Episode folder without an index → still show as a folder
                            items.add(relDir(basePath, d));
                        }
                    });
            } else {
                // Not a Season folder: show folders as folders + supported files at this level.
                for (Path d : childDirs)  items.add(relDir(basePath, d));
                for (Path f : childFiles) items.add(rel(basePath, f));
            }

            items.removeIf(s -> s == null || s.isBlank() || "/".equals(s) || ".".equals(s));
            return items;
        } catch (IOException e) {
            log.error("Failed listing media path: " + targetPath, e);
            return List.of();
        }
    }
    
    private boolean isSupportedByConfig(Path p) {
        String name = p.getFileName() != null ? p.getFileName().toString() : "";
        return allowedMediaType.isSupportedMediaFile(name);
    }
    
    /** Return a folder path with trailing slash (relative to base). */
    private String relDir(Path base, Path dir) {
        String r = rel(base, dir);
        return r.endsWith("/") ? r : r + "/";
    }
    
    private String rel(Path base, Path p) {
        return base.relativize(p).toString().replace("\\", "/");
    } 
    
    private Optional<Path> directIndex(Path dir) {
        try {
            Path idx = dir.resolve("index.m3u8");
            if (Files.isRegularFile(idx)) return Optional.of(idx);

            Path hls = dir.resolve("hls").resolve("index.m3u8");
            if (Files.isRegularFile(hls)) return Optional.of(hls);

            return Optional.empty();
        } catch (Exception e) {
            log.warn("directIndex: error for " + dir + ": " + e.getMessage());
            return Optional.empty();
        }
    }
    
    //new VOD stream logic - backend hosts pre-encoded files
    public Path resolveVodManifest(String relativePath) throws IOException {
        if (relativePath == null || relativePath.isBlank()) {
            throw new IOException("Empty path");
        }

        Path mediaRoot  = Paths.get(mediaDir).toAbsolutePath().normalize();
        Path candidate  = mediaRoot.resolve(relativePath).normalize();

        // Security: must remain inside media root
        if (!candidate.startsWith(mediaRoot)) {
            throw new IOException("Path escapes media root");
        }

        // If they passed a directory, look for index.m3u8 inside it
        if (Files.isDirectory(candidate)) {
            Path idx = candidate.resolve("index.m3u8");
            if (Files.isRegularFile(idx)) return idx;
            throw new IOException("index.m3u8 not found in directory: " + candidate);
        }

        // If they passed a file, it must be index.m3u8
        if (Files.isRegularFile(candidate) && candidate.getFileName().toString().equals("index.m3u8")) {
            return candidate;
        }

        throw new IOException("Not a playable manifest path: " + candidate);
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