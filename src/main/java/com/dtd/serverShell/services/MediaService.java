package com.dtd.serverShell.services;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import com.dtd.serverShell.config.allowedMediaType;

@Service
public class MediaService {

    @Value("${media.dir}")
    private String mediaDir;
    private static final Logger log = LoggerFactory.getLogger(MediaService.class);

    private Path mediaRoot() {
        return Paths.get(mediaDir).toAbsolutePath().normalize();
    }
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
    
    private String currentUsername() {
        var auth = SecurityContextHolder.getContext().getAuthentication();
        return (auth != null && auth.isAuthenticated()) ? String.valueOf(auth.getName()) : "anonymous";
    }

    private String categoryOfRel(String relPath) {
        if (relPath == null) return null;
        String first = relPath.replace('\\','/').replaceAll("^/+", "").split("/")[0].toLowerCase();
        return switch (first) {
            case "movies" -> "Movies";
            case "tv"     -> "TV";
            case "music"  -> "Music";
            default       -> null;
        };
    }

    private Path resolveUserFavoritesPlaylist(String category) {
        if (category == null) return null;
        Path root = mediaRoot();
        Path p = root.resolve(Path.of(category, "*Playlists*", currentUsername() + ".m3u")).normalize();
        return p.startsWith(root) ? p : null;
    }

    private boolean ensureParentDirs(Path file) {
        try {
            Files.createDirectories(file.getParent());
            if (!Files.exists(file)) Files.createFile(file);
            return true;
        } catch (IOException e) {
            log.error("[MediaService] ensureParentDirs failed for {}", file, e);
            return false;
        }
    }

    private String toPlaylistRelative(Path playlistParent, Path absoluteTarget) {
        Path rel = playlistParent.relativize(absoluteTarget).normalize();
        String s = rel.toString().replace('\\','/');

        // Ensure we *consistently* use "../" style (never "./" or absolute) in stored .m3u lines
        // From category/*Playlists*/  => category/Seasons/...   becomes  ../Seasons/...
        // If for some reason it's not starting with "../", force it (this should not happen in your layout)
        if (!s.startsWith("../")) {
            if (s.startsWith("./")) s = s.substring(2);
            if (!s.startsWith("../")) s = "../" + s;
        }
        // collapse any accidental multiple slashes
        s = s.replaceAll("/+", "/");
        return s;
    }

    /** Resolve a stored .m3u line (which should be "../...") or any relative string against the playlist's parent. */
    private Path resolveAgainstPlaylist(Path playlistParent, String storedLineOrRel) {
        String s = storedLineOrRel == null ? "" : storedLineOrRel.trim().replace('\\','/');
        Path p = Paths.get(s);
        if (!p.isAbsolute()) p = playlistParent.resolve(p);
        return p.normalize();
    }

    private boolean pathEqualsCI(Path a, Path b) {
        String os = System.getProperty("os.name").toLowerCase();
        return os.contains("win") ? a.toString().equalsIgnoreCase(b.toString()) : a.equals(b);
    }
    
    private String normalizeRel(String rel) {
        if (rel == null) return null;
        // media-root-relative, forward slashes, no leading slash, trim whitespace
        String s = rel.trim().replace('\\','/').replaceAll("/+", "/");
        while (s.startsWith("/")) s = s.substring(1);
        return s;
    }

    public boolean addFavorite(String relPath) {
        try {
            // Input expected from UI as media-root-relative (no "../")
            String norm = normalizeRel(relPath);
            if (norm == null || norm.isBlank()) return false;

            // Resolve to absolute under media root
            Path root = mediaRoot();
            Path absTarget = root.resolve(norm).normalize();
            if (!absTarget.startsWith(root)) return false; // safety

            // Determine category from the resolved absolute path (first segment under media root)
            Path rootRel = root.relativize(absTarget);
            String category = categoryOfRel(rootRel.toString().replace('\\','/'));
            if (category == null) return false;

            Path playlist = resolveUserFavoritesPlaylist(category);
            if (playlist == null) return false;
            if (!ensureParentDirs(playlist)) return false;

            List<String> lines = Files.exists(playlist)
                    ? Files.readAllLines(playlist, StandardCharsets.UTF_8)
                    : new ArrayList<>();

            Path baseDir = playlist.getParent();
            String storeLine = toPlaylistRelative(baseDir, absTarget); // ALWAYS "../..."

            // idempotent: consider existing lines after resolving against playlist parent
            boolean exists = lines.stream()
                    .map(s -> resolveAgainstPlaylist(baseDir, normalizeRel(s)))
                    .anyMatch(p -> pathEqualsCI(p, absTarget));
            if (!exists) {
                lines.add(storeLine);
                Files.write(playlist, lines, StandardCharsets.UTF_8,
                        StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING);
            }
            return true;
        } catch (IOException e) {
            log.error("[MediaService] addFavorite failed for {}", relPath, e);
            return false;
        }
    }

