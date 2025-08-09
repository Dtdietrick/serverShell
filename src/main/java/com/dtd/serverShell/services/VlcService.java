package com.dtd.serverShell.services;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
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

        // Build VLC command using EXACT paths from session.outDir()
        // NOTE: keep your existing codec/transcode settings; only the paths changed.
        String indexPath = outDir.resolve("index.m3u8").toString();
        String segPath   = outDir.resolve("seg-########.ts").toString();

        ProcessBuilder pb = new ProcessBuilder(
            "cvlc",
            mediaFile.toString(),
            "--sout",
            "#transcode{vcodec=h264,acodec=mp4a,ab=128,channels=2}:std{access=livehttp{seglen=2,delsegs=true,numsegs=10,index="
                + indexPath + ",index-url=seg-########.ts},mux=ts,dst=" + segPath + "}",
            "--no-sout-all",
            "--sout-keep",
            "--quiet"
        );
        pb.redirectError(outDir.resolve("vlc.err").toFile());
        pb.redirectOutput(outDir.resolve("vlc.out").toFile());
        Process p = pb.start();

        sessions.put(sid, new Proc(session, p));
        log.info("sid {}, outDir {}, m3u8 {}", session.sid(), session.outDir(), session.m3u8Url());
        Path index = session.outDir().resolve("index.m3u8");
        waitForIndex(index, Duration.ofSeconds(5));
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
    
    private void waitForIndex(Path index, Duration timeout) {
    	  long deadline = System.nanoTime() + timeout.toNanos();
    	  try {
    	    while (System.nanoTime() < deadline) {
    	      if (Files.exists(index) && Files.size(index) > 0) return;
    	      Thread.sleep(150);
    	    }
    	  } catch (Exception ignored) {}
    	}
}