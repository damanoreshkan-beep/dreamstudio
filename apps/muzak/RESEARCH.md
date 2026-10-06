# muzak — a song from a YouTube Music link, as a tagged mp3

Rebuilt 2026-10-06 on the farm's rails (the first cut mounted itself outside the runtime, had no spec and
copied another app's icon).

## The edge half (microspec-edge, media role)
- `GET /feed/music/meta?url=` → `{ id, title, artist, album, year, duration, cover }`;
  `GET /feed/music/file?url=` → `audio/mpeg` as an attachment `Artist - Title.mp3`, ID3 + cover embedded.
- yt-dlp beside ffmpeg in the media image; only the 11-char id reaches it as a canonical watch URL; songs
  ≤ 15 min; two downloads at a time (a third gets 429 → "try in a minute").
- Measured through the pod's VPN exit: meta ≈ 5 s, a 3:33 song to mp3 ≈ 18 s (5.3 MB at V2).
- A latent forwarder bug surfaced here: media's server gzips JSON, core passed the compressed framing on
  with an inflated stream — fixed in the forwarder (`forwardToOpen`).

## The screen
One tab, two panels. Link panel: the field, paste-from-clipboard, find (Enter works). Song panel: cover
(or a note glyph until the picture lands), title, "artist · album · year", length, one primary button.
The download is fetched as a blob and saved through an `<a download>` — the file takes ~20 s to prepare,
so the button says so ("Готую mp3…") instead of looking dead; a skeleton stands in for the card while the
song is read. Under the gate the link and the song are fixtures (`rt/muzak.js`), so the card is what the
store shows. Errors are one sentence each, keyed by the edge's status (400/413/429/other).
