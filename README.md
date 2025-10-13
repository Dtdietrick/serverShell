# ServerShell Version 1.1 LTS

`serverShell` is a modular Spring Boot application that serves as a self-hosted, plugin-based media server. It provides a web-based interface for exploring and playing media files including audio, video, eBooks (EPUB), and emulated games.

## Overview

This application exposes a unified frontend and a set of backend services to stream and interact with locally stored media. Each media type is handled by a plugin-style controller and rendering layer.

Supported media types:
- Music and video streaming via native browser players
- Playlist management and playback
- EPUB reading via in-browser EPUB.js
- Game Boy and Game Boy Advance emulation via Dockerized RetroArch with mGBA

## Features

- Responsive file explorer with folder navigation
- Popup player with playlist queue and controls
- EPUB reader using client-side EPUB.js
- On-demand emulator session launch for GBA/GB ROMs
- Per-user save states for games
- Modular API endpoints per media type
- Simple access control via Spring Security

---

## Usage

1. Launch the server and access the UI in your browser at `http://<host>:<port>/`
2. Use the navigation pane to explore media folders:
   - Click on a media file to start playback
   - Click on a playlist file to launch the popup player
   - Click on a ROM to start an emulator session
   - Use the back button to navigate up directories
3. Save game progress via UI or automatic emulator hooks

---

## API Endpoints

### Media

- `GET /media/list?path={relativePath}`  
  Returns a list of folders and files for the given path

- `GET /media/{filename}`  
  Streams the specified file (supports HTTP Range for partial streaming)

- `GET /media/playlist?name={playlistName}&offset={offset}&limit={limit}`  
  Returns paginated playlist contents

### EPUB

- `GET /epubs`  
  Lists all EPUB files found recursively under the configured Books directory

- `GET /epubs/download?file={relativePath}`  
  Streams a single EPUB file to the EPUB.js reader (supports HTTP Range)

- `GET /epubReader.html?file={relativePath}`  
  Launches the browser-based EPUB reading UI

### Emulator

- `POST /emulator/launch?rom={romName}`  
  Starts a new emulator session for the specified ROM. Returns a temporary URL to access the VNC frontend.

- `GET /roms/{romName}`  
  Serves raw ROM content to RetroArch

- `GET /saves/{saveFile}`  
  Fetches the latest save state for a user and ROM

- `POST /saves/{saveFile}`  
  Uploads a save state to the server (automatically triggered by the emulator)

---

## Emulator Architecture

This project uses **RetroArch** with the **mGBA core**, launched in isolated Docker containers with per-user config, save, and runtime directories.

- Save files are mapped by user and ROM name: `username-ROM.sav`
- Each emulator session runs on a dynamically allocated port
- VNC is used to display the emulator frontend in-browser
- Save state upload is triggered via JavaScript or emulator flush

---

## Deployment

- Java 17+
- Maven or your preferred Spring Boot build tool
- Docker (required for emulator functionality)
- A media directory, defined via `media.dir` in application config or env

### Example launch (with systemd):

```ini
[Unit]
Description=ServerShell
After=network.target

[Service]
ExecStart=/usr/bin/java -jar /opt/serverShell/serverShell-prod.jar
WorkingDirectory=/srv/
Restart=always
EnvironmentFile=/etc/serverShell.env

[Install]
WantedBy=multi-user.target

## TODO

- [✅] security logs, who accessed what from where (v0.1.1)
- [✅] stop current song playing when starting a song from playlist (v0.1.1)
- [✅] Keep user sound setting between playback (v0.1.1)
- [✅] Better listing - have submenu by letter that shows all items that start with the letter (v0.1.2)
- [✅] beautify UI - part 1 (v0.1.2)
- [✅] breakup index.html (v0.1.3)
- [✅] Ereader functionality (v0.1.3)
- [✅] Search bar (v0.1.4)
- [✅] fix back button on virtual directories (v0.1.5)
- [✅] current file banner (v0.1.5)
- [✅] GameBoy Emulator functionality (v0.1.6-v1.0.0.1)
- [✅] beautify UI - part 2 (v1.0.0.1)
- [✅] back button overhaul (v1.0.0.1)
- [✅] js and css refactor (v1.0.0.1)
- [✅] dashboard history jumps to media (v1.0.0.2)
- [✅] split file and path js (v1.0.0.2)
- [✅] user self service portal (v1.0.0.2)
- [✅] gba audio fix(v1.0.0.3)
- [✅] copy protect(v1.0.0.3)
- [✅] no more ghost folders(v1.0.0.4)
- [✅] video player overhaul (v1.0.0.5)
- [✅] logging overhaul (v1.0.0.5)
- [✅] NEW AUDIO [stable: (stream / emulator) audio stack & emulator rewrite] (v1.0.0.6)
- [✅] Audio Only Stream Tweak (v1.0.0.7)
- [✅] Ereader fix [revert] (v1.0.0.7)
- [✅] dark style quickfix (v1.0.0.8)
- [✅] Full VOD stream (v1.0.0.8)
- [✅] Initial N64 Emulator setup (v1.0.0.8)
- [✅] Fix Search Bar (v1.0.0.9)
- [✅] User favorite playlist (v1.1-LTS)
- [✅] Playlist shows currently playing media label (v1.1-LTS)
- [✅] JumpTo media back button fix (v1.1-LTS)
- [ ] Basic Visualizer for Music Only Stream (Will add to v1.1-LTS)
- [ ] Full N64 Emulator functionality (Will fix and add to v1.1-LTS)

Maybe List
- [ ] ESLint/Checkstyle
- [ ] gba custom controls
- [ ] add polling logic to container
- [ ] view toggle
- [ ] eupub user controls
- [ ] Show some onscreen error if there was a problem with media playback
- [ ] logup service 
- [ ] split out services into microservices
- [ ] user media request service
- [ ] beautify UI - part 3
- [ ] Self.pentest
- [ ] 
