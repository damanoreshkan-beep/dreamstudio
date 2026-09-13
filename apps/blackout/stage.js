// blackout — the 3D stage: a LANE RUNNER on Three.js (the Subway Surfers rework, 2026-09-13). She runs by herself
// down −z at a speed that ramps with distance; a swipe moves her one of four lanes (an exponential lerp, neon-rush's
// 13/s), up is a jump (our own gravity, 1.24 m at the top), down is a slide (0.75 s). Obstacles resolve by ACTION,
// never by box maths (a lane's `jump` is cleared only in the air, `slide` only sliding, `dodge` only from another
// lane): a miss on jump/slide is a STUMBLE that lunges the horde in, a second stumble within 150 m or any `dodge`
// hit is the grab. No physics engine — the street is flat and the floor is y = 0 (Rapier left with the joystick).
// Clips are DATA (CLIPS): Mixamo Running / Forward Running Jump / Running Slide / Jogging Stumble / Death Falling
// Forwards exported via the API (~/mixamo-library/pipeline/export-clips.mjs) — swapping a file swaps the move.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { report } from "/_rt/telemetry.js";
import { createWorld, LANES, laneX } from "./world.js";
import { hipsOf, fit, retarget } from "./rig.js";
import { glbUrl, muted } from "./state.js";
import { createSound } from "./sound.js";

