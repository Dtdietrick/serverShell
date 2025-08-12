package com.dtd.serverShell.services;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardOpenOption;
import java.time.Duration;
import java.time.Instant;
import java.util.Comparator;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import com.dtd.serverShell.config.VlcSession;

@Service
public class VlcService {
    private static final Logger log = LoggerFactory.getLogger(VlcService.class);

    // base path and url for streams
    @Value("${streams.dir}") private String streamsDir; // FS

    private final Map<String, Proc> sessions = new ConcurrentHashMap<>();

    // encapsulate a running stream
    private record Proc(VlcSession session, Process process) {}

    public VlcSession start(String username, Path mediaFile) throws IOException {
        String sid = UUID.randomUUID().toString();
        VlcSession session = new VlcSession(
                sid,
                username,
                Paths.get(streamsDir),
                "/streams"
        );

        Path outDir = session.outDir();
        Files.createDirectories(outDir);

        Path indexFile = outDir.resolve("index.m3u8");
        
        String indexPath = indexFile.toAbsolutePath().normalize().toString();
        String segPath   = outDir.resolve("seg-########.ts").toAbsolutePath().normalize().toString();

        // 4s @ 24fps → keyint=96; use 120 for 30fps
        String venc = "x264{keyint=96,min-keyint=96,scenecut=0,bframes=0}";
        String sout =
          "#transcode{vcodec=h264,venc=" + venc + ",acodec=mp4a,ab=128,channels=2}:"
        + "std{access=livehttp{seglen=4,delsegs=true,numsegs=12,"
        + "index='" + indexPath + "',index-url=seg-########.ts},"
        + "mux=ts{use-key-frames},dst='" + segPath + "'}";

        ProcessBuilder pb = new ProcessBuilder(
          "cvlc", mediaFile.toString(),
          "--sout", sout,
          "-vvv", "--sout-all", "--sout-keep",
          "--avcodec-hw=none",
          "--sout-mux-caching=800"
        );
        
        pb.redirectError(outDir.resolve("vlc.err").toFile());
        pb.redirectOutput(outDir.resolve("vlc.out").toFile());
        log.info("VLC --sout: {}", sout);

        Files.writeString(outDir.resolve(".vlc_write_probe"), "ok", StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING);
        Files.deleteIfExists(outDir.resolve(".vlc_write_probe"));
        
        Process p = pb.start();
        sessions.put(sid, new Proc(session, p));

        log.info("sid {}, outDir {}, m3u8 {}", session.sid(), session.outDir(), session.m3u8Url());

        // Wait a bit longer the first time; index is created when the first segment closes
        waitForPlayableManifest(indexFile, outDir, Duration.ofSeconds(10));
        return session;
    }

    public VlcSession getSession(String sid) {
        Proc proc = sessions.get(sid);
        return proc == null ? null : proc.session();
    }

    public void stop(String sid) {
        Proc proc = sessions.remove(sid);
        if (proc == null) return;

        try {
            proc.process().destroy();
            if (!proc.process().waitFor(1000, TimeUnit.MILLISECONDS)) proc.process().destroyForcibly();
        } catch (InterruptedException ignored) {}

        // Clean up files
        Path dir = proc.session().outDir();
        try {
            Files.walk(dir).sorted(Comparator.reverseOrder()).forEach(path -> {
                try { Files.deleteIfExists(path); } catch (IOException ignored) {}
            });
        } catch (IOException ignored) {}
        log.info("stopped sid {}, cleaned {}", sid, dir);
    }
    
    private void waitForPlayableManifest(Path indexFile, Path outDir, Duration timeout) throws IOException {
        long deadline = System.nanoTime() + timeout.toNanos();
        while (System.nanoTime() < deadline) {
            if (Files.exists(indexFile) && Files.size(indexFile) > 0) {
                // cheap check: look for #EXTINF (segment entries) and target duration
                String s = Files.readString(indexFile);
                if (s.contains("#EXT-X-TARGETDURATION") && s.contains("#EXTINF")) return;
            }
            // or: bail out early if we already have the first segment file
            try (var stream = Files.list(outDir)) {
                if (stream.anyMatch(p -> p.getFileName().toString().startsWith("seg-00000001"))) return;
            } catch (IOException ignored) { }
            try { Thread.sleep(200); } catch (InterruptedException ie) { Thread.currentThread().interrupt(); }
        }
        throw new IOException("Timed out waiting for playable HLS manifest: " + indexFile);
    }
}