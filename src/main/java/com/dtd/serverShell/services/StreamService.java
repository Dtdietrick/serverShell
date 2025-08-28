package com.dtd.serverShell.services;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;


import com.dtd.serverShell.model.MusicSession;   // [added]
import com.dtd.serverShell.model.StreamSession;  // [added]
import com.dtd.serverShell.model.VideoSession;  
@Service
public class StreamService {
    private static final Logger log = LoggerFactory.getLogger(StreamService.class);

    // base path and url for streams
    @Value("${streams.dir}") private String streamsDir; // FS
    @Value("${streams.baseUrl:/streams}") private String streamsBaseUrl;

    private final Map<String, Proc> sessions = new ConcurrentHashMap<>();

    // [VideoService.java] CHANGED: Proc now stores StreamSession, not VideoSession
    private record Proc(StreamSession session, Process process) {}
    
    @Value("${music.hls.segment.seconds:4}")   private int musicSegSeconds;
    @Value("${music.hls.list.size:24}")        private int musicListSize;
    @Value("${music.audio.codec:aac}")         private String musicAudioCodec;
    @Value("${music.audio.bitrate:128k}")      private String musicAudioBitrate;
    @Value("${music.audio.rate:48000}")        private String musicAudioRate;
    @Value("${music.audio.channels:2}")        private String musicAudioChannels;
    public VideoSession start(String username, Path mediaFile) throws IOException {
        return startVideo(username, mediaFile);
    }

    //video
    public VideoSession startVideo(String username, Path mediaFile) throws IOException {
        stopAllForUser(username); // keep your one-session-per-user behavior
        String sid = UUID.randomUUID().toString();
        VideoSession session = new VideoSession(sid, username, Paths.get(streamsDir), streamsBaseUrl);
        startFfmpegHls(mediaFile, session, /*audioOnly*/ false);
        waitForPlayableManifest(session.outDir().resolve("index.m3u8"), 2, Duration.ofSeconds(4 * 2 + 8));
        return session;
    }

    //music (audio-only)
    public MusicSession startMusic(String username, Path mediaFile) throws IOException {
        stopAllForUser(username);
        String sid = UUID.randomUUID().toString();
        MusicSession session = new MusicSession(sid, username, Paths.get(streamsDir), streamsBaseUrl);
        startFfmpegHls(mediaFile, session, /*audioOnly*/ true);
        // Music HLS readiness derived from musicSegSeconds/musicListSize, but 2 segments is usually enough
        waitForPlayableManifest(session.outDir().resolve("index.m3u8"), 2, Duration.ofSeconds(musicSegSeconds * 2 + 8));
        return session;
    }

    //single switch
    public enum StreamKind { VIDEO, MUSIC }
    public StreamSession start(StreamKind kind, String username, Path mediaFile) throws IOException {
        return (kind == StreamKind.MUSIC) ? startMusic(username, mediaFile) : startVideo(username, mediaFile);
    }

    public StreamSession getSession(String sid) {
        Proc proc = sessions.get(sid);
        return proc == null ? null : proc.session();
    }

    public void stop(String sid) {
        Proc proc = sessions.remove(sid);
        if (proc == null) return;
        Process p = proc.process();
        try {
            p.destroy();
            if (!p.waitFor(3, java.util.concurrent.TimeUnit.SECONDS)) {
                p.destroyForcibly();
                p.waitFor(2, java.util.concurrent.TimeUnit.SECONDS);
            }
        } catch (InterruptedException ie) {
            Thread.currentThread().interrupt();
        } finally {
            try { deleteRecursive(proc.session().outDir()); } catch (IOException ex) {
                log.warn("Failed to delete stream dir {}: {}", proc.session().outDir(), ex.toString());
            }
        }
    }

    // ---------- INTERNALS (shared) ----------

    private void stopAllForUser(String username) {
        sessions.entrySet().removeIf(e -> {
            if (username.equals(e.getValue().session().username())) {
                try { stop(e.getKey()); } catch (Exception ignored) {}
                return true;
            }
            return false;
        });
    }