const DRACO_PATH = "https://www.gstatic.com/draco/versioned/decoders/1.5.7/";
const CLIPS = {
  idle: { url: new URL("assets/clip-idle.glb", import.meta.url).href, loop: true },
  run: { url: new URL("assets/clip-run.glb", import.meta.url).href, loop: true, inPlace: true },
  jump: { url: new URL("assets/clip-jump.glb", import.meta.url).href, inPlace: true, fitTo: 0.7 },
  slide: { url: new URL("assets/clip-slide.glb", import.meta.url).href, inPlace: true, fitTo: 0.85 },
  stumble: { url: new URL("assets/clip-stumble.glb", import.meta.url).href, inPlace: true, fitTo: 0.9 },
  death: { url: new URL("assets/clip-death.glb", import.meta.url).href, inPlace: true, hold: true },
};
const TARGET_H = 1.7, GRAVITY = -22, JUMP_V = 7.4, JUMP_SAFE_Y = 0.35, SLIDE_S = 0.75, LANE_LERP = 13;
const BASE_SPEED = 6.5, MAX_SPEED = 15, RAMP_M = 1500, RUN_CLIP_MS = 4.4;   // the run clip reads as 4.4 m/s at timeScale 1
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export async function createStage(canvas, { getInput, onStatus, onStat, onEvent }, skinId) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.6));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene();
  // Silent Hill grade: a cold grey-teal murk, the fog close and thick, no colour left in the light
  const NIGHT = new THREE.Color(0x0a0e0f);
  scene.background = NIGHT; scene.fog = new THREE.Fog(NIGHT, 8, 62);
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 220);
  const hemi = new THREE.HemisphereLight(0x3a4a48, 0x141816, 0.55); scene.add(hemi);
  const moon = new THREE.DirectionalLight(0x6e7f80, 0.45); moon.position.set(-3, 10, -6); scene.add(moon);
  const fill = new THREE.DirectionalLight(0x8a8478, 0.9); fill.position.set(2, 7, 6); scene.add(fill);
  // the key rides with her: a warm lamp over her shoulder, so she and the nearest of the horde read against the murk
  const key = new THREE.PointLight(0xffe2b0, 60, 9, 1.6); key.position.set(0.6, 2.6, 1.4);   // candela (r155+ physical lights): ~7 lux on her back at 2.9 m

  const street = createWorld(scene);

  // the character: loaded per skin; the clips are loaded once and retargeted per rig
  const holder = new THREE.Group(); scene.add(holder);
  const loader = new GLTFLoader(); const draco = new DRACOLoader(); draco.setDecoderPath(DRACO_PATH); loader.setDRACOLoader(draco);
  const raw = {};
  let mixer = null, actions = {}, current = null, rig = null, oneShot = null, skin = null;
  async function loadClips() {
    await Promise.all(Object.entries(CLIPS).map(async ([id, c]) => { const g = await loader.loadAsync(c.url); raw[id] = { clip: g.animations[0], rig: hipsOf(g.scene) }; }));
  }
  async function loadSkin(id) {
    const g = await loader.loadAsync(glbUrl(id));
    const root = fit(g.scene, TARGET_H);
    holder.clear(); holder.add(root, key);
    rig = hipsOf(root); mixer = new THREE.AnimationMixer(root); actions = {}; current = null; oneShot = null;
    for (const [cid, c] of Object.entries(CLIPS)) {
      const a = mixer.clipAction(retarget(raw[cid].clip, raw[cid].rig, rig, !!c.inPlace));
      if (c.loop) a.setLoop(THREE.LoopRepeat, Infinity); else { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = !!c.hold; }
      if (c.fitTo) a.setEffectiveTimeScale(a.getClip().duration / c.fitTo);   // a one-shot plays out in the move's own window
      actions[cid] = a;
    }
    mixer.addEventListener("finished", (e) => { if (e.action === actions.death) return; oneShot = null; if (actions[current] === e.action) current = null; });
    skin = id;
  }
  function play(id, fade = 0.2, once = false) {
    const a = actions[id]; if (!a || current === id) return;
    a.enabled = true; a.setEffectiveWeight(1); a.reset(); a.play();
    const prev = actions[current]; if (prev) a.crossFadeFrom(prev, fade, true);
    current = id; if (once) oneShot = id;
  }
  try { await Promise.all([loadClips(), street.ready]); await loadSkin(skinId); } catch (e) { onStatus("failed", "glb: " + String(e && e.message || e).slice(0, 70)); return null; }

  // the sound (sound.js): null where Web Audio is missing; it wakes on the Run tap and the effects load then
  const sound = createSound({ muted });
  const sfx = (name, o) => sound?.play(name, o);
  let nextAmbience = 0, coinStreak = 0, lastCoinAt = 0;

  function resize() { const w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
  resize(); addEventListener("resize", resize);

  // the run
  let state = "idle", lane = 1, x = laneX(1), y = 0, vy = 0, z = 2, slideT = 0, stumbleT = 0, dist = 0, coins = 0, seed = 1, speedK = 1;
  const camPos = new THREE.Vector3(0, 3.3, 9), look = new THREE.Vector3(), want = new THREE.Vector3();
  const clock = new THREE.Clock();
  let raf = 0, dead = false, frame = 0, fpsN = 0, fpsT = 0, fps = 0, reported = false;
  const speedAt = (d) => BASE_SPEED + Math.min(1, d / RAMP_M) * (MAX_SPEED - BASE_SPEED);

  function tick() {
    if (dead) return;
    raf = requestAnimationFrame(tick);
    const dt = Math.min(clock.getDelta(), 0.05), now = performance.now();
    const running = state === "run";
    // forward: the speed ramps with the distance, dips after a stumble and recovers within a second
    if (stumbleT > 0) { stumbleT -= dt; speedK = 0.45 + 0.55 * (1 - clamp(stumbleT / 1.1, 0, 1)); } else speedK = 1;
    const speed = running ? speedAt(dist) * speedK : 0;
    const metres = speed * dt;
    z -= metres; dist = Math.max(dist, 2 - z);
    // lanes: an exponential lerp to the lane's x, a lean into the move
    const px = x; x += (laneX(lane) - x) * (1 - Math.exp(-LANE_LERP * dt));
    const vx = (x - px) / Math.max(dt, 1e-4);
    // the air: our gravity; the slide: a timer
    if (y > 0 || vy > 0) { vy += GRAVITY * dt; y = Math.max(0, y + vy * dt); if (y === 0 && vy < 0) { vy = 0; if (running) { sfx("land"); if (!oneShot) play("run", 0.12); } } }
    if (slideT > 0 && (slideT -= dt) <= 0) slideT = 0;
    if (running) {
      const got = street.collect(x, y, z);
      if (got) { coins += got; coinStreak = now - lastCoinAt < 700 ? coinStreak + 1 : 0; lastCoinAt = now; sfx("coin", { rate: 1 + Math.min(coinStreak, 10) * 0.035 }); onEvent("coin", got); }
      // the obstacle under her feet in her lane, resolved by ACTION (neon-rush collisionSystem): never by box maths
      const o = street.hit(lane, z);
      if (o) {
        const safe = o.kind === "jump" ? y > JUMP_SAFE_Y : o.kind === "slide" ? slideT > 0 : false;
        if (!safe) {
          sfx(o.kind === "jump" ? "hit-wood" : o.kind === "slide" ? "hit-metal" : "hit-car");
          if (o.kind === "dodge" || street.stumble()) caught(now);
          else { stumbleT = 1.1; slideT = 0; play("stumble", 0.06, true); sfx("stumble"); sfx(Math.random() < 0.5 ? "zombie-growl-1" : "zombie-growl-2"); onEvent("stumble"); }
        }
      }
      // the street's own life, now and then: a siren between the buildings, a crow off a lamp
      if (now > nextAmbience) { nextAmbience = now + 18000 + Math.random() * 30000; sfx(Math.random() < 0.5 ? "siren" : "crow"); }
    }
    street.update(z, dist, dt, running, x, speed, metres);
    street.spin(now / 1000);
    // the beat (the stream's kick, or the idle groove) lights the lamps; the beds follow her speed and the horde's closeness
    if (sound) {
      const b = sound.tick(now), near = street.near();
      street.pulse(1 - b.phase);
      sound.bedTo("run", running ? 1 : 0, Math.max(0.6, speed / RUN_CLIP_MS));
      sound.bedTo("wind", state !== "idle" ? 1 : 0.4);
      sound.bedTo("lamp-hum", state !== "idle" ? 1 : 0);
      sound.bedTo("horde", running || state === "over" ? 0.25 + near * 0.75 : 0, 1);
      sound.bedTo("horde-run", running ? near * 0.8 : 0, 0.9 + near * 0.3);
      sound.bedTo("heartbeat", running && near > 0.45 ? (near - 0.45) * 1.6 : 0, 0.9 + near * 0.5, 0.08);
    } else street.pulse(0.5);
    holder.position.set(x, y, z); holder.rotation.set(y > 0 ? -0.1 : 0, Math.PI, clamp(-vx * 0.035, -0.3, 0.3));
    if (!oneShot) play(running ? "run" : "idle", 0.2);
    if (current === "run") actions.run.setEffectiveTimeScale(Math.max(0.6, speed / RUN_CLIP_MS));
    mixer?.update(dt);
    // the chase camera: high behind her, easing after her lane, looking down the street
    look.set(x * 0.35, 0.9, z - 7);
    want.set(x * 0.45, 4.0, z + 7.8);
    camPos.lerp(want, 0.18); camera.position.copy(camPos); camera.lookAt(look);
    // the horde at her heels eats the light
    const near = street.near(), dim = 1 - near * 0.55;
    hemi.intensity = 0.55 * dim; moon.intensity = 0.45 * dim; fill.intensity = 0.9 * dim;
    renderer.render(scene, camera);
    fpsN++; if (now - fpsT >= 1000) { fps = fpsN; fpsN = 0; fpsT = now; }
    if (++frame % 6 === 0) onStat({ frame, dist, coins, speed, fps, lane, near, x: +x.toFixed(2), y: +y.toFixed(2), z: +z.toFixed(2) });
    if (!reported && frame > 720 && running) { reported = true; report("stage.fps", { fps, dpr: renderer.getPixelRatio(), skin }, "info"); }
  }
  function caught(now) {
    state = "over"; street.catch(); slideT = 0; stumbleT = 0;
    play("death", 0.1, true);
    sfx("zombie-scream"); setTimeout(() => { sfx("bite"); sfx("fall"); }, 500); setTimeout(() => sfx("over"), 900);
    onEvent("over", { dist, coins, at: now });
  }
  onStatus("ready", ""); tick();
  globalThis.__blackout = { get mixer() { return mixer; }, get actions() { return actions; }, get current() { return current; }, get rig() { return rig; }, get fps() { return fps; }, get state() { return state; }, get lane() { return lane; }, world: street, holder, sound, catch: () => { if (state === "run") caught(performance.now()); } };

  return {
    start(s) {
      seed = s || 1; street.reset(seed);
      lane = 1; x = laneX(1); y = 0; vy = 0; z = 2; slideT = 0; stumbleT = 0; dist = 0; coins = 0; oneShot = null; state = "run"; reported = false;
      coinStreak = 0; nextAmbience = performance.now() + 12000;
      // the Run tap is the audio gesture: the context wakes, the library loads, the stream starts
      if (sound) { sound.resume(); sound.load().then(() => sfx("whoosh-start")); sound.music(true); }
      onEvent("start");
    },
    // the four verbs of a lane runner; each is one swipe or one key
    act(what) {
      if (state !== "run") return false;
      if (what === "left") { if (lane <= 0) return false; lane--; sfx("lane"); return true; }
      if (what === "right") { if (lane >= LANES - 1) return false; lane++; sfx("lane"); return true; }
      if (what === "jump") { if (y > 0) return false; slideT = 0; vy = JUMP_V; y = 0.001; play("jump", 0.06, true); sfx("jump"); return true; }
      if (what === "slide") { if (y > 0 || slideT > 0) return false; slideT = SLIDE_S; play("slide", 0.06, true); sfx("slide"); return true; }
      return false;
    },
    async setSkin(id) { if (id === skin) return; try { await loadSkin(id); } catch (e) { onStatus("failed", "glb: " + String(e && e.message || e).slice(0, 70)); } },
    dispose() {
      dead = true; cancelAnimationFrame(raf); removeEventListener("resize", resize);
      sound?.dispose(); street.dispose();
      try { renderer.dispose(); renderer.forceContextLoss?.(); } catch { /* gone */ }
    },
  };
}