    public boolean removeFavorite(String relPath) {
        try {
            String norm = normalizeRel(relPath);
            if (norm == null || norm.isBlank()) return false;

            Path root = mediaRoot();
            Path absTarget = root.resolve(norm).normalize();
            if (!absTarget.startsWith(root)) return false;

            // Determine category from resolved absolute target
            Path rootRel = root.relativize(absTarget);
            String category = categoryOfRel(rootRel.toString().replace('\\','/'));
            if (category == null) return false;

            Path playlist = resolveUserFavoritesPlaylist(category);
            if (playlist == null || !Files.exists(playlist)) {
                // nothing to remove; idempotent
                return true;
            }

            List<String> lines = Files.readAllLines(playlist, StandardCharsets.UTF_8);
            Path baseDir = playlist.getParent();

            List<String> kept = new ArrayList<>(lines.size());
            boolean removed = false;
            for (String s : lines) {
                String sn = normalizeRel(s);
                Path lineAbs = resolveAgainstPlaylist(baseDir, sn);
                if (pathEqualsCI(lineAbs, absTarget)) {
                    removed = true; // drop it
                    continue;
                }
                // keep original text as-is; we are not rewriting format here
                kept.add(s);
            }

            if (removed) {
                Files.write(playlist, kept, StandardCharsets.UTF_8,
                        StandardOpenOption.TRUNCATE_EXISTING, StandardOpenOption.WRITE);
            }
            return true;
        } catch (IOException e) {
            log.error("[MediaService] removeFavorite failed for {}", relPath, e);
            return false;
        }
    }

