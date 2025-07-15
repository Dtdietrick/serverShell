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

	🕹 Game Boy Emulator Integration (WebRcade Patch)
	This project includes a customized version of the WebRcade GBA emulator, with save-state support integrated into the local file server.

	✅ Features:
	Embedded Game Boy Advance emulator (webrcade-app-vba-m)

[Your File Server HTML/UI]
    |
    |  📦 Launch button → loads iframe:
    v
[WebRCade UI Shell (/webrcade/play/index.html)]
    |
    |  📂 Feed-based launch of GBA emulator:
    v
[GBA Emulator Core (/webrcade/play/app/gba/)]
    |
    |  🧠 Exposes `window.wrc` + handles FS/Module
    |
    |  💾 Writes save data into MEMFS → IDBFS
	

🧪 Debug Tips:
Use window.wrc.getSaveBlob().then(console.log) in browser console to verify save exists

Ensure window.FS.syncfs is defined inside the emulator iframe (after flush)


Security Notes

    The server prevents path traversal attacks by sanitizing requested file paths

    Make sure your media directory contains only intended media files to avoid exposing sensitive data

Troubleshooting

    No audio on some videos: Ensure codecs are supported by the browser/player.

    Playlist scrolling not working: Verify JavaScript console errors in your browser.

    Media files not found: Check media directory path and file permissions.

## TODO

- [✅] security logs, who accessed what from where (v0.1.1)
- [✅] stop current song playing when starting a song from playlist (v0.1.1)
- [✅] Keep user sound setting between playback (v0.1.1)
- [✅] Better listing - maybe have submenu by letter that shows all items that start with the letter (v0.1.2)
- [✅] beautify UI - part 1 (v0.1.2)
- [✅] Search bar (v0.1.4)
- [✅] fix back button on virtual directories (v0.1.5)
  [✅] current file banner (v0.1.5)
- [ ] view toggle
- [ ] eupub user controls
- [ ] Show some onscreen error if there was a problem with media playback
- [ ] logup service, maybe (only send a request, dont auto add to user list)
- [ ] user self service portal (user login stats, recent views, and change password)
- [✅] breakup index.html (v0.1.3)
- [ ] beautify UI - part 2
- [✅] Ereader functionality (v0.1.3)
- [ ] split out into microservices (why am i using spring?)
- [ ] user media request service
  [✅] GameBoy Emulator functionality (v0.1.6)
  [] Better GameBoy Controls
- [ ] N64 Emulator functionality (more complex, has to handle controller inputs)

##None code TODO
- [✅] change avi and mkv to mp4 - In Progress
- [ ] fix curated list of epubs to add
- [ ] fix more playlists