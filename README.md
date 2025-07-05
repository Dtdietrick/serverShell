Usage

    Navigate folders and playlists via the web UI

    Click on media files to start streaming

    Click on playlists to open a popup player with track scrolling and playback controls

    Use the back button to navigate up folders

API Endpoints

    GET /media/list - Returns JSON list of all media files with relative paths

    GET /media/playlist?name={playlistName}&offset={offset}&limit={limit} - Returns paginated playlist entries

    GET /media/{filename} - Streams media file (supports Range requests for partial streaming)

Security Notes

    The server prevents path traversal attacks by sanitizing requested file paths

    Make sure your media directory contains only intended media files to avoid exposing sensitive data

Troubleshooting

    No audio on some videos: Ensure codecs are supported by the browser/player.

    Playlist scrolling not working: Verify JavaScript console errors in your browser.

    Media files not found: Check media directory path and file permissions.

## TODO

- [ ] change avi and mkv to mp4
- [ ] stop current song playing when starting a song from playlist
- [ ] Better listing - maybe have submenu by letter that shows all items that start with the letter
- [ ] security logs, who accessed what from where
- [ ] Ereader functionality
- [ ] N64 Emulator functionality