# afterdark — research & state map

**What it is.** A one-track techno rave: ONE live Icecast stream (`streams.rautemusik.fm/techno/mp3-192`)
behind a full-screen night stage — the `afterdark.frag` rave field (haze, five sweeping laser beams, a
strobe, crowd silhouettes) on `/_rt/glstage.js`, and over it a Three.js stage of rigged Mixamo dancers
(11 girls, any cast of 1..11) that move to the beat. One fit screen, one island (the dancer filmstrip + the
kit `Transport`), the profile tab. DARK-COMMITTED: a rave is dark by nature, so the stage ignores the theme
and the DOM chrome is dark glass in both farm themes.

## The recipe (what the build stands on)

- **Audio → beat.** `<audio crossOrigin="anonymous">` (set BEFORE `src`) → `MediaElementSource` →
  `AnalyserNode` (fftSize 1024) → destination; the `AudioContext` resumes from the Enter tap (autoplay
  policy). `rt/afterdark.js` (pure, unit-tested) turns a frequency frame into ONE `pulse`: kick band = bins
  1..6 (≈40–260 Hz at 44.1k), an adaptive baseline subtracts the track's steady loudness so only onsets
  spike, instant rise + 0.90/frame decay. No audio → `idleGroove` (~126 BPM), never a freeze. Drops
  reconnect with `tide.js`'s backoff — a live stream cannot resume, each retry is a fresh element.
- **The field.** `vary = [pulse, dancePhase, scenePhase, 1]`, `ink = tilt` (DeviceOrientation → pointer →
  auto-sway). The shader still declares the old sprite inputs (`cam`, `tex2`) from the chroma-key era; the
  view no longer feeds them, the 3D stage replaced the sprite.
- **The 3D stage** (`dancers.js`): Three.js 0.171 over esm.sh, `GLTFLoader` + `DRACOLoader` (decoders from
  gstatic). Every girl is the same Mixamo skeleton, so ANY clip retargets onto anyone: the app ships 11
  girl GLBs (0.15–0.7 MB, Draco) + 12 clip-only GLBs (a shared move library incl. a breathing idle), and an
  AUTO-CHOREOGRAPHER picks a tier (calm / light / groove / drive) from the smoothed energy, cross-fading the
  whole floor; each dancer swaps moves on her own clock. The kick punches a squash + a rim-light flash. The
  cast lays out as a crowd that fits the viewport width (cols from aspect). Probe-guarded; SKIPPED under the
  headless gate (Draco/addons/GLBs over CDNs flake CI) — the DOM carries every meaning there.
