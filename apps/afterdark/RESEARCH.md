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
