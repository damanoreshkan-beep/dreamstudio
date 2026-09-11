// afterdark — the 3D dance stage (Three.js on a transparent canvas, over the afterdark.frag rave and under
// the DOM chrome). It renders ANY cast of 1..11 rigged girls as a crowd sized to FIT the viewport width, and
// drives them from a SHARED MOVE LIBRARY: because every girl is the same Mixamo skeleton, any clip retargets
// onto anyone, so the stage is an AUTO-CHOREOGRAPHER — it reads the live beat energy and cross-fades the whole
// floor between calm / groove / drive moves (a girl on a quiet passage sways; on the drop the floor breaks into
// bboy/robot/snake), each dancer offset so no two do the same thing. On pause everyone eases into a calm move.
// The kick (env.pulse) still punches a per-beat squash + rim-light flash so they FEEL the track.
//
// PROBE-guarded like the shader: created only where WebGL answers; the view skips it under the headless gate.

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { GIRLS, glbUrl } from "./girls.js";

const DRACO_PATH = "https://www.gstatic.com/draco/versioned/decoders/1.5.7/";
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const TARGET_H = 1.7;
const ORDER = GIRLS.map((g) => g.id);
const clipUrl = (id) => new URL(`assets/clip-${id}.glb`, import.meta.url).href;   // top-level: the build copies files in assets/, not subdirs

// the move library, tiered by intensity (clip id = the girl it was captured from, but any girl can play it).
// The director picks a tier from the section energy; each dancer takes a different move within it.
const CALM = ["idle"];                                             // breathing idle — a real standing wait (pause)
const LIGHT = ["akai", "pirate"];                                   // arm wave, basic hip hop — quiet-but-playing
const GROOVE = ["kaya", "michelle", "nightshade", "louise", "kachujin"]; // northern soul, house, twist, wave, salsa
const DRIVE = ["arissa", "eve", "sophie", "jolleen"];              // snake, shuffle, robot, bboy — the drops
const TIERS = { calm: CALM, light: LIGHT, groove: GROOVE, drive: DRIVE };

const C_KEY = 0xffe9f4, C_MAG = 0xff3eb5, C_GRN = 0x39ff6a, C_GOLD = 0xf5b942;