- **The floor (2026-09-11).** A matte near-black plane that fades out radially (alphaMap — a finite
  plane's far edge is a table-top horizon) catches the coloured lights, an additive light pool under the
  crowd breathes with the kick, and each dancer stands on a soft contact shadow that follows her HIPS
  bone. Three standard meshes; no shadow maps on a phone GPU.
- **Standing on the floor is a construction, not an estimate.** Measured (`glb-inspect`, the GLB JSON
  chunk): the rigs share the bone tree but NOT the size — hips bind height 0.37 (pirate), 0.71 (kaya),
  1.03 (michelle), 1.13 (akai) in their own units; each clip's `Hips.position` track is in its SOURCE
  rig's units. Two rules therefore hold in `dancers.js`: (1) a shared clip's hips track is scaled by
  target/source bind height when the action is created (root-translation retargeting, the bob stays
  proportional); (2) every frame, after the mixer, the foot bones (`*Foot`, `*ToeBase`, `*Toe_End`) are
  measured in world space and the root is lifted so the LOWER foot touches y=0. No per-rig constant, no
  bind-pose guess; a jump clip is flattened to a slide, which is the cheaper failure. Owner, 2026-09-11:
  «такого багу як по висоті бути не може, всі персонажі мають бути на сцені на полу стояти».

## The eye on the LIVE app (2026-09-11) — the audit

Shot with `vps/eye.sh` at 384×832 (both themes), 412×430, 360×340, the live page before AND after the
Enter tap (the 3D stage only exists on the live page: under `?mock` the gate skips it).

| Where | Defect (measured) | Fix |
|---|---|---|
| Live, before Enter | the status pill wrapped to two lines: «· ТОРКНИСЬ, ЩОБ УВІЙТИ» does not fit beside the station and genre | the state word shows only once entered; before that the Enter cover IS the state. `idle` = «Пауза»/“Paused” |
| Live, before Enter | the centred Enter ring + «УВІЙТИ» printed across the lead dancer's face | the cover sits in the upper third of the void, over the beams, never over the dancers |
| Live, entered | three figures floating in a void — no floor, no shadow, no ground light: toy figures, not a stage | the floor plane + light pool + contact shadows (`dancers.js`) |
| Light theme | the wordmark carried a pale halo (the runtime halos in the PAGE's tone — paper) over the dark stage | the halo is the stage's own night, in both themes |
| `rt/afterdark.js` | a stale 3-girl roster (`neon/acid/goddess`, sprite era) + `girlById`, exported and unit-tested, imported by nothing — the app's roster is `girls.js` (11) | removed with its test; the module is the beat signal only |
| `RESEARCH.md` | empty | this file |
| Store | no luminous icon (a hand-drawn SVG), no captures, no slogan | icon (Z-Image, round 1 take d: a dancer inside a ring of light), captures from the LIVE page after Enter, `slogan_afterdark` |

Not changed, noted: the clip library loads all 12 clips up front (~2.6 MB gzip-less Draco) on top of the
cast's girl GLBs; a phone on LTE sees the first dancers after ~1–2 MB. Tiered lazy loading is the next step
if the client log shows slow first-dance times.

## The state map

| Screen · state | Stage | Island / primary verb | Demotes at 412×430 · 360×340 |
|---|---|---|---|
| Rave · not entered | rave field + the cast in the breathing idle; the Enter ring in the upper third | filmstrip (cast chips) + Transport play | filmstrip scrolls; dock drops labels |
| Rave · connecting / reconnecting | field, dancers in idle; pill «· З'ЄДНАННЯ» blinking dot | Transport shows stop | same |
| Rave · live | pulse from the kick: strobe, beams, light pool, squash; pill «· НАЖИВО» pulsing dot | stop + mute | same |
| Rave · paused | dancers ease into the breathing idle, lights dim; pill «· ПАУЗА» | play | same |
| Rave · offline | pill «· ОФЛАЙН»; retries on `online` | play | same |
| Rave · cast change | tapped chip toggles a girl (last one stays); «Усі» = all 11 | — | — |
| Gate (`?mock`) | field only (3D skipped), state seeded `live`, no cover | same DOM | — |
| Me | the profile: account, theme, language, install, APK | — | — |

---

# v2 UPGRADE CYCLE (2026-09-11) — research consolidation

Owner brief: (1) kill the stream reconnect churn via a server-buffered proxy (~5 min, client plays ~5 min
behind); (2) dancers move to the KICK only, not to the SONG — make them dance in time; (3) more rave lasers +
projectors that react to bass AND rhythm, better dancefloor; (4) character textures are 512px ("500"), the
originals are 2K–4K — re-export at ≥2048; (5) curate rave-appropriate dance clips from Mixamo (current set has
salsa/bboy-floor/northern-floor that don't read as techno). Three research agents + local ground-truth.

## Front 1 — stream: HLS-DVR proxy on microspec-edge `media`

**⚠ LOAD-BEARING FINDING:** iOS Safari native HLS + `createMediaElementSource()` returns **all-zeros** to the
AnalyserNode (WebKit bug 231656, developer.apple.com/forums/thread/694697). So HLS on iOS = the beat detector
dies → visuals fall back to `idleGroove`. This is a PRODUCT DECISION (owner):
  - A) iOS accepts idle-groove visuals (audio + outage-resilience still work). Simplest.
  - B) feature-detect: iOS keeps direct-Icecast `<audio>` (beat works, churn stays); everyone else gets HLS DVR.
  - C) hls.js over Managed Media Source (iOS 17.1+) — whether Web Audio then gets samples is UNKNOWN, test on device.

