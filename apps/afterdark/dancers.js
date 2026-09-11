// afterdark — the 3D dance stage (Three.js on a transparent canvas, over the afterdark.frag rave and under
// the DOM chrome). It renders ANY cast of 1..11 rigged girls as a crowd sized to FIT the viewport width, and
// drives them from a SHARED MOVE LIBRARY (dances.js): because every girl is the same Mixamo skeleton, any clip
// retargets onto anyone, so the stage is an AUTO-CHOREOGRAPHER — it reads the live BEAT CLOCK and cross-fades
// the whole floor between light / groove / drive moves, each dancer offset so no two do the same thing.
//
// IN TIME, not just on loudness (v2): the LIGHTING carries the time (below) AND — owner, 2026-09-11, second
// call: «рухи повинні бути у такт з ритмом, хоча б на 30%, глітч допустимий» — every clip is RATE-LOCKED to
// the track (its whole-beat loop vs the live bpm, at least 30 % of the correction, all of it when the clock
// is sure, within ±25 %) and nudged into phase with the bar every bar. The beat clock drives the LIGHTING
// RIG: a four-colour chase (one wash leads each beat of the bar), the ambient dimming between beats and
// popping on each one, a dip before the downbeat and a slam on it, a white strobe in the drive tier, the
// dancefloor grid and the light pool — all on the ANTICIPATED beat phase, with the kick transient as the
// fallback wherever the clock is unsure (breakdown, idle groove). Musical structure only picks moves: tiers
// change on a PHRASE (16 beats), per-girl swaps land on a BAR. The reactive grid lives HERE (a 3D plane
// under their feet has real perspective; the shader background is occluded by the matte floor). On pause
// everyone eases into the breathing idle under house lights.
//
// THEME-LIT (owner, 2026-09-11): the rig's colours come from the active theme (palette.js → env.pal: four
// washes, sun, room tones, key) and a light theme lights the floor as DAY (env.day 0..1): a sunlit sky fill,
// a warm strong key, the washes and the strobe pulled back (daylight cannot black out), a paper-toned floor.
//
// PROBE-guarded like the shader: created only where WebGL answers; the view skips it under the headless gate.

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { GIRLS, glbUrl } from "./girls.js";
import { DEFAULT_MOVES, moveUrl, tiersFor } from "./dances.js";

const DRACO_PATH = "https://www.gstatic.com/draco/versioned/decoders/1.5.7/";
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const frac = (x) => x - Math.floor(x);
const TARGET_H = 1.7;
const ORDER = GIRLS.map((g) => g.id);
const IDLE_URL = new URL("assets/clip-idle.glb", import.meta.url).href;   // top-level: the build copies files in assets/, not subdirs
const LOCK = 0.3;                                                    // clock confidence above which the floor follows it
const CLIP_BPM_REF = 125;                                            // Mixamo dance clips are captured near this tempo
const SYNC_MIN = 0.3;                                                // the least of the tempo correction ever applied while locked
const MIN_GAP = 0.8;                                                 // metres between two girls' hips — never inside each other
const MAX_DRIFT_X = 1.4, MAX_DRIFT_Z = 1.1;                          // how far the crowd solver may push a girl off her slot

const C_KEY = 0xffe9f4, C_MAG = 0xff3eb5, C_GRN = 0x39ff6a, C_GOLD = 0xf5b942, C_VIO = 0x8b5cf6;
// the wash ramp the floor cycles per bar — the brand colours until the theme palette arrives, then the theme's
const BAR_COLORS = [new THREE.Color(C_MAG), new THREE.Color(C_VIO), new THREE.Color(C_GRN), new THREE.Color(C_GOLD)];
const NIGHT_SKY = new THREE.Color(0x9a7ad8), NIGHT_GROUND = new THREE.Color(0x161022), NIGHT_FLOOR = new THREE.Color(0x07040c), WHITE = new THREE.Color(0xffffff);
const _c = new THREE.Color(), _c2 = new THREE.Color(), _sun = new THREE.Color(), _key = new THREE.Color(), _bot = new THREE.Color();

