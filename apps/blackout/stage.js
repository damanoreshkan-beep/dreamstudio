// blackout — the 3D stage: Three.js over a Rapier world (Ф1, 2026-09-13). The FLOOR IS THE PHYSICS: a kinematic
// capsule driven by Rapier's character controller (autostep walks the kerbs and steps, a crate ahead triggers the
// vault = a real vertical velocity), the Mixamo model hangs under it with a one-time bind-pose offset. The street
// (world.js) is born ahead and freed behind; coins and punch targets are plain boxes. Clips are DATA (CLIPS): Mixamo
// Running / Forward Running Jump / Cross Punch / Death Falling Forwards exported via the API
// (~/mixamo-library/pipeline/export-clips.mjs) — swapping a file swaps the move.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { report } from "/_rt/telemetry.js";
import { createWorld, STREET_W } from "./world.js";
import { hipsOf, fit, retarget } from "./rig.js";
import { glbUrl } from "./state.js";

const DRACO_PATH = "https://www.gstatic.com/draco/versioned/decoders/1.5.7/";
const CLIPS = {
  idle: { url: new URL("assets/clip-idle.glb", import.meta.url).href, loop: true },
  run: { url: new URL("assets/clip-run.glb", import.meta.url).href, loop: true, inPlace: true },
  jump: { url: new URL("assets/clip-jump.glb", import.meta.url).href, inPlace: true },
  punch: { url: new URL("assets/clip-punch.glb", import.meta.url).href, inPlace: true },
  death: { url: new URL("assets/clip-death.glb", import.meta.url).href, inPlace: true, hold: true },
};
const TARGET_H = 1.7, CAP_R = 0.3, CAP_HH = 0.5, GRAVITY = -9.81;
const RUN_SPEED = 4.4, JUMP_V = 5.3, STEP_MAX = 0.5;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));


