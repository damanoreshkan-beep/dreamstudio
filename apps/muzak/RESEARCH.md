# Muzak — Research & Design

## Problem

User wants to download songs from YouTube Music with metadata preview before download.

## Solution

### Backend (`/feed/music/*`)

Two routes:
- `GET /feed/music/metadata?url=…` — fetches song metadata via `yt-dlp --dump-json`, returns title/artist/thumbnail/duration
- `POST /feed/music/download?url=…` — downloads and converts to MP3 via `yt-dlp -x --audio-format mp3`, streams temp file, deletes after

No storage—temp file is cleaned up immediately after streaming.

### Frontend (muzak app)

Simple, minimal:
1. Input field + Paste button
2. Fetch metadata on URL entry
3. Display thumbnail, title, artist, duration
4. Download button triggers MP3 stream
5. Beautiful spinner during fetch/download

## Design Decisions

- **No metadata caching**: Fresh data every time (respects source changes)
- **No storage on backend**: Temp files only, cleaned immediately
- **Simple UI**: Single card layout, clear flow
- **Keyboard support**: Enter key to fetch metadata
- **Error handling**: Clear messages for invalid URLs and network errors

## Future

Could add:
- Playlist download (batch)
- Quality selector (128/192/320 kbps)
- History of downloaded songs (client-side only)
- Preferred format (MP3/M4A/OGG)
