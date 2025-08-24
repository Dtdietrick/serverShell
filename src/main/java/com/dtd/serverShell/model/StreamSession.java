package com.dtd.serverShell.model;

import java.nio.file.Path;

public sealed interface StreamSession permits VideoSession, MusicSession {
    String sid();
    String username();
    Path outDir();
    String publicDirUrl();

    default String m3u8Url() {
        return publicDirUrl() + "index.m3u8";
    }
}
