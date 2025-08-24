package com.dtd.serverShell.model;

import java.nio.file.Path;

public final class VideoSession implements StreamSession {
    private final String sid;
    private final String username;
    private final Path streamsRoot;     // filesystem root for all sessions
    private final String publicBaseUrl; // e.g. "/streams"

    public VideoSession(String sid, String username, Path streamsRoot, String publicBaseUrl) {
        this.sid = sid;
        this.username = username;
        this.streamsRoot = streamsRoot;
        this.publicBaseUrl = publicBaseUrl.endsWith("/") ? publicBaseUrl : publicBaseUrl + "/";
    }

    @Override public String sid() { return sid; }
    @Override public String username() { return username; }
    @Override public Path outDir() { return streamsRoot.resolve(sid); }
    @Override public String publicDirUrl() { return publicBaseUrl + sid + "/"; }
}