**ffmpeg puller** (one 24/7 supervised child of `media`, mirrors clip.js Deno.Command; reconnect flags mean it
does NOT exit on Icecast blips):
```
ffmpeg -nostdin -hide_banner -loglevel warning \
 -reconnect 1 -reconnect_streamed 1 -reconnect_at_eof 1 -reconnect_delay_max 5 -rw_timeout 15000000 \
 -i https://streams.rautemusik.fm/techno/mp3-192 \
 -vn -c:a aac -b:a 160k -ac 2 -ar 44100 -f hls \
 -hls_time 4 -hls_list_size 90 -hls_delete_threshold 8 -hls_segment_type mpegts \
 -hls_start_number_source epoch \
 -hls_flags delete_segments+append_list+omit_endlist+program_date_time+temp_file \
 -hls_segment_filename /run/hls/seg_%d.ts /run/hls/live.m3u8
```
- `-reconnect_streamed 1` is MANDATORY (Icecast is non-seekable; without it ffmpeg won't reconnect). VERIFIED ffmpeg-protocols.
- 90 × 4s = 360s window = 6 min (1 min tail margin over the 5-min play-behind). `omit_endlist` = never "ended".
  `append_list`+`epoch`+`program_date_time` = restart continues the same playlist, clients re-sync by PDT.
  Transcode to AAC-in-TS (NOT copy) — AAC-in-MPEG-TS is the safe audio-only choice for hls.js + iOS-native;
  MP3-in-TS live has native-Safari failures. Do NOT set `hls_playlist_type` (forces list_size=0). VERIFIED formats doc.
- window <10 MB → put `/run/hls` on a 16 MB tmpfs; add `/run/hls` to media's --allow-read/write; nginx serves it.

**hls.js client** (defaults VERIFIED vs docs/API.md): `lowLatencyMode:false` (default true — MUST disable),
`liveSyncDuration:285` (sit ~4.75 min behind), leave `liveMaxLatencyDurationCount` = Infinity (no catch-up seek),
`maxBufferLength:330` (default 30 — RAISE so the client holds ~285s forward and rides a 5-min outage from buffer),
`backBufferLength:360`, `fragLoadPolicy` with generous errorRetry, and an ERROR handler calling `hls.startLoad()`
on fatal NETWORK_ERROR (long outage can exhaust retries → fatal, #5488). Create `MediaElementSource` ONCE in
`MANIFEST_PARSED`; `crossOrigin="anonymous"` before attach or the analyser gets zeros. iOS-native: seek to
`seekable.end - 285` on `loadedmetadata`.

**nginx**: serve tmpfs static; `.m3u8`→`application/vnd.apple.mpegurl` no-cache; `.ts`→`video/mp2t` short cache;
`Access-Control-Allow-Origin` the app origin (required for the analyser); reject `*.tmp`.
**Cost**: upstream 1 conn; egress unchanged (N×160k, same fanout relocated to us); disk <10 MB; AAC encode low single-% CPU.
Deploy edge ONLY via `vps/deploy.sh` (see [[feedback_microspec_cicd]]). Sources: ffmpeg-formats/protocols, hls.js API.md, WebKit 231656.

## Front 2 — dance in time: a pure beat-clock module + rate-locked clips

Root cause (confirmed in code): `dancers.js:240` sets clip `timeScale = 0.9+0.45*energy` — playback speed rides
LOUDNESS, not TEMPO; and the only musical input is `bassEnergy` bins 1..6, so tier/swap changes fire on wall-clock
timers + bass transients, never on musical boundaries. No library emits a phase-locked realtime beat clock
(web-audio-beat-detector = offline; realtime-bpm-analyzer = BPM only, still bass; essentia.js = offline). BUILD a
pure module `rt/afterbeat.js` (unit-tested like afterdark.js):
- **Input**: `getFloatFrequencyData` (dB, sharper than bytes) from a dedicated AnalyserNode with smoothing ≤0.2.
- **Multi-band spectral flux** (half-wave-rectified positive bin increases): `flux=0.5*low+0.3*mid+0.2*high` — all
  instruments contribute, kick still weighted. Adaptive whitening `baseline=baseline*.99+flux*.01; onset=max(0,flux-baseline*1.1)`.
- **100 Hz novelty grid** (10 ms bins by wall-clock → immune to rAF jitter), ring buffer 600 (6 s).
- **Tempo**: autocorrelation over the window every ~150 ms, search **BPM 118–140** (lags 43..51 @Fr=100) with a
  log-Gaussian prior centered 128 (σ0.15) → parabolic-interpolate peak → EMA-smooth, freeze when confident.
  Confidence = peak/mean(ac). This band-limit + prior is the half/double-tempo defense.
- **Phase (the clock)**: PLP single-freq DFT of novelty at f=bpm/60 over a 2–3 s Hann window →
  `phi=atan2(im,re); beatPhase=frac(f*tEnd - phi/2π); nextBeatAt=tEnd+(1-beatPhase)/f`. Self-correcting, rides drift.
- **Bar/phrase**: 4/4, `beatIndex` on wraps, `barPhase=(beatIndex%4+beatPhase)/4`; don't chase true downbeat on
  four-on-the-floor. Phrase = 16 beats.
- **Fallback**: confidence collapse (breakdown) → HOLD bpm, free-run phase (dead-reckon, don't reset); true silence
  → idleGroove; hysteresis 1.5s in / 0.5s out.
- **Latency**: lead accents by `outputLatency + 1/60` (predict, never react); measure on device, fallback ~0.08 s.
- Output added to `env`: `{bpm, beatPhase, nextBeatAt, barPhase, beatIndex, confidence}`.

**Rewire dancers.js**: `timeScale = clamp(trackBpm/clipBpm, .85, 1.15)` where `clipBpm` from
`beatsPerLoop=round(clip.duration*125/60)` (snap loop to whole beats); phase-align clip time toward the bar each
bar (ease 0.25); quantize tier change to phrase (`beatIndex%16==0`), per-girl swaps to bars (stagger by slot),
accents (squash/hop/light-pool) on `beatPhase` (anticipated), all with fallback to current behaviour when not
confident. Sources: FMP C6.3 (Müller), Ellis 2007, BTrack, MDN AnalyserNode.

## Front 3 — lasers / projectors / dancefloor

Beat-clock feeds the shader via free uniform channels — **TODO verify /_rt/glstage.js leaves env.y/z/w writable
and wire them** (beatPhase→env.y, barPhase→env.z, beatIndex→env.w). Core mechanic:
`beatEnv=exp(-fract(env.y)*5.); barEnv=exp(-fract(env.z)*3.); hit=max(pulse,beatEnv*.85); slam=max(pulse,barEnv);`
- **Lasers**: replace the atan-ray loop with **6 capsule-SDF beams from discrete moving-head fixtures** on a top
  rail (sdSegment, iquilezles distfunctions2d), core+glow (`glow²/(glow²+d²)`), **haze-coupled** (`*=.45+.9*haze`),
  fan/cross/cone pattern on `floor(mod(sph*.1,3))`, brightness `.35+1.3*hit`, colour `ravePalette(env.z+i*.11)`. ×0.40 master.
- **Projector cones**: 3–4 soft wedges (`smoothstep(half,half*.15,abs(a-axis))`), sweep on sph, **snap on downbeat**
  `react=.12+.9*slam+.5*pulse`, localised strobe on hardest kicks, colour per-bar. ×0.22 master.
- **Dancefloor**: put the reactive emissive grid in **Three.js (dancers.js)**, NOT the shader — the matte floor
  plane (opacity .85) occludes any shader-background grid, and only a 3D floor has correct perspective/tilt under
  the dancers. New additive ShaderMaterial plane (scrolling grid + centre ring, `beat=.25+.9*max(pulse,exp(-uBeat*5))`,
  colour cycles per bar), driven next to lightPool.
- **Palette**: discrete brand ramp magenta→violet-bridge→green→gold, cycled on the bar; keep gold as haze/ambient
  (warm haze vs cool beams = "premium club" not "RGB gamer"). Max 2–3 hues on screen.
- **Mobile GPU**: ≤7 lasers + 4 cones; add animated IGN dither (`fract(52.9829189*fract(dot(p,vec2(.06711056,.00583715))))`
  at ~2/255) to kill OLED banding on the near-black BG; highlight rolloff `col=mix(col,col/(col+.6),.5)` so additive
  peaks don't wash out the 3D dancers + dark-glass DOM. Sources: iquilezles (SDF, palettes), demofox/bartwronski (IGN).

## Front 4 — character textures → 2048

Measured: all 11 girl GLBs carry **webp 512×512 q72** (that's the "500"). Originals in
`~/mixamo-library/glb-raw/*.glb` (11, full-res JPEG/PNG 2048–4096). Fix = re-run the documented pipeline
([[reference_mixamo_pipeline]]) with `textureCompress({targetFormat:'webp', resize:[2048,2048], quality:~88})` +
quantize + draco, from glb-raw → assets/<girl>.glb. Source→girl map: kaya-northern→kaya, michelle-house→michelle,
arissa-snake→arissa, eve-shuffling→eve, sophie-robot→sophie, nightshade-twist→nightshade, louise-wave→louise,
kachujin-salsa→kachujin, jolleen-bboy→jolleen, pirate-hiphop→pirate, arms-hiphop→akai. Independent of dance
selection (characters unchanged). Watch total asset size (512→2048 ≈ 6.5 MB → est. 20–40 MB); consider KTX2/Basis
if too heavy for the SW precache. Foot-grounding in dancers.js is by-construction so rig changes are tolerated.

## Front 5 — rave dance curation (Mixamo)

Catalog pulled via API (147 Dance motions, cookie-auth, X-Api-Key mixamo2). 36 rave-appropriate candidates
gathered with animated previews; gallery built for owner pick. Non-rave current clips to retire: salsa (kachujin),
bboy floor (jolleen), + weak twist (nightshade). Strong rave replacements: House v2/v3/v4, Shuffling, Running Man
(3 variants), Snake, Robot v1/v2, Tut v1/v2, Quake, Locking, Step, Just Listening (calm), Body Wave. Download via
the SPA Download button driven by `__mxGrab(char,dance)` ([[reference_mixamo_pipeline]]); clips are retargetable
onto any girl (shared skeleton), so they become clip-only GLBs in the shared move library. AWAIT owner selection.