    public List<String> listFavorites(String category) {
        try {
            Path playlist = resolveUserFavoritesPlaylist(category);
            if (playlist == null || !Files.exists(playlist)) return List.of();

            List<String> lines = Files.readAllLines(playlist, StandardCharsets.UTF_8);
            Path baseDir = playlist.getParent();
            Path root = mediaRoot();

            List<String> out = new ArrayList<>(lines.size());
            for (String s : lines) {
                String sn = normalizeRel(s);

                // Resolve any legacy absolute/root-rel lines to absolute, then re-emit as "../..."
                Path abs = sn.startsWith("../") || sn.startsWith("./")
                        ? resolveAgainstPlaylist(baseDir, sn)
                        : root.resolve(sn).normalize();

                if (!abs.startsWith(root)) continue; // safety
                out.add(toPlaylistRelative(baseDir, abs)); // ensure "../..." on output
            }
            return out;
        } catch (IOException e) {
            log.error("[MediaService] listFavorites failed for category={}", category, e);
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
        Path playlistsDir = Paths.get(mediaDir, "playlists");

        if (!Files.isDirectory(playlistsDir)) return names;

        try (var stream = Files.list(playlistsDir)) {
            stream.filter(Files::isRegularFile)
                  .map(Path::getFileName)
                  .map(Path::toString)
                  .filter(n -> n.toLowerCase(Locale.ROOT).endsWith(".m3u"))
                  .map(n -> n.substring(0, n.length() - 4))
                  .forEach(names::add);
        } catch (IOException e) {
            log.error("[MediaService] Error during listPlaylists", e);
        }
        return names;
    }

    // Load entire playlist by name, delegating to offset/limit method with no limit
    public List<String> loadPlaylist(String name) {
        return loadPlaylist(name, 0, Integer.MAX_VALUE);
    }

    // Load playlist with pagination (offset and limit)
    public List<String> loadPlaylist(String name, int offset, int limit) {
        if (name == null || name.isBlank()) return List.of();
        String cleaned = name.trim();

        // If it's a pure label (no slash and no extension), add .m3u under "playlists/" for legacy callers
        boolean looksLikeLabel = !cleaned.contains("/") && !cleaned.toLowerCase(Locale.ROOT).endsWith(".m3u");
        Path playlistPath;
        if (looksLikeLabel) {
            playlistPath = Paths.get(mediaDir, "playlists", cleaned + ".m3u").normalize();
        } else {
            // It might already include ".m3u" and/or subfolders
            if (!cleaned.toLowerCase(Locale.ROOT).endsWith(".m3u")) cleaned = cleaned + ".m3u";
            // Treat input as relative to mediaDir (reject absolute to avoid escaping)
            cleaned = cleaned.replace('\\', '/').replaceAll("^/+", "");
            playlistPath = Paths.get(mediaDir).resolve(cleaned).normalize();
        }

        return loadPlaylistByAbsolutePath(playlistPath, offset, limit);
    }

    /** New: load given a path that is already relative to mediaDir (e.g. "Music/File/newVibes.m3u") */
    public List<String> loadPlaylistByRelPath(String relPath, int offset, int limit) {
        if (relPath == null || relPath.isBlank()) return List.of();
        String cleaned = relPath.trim().replace('\\', '/').replaceAll("^/+", "");
        if (!cleaned.toLowerCase(Locale.ROOT).endsWith(".m3u")) cleaned += ".m3u";

        Path playlistPath = Paths.get(mediaDir).resolve(cleaned).normalize();
        return loadPlaylistByAbsolutePath(playlistPath, offset, limit);
    }

    /** Core worker: validates location, reads lines, resolves entries relative to the playlist file's parent */
    private List<String> loadPlaylistByAbsolutePath(Path playlistPath, int offset, int limit) {
        List<String> out = new ArrayList<>();
        Path mediaRoot = Paths.get(mediaDir).toAbsolutePath().normalize();

        // Security: require playlist to live under mediaDir
        if (!playlistPath.startsWith(mediaRoot)) {
            log.error("[MediaService] Playlist outside media root rejected: {}", playlistPath);
            return out;
        }
        if (!Files.isRegularFile(playlistPath)) {
            log.error("[MediaService] Playlist file not found: {}", playlistPath);
            return out;
        }

        Path baseDir = playlistPath.getParent(); // M3U relative paths are resolved against the playlist's folder
        int skipped = 0, collected = 0;

        try (BufferedReader reader = Files.newBufferedReader(playlistPath, StandardCharsets.UTF_8)) {
            String line;
            while ((line = reader.readLine()) != null) {
                line = line.trim();
                if (line.isEmpty() || line.startsWith("#")) continue;

                // Decode percent-escapes; normalize slashes
                String decoded = java.net.URLDecoder.decode(line, StandardCharsets.UTF_8);
                decoded = decoded.replace('\\', '/');

                Path candidate;
                if (decoded.startsWith("/") || decoded.matches("^[A-Za-z]:/.*")) {
                    // Absolute path in the playlist — allow only if it stays under mediaDir
                    candidate = Paths.get(decoded).normalize();
                } else {
                    // Relative entry — resolve against the playlist folder
                    candidate = baseDir.resolve(decoded).normalize();
                }

                if (!candidate.startsWith(mediaRoot)) {
                    log.warn("[MediaService] Skipping path outside media root in playlist: {}", decoded);
                    continue;
                }
                if (!Files.isRegularFile(candidate)) {
                    log.warn("[MediaService] Skipping missing path in playlist: {}", decoded);
                    continue;
                }

                if (skipped < offset) { skipped++; continue; }
                if (collected >= limit) break;

                // Return media-root-relative path with forward slashes
                String rel = mediaRoot.relativize(candidate).toString().replace('\\', '/');
                out.add(rel);
                collected++;
            }
        } catch (IOException e) {
            log.error("[MediaService] Error reading playlist: {}", playlistPath, e);
        }
        return out;
    }
}