    //compose & launch ffmpeg based on audioOnly flag
    private void startFfmpegHls(Path mediaFile, StreamSession session, boolean audioOnly) throws IOException {
        Path outDir = session.outDir();
        Files.createDirectories(outDir);

        Path indexFile = outDir.resolve("index.m3u8");
        String segPattern = outDir.resolve("seg-%08d.ts").toString();

        final List<String> cmd = audioOnly
            ? List.of(
                "ffmpeg", "-hide_banner", "-loglevel", "info",
                "-re", "-i", mediaFile.toString(),
                "-vn",                       // disable any video stream
                "-map", "0:a:0",             // first audio stream
                "-c:a", musicAudioCodec,     // e.g., aac
                "-b:a", musicAudioBitrate,   // e.g., 128k
                "-ar",  musicAudioRate,      // e.g., 48000
                "-ac",  musicAudioChannels,  // e.g., 2
                "-hls_time", Integer.toString(musicSegSeconds),
                "-hls_list_size", Integer.toString(musicListSize),
                "-hls_flags", "independent_segments+delete_segments",
                "-start_number", "1",
                "-hls_segment_filename", segPattern,
                indexFile.toString()
              )
            : List.of(
                "ffmpeg", "-hide_banner", "-loglevel", "info",
                "-re", "-i", mediaFile.toString(),
                "-map", "0:v:0", "-map", "0:a:0",
                "-c:v", "libx264", "-profile:v", "main", "-level", "3.1", "-pix_fmt", "yuv420p",
                "-r", "30", "-g", "120", "-keyint_min", "120", "-sc_threshold", "0",
                "-x264-params", "repeat-headers=1:vbv-maxrate=2500:vbv-bufsize=5000", "-b:v", "2500k",
                "-c:a", "aac", "-b:a", "128k", "-ar", "48000", "-ac", "2",
                "-hls_time", "4", "-hls_list_size", "24",
                "-hls_flags", "independent_segments+delete_segments",
                "-start_number", "1",
                "-hls_segment_filename", segPattern,
                indexFile.toString()
              );

        ProcessBuilder pb = new ProcessBuilder(cmd);
        pb.redirectOutput(outDir.resolve("ffmpeg.out").toFile());
        pb.redirectError(outDir.resolve("ffmpeg.err").toFile());
        Process p = pb.start();

        log.info("FFmpeg HLS started: kind={} sid={} outDir={} index={}",
                 (audioOnly ? "music" : "video"), session.sid(), outDir, indexFile);

        sessions.put(session.sid(), new Proc(session, p));

        // sidecar subtitle for video
        if (!audioOnly) {
            new Thread(() -> {
                try { extractSidecarSubtitles(mediaFile, outDir, (VideoSession) session); }
                catch (Exception e) { log.warn("subs extract failed: {}", e.toString()); }
            }, "subs-extract-" + session.sid()).start();
        }
    }
    
    // Recursive delete helper
    private static void deleteRecursive(Path root) throws IOException {
        if (root == null || !java.nio.file.Files.exists(root)) return;
        java.nio.file.Files.walkFileTree(root, new java.nio.file.SimpleFileVisitor<>() {
            @Override public java.nio.file.FileVisitResult visitFile(Path file, java.nio.file.attribute.BasicFileAttributes attrs) throws IOException {
                java.nio.file.Files.deleteIfExists(file);
                return java.nio.file.FileVisitResult.CONTINUE;
            }
            @Override public java.nio.file.FileVisitResult postVisitDirectory(Path dir, IOException exc) throws IOException {
                java.nio.file.Files.deleteIfExists(dir);
                return java.nio.file.FileVisitResult.CONTINUE;
            }
        });
    }
    
    //Subtitle helper
    private void extractSidecarSubtitles(Path mediaFile, Path outDir, VideoSession session) throws IOException, InterruptedException {
        // 1) ffprobe JSON of subtitle streams (index, codec_name, language/title)
        List<String> probeCmd = List.of(
            "ffprobe", "-v", "error",
            "-select_streams", "s",
            "-show_entries", "stream=index,codec_name:stream_tags=language,title",
            "-of", "json",
            mediaFile.toString()
        );
        Process probe = new ProcessBuilder(probeCmd)
            .redirectError(outDir.resolve("ffprobe.err").toFile())
            .redirectOutput(outDir.resolve("ffprobe.out").toFile())
            .start();
        int prc = waitForExit(probe, Duration.ofSeconds(10));
        if (prc != 0) return;

        // 2) Parse JSON (Jackson is on classpath in Spring Boot)
        var mapper = new com.fasterxml.jackson.databind.ObjectMapper();
        var root = mapper.readTree(outDir.resolve("ffprobe.out").toFile());
        var streamsNode = root.path("streams");
        if (!streamsNode.isArray() || streamsNode.isEmpty()) return;

        // 3) Extract each *text* subtitle to .vtt
        var allowed = java.util.Set.of("subrip","ass","ssa","webvtt","mov_text","text");
        var tracks = new java.util.ArrayList<java.util.Map<String,Object>>();

        for (var s : streamsNode) {
            int idx = s.path("index").asInt(-1);
            String codec = s.path("codec_name").asText("");
            if (idx < 0 || !allowed.contains(codec)) continue;

            String lang = s.path("tags").path("language").asText("");
            String title = s.path("tags").path("title").asText("");
            String safeLang = (lang == null || lang.isBlank()) ? "und" : lang.trim().toLowerCase();
            String base = "subs-" + String.format("%02d", idx) + "-" + safeLang + ".vtt";
            Path vttPath = outDir.resolve(base);

            // ffmpeg: extract to webvtt (overwrites if exists)
            List<String> subCmd = List.of(
                "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
                "-i", mediaFile.toString(),
                "-map", "0:s:" + indexToSubOrdinal(mediaFile, idx), // use ordinal mapping helper
                "-c:s", "webvtt",
                vttPath.toString()
            );
            Process subProc = new ProcessBuilder(subCmd)
                .redirectError(outDir.resolve("ffmpeg-subs-" + idx + ".err").toFile())
                .redirectOutput(outDir.resolve("ffmpeg-subs-" + idx + ".out").toFile())
                .start();
            int rc = waitForExit(subProc, Duration.ofMinutes(2));
            if (rc == 0 && Files.exists(vttPath)) {
                var track = new java.util.LinkedHashMap<String,Object>();
                track.put("label", !title.isBlank() ? title : (safeLang.equals("und") ? ("Sub #" + idx) : safeLang));
                track.put("lang", safeLang);
                track.put("src", session.publicDirUrl() + vttPath.getFileName().toString());
                tracks.add(track);
            }
        }

        if (!tracks.isEmpty()) {
            // 4) Write subs.json manifest next to the stream
            Path json = outDir.resolve("subs.json");
            mapper.writerWithDefaultPrettyPrinter().writeValue(json.toFile(), tracks);
        }
    }
    
