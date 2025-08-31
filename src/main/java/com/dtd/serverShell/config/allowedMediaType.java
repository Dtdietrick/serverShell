package com.dtd.serverShell.config;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
// Determine MediaType from filename extension for proper HTTP Content-Type header
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;

@Service
public class allowedMediaType{
    private static final Logger log = LoggerFactory.getLogger(allowedMediaType.class);
    
    /*DEPRECATED OLD LIVE STREAM LOGIC*/
//    public static final List<String> SUPPORTED_EXTENSIONS = List.of(
//            ".mp3", ".mp4", ".avi", ".mkv", ".webm",".m3u", ".epub"
//        );

    public static final List<String> SUPPORTED_EXTENSIONS = List.of(
            ".m3u8", ".epub"
        );
    
    /*DEPRECATED OLD LIVE STREAM LOGIC*/
    public static MediaType getMediaType(String filename) {
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
    
    public static boolean isSupportedMediaFile(String name) {
        if (name == null) return false;
        int dot = name.lastIndexOf('.');
        if (dot < 0) return false;                  
        String extension = name.substring(dot).toLowerCase();
        return SUPPORTED_EXTENSIONS.contains(extension);
    }
}
