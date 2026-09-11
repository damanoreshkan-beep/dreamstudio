// afterdark — the 3D dance stage (Three.js on a transparent canvas, over the afterdark.frag rave and under
// the DOM chrome). It renders a TRIO of rigged girls, each playing her own dance clip, LOCKED to the live
// beat: the kick (env.pulse) drives a per-frame squash/stretch punch + a rim-light flash on every girl at
// once, and the section energy nudges each mixer's timeScale — so they visibly FEEL the track, not loop on a
// timer. No audio → the idle groove still feeds pulse, so they sway, never freeze.
//
// PROBE-guarded like the shader: created only where WebGL answers; the view skips it under the headless gate
// (Draco decoder + addons + GLBs over CDNs would flake CI) and the DOM carries every meaning axe/e2e need.

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { glbUrl } from "./girls.js";

const DRACO_PATH = "https://www.gstatic.com/draco/versioned/decoders/1.5.7/";
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const TARGET_H = 1.7;                         // every girl normalised to this height (Mixamo scales vary)

// the rave palette, as lights (matches afterdark.frag: magenta / green / gold on near-black)
const C_KEY = 0xffe9f4, C_MAG = 0xff3eb5, C_GRN = 0x39ff6a, C_GOLD = 0xf5b942;

export function createDanceStage(canvas, getEnv, onReady) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "low-power" });
  } catch { return { ok: false, setTrio() {}, dispose() {} }; }
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  const DPR = Math.min(1.75, globalThis.devicePixelRatio || 1);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
  const still = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

  // lighting — DIRECTIONAL, so all three girls are lit evenly regardless of how far apart they stand (point
  // lights fell off with distance and left the flanks dim). A bright front key + a coloured hemisphere fill,
  // then magenta-left / green-right / gold-back-rim stage lights that punch on the beat.
  const hemi = new THREE.HemisphereLight(0x9a7ad8, 0x161022, 0.95); scene.add(hemi);
  const key = new THREE.DirectionalLight(C_KEY, 2.0); key.position.set(0.5, 3.5, 4); scene.add(key);
  const magenta = new THREE.DirectionalLight(C_MAG, 0.9); magenta.position.set(-4, 2.2, 2); scene.add(magenta);
  const green = new THREE.DirectionalLight(C_GRN, 0.9); green.position.set(4, 2.2, 2); scene.add(green);
  const gold = new THREE.DirectionalLight(C_GOLD, 0.7); gold.position.set(0, 3, -4); scene.add(gold);   // back rim: lifts them off the black

  const draco = new DRACOLoader().setDecoderPath(DRACO_PATH);
  const loader = new GLTFLoader().setDRACOLoader(draco);

  // three floor slots: lead centre-front, two flankers back. Their x/z are LAID OUT per aspect (portrait packs
  // them into a tight depth-staggered cluster so each still reads big on a phone; landscape fans them out).
  const slots = [
    { sign: -1, yaw: 0.20, id: null, root: null, mixer: null, centerDX: 0, baseY: 0, baseScale: 1, token: 0 },
    { sign: 0, yaw: 0.0, id: null, root: null, mixer: null, centerDX: 0, baseY: 0, baseScale: 1, token: 0 },
    { sign: 1, yaw: -0.20, id: null, root: null, mixer: null, centerDX: 0, baseY: 0, baseScale: 1, token: 0 },
  ];
  let layout = { spread: 1.45, frontZ: 0.45, backZ: -0.45 };
  const placeSlot = (slot) => {
    if (!slot.root) return;
    slot.root.position.x = layout.spread * slot.sign + slot.centerDX;
    slot.root.position.z = slot.sign === 0 ? layout.frontZ : layout.backZ;
  };
  let dead = false, loaded = 0;

  function disposeRoot(root) {
    if (!root) return;
    scene.remove(root);
    root.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      const mats = o.material ? [].concat(o.material) : [];
      for (const m of mats) { for (const k in m) { const v = m[k]; if (v && v.isTexture) v.dispose(); } m.dispose?.(); }
    });
  }

  async function loadSlot(i, id) {
    const slot = slots[i];
    if (slot.id === id && slot.root) return;
    const token = ++slot.token; slot.id = id;
    let gltf;
    try { gltf = await loader.loadAsync(glbUrl(id)); } catch { return; }        // a girl that will not load: her slot stays empty
    if (dead || slot.token !== token) { return; }                               // a newer pick superseded this one
    disposeRoot(slot.root); slot.mixer?.stopAllAction();
    const root = gltf.scene;
    root.scale.setScalar(1); root.rotation.y = slot.yaw;
    let box = new THREE.Box3().setFromObject(root);
    const s = TARGET_H / (box.getSize(new THREE.Vector3()).y || TARGET_H);
    root.scale.setScalar(s);
    box = new THREE.Box3().setFromObject(root);                                  // re-measure at final scale+yaw
    slot.centerDX = -(box.min.x + box.max.x) / 2;
    root.position.y = -box.min.y;                                               // feet on the floor (y=0)
    root.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; o.castShadow = false; } });
    const mixer = new THREE.AnimationMixer(root);
    if (gltf.animations[0]) { const a = mixer.clipAction(gltf.animations[0]); a.play(); a.time = Math.random() * 1.4; mixer.update(0); }
    slot.root = root; slot.mixer = mixer; slot.baseY = root.position.y; slot.baseScale = s;
    placeSlot(slot);                                                            // x/z from the current aspect layout
    scene.add(root);
    if (++loaded === 1) onReady?.();
  }

  function setTrio(ids) { for (let i = 0; i < 3; i++) if (ids[i]) loadSlot(i, ids[i]); }

  function frameCam() {
    const w = globalThis.innerWidth || 1, h = globalThis.innerHeight || 1, aspect = w / h;
    camera.aspect = aspect;
    const portrait = aspect < 0.85;
    // portrait: a tight cluster, flankers set further back so they read smaller and peek past the lead;
    // landscape: fanned out across the floor, shallow depth. Frame by HEIGHT so a girl fills the same
    // fraction of the screen either way (no more tiny dancers lost in a wide viewport).
    layout = portrait ? { spread: 0.74, frontZ: 0.55, backZ: -0.85 } : { spread: 1.45, frontZ: 0.45, backZ: -0.45 };
    const spanH = portrait ? 2.55 : 2.25, vFov = camera.fov * Math.PI / 180;
    camDist = (spanH / 2) / Math.tan(vFov / 2);
    for (const s of slots) placeSlot(s);
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(DPR);
    renderer.setSize(w, h, false);
  }
  let camDist = 6;

  // per-frame state: rising-edge kick detector + smoothed section energy
  let prevPulse = 0, kick = 0, sEnergy = 0, last = 0;
  let raf = 0;
  function frame() {
    if (dead) return;
    raf = requestAnimationFrame(frame);
    if (document.hidden) return;
    const env = getEnv() || {};
    const pulse = clamp(env.pulse || 0, 0, 1);
    const now = performance.now();
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016; last = now;

    // the kick: a fast rise crossing a floor fires a punch; it decays within ~half a beat
    if (!still && pulse > prevPulse + 0.05 && pulse > 0.26) kick = 1; else kick *= Math.pow(0.008, dt);
    kick = clamp(kick, 0, 1); prevPulse = pulse;
    sEnergy += ((env.energy ?? pulse) - sEnergy) * clamp(dt * 3, 0, 1);

    // stage lights breathe with the track; magenta hits hardest on the kick
    magenta.intensity = 0.85 + 2.4 * pulse;
    green.intensity = 0.85 + 1.9 * Math.max(pulse * 0.7, kick);
    gold.intensity = 0.6 + 1.3 * pulse;
    key.intensity = 2.0 + 0.7 * pulse;

    for (const slot of slots) {
      if (!slot.mixer || !slot.root) continue;
      slot.mixer.timeScale = still ? 1 : (0.9 + 0.45 * clamp(sEnergy * 1.5, 0, 1));
      slot.mixer.update(dt);
      const sq = 1 - 0.055 * kick, ex = 1 + 0.05 * kick, b = slot.baseScale;   // volume-conserving squash, anchored at feet
      slot.root.scale.set(b * ex, b * sq, b * ex);
      slot.root.position.y = slot.baseY + 0.055 * kick;
    }

    // gentle parallax: the whole stage leans with device/pointer tilt
    const tx = env.tiltX || 0, ty = env.tiltY || 0;
    camera.position.set(tx * 0.24, 1.05 - ty * 0.18, camDist);
    camera.lookAt(0, 0.95, 0);
    renderer.render(scene, camera);
  }

  frameCam();
  addEventListener("resize", frameCam);
  frame();

  return {
    ok: true,
    setTrio,
    dispose() {
      dead = true; cancelAnimationFrame(raf); removeEventListener("resize", frameCam);
      for (const s of slots) disposeRoot(s.root);
      try { renderer.dispose(); renderer.forceContextLoss?.(); } catch { /* gone */ }
    },
  };
}
