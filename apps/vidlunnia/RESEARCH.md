# Відлуння — your voice, any language (research note, 2026-09-02)

The app: record ten seconds of yourself, type a line, hear YOUR voice say it — in Ukrainian, Japanese, Georgian,
any of 600+ languages — optionally in a manner ("whisper", "cheerful"). The result is an audio file you share.
Every claim below carries how it was validated; the UNVERIFIED list at the end is what the build must not lean on.

## Why voice, and not video with sound (the survey)

`GET https://huggingface.co/api/spaces?sort=trendingScore&limit=200&expand[]=runtime` + each candidate's
`raw/main/app.py`, 2026-09-02 (memory `reference_hf_spaces_survey_2026_09`):

- every MiniMax-H3 (video + soundtrack), LTX-2.5, MiniMax Music 3 and both WASD world models declare
  `size="xlarge"` — charged 2×, never admitted on the anonymous 2-minute bucket. Not a product.
- voice-cloning TTS declares **15–60 s**: `k2-fsa/OmniVoice` 60 s (`@spaces.GPU(duration=60)` in app.py,
  VERIFIED), `samuel-vitorino/sopro-v2-turbo-tts` 15 s (en/pt/fr/de only), `patriotyk/styletts2-ukrainian`
  default 60 s (presets, no cloning). OmniVoice carries Ukrainian: `"ukrainian": "uk"` in
  `omnivoice/utils/lang_map.py` (658 quoted entries, VERIFIED on GitHub main).

## The Space, measured through the browser worker (pod p1, 2026-09-02, `vps/hfvoice.mjs`)

Parent page `https://huggingface.co/spaces/k2-fsa/OmniVoice` → iframe → gradio-app in ~6 s. The DOM:

| what | measured |
|---|---|
| tabs | `Voice Clone` (selected by default) · `Voice Design` (dropdown-driven — NOT drivable, the adapter never sets a Dropdown) |
| visible textareas, DOM order | `Text to Synthesize` · `Reference Text (optional)` · `Status` (output) — the FIRST is the prompt, as the adapter assumes |
| file input | ONE `input[type=file]` (hidden, `accept="audio/aac,…,audio/wav,audio/x-wav,audio/webm,…,audio/*"`) — `setInputFiles` on it works; after the upload the input is REMOVED from the DOM and the player shows `High volume · 1x` |
| instruct | inside a closed accordion `Instruct (optional) ▼` — opened by the adapter's accordion sweep, then a textarea labelled `Instruct` |
| run button | `Generate / 生成` (primary), n=19 — the RUN_RANK `generate` word matches it |
| progress | `.progress-text` = `processing \| 0.7/9.4s` (an ETA, no step counter); the toast area stayed empty |
| **the output** | NOT `<audio src>` — the `<audio>` in the frame is a `standard-player … hidden` with an EMPTY src (WaveSurfer owns playback). The result is a NEW download link: `a[href*="/gradio_api/file="]` — count 1 (the uploaded reference) → 2 at t=12.4 s; the `waveform-container` count grows 1 → 2 the same poll |
| GPU time | 9.4 s declared ETA, done ~2 s after the click (the model is tiny); page-open → result **12.4 s** |

So the adapter contract for `kind:"audio"`: snapshot `a[href*="file="]` hrefs BEFORE the click; the result is the
first fresh href once no GENERATING marker shows, held for two polls; fetch it inside the frame (same origin)
and keep the bytes when they start with `RIFF` or the blob type is `audio/*`. The uploaded reference is also
an `a[href*=file=]` — which is why the snapshot is taken AFTER the upload.

The first probe (before this note) failed with "no audio in time" because it waited for an `<audio src>` — the
counterexample that fixed the contract.

## Quota arithmetic

Anonymous ZeroGPU: 2 GPU-minutes per egress IP per day, admission needs `remaining ≥ declared` (60 s here), so
**two clones per pod bucket**, four pods, and the pod-rotator moves a refused pod to a fresh region (~7 s,
~55 regions) — the same machinery that carries vydyvo/mirage. A clone is charged its EFFECTIVE time (~10 s),
not the declared 60 s, so a fresh bucket pays for ~12 clones. Nothing here is 1–2 runs a day.

## The reference clip

- Recorded with the runtime's `mic.record()` (`/_rt/sensors.js`: getUserMedia races a timeout, MediaRecorder
  webm/opus, tracks stopped on every exit). 8 s by default; the Space's own guidance for cloning is 5–20 s.
- Decoded on the phone (`AudioContext.decodeAudioData`, the grain precedent), conditioned by the product's
  `rt/grain.js conditionSample` (mono, DC removed, silence trimmed, 8 ms edge fade, peak-normalised to
  −1 dBFS, with `quiet`/`clipped` verdicts) and written as PCM16 WAV by `rt/wav.js` (new, unit-tested) at
  24 kHz — an 8 s clip is ~384 KB, ~512 KB as a base64 data URL. The edge body cap is 3 MB.
- WAV, not the raw webm: `audio/wav` is first in the Space's accept list and needs no codec on the GPU box.

## The wire

`POST /feed/voice {text, audio: data:audio/wav;base64,…, instruct?, seed?}` → `{job}`; `GET /feed/voice/get?job=`
→ `{status:"pending", stage, elapsed, eta, pct}` | audio bytes (`content-type: audio/wav`, `x-audio-by`) |
`{status:"error", error:"busy"|null}`; `POST /feed/voice/cancel {job}`. Signed-in only (the systemic authWall
on 401). Client: `followOne()` in the core's `runtime/imagejob.js` (1.2.12) — the single-bytes contract the
slides follower never read. Cache key `text|audio-tail|instruct|seed` for a day: the same words in the same
voice never spend a second admission.

