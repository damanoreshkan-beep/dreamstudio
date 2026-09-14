# blackout — research & state map

A lane runner in an endless night city on afterdark's Mixamo cast (the Subway Surfers rework, 2026-09-13): she runs
by herself, a swipe moves her across four lanes, up jumps, down slides, coins on the way, the horde at her heels; a
runner of your own from words or a photo for 1000 coins. Decisions and the concept live above the code (the owner's
meta layer); this file is the evidence the build stands on. The sections below Ф3 describe the joystick game this
replaced — kept for the numbers that still hold (assets, textures, pools, clips, the see pod).

## Ф3 — the lane runner (2026-09-13, Claude Fable 5.1)

**The owner's brief:** «переробити … механіку у стилі сабвейсьорф, прибери все зайве. 4 умовні доріжки з преградами і
за нами толпа зомбі»; «не вигадувати а взяти готові механіки з гітхабу». Read first: the Play Store captures of Subway
Surfers (the chase camera high behind the runner, three lanes, coin lines and arcs over the low barriers, trains as
the lane blockers, the HUD = score + coins, nothing else) and two open Three.js lane runners, both read in full:

- **neon-rush** (`xnirajjatwer/neon-rush`, no licence, 2026-09) — `inputManager.js` (a swipe = the first axis past a
  threshold, ONE action per touch; keys ←→↑↓/WASD/Space), `player.js` (lane lerp `1 − e^(−13·dt)`, lean
  `−vx·0.05` clamped ±0.35, gravity −34 / jump 12.5, slide 0.62 s), `obstacleManager.js` (rows by pattern: vehicle ·
  dodge 1–2 lanes · uniform jump · uniform slide (chance 0.55 + 0.25·d) · mixed; safety net: never every lane a
  dodge), `collisionSystem.js` (**resolved by ACTION, never box maths**: `jump` safe only in the air above 0.32,
  `slide` only while sliding, `dodge` never — z window 0.85, x tolerance 1.05), `segmentManager.js` (40 m segments,
  130 m ahead, 18 behind, 1–3 rows by difficulty, coins on the open lanes between rows), `game.js` (speed 9 → 24 over
  1600 m).
- **jyoti-run** (`BIRAL0-0/jyoti-run`, no licence, 2026-09) — `Teacher.js` + `config.js TEACHER`: the chaser state
  machine with its fairness guards — appears/menaces at 5.5 behind after the 1st mistake, surges to 3.2 for 0.6 s,
  the 2nd mistake is the catch, −1 mistake per 150 clean metres, a catch needs ≤1.5 sustained 0.4 s, a lunge grace
  while mid-jump/slide; `Difficulty.js` (speed linear, spawn chance smoothstepped 500 → 1500 m).

Neither carries a licence, so nothing is copied verbatim: the MECHANICS and their numbers are ported into our own
files (`world.js rowStates` = spawnRow widened to four lanes; `stage.js` = player + collision; `world.js chase`
= the Teacher in metres behind the runner). What we set differently, and why:

| Ours | Theirs | Why |
|---|---|---|
| 4 lanes × 2.2 m (x = ±1.1, ±3.3) | 3 × 2.2 | the owner's brief; the 10 m street holds them with 0.6 m to the kerb |
| gravity −22, jump 7.4 → 1.24 m in 0.67 s | −34 / 12.5 → 2.3 m | a 0.6 m barrier needs 1.2 m; 2.3 m reads as flying |
| `jump` safe above y 0.35 | 0.32 | the same idea, our barrier is 0.6 m high |
| slide 0.75 s (the Running Slide clip fitted to 0.85 s) | 0.62 | the Mixamo clip's own slide phase |
| speed 6.5 → 15 m/s over 1500 m; a stumble dips to 0.45 and recovers in 1.1 s | 9 → 24 / one hit = death | one-hit death is the SS feel only with the inspector; we keep the two-stumble rule |
| the horde menaces at 5.2 m, surges to 2.3, grabs at 1.1; −1 mistake / 150 m | 5.5 / 3.2 / 1.5 / 150 | the camera sits 7.2 m behind: at 5.2 the zombies fill the frame's low edge, at 2.3 they are at her heels |
| rows 1–3 per 24 m chunk, 4 chunks ahead / 2 behind | 1–3 per 40 m, 130 m ahead | the chunk grammar the street already had |
| `dodge` = a dumpster or a car across the lane, at most 2 lanes | a full barrier, at most 2 of 3 | the props the street already ships |

**Removed as «зайве»:** the joystick, the orbit camera, the punch and the smashable bins, the sidewalk dancers,
the Blackout wall (behind the camera, it was never in frame), and **Rapier** — a lane runner has a flat floor and
resolves obstacles by action, so the physics engine (2.86 MB, `@dimforge/rapier3d-compat`) left with the joystick.
`dpad.js` is no longer imported.