    //Exit time out
    private int waitForExit(Process p, Duration d) throws InterruptedException {
        if (p.waitFor(d.toMillis(), java.util.concurrent.TimeUnit.MILLISECONDS)) return p.exitValue();
        p.destroyForcibly();
        return -1;
    }
    
    /**
     * helper:
     * ffprobe reports absolute stream indexes; ffmpeg -map uses 0:s:<ordinalAmongSubs>
     * Map stream index -> ordinal among subtitle streams.
     */
    private int indexToSubOrdinal(Path mediaFile, int absoluteIndex) throws IOException, InterruptedException {
        List<String> cmd = List.of(
            "ffprobe","-v","error",
            "-show_entries","stream=index",
            "-select_streams","s",
            "-of","csv=p=0",
            mediaFile.toString()
        );
        Process p = new ProcessBuilder(cmd).start();
        java.io.BufferedReader br = new java.io.BufferedReader(new java.io.InputStreamReader(p.getInputStream()));
        java.util.List<Integer> subs = new java.util.ArrayList<>();
        for (String line; (line = br.readLine()) != null; ) {
            try { subs.add(Integer.parseInt(line.trim())); } catch (Exception ignored) {}
        }
        p.waitFor();
        for (int i = 0; i < subs.size(); i++) if (subs.get(i) == absoluteIndex) return i;
        return 0; // fallback
    }
    
    private void waitForPlayableManifest(Path indexFile, int minSegments, Duration timeout) throws IOException {
        final long deadline = System.nanoTime() + timeout.toNanos();
        int lastCount = -1;

        while (System.nanoTime() < deadline) {
            if (Files.exists(indexFile)) {
                long size = Files.size(indexFile);
                if (size > 64) { // not just "#EXTM3U"
                    String m3u8 = Files.readString(indexFile);
                    // Count segments
                    int segCount = Math.max(0, m3u8.split("#EXTINF:", -1).length - 1);
                    if (segCount >= minSegments) return;

                    // (optional) low-noise progress logging while bringing it up
                    if (segCount != lastCount) {
                        lastCount = segCount;
                        // log.debug("HLS manifest warming up: {} EXTINF so far (need {})", segCount, minSegments);
                    }
                }
            }
            try { Thread.sleep(150); } catch (InterruptedException ie) {
                Thread.currentThread().interrupt();
                throw new IOException("Interrupted while waiting for HLS manifest", ie);
            }
        }
        throw new IOException("Timed out waiting for playable HLS manifest: " + indexFile);
    }
    
    //background class for deleting orphaned directories 
    @Scheduled(fixedDelay = 30_000) // every 30s
    public void cleanupOrphans() {
        try (var dirs = java.nio.file.Files.list(java.nio.file.Paths.get(streamsDir))) {
            long now = System.currentTimeMillis();
            dirs.filter(java.nio.file.Files::isDirectory).forEach(dir -> {
                // if not tracked or process is dead AND older than 2 minutes → delete
                boolean tracked = sessions.values().stream().anyMatch(p -> p.session().outDir().equals(dir));
                if (!tracked) {
                    try {
                        long ageMs = now - java.nio.file.Files.getLastModifiedTime(dir).toMillis();
                        if (ageMs > 120_000) deleteRecursive(dir);
                    } catch (Exception ignored) {}
                }
            });
        } catch (Exception e) {
            log.debug("cleanupOrphans skipped: {}", e.toString());
        }
    }
}