// the reactive dancefloor: an additive grid that scrolls toward the crowd, brightens on the beat, and rings
// out from the centre on every bar; colour cycles with the bar. uBeat/uBar are the ANTICIPATED phases.
const FLOOR_VERT = `varying vec2 vP; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vP = w.xz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const FLOOR_FRAG = `precision highp float; varying vec2 vP;
uniform float uTime, uBeat, uBar, uPulse, uConf, uCalm, uDay; uniform vec3 uColor, uColor2;
void main(){
  float beat = 0.25 + 0.9 * max(uPulse, exp(-uBeat * 5.0) * uConf);
  vec2 g = abs(fract(vP * 0.9 + vec2(0.0, uTime * 0.18)) - 0.5);
  float line = 1.0 - smoothstep(0.0, 0.07, min(g.x, g.y));
  vec2 c = vP - vec2(0.0, -0.8);
  float r = length(c);
  float ring = exp(-pow((r - uBar * 6.0) * 1.6, 2.0)) * (1.0 - uBar) * uConf;
  float fade = 1.0 - smoothstep(1.0, 7.5, r);
  vec3 col = mix(uColor, uColor2, smoothstep(0.0, 1.0, uBar));
  float a = (line * beat * 0.32 + ring * 0.55) * fade * (1.0 - 0.8 * uCalm) * (1.0 - 0.6 * uDay);
  gl_FragColor = vec4(col * a, 0.0);
}`;

// `onStatus(state, detail)` is the stage's DOM readout (glstage law: every meaning the canvas carries is
// also in the DOM): "ready" once the first girl dances, "failed" with the reason when a GLB or the decoder
// does not arrive — the drive and the client log read it, a silent catch told nobody (2026-09-11).
export function createDanceStage(canvas, getEnv, onStatus = () => {}) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "low-power" });
  } catch (e) { onStatus("failed", String(e && e.message || e).slice(0, 80)); return { ok: false, setCast() {}, setMoves() {}, dispose() {} }; }
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
  // the WASHES: four coloured lights around the floor — the chase steps through them beat by beat
  const magenta = new THREE.DirectionalLight(C_MAG, 0.9); magenta.position.set(-4, 2.2, 2); scene.add(magenta);
  const green = new THREE.DirectionalLight(C_GRN, 0.9); green.position.set(4, 2.2, 2); scene.add(green);
  const gold = new THREE.DirectionalLight(C_GOLD, 0.7); gold.position.set(0, 3, -4); scene.add(gold);
  const violet = new THREE.DirectionalLight(C_VIO, 0.7); violet.position.set(-1, 3.2, -3); scene.add(violet);
  const washes = [magenta, green, gold, violet];

  // ── the floor: what grounds a figure. A dark, half-transparent plane catches the coloured lights (the rave
  // field still shows through it, but the girls stop floating in a void), the reactive grid + an additive
  // light pool under the crowd breathe with the beat, and each dancer stands on her own soft contact shadow.
  // Standard meshes with canvas-drawn gradients — no shadow maps, which a weak GPU cannot afford.
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
  const gridU = { uTime: { value: 0 }, uBeat: { value: 0 }, uBar: { value: 0 }, uPulse: { value: 0 }, uConf: { value: 0 }, uCalm: { value: 0 }, uDay: { value: 0 }, uColor: { value: BAR_COLORS[0].clone() }, uColor2: { value: BAR_COLORS[1].clone() } };
  // ADDITIVE LIGHT ON A TRANSPARENT CANVAS: the stock AdditiveBlending also ADDS ALPHA, so wherever a light
  // layer covers the (semi-transparent) floor the canvas pixel turns opaque and the page composites its
  // premultiplied — i.e. darkened — colour: the floor read as a black slab by day (measured 2026-09-11).
  // Custom blending adds colour only (dst alpha × 1 + src alpha × 0), so light leaks onto the field behind.
  const additive = { blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor, depthWrite: false, transparent: true };
  const grid = new THREE.Mesh(new THREE.PlaneGeometry(18, 18), new THREE.ShaderMaterial({ uniforms: gridU, vertexShader: FLOOR_VERT, fragmentShader: FLOOR_FRAG, ...additive }));
  grid.rotation.x = -Math.PI / 2; grid.position.set(0, 0.003, -1.5); scene.add(grid);
  // the pool's map carries its falloff in RGB (black edge), not in alpha, so colour-only blending fades it
  const lightPool = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), new THREE.MeshBasicMaterial({ map: radial("rgba(77,77,77,1)", "rgba(0,0,0,1)"), color: C_MAG, ...additive }));   // grey map × the lead wash colour
  lightPool.rotation.x = -Math.PI / 2; lightPool.position.set(0, 0.004, -0.6); scene.add(lightPool);
  const shadowMat = new THREE.MeshBasicMaterial({ map: radial("rgba(0,0,0,0.6)", "rgba(0,0,0,0)"), transparent: true, depthWrite: false });

  // ── SMOKE + VOLUMETRIC CONES (owner, 2026-09-11: «напускай диму, світло має бути фізика», at no FPS cost).
  // No post-processing: the classic club fakes. The haze is a POINT CLOUD of soft sprites drifting up
  // through the stage (one draw call), tinted by whichever wash leads the beat — smoke is what makes light
  // visible. The four fixtures hang open CONES over the floor with a fresnel-soft, apex-bright shader
  // (colour-only additive, like the grid): a beam through haze, brightening with its wash's chase and
  // swaying slowly. Daylight thins both.
  const SMOKE_N = 72;
  const smokePos = new Float32Array(SMOKE_N * 3), smokeVel = new Float32Array(SMOKE_N * 3), smokeSeed = new Float32Array(SMOKE_N);
  const respawn = (i, fresh) => {
    smokePos[i * 3] = (Math.random() - 0.5) * 9; smokePos[i * 3 + 1] = fresh ? Math.random() * 2.4 : -0.3 + Math.random() * 0.4; smokePos[i * 3 + 2] = -4.5 + Math.random() * 6.5;
    smokeVel[i * 3] = (Math.random() - 0.5) * 0.1; smokeVel[i * 3 + 1] = 0.05 + Math.random() * 0.07; smokeVel[i * 3 + 2] = (Math.random() - 0.5) * 0.06;
    smokeSeed[i] = Math.random() * 6.28;
  };
  for (let i = 0; i < SMOKE_N; i++) respawn(i, true);
  const smokeGeo = new THREE.BufferGeometry();
  smokeGeo.setAttribute("position", new THREE.BufferAttribute(smokePos, 3).setUsage(THREE.DynamicDrawUsage));
  const smokeMat = new THREE.PointsMaterial({ map: radial("rgba(255,255,255,0.5)", "rgba(255,255,255,0)"), size: 2.6, sizeAttenuation: true, transparent: true, depthWrite: false, opacity: 0.3, color: 0x8c88a0 });
  const smoke = new THREE.Points(smokeGeo, smokeMat); smoke.frustumCulled = false; scene.add(smoke);
  const CONE_VERT = `varying float vA; varying float vF; void main(){ vA = uv.y; vec4 mv = modelViewMatrix * vec4(position, 1.0); vec3 n = normalize(normalMatrix * normal); vF = 1.0 - abs(dot(n, normalize(-mv.xyz))); gl_Position = projectionMatrix * mv; }`;
  const CONE_FRAG = `precision highp float; varying float vA; varying float vF; uniform vec3 uColor; uniform float uPower;