**Clips added (the box, `pipeline/export-clips.mjs`, Mixamo API, 2026-09-13):** Running Slide `119710901` (47 KB),
Jogging Stumble `121450901` (48 KB), Zombie Running `104020901` (33 KB), Zombie Attack `102320906` (80 KB), Zombie
Idle `104110902` (65 KB, unused yet). A one-shot's `fitTo` sets its timeScale so the clip plays out inside the
move's window (jump 0.7 s, slide 0.85 s, stumble 0.9 s).

**A runner of your own (1000 coins).** The generator is `rt/genchar.js` — afterdark's two-job pipeline (prompt →
`/feed/image` k:2 portrait → `/feed/character` TRELLIS + Make-It-Animatable) promoted to the product's rt/ as
`makeGenerator({jobKey, $loading, $pct, $error, onDone, onFail})`; afterdark's `genchar.js` is now a 12-line binding.
The PHOTO path adds one hop: `POST /feed/vision {image, mode:"look"}` (edge `vision.js`, the `caps/vision.js`
cascade that existed since 2026-08-18 with no route: Gemini keyed rows → OVH Qwen2.5-VL, inline bytes only) answers
the English LOOK paragraph — gender/age impression, build, hair, clothing, footwear, accessories, **no identity** —
which then rides the words path unchanged. The coins leave the wallet when the job starts (`spend`) and come back
on any failure (`onFail` → `refund`); a resumed job that fails after a reload does not refund (it was charged in the
run that started it and the edge may still finish it). The wallet is the local `persistentAtom` the skins already
spend — a client-side price, like the skins (a server-authoritative wallet is a separate decision).

**State map (the run tab):** `data-state` idle | run | over · `data-phys` loading | ready | failed | skipped ·
`data-lane` 0…3 · `data-near` 0…1 (the horde's closeness — the red edge and the dimming) · `data-acts` (the verbs
counted, keys and swipes alike) · `data-dist` / `data-coins`. The skins tab: `[data-mine-grid]` (the create card
`[data-gen-open]` + my runners, each with `[data-remove]`), `[data-skin-grid]` (the cast), the sheet
`[data-gen-form]` with `[data-gen-mode]` words | photo, `[data-gen-prompt]` / the intake `Chooser`
(`[data-src-upload]`, `[data-src-camera]`) → `[data-gen-photo]`, `[data-gen-go]`, `[data-gen-progress]`,
`[data-gen-error]`.

