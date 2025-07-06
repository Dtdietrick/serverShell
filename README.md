Usage

    Navigate folders and playlists via the web UI

    Click on media files to start streaming

    Click on playlists to open a popup player with track scrolling and playback controls

    Use the back button to navigate up folders

API Endpoints

    GET /media/list - Returns JSON list of all media files with relative paths

    GET /media/playlist?name={playlistName}&offset={offset}&limit={limit} - Returns paginated playlist entries

    GET /media/{filename} - Streams media file (supports Range requests for partial streaming)
	
	
📚 EPUB Reader Endpoints

    GET /epubs
    Returns a JSON array of all .epub files found recursively under the Books/ directory (relative to media.dir).

    GET /epubs/download?file={path}
    Streams an EPUB file for the client-side EPUB.js reader.
    Supports HTTP Range headers for partial loading.

        Example: /epubs/download?file=Books/Fiction Books/Orwell, George/1984.epub

    GET /epubReader.html?file={path}
    Loads the web-based EPUB reader interface for the specified book.
    Uses EPUB.js for in-browser reading.

        Example:
        http://192.168.1.99:8080/epubReader.html?file=Books%2FFiction%20Books%2FCervantes%2C%20Miguel%20De%2FDon%20Quixote.epub


Security Notes

    The server prevents path traversal attacks by sanitizing requested file paths

    Make sure your media directory contains only intended media files to avoid exposing sensitive data

Troubleshooting

    No audio on some videos: Ensure codecs are supported by the browser/player.

    Playlist scrolling not working: Verify JavaScript console errors in your browser.

    Media files not found: Check media directory path and file permissions.

## TODO

- [✅] security logs, who accessed what from where (v1.1)
- [✅] stop current song playing when starting a song from playlist (v1.1)
- [✅] Keep user sound setting between playback (v1.1)
- [✅] Better listing - maybe have submenu by letter that shows all items that start with the letter (v1.2)
- [✅] beautify UI - part 1 (v1.2)
- [✅] Search bar (v1.4)
- [ ] Show some onscreen error if there was a problem with media playback
- [ ] logup service, maybe (only send a request, dont auto add to user list)
- [ ] user self service portal (user login stats and change password)
- [✅] breakup index.html (v1.3)
- [ ] beautify UI - part 2
- [✅] change avi and mkv to mp4 - In Progress (no code change)
- [ ] fix curated list of epubs to add
- [ ] fix more playlists
- [✅] Ereader functionality (v1.3)
- [ ] user media request service
- [ ] N64 Emulator functionality