void main(){ float along = pow(vA, 2.4); float edge = 0.04 + 0.96 * pow(vF, 2.2); gl_FragColor = vec4(uColor * along * edge * uPower * 0.3, 0.0); }`;
  const coneGeo = new THREE.ConeGeometry(1.15, 4.4, 28, 1, true); coneGeo.translate(0, -2.2, 0);   // origin = the apex (the fixture)
  const cones = [-1.8, -0.6, 0.6, 1.8].map((x, i) => {
    const m = new THREE.Mesh(coneGeo, new THREE.ShaderMaterial({ uniforms: { uColor: { value: BAR_COLORS[i].clone() }, uPower: { value: 0 } }, vertexShader: CONE_VERT, fragmentShader: CONE_FRAG, side: THREE.DoubleSide, ...additive }));
    m.position.set(x, 3.7, -1.4); scene.add(m); return m;
  });

  const draco = new DRACOLoader().setDecoderPath(DRACO_PATH);
  const loader = new GLTFLoader().setDRACOLoader(draco);

  // the move pool: id -> { clip, hipsY } (shared across all girls; hipsY = the SOURCE rig's hips bind height)
  const pool = new Map();
  const loading = new Set();
  // "The same Mixamo skeleton" is the same bone tree, NOT the same size: the rigs' hips sit at 0.37 (pirate),
  // 0.71 (kaya), 1.03 (michelle), 1.13 (akai) in their own units (measured 2026-09-11, glb-inspect). A clip's
  // Hips.position track is in its SOURCE rig's units, so played raw on a smaller rig it lifts her off the
  // floor by the difference, times her fit scale — Pirate flew a metre up. Standard retargeting of the root
  // translation: scale the hips track by target/source bind height; rotations retarget as they are.
  const hipsOf = (obj) => { let h = null; obj.traverse((o) => { if (!h && /hips$/i.test(o.name)) h = o; }); return h ? { bone: h, y: h.position.y, prefix: h.name.replace(/hips$/i, "") } : { bone: null, y: 0, prefix: "" }; };
  // "The same Mixamo skeleton" is also not the same NAMES: Mixamo numbers a rig it has seen before —
  // Louise's bones are `mixamorig8:Hips`, everyone else's `mixamorig:Hips` (measured 2026-09-11: 53
  // "No target node found" warnings and a girl frozen mid-pose). A clip's tracks are renamed to the target
  // rig's prefix, then the hips translation is scaled by target/source bind height.
  const retargetHips = (clip, srcY, dstY, srcPrefix, dstPrefix) => {
    const rename = srcPrefix && dstPrefix && srcPrefix !== dstPrefix;
    const scale = srcY && dstY && Math.abs(srcY - dstY) >= 1e-4;
    if (!rename && !scale) return clip;
    const c = clip.clone(), r = scale ? dstY / srcY : 1;
    for (const t of c.tracks) {
      if (rename && t.name.startsWith(srcPrefix)) t.name = dstPrefix + t.name.slice(srcPrefix.length);
      if (scale && /hips\.position$/i.test(t.name)) for (let i = 0; i < t.values.length; i++) t.values[i] *= r;
    }
    return c;
  };
  // a clip's beat count: snap its loop to whole beats at the capture tempo (a 4.6 s clip ≈ 10 beats)
  const poolEntry = (clip, hips) => { const beats = Math.max(1, Math.round(clip.duration * CLIP_BPM_REF / 60)); return { clip, hipsY: hips.y, prefix: hips.prefix || (clip.tracks[0]?.name.replace(/hips\..*$/i, "") ?? ""), beats, bpm: beats * 60 / clip.duration }; };
  function loadClip(id, url) {
    if (pool.has(id) || loading.has(id)) return;
    loading.add(id);
    loader.loadAsync(url).then((g) => { loading.delete(id); if (!dead && g.animations[0]) { pool.set(id, poolEntry(g.animations[0], hipsOf(g.scene))); assignMoves(); } }).catch(() => { loading.delete(id); });
  }
  loadClip("idle", IDLE_URL);                                      // the breathing idle — a real standing wait (pause)

  const _v = new THREE.Vector3();
  const cast = new Map();       // girl id -> { root, mixer, actions:Map, current, currentAction, baseY, baseScale, centerDX, token, tx, tz, yaw }
  let order = [];
  let dead = false, loaded = 0, camDist = 6, camY = 1.05, lookY = 0.95;
  let tiers = tiersFor(DEFAULT_MOVES), moves = DEFAULT_MOVES.slice();

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
      e.root.position.x = e.tx + e.centerDX + e.ox; e.root.position.z = e.tz + e.oz; e.root.rotation.y = e.yaw;
      if (e.shadow) e.shadow.position.set(e.tx, 0.006, e.tz);
    }
  }

  // cross-fade a girl to a move from the shared pool (skips if the clip hasn't loaded yet — she keeps dancing)
  function playMove(e, id, fade = 0.5) {
    if (!e || !e.mixer || e.current === id) return;
    const src = pool.get(id); if (!src) return;
    let a = e.actions.get(id);
    if (!a) { a = e.mixer.clipAction(retargetHips(src.clip, src.hipsY, e.hipsY, src.prefix, e.prefix)); a.setLoop(THREE.LoopRepeat, Infinity); e.actions.set(id, a); }
    a.enabled = true; a.setEffectiveWeight(1); a.reset(); a.play();
    if (e.currentAction && e.currentAction !== a) a.crossFadeFrom(e.currentAction, fade, true);
    e.currentAction = a; e.current = id;
  }

  let tier = "groove", lastTierAt = 0, rotation = 0;
  function assignMoves(fade = 0.5) {
    const list = tiers[tier] || tiers.groove;
    order.forEach((id, i) => {
      const e = cast.get(id); if (!e || !e.mixer) return;
      // prefer a tier move that's loaded; fall back to her own clip so she never freezes
      const want = list[(i + rotation) % list.length];
      playMove(e, pool.has(want) ? want : (pool.has(id) ? id : e.current), fade);
    });
  }

  async function loadGirl(id) {
    const e = { root: null, mixer: null, actions: new Map(), current: null, currentAction: null, token: 0, tx: 0, tz: 0, yaw: 0, centerDX: 0, baseY: 0, baseScale: 1, ox: 0, oz: 0, hx: 0, hz: 0, nextSwap: performance.now() + 4000 + Math.random() * 7000, nextSwapBar: 2 + ((Math.random() * 4) | 0) };
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
    const hips = hipsOf(root); e.hips = hips.bone; e.hipsY = hips.y; e.prefix = hips.prefix;   // her rig's hips + bone-name prefix, bind pose (before any mixer)
    // THE FLOOR IS DEFINED BY THE FEET, every frame (owner, 2026-09-11: «всі персонажі мають бути на сцені на
    // полу стояти» — a height bug must be impossible by construction). The foot bones are measured in world
    // space after the mixer runs and the root is lifted so the LOWER foot touches y=0; no bind-pose estimate,
    // no per-rig constant, no clip can float or sink her. `baseY` is only the first frame's guess.
    e.feet = []; root.traverse((o) => { if (/(Toe_End|ToeBase|Foot)$/i.test(o.name)) e.feet.push(o); });
    if (gltf.animations[0] && !pool.has(id)) pool.set(id, poolEntry(gltf.animations[0], hips));   // her own move: the instant fallback
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

  // the switched-on moves: fetch what is new (on demand), rebuild the tiers, re-seat the floor
  function setMoves(ids) {
    const want = ids.filter((id) => moveUrl(id));
    if (!want.length) return;
    moves = want; tiers = tiersFor(moves);
    for (const id of moves) loadClip(id, moveUrl(id));
    assignMoves(0.6);
  }
  setMoves(moves);

  let prevPulse = 0, kick = 0, sEnergy = 0, calm = 0, last = 0, raf = 0, t0 = 0;
  let lastBar = -1, lastPhrase = -1, colorIdx = 0;
  function frame() {
    if (dead) return;
    raf = requestAnimationFrame(frame);
    if (document.hidden) return;
    const env = getEnv() || {};
    const pulse = clamp(env.pulse || 0, 0, 1);
    const active = env.playing !== false;                                        // paused → calm
    const now = performance.now();
    if (!t0) t0 = now;
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016; last = now;

    // the clock: confident → the floor follows beats/bars/phrases; unsure → transients + timers (as before)
    const conf = clamp(env.confidence || 0, 0, 1), locked = active && conf > LOCK;
    const beatA = frac(env.beatA || 0), barA = frac(env.barA || 0), beatIndex = env.beatIndex | 0;
    const bar = Math.floor(beatIndex / 4), phrase = Math.floor(beatIndex / 16);
    const barTick = locked && bar !== lastBar; if (locked) lastBar = bar;
    const phraseTick = locked && phrase !== lastPhrase; if (locked) lastPhrase = phrase;
    if (barTick) colorIdx = bar % BAR_COLORS.length;

    if (!still && active && pulse > prevPulse + 0.05 && pulse > 0.26) kick = 1; else kick *= Math.pow(0.008, dt);
    kick = clamp(kick, 0, 1); prevPulse = pulse;
    const lit = still ? 0 : (locked ? conf : 0);                                 // how much the rig follows the clock
    const beatEnv = Math.exp(-beatA * 6) * lit;                                  // the anticipated beat, as an envelope
    const hit = Math.max(kick, beatEnv);                                          // what the lights fire on
    sEnergy += ((env.energy ?? pulse) - sEnergy) * clamp(dt * 3, 0, 1);
    calm += (((tier === "calm") ? 1 : 0) - calm) * clamp(dt * 4, 0, 1);

    // the DIRECTOR: choose a tier from energy (paused → calm). Locked → the tier may only change on a PHRASE
    // (16 beats), so the floor turns with the music; unsure → dwell so it moves musically, not twitchily
    const target = !active ? "calm" : sEnergy < 0.14 ? "light" : sEnergy < 0.36 ? "groove" : "drive";
    const dwell = (target === "calm" || tier === "calm") ? 500 : 5000;
    const may = (target === "calm" || tier === "calm") ? now - lastTierAt > dwell : (locked ? phraseTick : now - lastTierAt > dwell);
    if (target !== tier && may) { tier = target; lastTierAt = now; rotation++; assignMoves(0.6); }

    // ── THE LIGHTING RIG (this is where "in time" lives) ──
    // chase: the wash for THIS beat of the bar leads (a full pop), the others stay low; between beats every
    // wash sinks, so the floor blinks with the kick instead of glowing through it. The kick transient still
    // punches everything (unsure clock → that alone runs the rig, as before).
    // THE THEME: colours off env.pal (eased by the view), day 0..1 — applied every frame (a handful of sets)
    const day = clamp(env.day || 0, 0, 1), pal = env.pal;
    if (pal && pal.length >= 32) {
      for (let i = 0; i < 4; i++) { washes[i].color.setRGB(pal[i * 4], pal[i * 4 + 1], pal[i * 4 + 2]); BAR_COLORS[i].copy(washes[i].color); }
      _sun.setRGB(pal[16], pal[17], pal[18]); _bot.setRGB(pal[24], pal[25], pal[26]); _key.setRGB(pal[28], pal[29], pal[30]);
    } else { _sun.setHex(C_GOLD); _bot.copy(NIGHT_FLOOR); _key.setHex(C_KEY); }
    // sky: at night the violet dome tinted by the second wash; by day white warmed by the sun
    hemi.color.copy(NIGHT_SKY).lerp(washes[1].color, 0.35).lerp(_c.copy(WHITE).lerp(_sun, 0.25), day);
    hemi.groundColor.copy(NIGHT_GROUND).lerp(_bot, day);
    key.color.copy(_key).lerp(_c2.copy(_sun).lerp(WHITE, 0.5), day);
    floor.material.color.copy(NIGHT_FLOOR).lerp(_c.copy(_bot).multiplyScalar(0.85), day);
    floor.material.opacity = 0.85 - 0.3 * day;
    renderer.toneMappingExposure = 1.15 - 0.15 * day;
    gridU.uDay.value = day;

    const kEff = kick * (1 - calm * 0.85);
    const drive = tier === "drive" ? 1 : tier === "groove" ? 0.35 : 0;
    const dip = 1 - 0.55 * lit * (barA > 0.86 ? (barA - 0.86) / 0.14 : 0);       // the breath before the downbeat
    const slam = lit * Math.exp(-barA * 4);                                       // the downbeat, a slower envelope
    const chase = beatIndex & 3;
    // by day the washes are coloured accents in sunlight, not the light itself; the sun (key + sky) carries
    // the room, and nothing can black it out — dims, dips and the strobe are pulled back with `day`
    const dayDip = 1 - (1 - dip) * (1 - 0.7 * day);
    for (let i = 0; i < 4; i++) {
      const lead = chase === i ? 1 : 0.22;
      const on = Math.max(pulse * 0.8, beatEnv * lead, slam * 0.5);
      const idle = 0.55 * (1 - lit) + 0.12 * lit;                                // unlit rig: the old steady glow
      washes[i].intensity = ((idle + 2.6 * on) * dayDip) * (1 - calm) * (1 - 0.6 * day) + 0.45 * calm * (1 - 0.5 * day);
    }
    // the key: steady house light when unsure; locked → dims between beats, STROBES in the drive tier; by day
    // it is the SUN — strong, warm, steady, with only a breath of the beat
    const strobe = drive * lit * Math.exp(-beatA * 18) * (0.5 + 0.5 * Math.min(1, sEnergy * 2)) * (1 - 0.85 * day);
    const keyNight = (2.0 * (1 - 0.5 * lit * (1 - beatEnv)) + 0.7 * pulse + 5.5 * strobe) * dip * (1 - calm * 0.4) + 0.8 * calm;
    const keyDay = 3.2 * (1 - 0.12 * lit * (1 - beatEnv)) + 0.3 * pulse + 5.5 * strobe;
    key.intensity = keyNight + (keyDay - keyNight) * day;
    const hemiNight = (0.95 * (1 - 0.45 * lit * (1 - Math.max(beatEnv, slam)))) * dip * (1 - calm * 0.3) + 0.3 * calm;
    const hemiDay = 1.7 * (1 - 0.1 * lit * (1 - beatEnv));
    hemi.intensity = hemiNight + (hemiDay - hemiNight) * day;
    // smoke: drift up with a slow swirl, respawn at the floor; tinted by the leading wash, thinner by day
    const st = (now - t0) / 1000;
    for (let i = 0; i < SMOKE_N; i++) {
      const o = i * 3, ph = smokeSeed[i];
      smokePos[o] += (smokeVel[o] + Math.sin(st * 0.35 + ph) * 0.05) * dt;
      smokePos[o + 1] += smokeVel[o + 1] * dt * (1 + 0.6 * hit);
      smokePos[o + 2] += (smokeVel[o + 2] + Math.cos(st * 0.29 + ph * 1.7) * 0.04) * dt;
      if (smokePos[o + 1] > 2.9 || Math.abs(smokePos[o]) > 5 || smokePos[o + 2] > 2.4 || smokePos[o + 2] < -5) respawn(i, false);
    }
    smokeGeo.attributes.position.needsUpdate = true;
    smokeMat.color.set(0x8c88a0).lerp(washes[chase].color, 0.45 * Math.max(hit, 0.15)).lerp(WHITE, 0.5 * day);
    smokeMat.opacity = (0.26 + 0.12 * hit) * (1 - 0.55 * day) * (1 - 0.6 * calm);
    // the cones: each rides its wash's chase; a slow sway from the fixture
    for (let i = 0; i < 4; i++) {
      const c = cones[i];
      c.material.uniforms.uColor.value.copy(washes[i].color);
      c.material.uniforms.uPower.value = clamp(washes[i].intensity / 2.8, 0, 1) * (1 - 0.75 * day) * (1 - 0.5 * calm);
      c.rotation.z = Math.sin(st * 0.45 + i * 1.9) * 0.28; c.rotation.x = Math.sin(st * 0.33 + i * 2.6) * 0.16;
    }
    lightPool.material.color.copy(washes[0].color);
    lightPool.material.opacity = (0.3 + 0.7 * hit) * dip * (1 - calm * 0.7) * (1 - 0.5 * day);   // the floor blinks with the beat
    lightPool.scale.setScalar(1 + 0.12 * hit);
    gridU.uTime.value = (now - t0) / 1000; gridU.uBeat.value = beatA; gridU.uBar.value = barA; gridU.uPulse.value = pulse;
    gridU.uConf.value = locked ? conf : 0.35; gridU.uCalm.value = calm;
    gridU.uColor.value.copy(BAR_COLORS[colorIdx]); gridU.uColor2.value.copy(BAR_COLORS[(colorIdx + 1) % BAR_COLORS.length]);

    // the body: a squash on the kick, plus a small hop ON THE BEAT once the clock is sure
    const beatKick = Math.max(kEff, beatEnv * 0.6 * (1 - calm));
    const sq = 1 - 0.055 * beatKick, ex = 1 + 0.05 * beatKick, hop = 0.055 * beatKick;
    const list = tiers[tier] || tiers.groove;
    for (const id of order) {
      const e = cast.get(id); if (!e || !e.mixer || !e.root) continue;
      // keep the floor ALIVE: each girl swaps to another move of the tier on her own clock (staggered) —
      // on a BAR when the clock is locked, on a timer otherwise — so even a steady passage keeps evolving.
      // Paused/calm → hold the calm move.
      const due = locked ? (barTick && bar >= e.nextSwapBar) : now > e.nextSwap;
      if (active && tier !== "calm" && list.length > 1 && due) {
        let m = e.current; for (let k = 0; k < 4 && (m === e.current || !pool.has(m)); k++) m = list[(Math.random() * list.length) | 0];
        playMove(e, m, 0.7); e.nextSwap = now + 7000 + Math.random() * 7000; e.nextSwapBar = bar + 4 + ((Math.random() * 4) | 0);
      }
      // RATE-LOCK to the track (see the header): whole-beat loop vs live bpm, ≥30 % of the correction, all
      // of it as confidence rises; and once a bar, pull the clip's beat onto the track's beat (half the
      // error at once — a visible catch-step is allowed)
      const src = pool.get(e.current);
      let ts = 1;
      if (locked && src && !still && tier !== "calm") {
        const want = (env.bpm || CLIP_BPM_REF) / src.bpm;
        ts = clamp(1 + (want - 1) * Math.max(SYNC_MIN, conf), 0.75, 1.3);
        const a = e.currentAction;
        if (barTick && a) {
          const beatLen = src.clip.duration / src.beats;
          const err = frac((env.beatPhase || 0) - frac(a.time / beatLen) + 0.5) - 0.5;   // in beats, −.5..+.5
          a.time = ((a.time + err * beatLen * 0.5) % src.clip.duration + src.clip.duration) % src.clip.duration;
        }
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
      if (e.hips && e.shadow) { e.root.updateMatrixWorld(); e.hips.getWorldPosition(_v); e.shadow.position.x = _v.x; e.shadow.position.z = _v.z; e.hx = _v.x; e.hz = _v.z; }
    }

    // ── THE CROWD SOLVER (owner, 2026-09-11: «вона може бути позаду, але не налазити»). A dance TRAVELS — a
    // running man crosses a metre, house drifts — so two girls on neighbouring slots end up inside each other.
    // Every frame: each girl is pulled softly back to her slot, and any pair whose HIPS are closer than
    // MIN_GAP on the floor plane is pushed apart along the line between them (half each, a quarter of the
    // overlap per frame — a constraint, not a bounce). Depth is free: standing behind is a large distance on
    // the plane, standing inside is not. The push is capped so nobody leaves the stage.
    let crowdMin = Infinity;
    for (const id of order) {
      const e = cast.get(id); if (!e || !e.root) continue;
      const k = Math.min(1, dt * 0.8);
      e.ox -= e.ox * k; e.oz -= e.oz * k;
    }
    for (let i = 0; i < order.length; i++) {
      const a = cast.get(order[i]); if (!a || !a.root) continue;
      for (let j = i + 1; j < order.length; j++) {
        const b = cast.get(order[j]); if (!b || !b.root) continue;
        const dx = b.hx - a.hx, dz = b.hz - a.hz;
        const dist = Math.hypot(dx, dz);
        if (dist < crowdMin) crowdMin = dist;
        if (dist >= MIN_GAP) continue;
        const nx = dist > 1e-3 ? dx / dist : (a.tx <= b.tx ? -1 : 1), nz = dist > 1e-3 ? dz / dist : 0;
        const push = (MIN_GAP - dist) * 0.35;
        a.ox -= push * nx; a.oz -= push * nz; b.ox += push * nx; b.oz += push * nz;
      }
    }
    for (const id of order) {
      const e = cast.get(id); if (!e || !e.root) continue;
      e.ox = clamp(e.ox, -MAX_DRIFT_X, MAX_DRIFT_X); e.oz = clamp(e.oz, -MAX_DRIFT_Z, MAX_DRIFT_Z);
      e.root.position.x = e.tx + e.centerDX + e.ox; e.root.position.z = e.tz + e.oz;
    }
    env.crowdMin = crowdMin;                                                    // the closest pair, for the eye/device check

    // THE CAMERA: an orbit around the crowd — yaw/pitch from a finger drag, distance from a pinch (view.js
    // eases env.cam) — with the tilt parallax riding on top. The fit distance stays the zoom's 1.0.
    const tx = env.tiltX || 0, ty = env.tiltY || 0;
    const cam = env.cam || {}, yaw = cam.yaw || 0, pitch = cam.pitch || 0, R = camDist * (cam.zoom || 1);
    const cp = Math.cos(pitch);
    camera.position.set(Math.sin(yaw) * cp * R + tx * 0.24, camY + Math.sin(pitch) * R - ty * 0.18, Math.cos(yaw) * cp * R);
    camera.lookAt(0, lookY, 0);
    renderer.render(scene, camera);
  }

  computeLayout();
  addEventListener("resize", computeLayout);
  frame();

  return {
    ok: true,
    setCast,
    setMoves,
    dispose() {
      dead = true; cancelAnimationFrame(raf); removeEventListener("resize", computeLayout);
      for (const e of cast.values()) disposeEntry(e);
      grid.geometry.dispose(); grid.material.dispose(); smokeGeo.dispose(); smokeMat.dispose(); coneGeo.dispose(); for (const c of cones) c.material.dispose();
      try { renderer.dispose(); renderer.forceContextLoss?.(); } catch { /* gone */ }
    },
  };
}
