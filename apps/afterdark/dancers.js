// afterdark — the 3D dance stage (Three.js on a transparent canvas, over the afterdark.frag rave and under
// the DOM chrome). It renders ANY cast of 1..11 rigged girls, each playing her own dance clip, LOCKED to the
// live beat: the kick (env.pulse) drives a per-frame squash/stretch punch + a rim-light flash on every girl
// at once, and the section energy nudges each mixer's timeScale — so they visibly FEEL the track. The cast is
// laid out as a crowd (rows that recede in depth) sized to FIT the viewport width: more girls → packed wider
// and set further back, never spilling off the edge. No audio → the idle groove still feeds pulse.
//
// PROBE-guarded like the shader: created only where WebGL answers; the view skips it under the headless gate.

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { GIRLS, glbUrl } from "./girls.js";

const DRACO_PATH = "https://www.gstatic.com/draco/versioned/decoders/1.5.7/";
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const TARGET_H = 1.7;                          // every girl normalised to this height (Mixamo scales vary)
const ORDER = GIRLS.map((g) => g.id);          // stable layout order, so toggling one never reshuffles the rest

const C_KEY = 0xffe9f4, C_MAG = 0xff3eb5, C_GRN = 0x39ff6a, C_GOLD = 0xf5b942;

export function createDanceStage(canvas, getEnv, onReady) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "low-power" });
  } catch { return { ok: false, setCast() {}, dispose() {} }; }
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  const DPR = Math.min(1.75, globalThis.devicePixelRatio || 1);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
  const still = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

  // DIRECTIONAL lighting (even across a wide crowd; point lights fell off with distance): bright front key,
  // a coloured hemisphere fill, magenta-left / green-right / gold-back-rim that punch on the beat.
  const hemi = new THREE.HemisphereLight(0x9a7ad8, 0x161022, 0.95); scene.add(hemi);
  const key = new THREE.DirectionalLight(C_KEY, 2.0); key.position.set(0.5, 3.5, 4); scene.add(key);
  const magenta = new THREE.DirectionalLight(C_MAG, 0.9); magenta.position.set(-4, 2.2, 2); scene.add(magenta);
  const green = new THREE.DirectionalLight(C_GRN, 0.9); green.position.set(4, 2.2, 2); scene.add(green);
  const gold = new THREE.DirectionalLight(C_GOLD, 0.7); gold.position.set(0, 3, -4); scene.add(gold);

  const draco = new DRACOLoader().setDecoderPath(DRACO_PATH);
  const loader = new GLTFLoader().setDRACOLoader(draco);

  const cast = new Map();       // id -> { root, mixer, baseY, baseScale, centerDX, token, tx, tz, yaw }
  let order = [];               // ids currently on stage, in ORDER
  let dead = false, loaded = 0, camDist = 6, camY = 1.05, lookY = 0.95;

  function disposeEntry(e) {
    if (!e || !e.root) return;
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
    const cols = Math.max(1, Math.min(n, Math.round(2 + aspect * 2.8)));   // portrait ~3, landscape ~7
    const rows = Math.ceil(n / cols);
    const sx = 1.0, sz = 1.2;
    order.forEach((id, i) => {
      const e = cast.get(id); if (!e) return;
      const r = Math.floor(i / cols), inRow = Math.min(cols, n - r * cols), c = i - r * cols;
      e.tx = (c - (inRow - 1) / 2) * sx + (r % 2 ? sx * 0.5 : 0);          // stagger alternate rows to peek through
      e.tz = -r * sz;                                                       // deeper rows recede
      e.yaw = e.tx < -0.15 ? 0.14 : e.tx > 0.15 ? -0.14 : 0;
    });
    // frame so the front row fits the width AND the crowd fits the height; more rows → pull back + look down
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
    }
  }

  async function loadGirl(id) {
    const e = { root: null, mixer: null, token: 0, tx: 0, tz: 0, yaw: 0, centerDX: 0, baseY: 0, baseScale: 1 };
    cast.set(id, e);
    const token = ++e.token;
    let gltf;
    try { gltf = await loader.loadAsync(glbUrl(id)); } catch { return; }
    if (dead || cast.get(id) !== e || e.token !== token) return;              // removed/superseded mid-load
    const root = gltf.scene;
    root.scale.setScalar(1);
    let box = new THREE.Box3().setFromObject(root);
    const s = TARGET_H / (box.getSize(new THREE.Vector3()).y || TARGET_H);
    root.scale.setScalar(s);
    box = new THREE.Box3().setFromObject(root);
    e.centerDX = -(box.min.x + box.max.x) / 2;
    e.baseY = -box.min.y; root.position.y = e.baseY;                          // feet on the floor
    root.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; o.castShadow = false; } });
    const mixer = new THREE.AnimationMixer(root);
    if (gltf.animations[0]) { const a = mixer.clipAction(gltf.animations[0]); a.play(); a.time = Math.random() * 1.4; mixer.update(0); }
    e.root = root; e.mixer = mixer; e.baseScale = s;
    scene.add(root);
    computeLayout();                                                          // re-fit now that a new girl is in
    if (++loaded === 1) onReady?.();
  }

  // the cast: 1..N ids. Add the new, drop the gone, keep the rest — never reload a girl already on stage.
  function setCast(ids) {
    const want = ORDER.filter((id) => ids.includes(id));
    if (!want.length) return;
    for (const id of [...cast.keys()]) if (!want.includes(id)) { disposeEntry(cast.get(id)); cast.delete(id); }
    order = want;
    for (const id of want) if (!cast.has(id)) loadGirl(id);
    computeLayout();
  }

  let prevPulse = 0, kick = 0, sEnergy = 0, last = 0, raf = 0;
  function frame() {
    if (dead) return;
    raf = requestAnimationFrame(frame);
    if (document.hidden) return;
    const env = getEnv() || {};
    const pulse = clamp(env.pulse || 0, 0, 1);
    const now = performance.now();
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016; last = now;

    if (!still && pulse > prevPulse + 0.05 && pulse > 0.26) kick = 1; else kick *= Math.pow(0.008, dt);
    kick = clamp(kick, 0, 1); prevPulse = pulse;
    sEnergy += ((env.energy ?? pulse) - sEnergy) * clamp(dt * 3, 0, 1);

    magenta.intensity = 0.85 + 2.4 * pulse;
    green.intensity = 0.85 + 1.9 * Math.max(pulse * 0.7, kick);
    gold.intensity = 0.6 + 1.3 * pulse;
    key.intensity = 2.0 + 0.7 * pulse;

    const ts = still ? 1 : (0.9 + 0.45 * clamp(sEnergy * 1.5, 0, 1)), sq = 1 - 0.055 * kick, ex = 1 + 0.05 * kick, hop = 0.055 * kick;
    for (const id of order) {
      const e = cast.get(id); if (!e || !e.mixer || !e.root) continue;
      e.mixer.timeScale = ts; e.mixer.update(dt);
      e.root.scale.set(e.baseScale * ex, e.baseScale * sq, e.baseScale * ex);
      e.root.position.y = e.baseY + hop;
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
