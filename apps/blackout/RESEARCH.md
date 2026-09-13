# blackout — research & state map

An endless night city in full 3D on afterdark's Mixamo cast: run (joystick), punch (one key), vault
automatically, collect coins, outrun the Blackout (the dark that kills the lights behind you), set a distance
record, spend coins on skins and powers. Decisions and the concept live above the code (the owner's meta layer);
this file is the evidence the build stands on.

## Ф1 — the game (2026-09-13, Claude Fable 5.1; measured on the box: dev server `?live`, Chromium/SwiftShader)

- **Shipped:** `state.js` (skins, wallet, record, live-run atoms; gate = a fixed mid-run frame) · `world.js` (24 m
  chunks, 4 ahead / 2 behind: lit facades from one canvas texture, kerbs, lamps, phrases of step / crate / barrier /
  bin + coin lines and arcs, density by distance; the Blackout wall + ground tongue, chunks it passes lose their
  emissive) · `stage.js` (Rapier controller + autostep, the vault = `JUMP_V` when a crate is within 1.5 m, coins and
  punch targets are plain AABBs — no sensors, no `ActiveCollisionTypes` question; follow camera settles behind the
  heading 1.8 s after the last drag; the dark dims the lights within 25 m) · `view.js` (floating joystick left, orbit
  right, ONE punch key, cover / HUD / over card; WASD + Space + X/C + Enter on a keyboard) · skins tab.
- **Kaya's rig does not take the shared clips.** Every clip put her in a T-pose while her bones carried the clip's
  quaternions (hands mirror-perfect at ±0.61 m, feet symmetric under the hips mid-run). The same file + the same
  `clip-idle.glb` in afterdark: Kaya T-poses there too, Michelle/Arissa stand arms-down (screenshot, dev `?live`).
  Her joint orientations are baked differently → not a blackout bug, an afterdark one nobody caught in a crowd.
  Blackout ships **Arissa** as the free default (bundled, 668 KB) and lists 10 skins without Kaya.
- **A stored skin id that left the list must fall back** (`skinById`), or the stage 404s on `../afterdark/assets/kaya.glb`.
- **Clips are stand-ins** from the box (no run/jump/punch in the 104 clips on disk — the library holds dances):
  run = Running Man in place (`108780902`), jump = Sword And Shield Running Jump (`122670901`), punch = a 0.6 s window
  of Breakdance Uprock (`122110901`), idle = the breathing idle. The REAL set to export via the Mixamo API (memory
  `reference_mixamo_api_export`): Running `117600901`, Forward Running Jump `124490901`, Cross Punch `90009`,
  Death Falling Forwards `128670935`; convert with `pipeline/clip.mjs`, drop into `assets/clip-*.glb`, nothing else changes.
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
