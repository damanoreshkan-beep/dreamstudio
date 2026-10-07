# fonoteka — a shelf of your own songs: shared in from the phone, streamed back with seeking

Built 2026-10-07. Three repos moved for it: the runtime learned FILE shares, the edge learned to keep and stream
songs, and this app plays them. Every number below was measured or read on the box; UNVERIFIED is at the end.

## Decision log
- **Store on the VPS disk, not a CDN** (owner's instinct, confirmed): 181 GB free of 232, $0, one hop, full control
  of Range. R2/B2 are both free to 10 GB with zero/3× egress and stay the nightly-backup target; Supabase (1 GB),
  Telegram Bot API (getFile ≤ 20 MB, no Range), Drive (OAuth churn) were ruled out.
- **Signed-in only, with a quota**: 300 songs / 3 GB per account, one file ≤ 16 MB (nginx's `client_max_body_size`
  for `/feed`, read live). Upload and stream ride **sealed URLs that carry the session** (6 h, bound to the route) —
  the POST tunnel base64s a JSON body (13 MB of text for a 10 MB song, buffered twice) and an `<audio src>` fetches
  itself with its own `Range`, so neither can ride it.
- **"Keep" from remix and muzak** is server-side: those songs are made on the edge, so a button there asks the edge
  to make the file again into the shelf — nothing leaves the phone.

## Share INTO a PWA (VERIFIED on the primary sources)
- Manifest `share_target` with `method: "POST"`, `enctype: "multipart/form-data"`, `params.files: [{ name, accept }]`;
  `accept` takes MIME (`audio/*`) and dotted extensions (`.mp3`) — declare BOTH, Chrome lists for either but
  delivers reliably for both (MDN, web-share-target Level 2, Chrome docs).
- The POST is a navigation to `./share-target` that **only the service worker can read**: `event.request.formData()`,
  park the files in a cache, answer `303` to the page so a refresh never re-posts. `sw-core.js shareIn()` does
  this under the `ms-share` cache keyed by scope; `/_rt/share.js takeFiles()` collects and deletes.
- Chrome Android since 76 (2019); **iOS Safari cannot receive shares at all** (WebKit 194593 still NEW, 2026);
  Samsung Internet is Chromium-based but has no first-party table — test on the S25. The app must be installed;
  a changed share target needs a reinstall. File Handling / `launchQueue` is desktop-only.

## Streaming with seeking (VERIFIED: MDN, Chromium media source, measured on the box)
- Chromium sends `Range: bytes=N-` for every media load and every seek past the buffer; the answer must be **206
  with Content-Range** (and `Accept-Ranges: bytes`), or `seekable == buffered`. A 206 is not storable in the Cache
  API; `sw-core.js` already leaves Range requests alone.
- `edge/library.js` streams the slice from an open file (`Deno.open` → `seek` → a byte-limited stream), 416 past the
  end, framing headers kept through core; `remuxArgs` re-muxes the upload with `-c copy -map 0` so a VBR mp3 gets a
  fresh Xing frame (ffmpeg writes it by default: duration + seek table). Unit test: a 1000-byte file answers
  `bytes 100-199/1000` with exactly those bytes.
- nginx `/feed` already has `proxy_buffering off` and passes Range/206 untouched (no proxy_cache).

## The edge contract (edge/library.js)
`POST /feed/library/put?s=` raw body → `{ id, name, title, artist, size, dur, added }` · `GET /feed/library/get?s=`
→ audio/mpeg 200/206 · sealed JSON `list` → `{ songs, count, bytes, maxFiles, maxBytes }`, `del {id}`, `keep {url, v?,
genre?, vocal?}`. Errors are one word the app maps to a sentence: `too large` 413 · `too many songs` / `library full`
409 · `not audio` 415.

## The screen
Two panels. **Now playing**: the kit `Transport` (sm) — title/artist, seek bar, prev/next walk the shelf through
`advance()` with repeat "all"; one `Audio` element, `holdAudio` for the lock screen. **Songs**: the shelf readout
("3 пісень · 17.9 MB з 3 GB"), uploads in flight as pulsing rows, then the songs — title, `artist · length · size`,
the playing one marked with the accent dot and `sf-pressed`; delete through the runtime's history-backed confirm
sheet (a server-side delete has no undo). Under the gate the shelf is three fixture songs.

## UNVERIFIED / open
- Samsung Internet delivering a file share (Chromium ≥ 76 base; no first-party statement).
- Whether the APK shell hands in files (`share.incoming` carries text today; `kinds:["audio"]` exists only in the mock).
- A 16 MB cap means a 320 kbps song over ~7 min is refused; chunked upload would lift it without touching nginx.
- The host dir `/home/mrx/edge-library` is created by Docker on first `up` (root-owned, like edge-characters); it is
  in no backup yet — the R2/B2 nightly copy is the next step.
