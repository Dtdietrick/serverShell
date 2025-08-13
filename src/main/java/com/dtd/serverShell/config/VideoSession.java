package com.dtd.serverShell.config;

import java.nio.file.Path;

public final class VideoSession {
    private final String sid;            // opaque session id (uuid)
    private final String username;       // owner
    private final Path streamsRootFs;    // e.g. Paths.get("/home/dylbeasto/streams")
    private final String streamsRootUrl; // e.g. "/streams"

    public VideoSession(String sid, String username, Path streamsRootFs, String streamsRootUrl) {
        this.sid = sid;
        this.username = username;
        this.streamsRootFs = streamsRootFs;
        // normalize root url to NOT end with slash
        this.streamsRootUrl = streamsRootUrl.endsWith("/")
                ? streamsRootUrl.substring(0, streamsRootUrl.length() - 1)
                : streamsRootUrl;
    }
    
    
    public String sid() { return sid; }
    public String username() { return username; }

    /** Single source of truth for the folder name. KEEP THIS STABLE. */
    public String folderName() { return sid; }

    /** Filesystem directory where video writes index.m3u8 and seg-*.ts */
    public Path outDir() { return streamsRootFs.resolve(folderName()); }

    /** Public URL the browser should load. Must mirror outDir() exactly. */
    public String m3u8Url() { return streamsRootUrl + "/" + folderName() + "/index.m3u8"; }

    /** Optional cache-busting without changing the path. */
    public String m3u8UrlWithNonce(String nonce) { return m3u8Url() + "?t=" + nonce; }

    public String publicDirUrl() {
        return streamsRootUrl + "/" + folderName() + "/";
    }
}

