package com.dtd.serverShell.config;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
// Determine MediaType from filename extension for proper HTTP Content-Type header
import org.springframework.http.MediaType;

public class allowedMediaType{
	private static final Logger log = LoggerFactory.getLogger(allowedMediaType.class);
	
	public MediaType getMediaType(String filename) {
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

        if (lower.endsWith(".epub")) return MediaType.valueOf("application/epub+zip"); 
 
        log.info("Unknown file type: {}",filename);
        // Default binary stream if unknown type
        return MediaType.APPLICATION_OCTET_STREAM;
    }
	
    public boolean isSupportedMediaFile(String name) {
        String lower = name.toLowerCase();
        return lower.endsWith(".mp3") || lower.endsWith(".mp4") || lower.endsWith(".wav")
            || lower.endsWith(".avi") || lower.endsWith(".mkv") || lower.endsWith(".webm")
            || lower.endsWith(".ogg") || lower.endsWith(".flac") || lower.endsWith(".m3u")
            || lower.endsWith(".epub");  // <-- add epub here
    }
}