export async function createStage(canvas, { getInput, onStatus, onStat, onEvent }, skinId) {
  let RAPIER;
  try { RAPIER = await import("@dimforge/rapier3d-compat"); await RAPIER.init(); } catch (e) { onStatus("failed", "rapier: " + String(e && e.message || e).slice(0, 70)); return null; }

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.6));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene();
  // Silent Hill grade: a cold grey-teal murk, the fog close and thick, no colour left in the light
  const NIGHT = new THREE.Color(0x0a0e0f);
  scene.background = NIGHT; scene.fog = new THREE.Fog(NIGHT, 6, 58);
  const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 220);
  // the runner is seen from BEHIND: the key comes over the camera's shoulder, the moon rims her from the front
  const hemi = new THREE.HemisphereLight(0x3a4a48, 0x141816, 0.55); scene.add(hemi);
  const moon = new THREE.DirectionalLight(0x6e7f80, 0.45); moon.position.set(-3, 10, -6); scene.add(moon);
  const fill = new THREE.DirectionalLight(0x8a8478, 0.9); fill.position.set(2, 7, 6); scene.add(fill);

  const world = new RAPIER.World({ x: 0, y: GRAVITY, z: 0 });
  const street = createWorld(scene, RAPIER, world);   // the road (+ its ground colliders), sidewalks, buildings, props, NPCs — see world.js

  const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, CAP_HH + CAP_R + 0.05, 2));
  const collider = world.createCollider(RAPIER.ColliderDesc.capsule(CAP_HH, CAP_R), body);
  const cc = world.createCharacterController(0.02);
  cc.enableAutostep(STEP_MAX, 0.2, true); cc.setMaxSlopeClimbAngle(50 * Math.PI / 180); cc.enableSnapToGround(0.3); cc.setApplyImpulsesToDynamicBodies(false);

  // the character: loaded per skin; the clips are loaded once and retargeted per rig
  const holder = new THREE.Group(); scene.add(holder);
  const loader = new GLTFLoader(); const draco = new DRACOLoader(); draco.setDecoderPath(DRACO_PATH); loader.setDRACOLoader(draco);
  const raw = {};
  let mixer = null, actions = {}, current = null, rig = null, oneShot = null, skin = null;
  async function loadClips() {
    await Promise.all(Object.entries(CLIPS).map(async ([id, c]) => { const g = await loader.loadAsync(c.url); let clip = g.animations[0]; if (c.window) clip = THREE.AnimationUtils.subclip(clip, id, Math.round(c.window[0] * 30), Math.round(c.window[1] * 30), 30); raw[id] = { clip, rig: hipsOf(g.scene) }; }));
  }
  async function loadSkin(id) {
    const g = await loader.loadAsync(glbUrl(id));
    const root = fit(g.scene, TARGET_H);
    holder.clear(); holder.add(root);
    rig = hipsOf(root); mixer = new THREE.AnimationMixer(root); actions = {}; current = null; oneShot = null;
    for (const [cid, c] of Object.entries(CLIPS)) {
      const a = mixer.clipAction(retarget(raw[cid].clip, raw[cid].rig, rig, !!c.inPlace));
      if (c.loop) a.setLoop(THREE.LoopRepeat, Infinity); else { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = !!c.hold; }
      actions[cid] = a;
    }
    mixer.addEventListener("finished", (e) => { if (e.action === actions.death) return; oneShot = null; current = null; });
    skin = id;
  }
  function play(id, fade = 0.2, once = false) {
    const a = actions[id]; if (!a || current === id) return;
    a.enabled = true; a.setEffectiveWeight(1); a.reset(); a.play();
    const prev = actions[current]; if (prev) a.crossFadeFrom(prev, fade, true);
    current = id; if (once) oneShot = id;
  }
  try { await Promise.all([loadClips(), street.ready]); await loadSkin(skinId); } catch (e) { onStatus("failed", "glb: " + String(e && e.message || e).slice(0, 70)); return null; }

  // the burst: a few emissive cubes thrown from a smashed bin
  const burstGeo = new THREE.BoxGeometry(0.12, 0.12, 0.12), burstMat = new THREE.MeshBasicMaterial({ color: 0x6b7a5a });
  const bursts = [];
  function burst(x, y, z) { for (let i = 0; i < 10; i++) { const m = new THREE.Mesh(burstGeo, burstMat); m.position.set(x, y, z); scene.add(m); bursts.push({ m, vx: (Math.random() - 0.5) * 6, vy: 2 + Math.random() * 4, vz: (Math.random() - 0.5) * 6, life: 0.7 }); } }

  function resize() { const w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
  resize(); addEventListener("resize", resize);

  let state = "idle", vy = 0, grounded = true, yaw = Math.PI, dist = 0, coins = 0, seed = 1;
  const cam = { yaw: 0, pitch: 0.2, zoom: 1 };
  const camPos = new THREE.Vector3(0, 2, 8), look = new THREE.Vector3(), want = new THREE.Vector3();
  const clock = new THREE.Clock();
  let raf = 0, dead = false, frame = 0, fpsN = 0, fpsT = 0, fps = 0, reported = false, overAt = 0;

  function tick() {
    if (dead) return;
    raf = requestAnimationFrame(tick);
    const dt = Math.min(clock.getDelta(), 0.05), now = performance.now();
    const input = getInput();
    const mv = state === "run" ? (input.move || { x: 0, z: 0 }) : { x: 0, z: 0 };
    const cy = cam.yaw;
    const dx = mv.x * Math.cos(cy) + mv.z * Math.sin(cy), dz = -mv.x * Math.sin(cy) + mv.z * Math.cos(cy);
    const speed = Math.min(1, Math.hypot(dx, dz));
    if (speed > 0.08) yaw = Math.atan2(dx, dz);
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    // the vault: a crate within reach, feet on the ground → a real jump
    if (state === "run" && grounded && speed > 0.1 && street.ahead(body.translation().x, body.translation().z, fx, fz, 1.5, "crate")) { vy = JUMP_V; grounded = false; play("jump", 0.08, true); onEvent("vault"); }
    const desired = { x: dx * RUN_SPEED * dt, y: vy * dt, z: dz * RUN_SPEED * dt };
    cc.computeColliderMovement(collider, desired);
    const m = cc.computedMovement(); grounded = cc.computedGrounded();
    const p = body.translation();
    body.setNextKinematicTranslation({ x: clamp(p.x + m.x, -STREET_W / 2 - 0.9, STREET_W / 2 + 0.9), y: p.y + m.y, z: p.z + m.z });
    world.step();
    vy = grounded && vy <= 0 ? 0 : vy + GRAVITY * dt;
    const q = body.translation(), feetY = q.y - CAP_HH - CAP_R;
    holder.position.set(q.x, feetY, q.z); holder.rotation.y = yaw;
    if (state === "run") {
      dist = Math.max(dist, 2 - q.z);
      const got = street.collect(q.x, feetY, q.z); if (got) { coins += got; onEvent("coin", got); }
      if (q.z > street.wallZ() - 0.4) { state = "over"; overAt = now; play("death", 0.1, true); onEvent("over", { dist, coins }); }
    }
    street.update(q.z, dist, dt, state !== "idle", q.x);
    street.spin(now / 1000);
    if (!oneShot) play(speed > 0.08 && grounded ? "run" : (grounded ? "idle" : "jump"), 0.2);
    if (current === "run") actions.run.setEffectiveTimeScale(0.9 + speed * 0.5);
    mixer?.update(dt);
    for (let i = bursts.length - 1; i >= 0; i--) { const b = bursts[i]; b.life -= dt; b.vy += GRAVITY * dt; b.m.position.x += b.vx * dt; b.m.position.y += b.vy * dt; b.m.position.z += b.vz * dt; if (b.life <= 0) { scene.remove(b.m); bursts.splice(i, 1); } }
    // the follow camera: an orbit around the chest; it settles behind her heading unless a finger is orbiting
    const ic = input.cam || cam;
    if (now - (input.dragT || 0) > 1800 && speed > 0.08) ic.yaw += wrap(yaw - Math.PI - ic.yaw) * 0.06;
    cam.yaw += wrap(ic.yaw - cam.yaw) * 0.12; cam.pitch += ((ic.pitch ?? 0.2) - cam.pitch) * 0.12; cam.zoom += ((ic.zoom ?? 1) - cam.zoom) * 0.12;
    const R = 5 * cam.zoom, cp = Math.cos(cam.pitch);
    look.set(q.x, q.y + 0.35, q.z);
    want.set(look.x + Math.sin(cam.yaw) * cp * R, look.y + 0.8 + Math.sin(cam.pitch) * R, look.z + Math.cos(cam.yaw) * cp * R);
    camPos.lerp(want, 0.2); camera.position.copy(camPos); camera.lookAt(look);
    // the dark eats the light: within 25 m of the wall the whole scene dims
    const gap = street.wallZ() - q.z, dim = clamp(gap / 25, 0.12, 1) * (state === "over" ? clamp(1 - (now - overAt) / 1200, 0, 1) : 1);
    hemi.intensity = 0.55 * dim; moon.intensity = 0.45 * dim; fill.intensity = 0.9 * dim;
    renderer.render(scene, camera);
    fpsN++; if (now - fpsT >= 1000) { fps = fpsN; fpsN = 0; fpsT = now; }
    if (++frame % 6 === 0) onStat({ frame, dist, coins, gap, speed: speed * RUN_SPEED, fps, x: q.x, y: feetY, z: q.z, grounded });
    if (!reported && frame > 720 && state === "run") { reported = true; report("stage.fps", { fps, dpr: renderer.getPixelRatio(), skin }, "info"); }
  }
  onStatus("ready", ""); tick();
  globalThis.__blackout = { get mixer() { return mixer; }, get actions() { return actions; }, get current() { return current; }, get rig() { return rig; }, get fps() { return fps; }, world: street, holder };

  return {
    start(s) {
      seed = s || 1; street.reset(seed);
      body.setNextKinematicTranslation({ x: 0, y: CAP_HH + CAP_R + 0.05, z: 2 }); body.setTranslation({ x: 0, y: CAP_HH + CAP_R + 0.05, z: 2 }, true);
      vy = 0; yaw = Math.PI; dist = 0; coins = 0; oneShot = null; state = "run"; reported = false;
      const ic = getInput().cam; if (ic) { ic.yaw = 0; ic.pitch = 0.2; ic.zoom = 1; }
      onEvent("start");
    },
    // the punch: a bin within reach in front → smashed for coins; else just the move
    punch() {
      if (state !== "run" || oneShot === "punch") return;
      play("punch", 0.06, true);
      const q = body.translation(), o = street.ahead(q.x, q.z, Math.sin(yaw), Math.cos(yaw), 1.7, "bin");
      if (o) { street.smash(o); burst(o.x, 0.8, o.z); coins += 3; onEvent("smash", 3); } else onEvent("punch");
    },
    jump() { if (state === "run" && grounded) { vy = JUMP_V; grounded = false; play("jump", 0.08, true); } },
    async setSkin(id) { if (id === skin) return; try { await loadSkin(id); } catch (e) { onStatus("failed", "glb: " + String(e && e.message || e).slice(0, 70)); } },
    dispose() {
      dead = true; cancelAnimationFrame(raf); removeEventListener("resize", resize);
      street.dispose(); burstGeo.dispose(); burstMat.dispose();
      try { world.free(); renderer.dispose(); renderer.forceContextLoss?.(); } catch { /* gone */ }
    },
  };
}
