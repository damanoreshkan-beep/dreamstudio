# remix — a YouTube Music link → slowed + reverb · deep slowed · nightcore, tuned to the song

Built 2026-10-07. Every number here was measured (ffmpeg 8.1 on the laptop and in the media container), the
producer heuristics are cited from the guides they came from, and the UNVERIFIED list is at the end.

## Decision log
- **Dhammapada X API is dead** (no DNS record; the edge's own docs call `~/dhammapada_x` a dead project) and the
  farm never used it — every app talks to the edge through `/feed`. **No HF Space does this**: of ~35 search
  terms, every "slowed-reverb"/"remixer" Space was RUNTIME_ERROR or asleep, the one live upload-able Space
  (`teamup-tech/pedalboard`) has reverb and pitch but no tempo, and the one taking a YouTube link runs yt-dlp
  on HF, which YouTube blocks. The effect is DSP, not ML, so it is **ffmpeg in `media`**, next to `/feed/music`.
- **"Three in parallel on three pods"** → three parallel ffmpeg renders in `media` (6 cores, load 0.2). The
  browser pods have neither ffmpeg nor yt-dlp; they drive HF Space pages and are the wrong tool here.
- **Adaptive, not fixed** (owner, 2026-10-07): the song is measured and the presets follow it; the AI adds the
  one thing the audio cannot say (genre, vocal type) and a sentence for the screen. Without the AI the remix
  is the same remix with the base numbers.

## What people tune by ear (VERIFIED in the guides)
- Speed is a **percentage, never a target BPM**: 0.92 subtle · 0.85 classic · 0.80 deeper · 0.75 effect; genre
  tables agree in direction — rap/phonk 0.78–0.87 with 15–30 % wet, R&B/dream-pop 0.84–0.92 with 35–60 %, fast
  dense material (DnB 160+) at most 0.90 with 10–20 % (reverbfx.com, luminaaudio.com, soniclab.io).
- **Wet follows density and vocals**: a sparse solo vocal takes 45–60 % and a 3–5 s tail; a dense mix tops out
  at 25–35 % and 2–3 s "before it turns to mud". Reverb return: high-pass 100–400 Hz, low-pass 7–10 kHz on
  bright vocals, 20 ms pre-delay (Raycast `reverb 50 50 100 100 20 0`).
- **Nightcore** 1.20–1.30 "for 95 % of tracks", landing in 140–175 BPM; > 1.35 smears vocals; dry (reverb ≈ 0);
  a bass shelf is "essential"; bright vocalists cap at 1.20, rap at 1.15.
- **Varispeed always** — every guide says "change speed, not tempo"; pitch-preserving stretch smears transients.
- Output: streaming loudness −14 LUFS, −1 dBTP (generic mastering guidance; the slowed guides say only "normalise
  to −1 dB, export 320 kbps").

## What is measured instead (VERIFIED, `edge/remix.js`)
- **Tempo** — `aspectralstats` flux per 1024-sample hop → rectified difference → autocorrelation 60–190 BPM with
  a log-normal prior at 120 and parabolic refinement. **112.3 BPM on Never Gonna Give You Up (113)**, 129.2 on
  a 128 BPM click, 60.1 on a 60 BPM beep track. ffmpeg has no BPM filter; this is the whole estimator, unit-tested
  on synthetic click tracks (±1 BPM at 128/92/60).
- **Loudness** — `ebur128=peak=true` summary: I, LRA, true peak. The reference song: −13.0 LUFS, LRA 5.0, TP −0.3.
- **Brightness** — median spectral centroid (3 300 Hz on the reference). **Density** — median spectral flatness
  (0.108) + LRA: flat > 0.1, or flat > 0.06 with LRA < 5, is "dense"; flat < 0.03 or LRA > 9 is "sparse".
- **Vocal / bass weight** — RMS of a 3-octave band at 1 kHz over full RMS (0.99 here) and RMS < 200 Hz over full
  (0.73). One ffmpeg pass with `asplit=4`; the three `astats` blocks are read by filter index (4 / 7 / 10 in
  graph order — confirmed on the box).
- Analysis of a 3:33 song: **4.1 s** (two ffmpeg runs in parallel). YouTube carries **no genre** (`genre=NA`,
  `genres=NA` in every info dict); Spotify audio-features died in 2024; Deezer's public `bpm` has gaps
  (0 for major tracks) — our own tempo is used.

## The rules (INFERRED synthesis, anchored to the guides; `presetsOf` in `edge/remix.js`, unit-tested)
| | slowed | deep | nightcore |
|---|---|---|---|
| speed | 0.85; > 150 BPM +0.05; < 80 BPM −0.03; clamp 0.80–0.92 | 0.75; > 150 BPM +0.05; clamp 0.70–0.80 | 160/BPM clamped 1.15–1.30; ≥ 150 BPM → 1.12; bright + vocal-forward ≤ 1.20; rap ≤ 1.15 |
| tail | two bars at the new tempo × 0.5 dense / 0.7 mid / 1.0 sparse; 1.5–4 s | ×1.6 of that; 3–6 s | none |
| wet | 0.35; dense −0.13; sparse + vocal +0.10; instrumental +0.05; 0.15–0.50 | 0.50, same moves; 0.30–0.65 | 0 |
| return | HP 200 Hz (300 if bass-heavy) · LP 10 kHz (9 kHz bright, 12 kHz dark) · pre-delay 20 ms (40 with vocal) | LP ~7.5 kHz, +50 Hz, +10 ms; master LP 12 kHz | bass shelf +2.5 dB @ 120 Hz |
| genre shift | rap/phonk −0.02…−0.03 speed, −0.08 wet · rnb/ballad +0.08 wet · dnb +0.05 speed, −0.10 wet · ambient +0.12 wet, ×1.3 tail · edm +0.02 speed | same table | caps 1.12–1.28 per genre |
| loudness | `volume` = −14 − I, then `alimiter` at 0.89 (−1 dBFS) | same | same |

On the reference song (pop, sung): slowed 0.85× / 2.5 s / wet 0.22 → 96 BPM, **−14.1 LUFS, TP −1.4**; deep
0.75× / 4.0 s / 0.37 → 85 BPM, −14.1 / −1.1; nightcore 1.30× → 147 BPM, −13.5 / −1.3. Three renders in
parallel: **10.6 s** on the laptop; 6.0 / 7.8 / 4.2 MB at V2.

## The sound (VERIFIED on a synthetic tone, then the song)
- Varispeed: `aresample=44100,asetrate=44100*speed,aresample=44100`. Duration 8.00 → 9.41 s at 0.85 (= /0.85).
- Reverb: convolution (`afir`) with a **synthesised IR** from `aevalsrc` — decaying stereo noise, `exp(−t·6.9078/
  decay)` so −60 dB lands at `decay`, pre-delay inside the expression. **`afir`'s `dry`/`wet` are INPUT and OUTPUT
  gains, not a mix** — the first attempt came out at −76 dB. **`irnorm=2`** (L2) puts the wet path at the dry
  level (−24.2 vs −23.4 dB mean); the default L1 norm left it at −67 dB; `gtype` made no difference at all.
  The mix is `asplit` → return (`afir`, `highpass`, `lowpass`) → `amix=weights='1 wet':normalize=0`.
- The whole chain at 0.85 / wet 0.35: mean −25.0 dB, peak −11.1 dB on a −23.4 / −11.5 source — no clipping
  before the limiter; the limiter is a guard.

## The AI layer (`/feed/ai` mode `remix`, `edge/ai-prompts.js`)
Strict JSON from the title block (`ARTIST / TITLE / ALBUM / YEAR`): `{genre ∈ closed list, vocal ∈ rap|sung|
instrumental, why: one sentence in the UI language}`. Temperature 0.2, cached, accepted only when `genre` parses.
The edge turns the tags into numbers (`GENRE_SHIFT`); the model is told not to invent tempo, key or loudness. The
app runs it first (15 s race), then `analyze`, then the three `remix` calls together; a failed or slow reply
means the base rules — the screen never waits on it alone.

## The screen
Three panels on one tab. Link (field, paste, find) and Song (cover, title, byline, length) are muzak's. After
"Three remixes": the Song panel grows a mono readout — `113 BPM · dense mix · vocal up front · pop` — and the
AI's one sentence; the Remixes panel lists the three versions, each with `0.85× · 96 BPM · soft space`, a
skeleton while it renders, a save button when it lands, and the kit's `Transport` (sm) plays the picked one
through a single `Audio` element — prev/next walk the three via `advance()`. Under the gate the song, the
analysis and the three versions are fixtures (`rt/remix.js`), so the store card shows the populated screen.

## UNVERIFIED / open
- The density thresholds (flatness 0.03 / 0.06 / 0.1, LRA 5 / 9) come from one song and the guides' words, not
  from a corpus; they are the first numbers to re-set from real use (`x-remix` on every file says what ran).
- Tempo octave errors (half/double) on sparse or swung material — the prior at 120 BPM is the only guard.
- The 1 kHz 3-octave band as a vocal proxy reads 0.99 on dense pop; its discriminating power is INFERRED.
- Whether Gemini's genre for a Ukrainian-language title is reliable; `other` is the fallback and costs nothing.