// `onStatus(state, detail)` is the stage's DOM readout (glstage law: every meaning the canvas carries is
// also in the DOM): "ready" once the first girl dances, "failed" with the reason when a GLB or the decoder
// does not arrive — the drive and the client log read it, a silent catch told nobody (2026-09-11).
export function createDanceStage(canvas, getEnv, onStatus = () => {}) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "low-power" });
  } catch (e) { onStatus("failed", String(e && e.message || e).slice(0, 80)); return { ok: false, setCast() {}, dispose() {} }; }
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  const DPR = Math.min(1.75, globalThis.devicePixelRatio || 1);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
  const still = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

  const hemi = new THREE.HemisphereLight(0x9a7ad8, 0x161022, 0.95); scene.add(hemi);
  const key = new THREE.DirectionalLight(C_KEY, 2.0); key.position.set(0.5, 3.5, 4); scene.add(key);
  const magenta = new THREE.DirectionalLight(C_MAG, 0.9); magenta.position.set(-4, 2.2, 2); scene.add(magenta);
  const green = new THREE.DirectionalLight(C_GRN, 0.9); green.position.set(4, 2.2, 2); scene.add(green);
  const gold = new THREE.DirectionalLight(C_GOLD, 0.7); gold.position.set(0, 3, -4); scene.add(gold);

  // ── the floor: what grounds a figure. A dark, half-transparent plane catches the coloured lights (the rave
  // field still shows through it, but the girls stop floating in a void), an additive light pool under the
  // crowd breathes with the kick, and each dancer stands on her own soft contact shadow. Three standard
  // meshes with canvas-drawn gradients — no shadow maps, which a weak GPU cannot afford.
  const radial = (inner, outer) => {
    const c = document.createElement("canvas"); c.width = c.height = 256;
    const g = c.getContext("2d"), grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    grad.addColorStop(0, inner); grad.addColorStop(1, outer); g.fillStyle = grad; g.fillRect(0, 0, 256, 256);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  };
  // The floor fades out radially (alphaMap) — a finite plane's far edge is a hard horizon that reads as a
  // table top; matte and near-black so the coloured lights tint it without turning it into a wooden deck.
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(24, 24), new THREE.MeshStandardMaterial({ color: 0x07040c, roughness: 0.75, metalness: 0.25, transparent: true, opacity: 0.85, alphaMap: radial("#ffffff", "#000000") }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(0, -0.002, -2); scene.add(floor);
  const lightPool = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), new THREE.MeshBasicMaterial({ map: radial("rgba(255,62,181,0.30)", "rgba(255,62,181,0)"), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  lightPool.rotation.x = -Math.PI / 2; lightPool.position.set(0, 0.004, -0.6); scene.add(lightPool);
  const shadowMat = new THREE.MeshBasicMaterial({ map: radial("rgba(0,0,0,0.6)", "rgba(0,0,0,0)"), transparent: true, depthWrite: false });

  const draco = new DRACOLoader().setDecoderPath(DRACO_PATH);
  const loader = new GLTFLoader().setDRACOLoader(draco);

  const pool = new Map();       // move id -> { clip, hipsY } (shared across all girls; hipsY = the SOURCE rig's hips bind height)
  // "The same Mixamo skeleton" is the same bone tree, NOT the same size: the rigs' hips sit at 0.37 (pirate),
  // 0.71 (kaya), 1.03 (michelle), 1.13 (akai) in their own units (measured 2026-09-11, glb-inspect). A clip's
  // Hips.position track is in its SOURCE rig's units, so played raw on a smaller rig it lifts her off the
  // floor by the difference, times her fit scale — Pirate flew a metre up. Standard retargeting of the root
  // translation: scale the hips track by target/source bind height; rotations retarget as they are.
  const hipsOf = (obj) => { let h = null; obj.traverse((o) => { if (!h && /hips$/i.test(o.name)) h = o; }); return h ? { bone: h, y: h.position.y } : { bone: null, y: 0 }; };
  const retargetHips = (clip, srcY, dstY) => {
    if (!srcY || !dstY || Math.abs(srcY - dstY) < 1e-4) return clip;
    const c = clip.clone(), r = dstY / srcY;
    for (const t of c.tracks) if (/hips\.position$/i.test(t.name)) for (let i = 0; i < t.values.length; i++) t.values[i] *= r;
    return c;
  };
  const _v = new THREE.Vector3();
  const cast = new Map();       // girl id -> { root, mixer, actions:Map, current, currentAction, baseY, baseScale, centerDX, token, tx, tz, yaw }
  let order = [];
  let dead = false, loaded = 0, camDist = 6, camY = 1.05, lookY = 0.95;

  // load the whole move library once (tiny clip-only GLBs) + the breathing idle, so any girl can dance any
  // move regardless of cast, and everyone has a real standing wait for pause
  for (const id of [...ORDER, "idle"]) {
    loader.loadAsync(clipUrl(id)).then((g) => { if (!dead && g.animations[0]) { pool.set(id, { clip: g.animations[0], hipsY: hipsOf(g.scene).y }); assignMoves(); } }).catch(() => {});
  }

  function disposeEntry(e) {
    if (!e || !e.root) return;
    if (e.shadow) { scene.remove(e.shadow); e.shadow.geometry.dispose(); e.shadow = null; }
    scene.remove(e.root); e.mixer?.stopAllAction();
    e.root.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      const mats = o.material ? [].concat(o.material) : [];
      for (const m of mats) { for (const k in m) { const v = m[k]; if (v && v.isTexture) v.dispose(); } m.dispose?.(); }
    });
  }

  function computeLayout() {
    const w = globalThis.innerWidth || 1, h = globalThis.innerHeight || 1, aspect = w / h;
    camera.aspect = aspect;
    const n = order.length || 1;
    const cols = Math.max(1, Math.min(n, Math.round(2 + aspect * 2.8)));
    const rows = Math.ceil(n / cols);
    const sx = 1.0, sz = 1.2;
    order.forEach((id, i) => {
      const e = cast.get(id); if (!e) return;
      const r = Math.floor(i / cols), inRow = Math.min(cols, n - r * cols), c = i - r * cols;
      e.tx = (c - (inRow - 1) / 2) * sx + (r % 2 ? sx * 0.5 : 0);
      e.tz = -r * sz;
      e.yaw = e.tx < -0.15 ? 0.14 : e.tx > 0.15 ? -0.14 : 0;
    });
    const frontW = Math.min(cols, n) * sx + 0.8, spanH = 2.35 + (rows - 1) * 0.3, vFov = camera.fov * Math.PI / 180;
    const distW = (frontW / 2) / (Math.tan(vFov / 2) * aspect), distH = (spanH / 2) / Math.tan(vFov / 2);
    camDist = Math.max(distW, distH) * 1.04 + (rows - 1) * sz * 0.5;
    camY = 1.0 + (rows - 1) * 0.55; lookY = 0.85 + (rows - 1) * 0.12;
    applyPositions();
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(DPR);
    renderer.setSize(w, h, false);
  }

  function applyPositions() {
    for (const id of order) {
      const e = cast.get(id); if (!e || !e.root) continue;
      e.root.position.x = e.tx + e.centerDX; e.root.position.z = e.tz; e.root.rotation.y = e.yaw;
      if (e.shadow) e.shadow.position.set(e.tx, 0.006, e.tz);
    }
  }

  // cross-fade a girl to a move from the shared pool (skips if the clip hasn't loaded yet — she keeps dancing)
  function playMove(e, id, fade = 0.5) {
    if (!e || !e.mixer || e.current === id) return;
    const src = pool.get(id); if (!src) return;
    let a = e.actions.get(id);
    if (!a) { a = e.mixer.clipAction(retargetHips(src.clip, src.hipsY, e.hipsY)); a.setLoop(THREE.LoopRepeat, Infinity); e.actions.set(id, a); }
    a.enabled = true; a.setEffectiveWeight(1); a.reset(); a.play();
    if (e.currentAction && e.currentAction !== a) a.crossFadeFrom(e.currentAction, fade, true);
    e.currentAction = a; e.current = id;
  }

  let tier = "groove", lastTierAt = 0, rotation = 0;
  function assignMoves(fade = 0.5) {
    const list = TIERS[tier] || GROOVE;
    order.forEach((id, i) => {
      const e = cast.get(id); if (!e || !e.mixer) return;
      // prefer a tier move that's loaded; fall back to her own clip so she never freezes
      const want = list[(i + rotation) % list.length];
      playMove(e, pool.has(want) ? want : (pool.has(id) ? id : e.current), fade);
    });
  }

  async function loadGirl(id) {
    const e = { root: null, mixer: null, actions: new Map(), current: null, currentAction: null, token: 0, tx: 0, tz: 0, yaw: 0, centerDX: 0, baseY: 0, baseScale: 1, nextSwap: performance.now() + 4000 + Math.random() * 7000 };
    cast.set(id, e);
    const token = ++e.token;
    let gltf;
    try { gltf = await loader.loadAsync(glbUrl(id)); } catch (err) { onStatus("failed", `${id}: ${String(err && err.message || err).slice(0, 80)}`); return; }
    if (dead || cast.get(id) !== e || e.token !== token) return;
    const root = gltf.scene;
    root.scale.setScalar(1);
    let box = new THREE.Box3().setFromObject(root);
    const s = TARGET_H / (box.getSize(new THREE.Vector3()).y || TARGET_H);
    root.scale.setScalar(s);
    box = new THREE.Box3().setFromObject(root);
    e.centerDX = -(box.min.x + box.max.x) / 2;
    e.baseY = -box.min.y; root.position.y = e.baseY;
    root.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; o.castShadow = false; } });
    e.mixer = new THREE.AnimationMixer(root);
    const hips = hipsOf(root); e.hips = hips.bone; e.hipsY = hips.y;            // her rig's hips, bind pose (before any mixer)
    // THE FLOOR IS DEFINED BY THE FEET, every frame (owner, 2026-09-11: «всі персонажі мають бути на сцені на
    // полу стояти» — a height bug must be impossible by construction). The foot bones are measured in world
    // space after the mixer runs and the root is lifted so the LOWER foot touches y=0; no bind-pose estimate,
    // no per-rig constant, no clip can float or sink her. `baseY` is only the first frame's guess.
    e.feet = []; root.traverse((o) => { if (/(Toe_End|ToeBase|Foot)$/i.test(o.name)) e.feet.push(o); });
    if (gltf.animations[0] && !pool.has(id)) pool.set(id, { clip: gltf.animations[0], hipsY: e.hipsY });   // seed the library with her own move
    e.baseScale = s; e.root = root;
    scene.add(root);
    e.shadow = new THREE.Mesh(new THREE.CircleGeometry(0.55, 32), shadowMat);
    e.shadow.rotation.x = -Math.PI / 2; scene.add(e.shadow);
    computeLayout();
    playMove(e, pool.has(id) ? id : (pool.keys().next().value), 0);              // dance immediately
    assignMoves(0);                                                              // then fit the current tier
    if (++loaded === 1) onStatus("ready", id);
  }

  function setCast(ids) {
    const want = ORDER.filter((id) => ids.includes(id));
    if (!want.length) return;
    for (const id of [...cast.keys()]) if (!want.includes(id)) { disposeEntry(cast.get(id)); cast.delete(id); }
    order = want;
    for (const id of want) if (!cast.has(id)) loadGirl(id);
    computeLayout();
  }

  let prevPulse = 0, kick = 0, sEnergy = 0, calm = 0, last = 0, raf = 0;
  function frame() {
    if (dead) return;
    raf = requestAnimationFrame(frame);
    if (document.hidden) return;
    const env = getEnv() || {};
    const pulse = clamp(env.pulse || 0, 0, 1);
    const active = env.playing !== false;                                        // paused → calm
    const now = performance.now();
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016; last = now;

    if (!still && active && pulse > prevPulse + 0.05 && pulse > 0.26) kick = 1; else kick *= Math.pow(0.008, dt);
    kick = clamp(kick, 0, 1); prevPulse = pulse;
    sEnergy += ((env.energy ?? pulse) - sEnergy) * clamp(dt * 3, 0, 1);
    calm += (((tier === "calm") ? 1 : 0) - calm) * clamp(dt * 4, 0, 1);

    // the DIRECTOR: choose a tier from energy (paused → calm); dwell so it moves musically, not twitchily
    let target = !active ? "calm" : sEnergy < 0.14 ? "light" : sEnergy < 0.36 ? "groove" : "drive";
    const dwell = (target === "calm" || tier === "calm") ? 500 : 5000;
    if (target !== tier && now - lastTierAt > dwell) { tier = target; lastTierAt = now; rotation++; assignMoves(0.6); }

    const kEff = kick * (1 - calm * 0.85);
    magenta.intensity = (0.85 + 2.4 * pulse) * (1 - calm) + 0.45 * calm;
    green.intensity = (0.85 + 1.9 * Math.max(pulse * 0.7, kick)) * (1 - calm) + 0.45 * calm;
    gold.intensity = (0.6 + 1.3 * pulse) * (1 - calm) + 0.35 * calm;
    key.intensity = 2.0 + 0.7 * pulse * (1 - calm);
    lightPool.material.opacity = (0.35 + 0.65 * pulse) * (1 - calm * 0.7); // the floor breathes with the kick
    lightPool.scale.setScalar(1 + 0.12 * kick);

    // dances always play at ~natural speed — NEVER slow-mo (that reads as cringe). Calm differs by move choice
    // (light tier) + dimmed lights + no kick, not by slowing the clip. (A true standing idle is a future move.)
    const ts = still ? 1 : (0.9 + 0.45 * clamp(sEnergy * 1.5, 0, 1));
    const sq = 1 - 0.055 * kEff, ex = 1 + 0.05 * kEff, hop = 0.055 * kEff;
    const list = TIERS[tier] || GROOVE;
    for (const id of order) {
      const e = cast.get(id); if (!e || !e.mixer || !e.root) continue;
      // keep the floor ALIVE: each girl swaps to another move of the tier on her own clock (staggered),
      // so even a steady passage keeps evolving. Paused/calm → hold the calm move.
      if (active && tier !== "calm" && list.length > 1 && now > e.nextSwap) {
        let m = e.current; for (let k = 0; k < 4 && (m === e.current || !pool.has(m)); k++) m = list[(Math.random() * list.length) | 0];
        playMove(e, m, 0.7); e.nextSwap = now + 7000 + Math.random() * 7000;
      }
      e.mixer.timeScale = ts; e.mixer.update(dt);
      e.root.scale.set(e.baseScale * ex, e.baseScale * sq, e.baseScale * ex);
      if (e.feet && e.feet.length) {
        // ground by the feet: measure the lowest foot with the root at 0, then lift by exactly that much
        e.root.position.y = 0; e.root.updateMatrixWorld(true);
        let low = Infinity; for (const f of e.feet) { f.getWorldPosition(_v); if (_v.y < low) low = _v.y; }
        e.root.position.y = (Number.isFinite(low) ? -low : e.baseY) + hop;
      } else e.root.position.y = e.baseY + hop;
      // the contact shadow follows the HIPS, not the model's origin — a dance travels, the origin does not
      if (e.hips && e.shadow) { e.root.updateMatrixWorld(); e.hips.getWorldPosition(_v); e.shadow.position.x = _v.x; e.shadow.position.z = _v.z; }
    }

    const tx = env.tiltX || 0, ty = env.tiltY || 0;
    camera.position.set(tx * 0.24, camY - ty * 0.18, camDist);
    camera.lookAt(0, lookY, 0);
    renderer.render(scene, camera);
  }

  computeLayout();
  addEventListener("resize", computeLayout);
  frame();

  return {
    ok: true,
    setCast,
    dispose() {
      dead = true; cancelAnimationFrame(raf); removeEventListener("resize", computeLayout);
      for (const e of cast.values()) disposeEntry(e);
      try { renderer.dispose(); renderer.forceContextLoss?.(); } catch { /* gone */ }
    },
  };
}