## Decision log (closed)

1. Pool = OmniVoice's Voice Clone tab only. Voice Design needs Dropdowns → out. Sopro (15 s) is not added:
   four languages and a second DOM contract for no product gain; revisit if OmniVoice dies.
2. Manner = the Space's `instruct` textbox, filled by LABEL (`fields: [{label:/instruct/i, value}]`) — a
   generic adapter capability, not an OmniVoice hack. Six manners, English strings, chosen by a Segmented.
3. Language = the Space's `Auto` default (it detects from the text). No language control in the app.
4. One fit screen: the voice (record / re-record), the words, the manner strip, one Generate; the result is a
   Transport island; history ("echoes") in IndexedDB, opened as a Sheet.
5. Under the gate the job yields a synthetic WAV from `rt/wav.js` (a vowel-shaped tone burst) in 90 ms —
   no network, no GPU; the mic is seeded (`gate` → a synthetic take), `data-live` marks the take.

## The manner is a vocabulary, not prose (measured 2026-09-02, pods p3/p4)

`Instruct` = "speak softly, almost a whisper" → the run ends in ~2 s with the Status box reading
`Error: ValueError: Unsupported instruct items found in …` — no toast, so the worker used to wait out its
whole 150 s deadline (now it fails fast on any textarea that starts with "Error"). `Instruct` = "Whisper" →
226 604 B of WAV in 15.2 s. The accepted items are the demo's own Voice Design options
(`omnivoice/cli/demo.py` `_CATEGORIES`, English half, joined by ", "): Male · Female · Child · Teenager ·
Young Adult · Middle-aged · Elderly · Very Low/Low/Moderate/High/Very High Pitch · Whisper · the English
accents. The edge validates against that list (`edge/voice.js cleanInstruct`); the app offers six.

## Preset voices (owner, 2026-09-02: "а чому я не можу без свого голосу просто текст написать для озвучки")

The clone tab REFUSES a run without a reference ("Please upload a reference audio") and the Voice Design tab is
dropdown-driven, so "just text" still needs a clip: the app ships two public-domain LibriTTS references
(the sopro Space's own examples, CC BY 4.0 LibriTTS) as `assets/voice-m.wav` (7.0 s, YIN pitch 125 Hz) and
`assets/voice-f.wav` (4.6 s, 175 Hz), conditioned to 24 kHz mono PCM16 by `rt/wav.js referenceWav` (335 KB +
220 KB). The voice strip = Female · Male · Mine (Mine appears with a take and is selected by recording);
Say it needs words and a voice, and a voice always exists. Decision 6 in the log.

## Named voices by language (owner, 2026-09-02: "адаптовані en та ua спейси з голосами … по іменам розбиті … мають бути усі")

The edge catalogue (`edge/voice.js VOICES`, `GET /feed/voice/voices`) — every speaker of the four Spaces the
worker can DRIVE, measured with `vps/hftts.mjs` through the parent page:

| Space | control | speakers | cost | measured |
|---|---|---|---|---|
| `robinhad/ukrainian-tts` | gr.Radio «Голос» | Тетяна · Микита · Лада · Дмитро · Олекса | CPU, no quota | Микита → RIFF 145 KB in 20 s |
| `patriotyk/styletts2-ukrainian` | gr.Dropdown «Голос:» (Multi tab) | 31 named speakers (`voices/*.pt`) | 60 s ZeroGPU | Тетяна Гончарова → 151 KB in 13 s |
| `Pendrokar/Kokoro-TTS` | gr.Dropdown «Voice» | 28 (20 US, 8 GB; f/m marked) | CPU, no quota | Adam → 155 KB in 15 s |
| `hexgrad/Kokoro-TTS` | the same | the same 28 | 30 s ZeroGPU | Bella → 167 KB in 11 s (the fallback row) |

Adapter facts each of these cost a round: a gr.Dropdown opens its `ul.options` on **ArrowDown** (a click left
`aria-expanded=false` on styletts2) and the option is CLICKED by text while open (typing filtered the list shut
and Enter took the highlighted neighbour); the input is found by its block label (`[data-testid=block-info]`)
and MARKED in-page — a `.wrap:has(span)` locator once resolved to the text box; the run button is picked by a
size filter (Kokoro carries a 1 px-high "Generate" under its tab bar) and clicked by MARK, not by index (a
dropdown's buttons come and go with focus); "Синтезувати" is a run verb, "Вербалізувати" is not; the options
list stays over the button until the input blurs. Named voices speak their own language and take no style.

## Character styles (owner, 2026-09-02: "пресети стилю готових знаменитих персонажів … збери топ 20 … мікрокартинки")

A style is a RECIPE from OmniVoice's vocabulary applied over a clone voice (mine / her / him), never a real
person's voice: `characters.js` (20 fictional characters, names + one-line voice descriptions in i18n
`ch_*`/`chd_*`, chosen by the catalogue agent), micro-pictures `assets/ch-<id>.webp` (256², generated on the
pods with the icon master prompt, measured by `icongeom.mjs`, converted by `mascot-tools/cards.mjs`). Verified:
"Male, Elderly, Very Low Pitch" over the male clip → 196 KB in 15 s. Adding a character = a row + two keys + a card.

## UNVERIFIED (do not build on)

- Ukrainian OUTPUT quality of OmniVoice with a Ukrainian reference — only the language map was read; the
  first Ukrainian clone (197 804 B, 15.3 s, pod p2) has not been listened to yet.
- Whether a manner other than Whisper is audible over a cloned voice (Whisper is the one run).
- The WebView (APK) mic: `MediaRecorder` exists in Android WebView ≥ 5; the shell's RECORD_AUDIO permission
  is the `microphone` row in `permissions.js`.