**Sound (2026-09-13, evening; owner: «звуків багато треба щоб користувач повністю погрузився … музику з afterdark
підключити, у такт світло фонарів»).** No text-to-audio capability existed on the edge; the catalogue through the HF
API from the VPS (13 synonyms, 81 RUNNING Spaces) and four probes on the pods (`vps/hftts.mjs`, one prompt) gave
`/feed/sfx` (edge `sfx.js`, the voice route's shape, kind:"audio" on the browser workers):

| Space | hardware | probe | verdict |
|---|---|---|---|
| `fffiloni/audiogen` (Meta AudioGen) | bare ZeroGPU | 5 s WAV 160 KB in 15 s, "Submit" | leads — made for effects, no fields |
| `stabilityai/stable-audio-3` | bare ZeroGPU | 8 steps in 16 s, but 60 s of WAV (10.5 MB) | second — radio "Model" → Small SFX, "Duration" by label |
| `fffiloni/audioldm2-…-API` | bare ZeroGPU | 10 s WAV 320 KB in 23 s | tail |
| `artificialguybr/Stable-Audio-Open-Zero` | duration=120 | "ZeroGPU worker error RuntimeError" | dropped |
| `OpenMOSS-Team/MOSS-SoundEffect-v2.0` | duration=180 | never admitted anonymously | dropped |
| `Wubble-AI/…-v1` | cpu-basic | answered nothing twice | dropped |

The library (`docs/research/sfx-tools/sfxraw.mjs` inside the edge container → `sfxpack.mjs` → `assets/sfx-*.mp3`,
mono 44.1 kHz VBR, 26 → 25 effects, 630 KB): AudioGen answered every prompt at exactly 5.00 s (its duration slider
steps 5/10, the 10 s asks came back 5 s), one bucket per pod per 1–2 effects (the first batch lost 22 of 26 to a
refusal each; detached with 25 s pauses it took 105 s for 22). One trap: two prompts on two pods came back byte-identical
(`heartbeat` = `lamp-hum`, md5 ea96f57b) — a re-run with a reworded prompt replaced it; check md5 before shipping.
Measured (ffmpeg volumedetect): means −6 … −24 dB, so the mix lives in `SFX` gains (land −6.7 dB → 0.6, coin −24 dB
→ 0.5); one-shots trimmed with a 0.15 s fade (jump 1.2 s, land 1.0 s, hits 1.2–1.6 s), beds kept whole to loop.

The engine (`sound.js`): one Web Audio graph from the core's `createEngine`; effects are `AudioBufferSource`s with a
±spread on `playbackRate`; beds (steps, wind, lamp hum, the horde's moans and running, the heartbeat) are looping
sources whose gains follow the run every frame (`bedTo`: the steps' rate = speed / 4.4, the horde = 0.25 + near·0.75,
the heartbeat from near 0.45). THE MUSIC is afterdark's station, the direct Icecast feed (CORS-open, so the analyser
hears it — afterdark's own fallback path; the DVR/hls.js path is not needed to run, so it is not here), into the same
context; two analysers as in afterdark (smoothed → `bassEnergy`/`stepPulse`, raw → `spectralFlux`/`stepBeat` from
`rt/afterbeat.js`); `beat.phase` (latency-led) drives `world.pulse(1 − phase)` — every lamp head, cone and pool shares
one material, so the street flashes on the kick. The Run tap is the gesture: `ctx.resume`, the library loads, the
stream starts. No audio under the gate (`createEngine` returns null); the mute key in the HUD (`[data-mute]`) holds
`blackout:muted`.

**Gotham, the second level, the armoury, the selfie (2026-09-13, night; owner: «баг з Т після прижку. біг анімація …
підглючує. не вистачає естакад 2 рівня і тунелів … енергетики … швидкість 2x … більше препятствій … небо з луною. кажани.
готем сіті … пистолет та вороги попереду … різні зброя … у магазині … мініатюри селфі ігрока і його емоції … nfs
carbon … кіберпанк … хочу вау. хочу екшн»).**

- **The T after a jump** was the mixer: a `LoopOnce` action that is not `clampWhenFinished` is DISABLED when it ends
  and the rig snaps to its bind pose until the next `play()` — a frame or more at low fps. Every one-shot now holds
  its last pose and the landing/slide-end/stumble-end cross-fade into the run explicitly (`oneShot = null; play("run")`).
- **The twitching run** was the clip's timeScale: `speed / 4.4` reached 3.4× at 15 m/s. Clamped 0.9 … 1.6 (1.9 boosted).
- **Decks** (`world.js deck/floorAt`): from chunk 3, when none runs, on one or two neighbouring lanes, 1.5–2 chunks
  long; ramp 5 m → top 2.4 m → ramp 5 m; rails and posts. `floorAt(lane, z)` is the floor under her: the stage moves
  her on it (`y = floor` on the ground, gravity above it, a run off the edge = a fall); a floor more than 0.6 m above
  her feet while grounded = the deck's end head-on → the grab (boosted: an automatic vault). Obstacle rows skip a lane
  whose floor changes across the row; coins ride the deck. **Tunnels**: a whole chunk of walls, ceiling and tube
  lights (they pulse with the lamps), no buildings; every 6+ chunks, never over a deck; the wind bed drops to 0.3 inside.
- **Density:** rows 1–4 per chunk (was 1–3), difficulty reaches 1 at 800 m (was 1200).
- **The energy can** (`drink`): one per ~5 chunks on a lane with no row within 2.5 m; 6 s of ×2 speed (eased in over
  a third of a second), the fov 60 → 70, a cyan rim on the HUD, the `boost` bed; whatever is in the lane is knocked
  flat (a walker dies and pays).
- **Walkers** (`spawnWalker`): rowStates now hands out `walker` lanes (≤ 2 blocking lanes per row with the dodges);
  a cast clone on Zombie Walk `121340901` shuffling toward her at 0.7 m/s, 2 hit points, Zombie Reaction Hit
  `102460901` on a hit, Zombie Death `121380901` (clamped) when it drops; a body stays 6 s. Run into one: she shoves it
  down and stumbles. Shoot it: +5 coins.
- **The armoury** (`state.js WEAPONS`, data): pistol free (1 dmg, 3/s, 8 rounds, 1.1 s reload, 28 m), shotgun 350
  (2 dmg, 1.2/s, 4 rounds, the lanes either side too, 14 m), SMG 600 (1 dmg, 8/s, 24 rounds, 24 m). A TAP anywhere on
  the stage (a touch that lifts before 40 px and 400 ms) or Space/X fires; `world.shoot` picks the nearest live
  walker in range in the lane (± spread); a tracer (a lit 1.4 m rod at 60 m/s) flies to it or to the range; the gun
  is a primitive in her `RightHand` bone with a muzzle that flashes the weapon's tint. Empty → the reload runs
  (`···` in the HUD). Bought and wielded on the shop tab (`[data-arm]`), the same wallet as the skins.
- **The selfie** (owner: NFS Carbon): a second render pass of the same scene from a 34° camera on her shoulder
  looking back at her face, scissored into a 132 px square at (16, 150) CSS px (`FACE_PX`); the HUD draws the ring
  over it (`[data-face]`) and tints it by `data-mood` (hit/caught red, boost/kill/smash cyan, coins gold). The camera
  shakes on a landing or a hit (`face.shake`, decays at 6/s) and zooms on a jump or a can (`face.zoom`). The cast has no
  facial blendshapes — the emotion is the camera's, like a helmet cam.
- **The sky and the bats:** a 7 m moon with a sprite halo and 420 stars ride with the camera 170–190 m out, `fog:
  false`; a flock of 14 bats (two-triangle V's in an InstancedMesh, wings on a 9–15 Hz sine) crosses the street
  every 26–56 s, 4.2 s per pass, with the `bats` effect. Gothic roofs: a spire on 45 % of the buildings (14–56 m
  tall now), an antenna on 35 %, a neon sign (five cyberpunk hues) on 50 % of the faces.
- **Nine more effects** (`sfx-jobs4`): the three shots, the reload, the hit and the death of a walker, the can, the
  boost bed, the bats — AudioGen, 53 s for nine, no duplicates (md5 checked).

**Coins for Stars, the renders, the menu (2026-09-13, night; owner: «кнопку поповнити баланс зірками … картинки зброї,
а не іконки … головне меню перероби»).**

- **The purchase rides the Stars rail the farm already had** (`edge/stars.js`, `runtime/tma.js`): a tip took the Mini
  App's initData; a coin pack takes `{sku}` from a SEALED session instead, so the invoice link works from a
  browser or the APK (Telegram opens `t.me/$…` itself) as well as through `openInvoice` inside a Mini App. Packs are
  data on both ends (edge `COIN_PACKS`, `rt/coins.js PACKS`): c500 25★ · c1500 60★ · c5000 150★ — cheaper per coin as
  they grow, the largest marked best value. The webhook parses `coins:<user>:<sku>:<ts>` and writes `coin_purchase`
  (`charge_id` unique: a retried update never credits twice); `/feed/stars/claim` flips the caller's uncredited
  rows and answers the sum — the wallet grows exactly once per purchase. Measured live (probe session): invoice 200
  with a real link, claim 200 `{coins:0, purchases:0, packs}`; the paid path waits for the owner's phone.
- **The claim is a passive read.** The first cut used `requireUser` and its `{"error":"sign in"}` body — the
  runtime's authwall matches that body, so a boot-time claim opened the sign-in wall on every visitor (the see-pod
  drive caught it: a 401, then Google's GSI errors). Now: `whoami` with a plain 401, and the client never asks
  without a session id in storage (character.js `/mine` is the precedent).
- **Weapon renders** (Z-Image through `mascot-tools/genraw.mjs`, two takes each): "game inventory item render …
  three-quarter view … rim light … pure black background, no text, no hands" — every first take usable (a faint
  engraved word on the pistol's slide is the model's habit); 512 px webp, `assets/arm-<id>.webp`, on the shop cards
  and the menu.
- **The menu** replaces the cover: the stage keeps rendering with her idle under the moon and the camera circling
  (r 6.2 m, a 69 s lap, eye height 2.3 ± 0.5), the title and the tagline over it, three cards (runner → the shop,
  weapon → the shop, coins → the top-up sheet), the run key, the last run's distance and coins. The selfie pass runs
  on the run only (the menu has no ring for it, and it drew a bare square).

**The sound settings and the default balance (2026-09-14; owner: «зроби налаштування звуку. ефекти. музика і так
далі» + «сам по дефолту збалансуй звук»).**

- **Measured before mixed.** `ffmpeg -af ebur128=peak=true` over all 34 effects and 25 s of the stream: the effects
  spread 14 LU (land −27.3, slide −25.1 … can −10.9, crow −13.3), coin's true peak +5.1 dBTP, the stream −9.8 LUFS
  (LRA 0.6 — mastered techno). With the old hand gains the stream sat at ≈ −13 and the action at −26…−32: the music
  buried the game by 15–20 dB. The beds (steps, horde, wind, heartbeat) ignored their `gain` field altogether —
  `bedTo` drove the gain node to the stage's 0…1 directly.
- **The balance is data:** each `SFX` entry carries its measured `lufs` and the loudness its ROLE plays at (`at`), the
  gain is `dbToGain(at − lufs)` (rt/scifi.js, unit-tested). Roles follow the usual game-mix order — what hurts her
  −17, the arms −17…−20, the horde −21…−23, her body −22…−25, reward −19…−23, the city −27…−36 — and the music at −26,
  ~8 LU under the action (a dense stream under effects that must read). A beds' 0…1 is now a share of its balanced
  level. A `DynamicsCompressor` brickwall (−3 dB, 20:1, 3 ms) sits after the master: stacked hits over the kick never
  clip a phone speaker.
- **The sheet** (menu → sliders glyph): the kit's `Segmented` on/off (the daisy `toggle` collapsed to 6 px in a flex
  row on the see pod; the kit has no toggle, the profile uses segments) and four kit `Slider`s — volume, music,
  effects, the city — on `faderGain` (half the travel −27 dB; linear reads loud until the bottom). Levels persist as
  `blackout:mix`. Music at 0 does not fetch the stream at all (driven: `live:false` at 0, `live:true` after raising it
  mid-run). Dragging effects/city plays a coin/crow through that bus. The run's HUD keeps the one-tap mute: a sheet
  over a live run would get her caught.

**Not measured yet (UNVERIFIED until the S25):** a real Stars payment end to end (the webhook's `coins` line, the
claim on return); whether the Icecast stream plays inside the WebView APK (afterdark
plays it in Chrome; the shell's WebView is the open question), the beat lock time on the phone (afterdark measures
~4–8 s), and real fps of the horde (10–12 skinned clones + the street) —
`report("stage.fps")` at frame 720, `bash vps/logs.sh blackout`; the swipe threshold (40 px) on a 6.9" screen; whether
the Zombie Running clip's timeScale (0.6 … speed/6) reads as a chase at 15 m/s.

## Ф2 — the premium street (2026-09-13, Claude Fable 5.1; measured on the box: dev `?live`, own headless Chromium/SwiftShader)

- **Props are Kenney CC0** (Car Kit + City Kit Roads/Suburban, kenney.nl zips): sedan, taxi, suv, van, hatchback-sports,
  dumpster (×4), light-curved (×7), construction-barrier (×8), planter (×3.2), construction-cone (×8) merged into ONE
  draco GLB `assets/props.glb` (67 KB, 3 palette textures) by `~/mixamo-library/pipeline/_props.mjs` (gltf-transform:
  flatten+join per model → wrapper node = the prop name → mergeDocuments → unpartition → dedup → webp 512 → draco).
  **Name the merged scene** (`setName("props")`): GLTFLoader uniquifies node names, and a scene named "sedan" turned
  the sedan wrapper into `sedan_1` — `P[kind]` undefined, `.size` TypeError in `car()`.
- **Textures are Z-Image (zimg, 1024², "seamless tileable … orthographic")** → webp `assets/tex-*.webp` (FLAT: `deploy/build.mjs` copies only top-level files of `assets/`, a `textures/` subdir 404s on prod — measured after the first deploy): facade (dark
  brick, 96 KB) + graffiti (269 KB) + asphalt (275 KB) + sidewalk (paving slabs, 2 m tiles on the kerb top) + metal
  (512², 12 KB). The HF guest quota ran dry mid-batch — a retry loop with 90–240 s backoff got every prompt through.
  Seams: `MirroredRepeatWrapping` — free and invisible.
  The facade is composed at boot: brick photo + a 3×3 window grid per 9 m tile drawn on a canvas (two seeded variants),
  the glow map holds only the lit windows. Buildings scale their box UVs per face (`buildingGeo`) — one material per
  chunk per variant, NO texture clones (a 1024² clone per building = a GPU upload each).
- **Instance pools** (`pool()`): one InstancedMesh per prop kind, a free-list of slots, free slots parked at scale 0,
  `count` = highest slot in use (SwiftShader halved its frame time when every zero-scale instance stopped running
  the vertex shader: 1.5 → 3 fps). Per-instance colour = the lamp head/beam/pool dimming when the Blackout passes.
- **The huge Rapier ground was sinking the capsule 0.14 m** (`cuboid(10, 0.1, 100000)`, HEAD measured −0.14 on flat
  road, −0.26 further in). Per-chunk 24 m road cuboids (chunk 0 + 8 m start pad) → feet at 0.02. World owns the road.
- **Vault through a car proven** (`scratchpad/drive.mjs`: seed 35, sedan across lane 0 at z −54.2, d 1.5): feet
  0.02 → 1.58 over the roof, down past it, still running, 4 arc coins. Lane cars sit ACROSS (d 1.5) — a lengthwise
  car (d 2.6) can't be cleared from the 1.5 m trigger at JUMP_V 5.3 (y 0.69 at the rear edge). Kerb cars are
  lengthwise side obstacles with a crate-height AABB (1.05). (On the sunken ground the same run peaked at 2.5 m —
  grounded flipped true on the roof and re-fired the vault; with the per-chunk road it is one clean arc.)
- **NPCs** = afterdark's cast (michelle/sophie/eve/nightshade + bundled arissa) via `SkeletonUtils.clone`, one mixer
  each, the breathing idle (75 %) or Quake (`../afterdark/assets/move-108780901.glb`, when reachable), hidden past
  55 m. Dev serves only `apps/blackout/` → in dev only arissa spawns; prod is same-origin. A failed skin is skipped.
- `rig.js` = hipsOf / fit / retarget shared by stage and world (was inline in stage).
- SwiftShader here: ~2 fps at 420×860 full scene (fill-bound: 1024² textures + additive beams); physics tests ran at
  200×400 with the eye candy hidden (6 fps). Real fps = the S25 via `report("stage.fps")`.

## Ф1 — the game (2026-09-13, Claude Fable 5.1; measured on the box: dev server `?live`, Chromium/SwiftShader)

- **Shipped:** `state.js` (skins, wallet, record, live-run atoms; gate = a fixed mid-run frame) · `world.js` (24 m
  chunks, 4 ahead / 2 behind: lit facades from one canvas texture, kerbs, lamps, phrases of step / crate / barrier /
  bin + coin lines and arcs, density by distance; the Blackout wall + ground tongue, chunks it passes lose their
  emissive) · `stage.js` (Rapier controller + autostep, the vault = `JUMP_V` when a crate is within 1.5 m, coins and
  punch targets are plain AABBs — no sensors, no `ActiveCollisionTypes` question; follow camera settles behind the
  heading 1.8 s after the last drag; the dark dims the lights within 25 m) · `view.js` (floating joystick left, orbit
  right, ONE punch key, cover / HUD / over card; WASD + Space + X/C + Enter on a keyboard) · skins tab.
- **Kaya's T-pose was the converter, not her rig (resolved 2026-09-13).** Every clip put her in a T-pose while her
  bones carried the clip's quaternions — because the bones the clip drove were not the bones the mesh was bound to.
  FBXLoader→GLTFExporter writes a multi-mesh character with a COPY chain of every bone per skinned mesh
  (`mixamorigLeftArm` › `mixamorigLeftArm` › …, identity transforms, under the real bone); Three's GLTFLoader
  de-dupes the names in skin-load order, so the plain `mixamorigLeftArm` the track resolves to was a leaf copy of
  the body skin and the real bone never moved. 32 of 105 library characters (Kaya, Louise, Sophie among the
  bundled 11) had it. Fix: `pipeline/collapse-bones.mjs` inside `retex.mjs` re-points every skin joint to the
  level-0 bone and drops the copies; assets rebuilt. Blackout ships **Arissa** as the free default (bundled) and
  lists 11 skins, Kaya at 20.
- **A stored skin id that left the list must fall back** (`skinById`), or the stage 404s on `../afterdark/assets/kaya.glb`.
- **Clips are the real Mixamo set (2026-09-13)**, exported through the API with no UI (`pipeline/export-clips.mjs`,
  token from the owner's Chromium `localStorage` → `~/.config/mixamo/token`, 24 h): Running `117600901` (37 KB),
  Forward Running Jump `124490901` (45 KB), Cross Punch `90009` (31 KB, whole clip — no window), Death Falling
  Forwards `128670935` (100 KB, `hold` = clampWhenFinished, the mixer's `finished` ignores it so the body stays down),
  idle = the breathing idle. Skeleton-only FBX → `clip.mjs` → clip-only GLB; swapping a file swaps the move.
- **SwiftShader here: 7–8 fps**, dt clamped to 0.05 → the run reads 1.5 m/s (4.4 × 0.37): a software artefact, the
  simulation is consistent. Real fps comes from the S25 via `report("stage.fps")` at frame 720 (`vps/logs.sh blackout`).
- **The farm's haptic check taps the first key before e2e** → the punch counter test is relative (`n0 + 1`).
- **a11y:** `text-warning` on the skin price fails contrast in both themes; ink is `text-base-content`, the lock is
  on the avatar (`opacity-40 grayscale`), never on the card.
- Debug handles: `globalThis.__blackout` (mixer/actions/current/rig/fps/world/holder), `__blackoutEnv` (move/cam).
- Eye: `~/blackout-shots/{run,over}.png`.

## Ф0 — proven on the see pod (2026-09-13, `bash vps/drive.sh blackout --anon --see`)

- **Rapier loads with no bundler.** `@dimforge/rapier3d-compat@0.14.0` from esm.sh (`x-esm-path:
  /@dimforge/rapier3d-compat@0.14.0/es2022/rapier3d-compat.mjs`, HTTP 200 measured with curl) imported by full
  URL in `stage.js`, `await RAPIER.init()`; the DOM readout went `data-phys="ready"` 3.0 s after navigation.
- **Autostep is the vault for low furniture.** Kinematic position-based body + capsule (radius 0.3, half-height
  0.5), `createCharacterController(0.02)`, `enableAutostep(0.5, 0.2, true)`, `setMaxSlopeClimbAngle(50°)`,
  `enableSnapToGround(0.3)`. Auto-run at 2.6 m/s toward −z through `STREET`: the 0.3 step at z −4 was climbed
  (feet y 0.31 at z −3.6), the 0.45 kerb at z −8 was climbed (y back to 0.02 at z −9.3), the 1.0 crate at
  z −12 STOPPED her at z −11.17 (crate face −11.5 + capsule radius 0.3 = −11.2). Gravity is ours: `vy` is
  integrated per frame and zeroed on `computedGrounded()`.
- **afterdark's retarget carries over.** `hipsOf` + prefix rename + hips translation scaled by bind height
  (`dancers.js`), plus IN PLACE: the hips' x/z pinned to frame 0 so a clip never drags the character off its
  physics body. The Running Man dance stood in for a run clip; the breathing idle is afterdark's `clip-idle.glb`.
- **The floor is the physics, not the feet.** afterdark lifts the root so the lower foot touches y=0 every
  frame — by construction that flattens a jump into a slide (its own RESEARCH.md says so). Here the model hangs
  under the capsule with a ONE-TIME bind-pose offset (`root.position.y = -box.min.y`); a jump is a vertical
  velocity the controller resolves.
- **Follow camera = afterdark's orbit re-centred.** `env.cam {yaw, pitch, zoom}` eased from `camT` (drag →
  yaw/pitch, pinch → zoom); position = chest + R·(sin yaw·cos pitch, sin pitch, cos yaw·cos pitch), yaw 0 =
  behind the runner, lerp 0.18 per frame. The shot (384×832): the runner seen from behind, facing the crate.
- The see pod renders in software (~10 fps in the readout) — it proves correctness, never performance. FPS is
  read from the S25 Ultra after the first deploy (`report("stage.fps")`, `vps/logs.sh`).

## The stack (standard first)

- three 0.171 + `three/addons/` — the core's import-map union (1.2.68). GLTFLoader + DRACOLoader (gstatic 1.5.7).
- **Rapier** (`@dimforge/rapier3d-compat`): the official three.js `physics_rapier` example is the precedent; the
  character controller is Rapier's own (`KinematicCharacterController`), used directly — three's
  `RapierPhysics.js` addon only wraps rigid bodies. Product rule: the bare specifier joins the core's UNION (a
  full URL in an app is the probe's shortcut, not the farm's idiom). See the validated API notes below.
- `runtime/dpad.js` (bit mask + `data-act` momentary keys) for the punch key; the joystick is a NEW core element
  (an analog vector — the deck's mask has 8 directions, a 3D runner with an orbit camera needs 360°).
- Cast: afterdark's 11 Draco GLBs (same skeleton, hips prefix differs on Louise). Clips: clip-only GLBs exported
  from the owner's Mixamo library (on the box), never fetched from mixamo.com.

## The world — a street grammar, not tiles (design, to be measured in Ф1)

Segments (straight 24 m, bend, 90° turn, crossing, overpass, tunnel), 8–12 m wide, born 3 ahead of the
runner and freed 2 behind (`world.removeCollider`, geometry disposed). Districts of 400–800 m (centre, blocks,
industrial, waterfront, park, old town) with 100 m blends; neighbours chosen from a sensible adjacency, not
at random. One seed per run; the daily run's seed is the date. Obstacles and coins are placed in 24 m phrases
(run-up → obstacle → coin arc → enemy), density rising with distance. Fog at 80 m hides the edge of the world.
Z-Image (1024² only — no equirect skybox) paints FACADE textures per district into a library; the sky is
procedural. The Blackout: a plane of darkness behind the runner whose speed grows with distance; lights inside
it dim to zero (material emissive → 0, fog colour → black).

## The state map

- `data-phys`: loading | ready | failed | skipped (gate). `data-why` names the failure (rapier: … | glb: …).
- `data-frame`, `data-x/y/z` (feet), `data-grounded` — the readout the driver and e2e assert on.
- Under the gate (`?mock` / localhost) the stage is SKIPPED (WASM + Draco + GLBs over CDNs flake CI); every
  meaning stays in the DOM.

## Open (must be answered before Ф1 code)

- Where the cast lives: cross-app `../afterdark/assets/` works on the deployed site (same origin) but escapes
  blackout's service-worker precache; a farm-level shared `cast/` needs a copy rule in `deploy/build.mjs`.
- The run/vault/punch clip set — on the box.

## Rapier — the validated notes (research pass 2026-09-13; every load-bearing line re-checked by hand)

How each was validated: **[curl]** = a command run from this phone and its output; **[pod]** = the probe measured
on the see pod; **[doc]** = a rapier.rs page or rapier.js source the researcher opened, quoted verbatim, and
whose claim the probe's behaviour agrees with.

- **Version and delivery.** npm latest `0.20.0` (2026-08-08); esm.sh serves it (`x-esm-path
  /@dimforge/rapier3d-compat@0.20.0/es2022/rapier3d-compat.mjs`), module 2 855 162 B, ≈1.08 MB gzip,
  `cache-control: immutable`; the WASM is a base64 literal inside (≈2.0 MB) instantiated with
  `WebAssembly.instantiate`, no fetch. [curl: registry, esm.sh HEAD, `wc -c`, grep of the module text —
  `createCharacterController` / `enableAutostep` / `setNextKinematicTranslation` / `intersectionPairsWith` /
  `removeCollider` all present]. The probe re-driven on 0.20.0 gave the same stop at z −11.18 [pod]. Use
  nothing older: the 0.18.0 changelog fixes a crash when colliders are removed in insertion order — exactly
  what freeing street chunks does [doc: CHANGELOG].
- **Init.** `const RAPIER = await import(url); await RAPIER.init();` — both `default` and the named
  `init`/`World`/`ColliderDesc` are exported [curl: module tail; pod].
- **The controller** (`KinematicCharacterController`, [doc: class page + character_controller_setup]):
  `world.createCharacterController(offset)` (metres, the gap to the environment; guide 0.01, demo 0.1 —
  never 0); `enableAutostep(maxHeight, minWidth, includeDynamicBodies)` (metres; demo 0.7/0.3);
  `setMaxSlopeClimbAngle(rad)`, `setMinSlopeSlideAngle(rad)`; `enableSnapToGround(metres)`;
  `computeColliderMovement(collider, desiredTranslationDelta)` — a PER-FRAME translation in metres, not a
  velocity; then `computedMovement()` / `computedGrounded()`, valid only after that call in the same frame.
  Translation only: "does not support rotational movement" — facing is ours (`holder.rotation.y`).
- **Order per frame** [doc: testbed Testbed.ts 146/150; pod]: controller → `body.setNextKinematicTranslation
  (translation + movement)` → `world.step()`. The step derives the kinematic body's velocity from the next
  position, which is what pushes dynamic bodies later (enemies knocked down).
- **Gravity is ours** [doc: "it is up to you to emulate gravity by adding a downward component"; pod]:
  `vy += g·dt` in the air, `vy = 0` when `computedGrounded()`, a jump = `vy = jumpSpeed` when grounded.
- **Capsule** [doc: colliders]: `ColliderDesc.capsule(halfHeight, radius)`, principal axis Y — three's up,
  no rotation; origin at the CENTRE, so the Mixamo model (origin at the feet) hangs at
  `y − (halfHeight + radius)` [pod: feet at y 0.02 on flat ground].
- **Chunks** [doc: world.ts 629–637]: `world.removeCollider(collider, true)` (always `wakeUp: true`),
  `world.removeRigidBody(body)` removes its colliders and joints too. Broad-phase since 0.18 no longer
  rebuilds its structure every frame — static chunks are cheap to keep [doc: CHANGELOG].
- **Coins** [doc: advanced_collision_detection_js, World.html]: `ColliderDesc.setSensor(true)` on the coin;
  after `world.step()` poll `world.intersectionPairsWith(playerCollider, (other) => …)` — no event queue, no
  `ActiveEvents` flag, no handle→object map. UNKNOWN until measured on device: whether a kinematic-vs-static
  sensor pair needs `setActiveCollisionTypes`.
- **Cost**: no published JS step-time numbers (UNKNOWN). Measure on the S25 with `world.profilerEnabled =
  true; world.timingStep()` (ms of the last step) and `timingCollisionDetection()` [doc: World.html].
- **three's own `RapierPhysics.js` (r171) is NOT the path** [curl: the esm.sh build imports
  `https://cdn.skypack.dev/@dimforge/rapier3d-compat@0.12.0`; doc: 240 lines, rigid bodies only, no
  controller/sensors/removal]. The precedent we keep from it is the idea (Rapier under three); the calls
  are Rapier's own.
- **CSP**: WASM compilation needs `'wasm-unsafe-eval'` in `script-src` where a CSP exists; production sends
  NO Content-Security-Policy header [curl: `dreamstudio.mooo.com/afterdark/`, 0 lines]. Re-check inside the
  Android shell's WebView before the APK flavour.
