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

## 2026-10-10 — many songs at once: a playlist link, or the account

The ask (owner): «вхід через ютуб мюзик або по лінці яка витягне треки з аккаунту; клік має скачати їх» — stop
copying one link at a time. Research only; nothing built.

### What was measured / read (how each fact was validated)
- **A playlist link needs no login.** On the VPS, `microspec-edge-media` (yt-dlp 2026.08.19, the pod's VPN exit):
  `yt-dlp --flat-playlist -J https://music.youtube.com/playlist?list=PLFgquLnL59alCl_2TQvOiD5Vgm1hCaGSI` →
  182 entries in 2.5 s. Each entry already carries `id, title, duration, channel, thumbnails, url` — enough for the
  list without a per-song meta call. VERIFIED (command run 2026-10-10).
- **«Liked music» (`list=LM`) is private:** the same call → `ERROR: [youtube:tab] LM: YouTube said: The playlist
  does not exist.` in 0.9 s. A link reaches public and unlisted playlists, not the likes. VERIFIED.
- **yt-dlp has no login of its own any more:** its wiki (Extractors.md, «Logging in with OAuth»): "Due to new
  restrictions enacted by YouTube, logging in with OAuth no longer works with yt-dlp. You should use cookies
  instead." — and cookies carry "the risk of it being banned (temporarily or permanently)". A PWA cannot read
  YouTube's cookies anyway. VERIFIED (raw wiki read).
- **The official login (Google OAuth, YouTube Data API v3)** lists `playlists.list?mine=true`, and the likes via
  `channels.contentDetails.relatedPlaylists.likes` → `playlistItems.list`; the revision history deprecates only
  `watchHistory`/`watchLater`/`favorites`, not `likes`. VERIFIED (docs + revision_history read). Those likes are all
  liked videos, not only music — INFERRED.
- **…but its policy forbids exactly this app.** developers.google.com/youtube/terms/developer-policies,
  «Audiovisual Content»: API clients "must not … download, import, backup, cache, or store copies of YouTube
  audiovisual content … make content available for offline playback". VERIFIED (page text read). An OAuth client
  for muzak cannot pass verification honestly; unverified, a sensitive scope is capped at 100 users for the
  project's whole life, shows the "unverified app" wall, and in Testing mode the grant dies after 7 days
  (support.google.com/cloud/answer/15549945). Cap + 7 days VERIFIED via the help page summary; that
  `youtube.readonly` is classed sensitive — UNVERIFIED.
- **ytmusicapi** (the real YT Music library: LM, saved albums) needs the same Google client since Nov 2024
  ("TVs and Limited Input devices", docs/source/setup/oauth.rst) — same policy, plus Python on the edge, plus open
  400 "Request contains an invalid argument" reports for family-plan / brand accounts (discussion #682). VERIFIED
  (docs read; the 400 is user reports).

### Owner's decision (2026-10-10)
«вхід має бути через гугл любого акаунта і витягнуті уподобайки» · «ніяких масових завантажень» · «лише список і
лінки, юзер сам натискає завантажити». A pet project for neighbours and close people, not monetized — the
100-user cap of an unverified sensitive scope is enough.

### What it means for the build
1. **Sign in with Google already exists** (edge `google.js`, `GOOGLE_CLIENT_ID`, live `/feed/google/config` →
   `241809443657-…apps.googleusercontent.com`; core `runtime/signin.js` loads GIS). It is IDENTITY only:
   `google.accounts.id` → an ID token the edge verifies (`verifyIdToken`) and seals into a sid; no access token
   exists anywhere, and "the Google token itself is never stored". Read 2026-10-10.
2. **Decided (owner: «як найкраще без костилів»): a SERVER-SIDE grant, the farm's GitHub pattern.**
   `github.js` already runs OAuth server-side ("the token NEVER reaches the browser"). The YouTube grant does the
   same on core: Google's web-server flow (`access_type=offline`, `include_granted_scopes=true`, `login_hint`,
   `state`), the refresh token kept per `users.id` in Postgres, sealed. Why not GIS's browser token
   (`initTokenClient`): a 1 h token per device, a popup that forum reports say dies in an installed Android
   PWA, and nothing for the APK. One server grant serves every surface:
   - browser / installed PWA — a top-level navigation to Google and back to `/muzak/`, no popup;
   - APK and Telegram — the authorize URL opens in the real browser (Google refuses embedded WebViews:
     `disallowed_useragent`, web-server doc) and the sealed `state` carries the user, so the browser needs no
     farm session; the app just re-reads the list once the grant exists.
   - Granular consent: the person can untick the YouTube box — the callback checks the granted `scope`.
   - A refresh token dies after 6 months unused, on revoke, or past 100 per account per client
     (identity/protocols/oauth2 «Refresh token expiration», read) → the list answers "reconnect", not an error.
   Routes (core, mirroring `/feed/gh/*`): `start` → the authorize URL · `callback` → exchange + store → 303 to
   `/muzak/` · `likes` → the list · `revoke` → Google's revoke + delete the row.
3. **The likes:** `channels.list?mine=true` → `contentDetails.relatedPlaylists.likes` → `playlistItems.list`
   (50 per page) → `videos.list` for the same 50 ids (category, duration) — 2 quota units per 50 songs of the
   10 000 a day. YT Music likes and YouTube likes are ONE list (Android Central, Engadget — secondary, so the
   owner's first sign-in confirms), so a music filter is needed: `categoryId` 10 (Music), ≤ 15 min (the
   download cap). INFERRED until the owner's list is seen.
4. **The screen:** the list of liked songs, each row = its link; the person taps download on ONE song and the
   existing song task (`/music/filetask`) does the rest. No download-all, no queue of many.

### Owner's side (the Google Cloud console — only the owner has the account)
- APIs & Services → enable **YouTube Data API v3** in the project of client `241809443657-…`.
- OAuth consent screen → Data access → add `…/auth/youtube.readonly`.
- Audience → publishing status **In production** (Testing = only listed test users, grant dies after 7 days —
  identity/protocols/oauth2, read). Unverified, every person sees «Google hasn't verified this app» →
  Advanced → continue; ≤ 100 people over the project's life.
- Clients → the Web client → Authorized redirect URI `https://dreamstudio.mooo.com/feed/google/yt/callback`;
  its **client secret** → VPS `~/edge/.env` as `GOOGLE_CLIENT_SECRET` (not there today — names checked).

### UNVERIFIED (the build must not depend on these)
- An installed Android PWA navigating out to accounts.google.com and back lands inside the app window.
- `youtube.readonly` classed sensitive — per a third-party guide (Phyllo), not Google's own list.
