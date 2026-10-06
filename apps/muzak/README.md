# Muzak

Download songs from YouTube Music as MP3 files.

## Features

- Paste YouTube Music or YouTube links
- View song metadata (title, artist, duration, thumbnail)
- One-click download to device
- Clean, minimal UI
- Works offline (cached)

## Backend

Uses `yt-dlp` on the backend via `/feed/music/{metadata,download}` routes. No storage—files are downloaded on-demand and deleted after streaming.

## Usage

1. Paste a YouTube Music or YouTube link
2. View metadata and thumbnail
3. Click Download
4. MP3 saves to your device
