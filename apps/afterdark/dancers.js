import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { CHARACTERS, glbUrl } from "./characters.js";
import { DEFAULT_MOVES, moveUrl, tiersFor } from "./dances.js";

const DRACO_PATH = "https://www.gstatic.com/draco/versioned/decoders/1.5.7/";
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const frac = (x) => x - Math.floor(x);
const TARGET_H = 1.7;
const ORDER = CHARACTERS.map((g) => g.id);
const IDLE_URL = new URL("assets/clip-idle.glb", import.meta.url).href;
const LOCK = 0.3;
const CLIP_BPM_REF = 125;
const SYNC_MIN = 0.3;
const MIN_GAP = 0.8;
const MAX_DRIFT_X = 1.4, MAX_DRIFT_Z = 1.1;

const C_KEY = 0xffe9f4, C_MAG = 0xff3eb5, C_GRN = 0x39ff6a, C_GOLD = 0xf5b942, C_VIO = 0x8b5cf6;
const BAR_COLORS = [new THREE.Color(C_MAG), new THREE.Color(C_VIO), new THREE.Color(C_GRN), new THREE.Color(C_GOLD)];
const NIGHT_SKY = new THREE.Color(0x9a7ad8), NIGHT_GROUND = new THREE.Color(0x161022), NIGHT_FLOOR = new THREE.Color(0x07040c), WHITE = new THREE.Color(0xffffff);
const _c = new THREE.Color(), _c2 = new THREE.Color(), _sun = new THREE.Color(), _key = new THREE.Color(), _bot = new THREE.Color();

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
  const magenta = new THREE.DirectionalLight(C_MAG, 0.9); magenta.position.set(-4, 2.2, 2); scene.add(magenta);
  const green = new THREE.DirectionalLight(C_GRN, 0.9); green.position.set(4, 2.2, 2); scene.add(green);
  const gold = new THREE.DirectionalLight(C_GOLD, 0.7); gold.position.set(0, 3, -4); scene.add(gold);
  const violet = new THREE.DirectionalLight(C_VIO, 0.7); violet.position.set(-1, 3.2, -3); scene.add(violet);
  const washes = [magenta, green, gold, violet];

  const radial = (inner, outer) => {
    const c = document.createElement("canvas"); c.width = c.height = 256;
    const g = c.getContext("2d"), grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    grad.addColorStop(0, inner); grad.addColorStop(1, outer); g.fillStyle = grad; g.fillRect(0, 0, 256, 256);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  };
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(24, 24), new THREE.MeshStandardMaterial({ color: 0x07040c, roughness: 0.75, metalness: 0.25, transparent: true, opacity: 0.85, alphaMap: radial("#ffffff", "#000000") }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(0, -0.002, -2); scene.add(floor);
  const gridU = { uTime: { value: 0 }, uBeat: { value: 0 }, uBar: { value: 0 }, uPulse: { value: 0 }, uConf: { value: 0 }, uCalm: { value: 0 }, uDay: { value: 0 }, uColor: { value: BAR_COLORS[0].clone() }, uColor2: { value: BAR_COLORS[1].clone() } };
  const additive = { blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor, depthWrite: false, transparent: true };
  const grid = new THREE.Mesh(new THREE.PlaneGeometry(18, 18), new THREE.ShaderMaterial({ uniforms: gridU, vertexShader: FLOOR_VERT, fragmentShader: FLOOR_FRAG, ...additive }));
  grid.rotation.x = -Math.PI / 2; grid.position.set(0, 0.003, -1.5); scene.add(grid);
  const lightPool = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), new THREE.MeshBasicMaterial({ map: radial("rgba(77,77,77,1)", "rgba(0,0,0,1)"), color: C_MAG, ...additive }));
  lightPool.rotation.x = -Math.PI / 2; lightPool.position.set(0, 0.004, -0.6); scene.add(lightPool);
  const shadowMat = new THREE.MeshBasicMaterial({ map: radial("rgba(0,0,0,0.6)", "rgba(0,0,0,0)"), transparent: true, depthWrite: false });

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
  const coneGeo = new THREE.ConeGeometry(1.15, 4.4, 28, 1, true); coneGeo.translate(0, -2.2, 0);
  const cones = [-1.8, -0.6, 0.6, 1.8].map((x, i) => {
    const m = new THREE.Mesh(coneGeo, new THREE.ShaderMaterial({ uniforms: { uColor: { value: BAR_COLORS[i].clone() }, uPower: { value: 0 } }, vertexShader: CONE_VERT, fragmentShader: CONE_FRAG, side: THREE.DoubleSide, ...additive }));
    m.position.set(x, 3.7, -1.4); scene.add(m); return m;
  });

  const draco = new DRACOLoader().setDecoderPath(DRACO_PATH);
  const loader = new GLTFLoader().setDRACOLoader(draco);

  const pool = new Map();
  const loading = new Set();
  const hipsOf = (obj) => { let h = null; obj.traverse((o) => { if (!h && /hips$/i.test(o.name)) h = o; }); return h ? { bone: h, y: h.position.y, prefix: h.name.replace(/hips$/i, "") } : { bone: null, y: 0, prefix: "" }; };
  const retargetHips = (clip, srcY, dstY, srcPrefix, dstPrefix) => {
    const rename = srcPrefix !== dstPrefix;
    const scale = srcY && dstY && Math.abs(srcY - dstY) >= 1e-4;
    if (!rename && !scale) return clip;
    const c = clip.clone(), r = scale ? dstY / srcY : 1;
    for (const t of c.tracks) {
      if (rename && t.name.startsWith(srcPrefix)) t.name = dstPrefix + t.name.slice(srcPrefix.length);
      if (scale && /hips\.position$/i.test(t.name)) for (let i = 0; i < t.values.length; i++) t.values[i] *= r;
    }
    return c;
  };
  const poolEntry = (clip, hips) => { const beats = Math.max(1, Math.round(clip.duration * CLIP_BPM_REF / 60)); return { clip, hipsY: hips.y, prefix: hips.prefix || (clip.tracks[0]?.name.replace(/hips\..*$/i, "") ?? ""), beats, bpm: beats * 60 / clip.duration }; };
  function loadClip(id, url) {
    if (pool.has(id) || loading.has(id)) return;
    loading.add(id);
    loader.loadAsync(url).then((g) => { loading.delete(id); if (!dead && g.animations[0]) { pool.set(id, poolEntry(g.animations[0], hipsOf(g.scene))); assignMoves(); } }).catch(() => { loading.delete(id); });
  }
  loadClip("idle", IDLE_URL);

  const _v = new THREE.Vector3();
  const cast = new Map();
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

  function playMove(e, id, fade = 0.5) {
    if (!e || !e.mixer || e.current === id) return;
    const src = pool.get(id); if (!src) return;
    let a = e.actions.get(id);
    if (!a) { a = e.mixer.clipAction(retargetHips(src.clip, src.hipsY, e.hipsY, src.prefix, e.prefix)); a.setLoop(THREE.LoopRepeat, Infinity); e.actions.set(id, a); }
    if (e.root && e.hips) e.hold = { x: e.hx, z: e.hz };
    a.enabled = true; a.setEffectiveWeight(1); a.reset(); a.play();
    if (e.currentAction && e.currentAction !== a) a.crossFadeFrom(e.currentAction, fade, true);
    e.currentAction = a; e.current = id;
    e.loops = 0; e.prevT = 0;
  }

  let tier = "groove", lastTierAt = 0, rotation = 0;
  const NEIGHBOUR = { light: ["groove"], groove: ["light", "drive"], drive: ["groove"] };
  function nextMove(e, list) {
    let from = list;
    if (Math.random() < 0.33) { const n = NEIGHBOUR[tier] || []; const t = n[(Math.random() * n.length) | 0]; if (t && tiers[t]?.length) from = tiers[t]; }
    const loaded = from.filter((m) => pool.has(m) && m !== e.last && m !== "idle");
    if (!loaded.length) return null;
    const mine = loaded.filter((_, i) => ((i + Math.floor(e.seed * 97)) % 2) === 0);
    const pick = (mine.length && Math.random() < 0.75) ? mine : loaded;
    return pick[(Math.random() * pick.length) | 0];
  }
  function assignMoves(fade = 0.5) {
    const list = tiers[tier] || tiers.groove;
    order.forEach((id, i) => {
      const e = cast.get(id); if (!e || !e.mixer) return;
      const want = list[(i + rotation) % list.length];
      playMove(e, pool.has(want) ? want : (pool.has(id) ? id : e.current), fade);
    });
  }

  async function loadChar(id) {
    const e = { root: null, mixer: null, actions: new Map(), current: null, currentAction: null, token: 0, tx: 0, tz: 0, yaw: 0, centerDX: 0, baseY: 0, baseScale: 1, ox: 0, oz: 0, hx: 0, hz: 0, loops: 0, prevT: 0, phraseEnd: null, swapAt: 0, last: null, seed: Math.random() };
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
    const aniso = renderer.capabilities.getMaxAnisotropy();
    root.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; o.castShadow = false; for (const m of [].concat(o.material || [])) for (const k of ["map", "normalMap", "roughnessMap", "metalnessMap", "emissiveMap"]) if (m[k]) { m[k].anisotropy = aniso; m[k].needsUpdate = true; } } });
    e.mixer = new THREE.AnimationMixer(root);
    const hips = hipsOf(root); e.hips = hips.bone; e.hipsY = hips.y; e.prefix = hips.prefix;
    e.feet = []; root.traverse((o) => { if (/(Toe_End|ToeBase|Foot)$/i.test(o.name)) e.feet.push(o); });
    if (gltf.animations[0] && !pool.has(id)) pool.set(id, poolEntry(gltf.animations[0], hips));
    e.baseScale = s; e.root = root;
    scene.add(root);
    e.shadow = new THREE.Mesh(new THREE.CircleGeometry(0.55, 32), shadowMat);
    e.shadow.rotation.x = -Math.PI / 2; scene.add(e.shadow);
    computeLayout();
    playMove(e, pool.has(id) ? id : (pool.keys().next().value), 0);
    assignMoves(0);
    if (++loaded === 1) onStatus("ready", id);
  }

  function setCast(ids) {
    const want = [...ORDER.filter((id) => ids.includes(id)), ...ids.filter((id) => !ORDER.includes(id))];
    if (!want.length) return;
    for (const id of [...cast.keys()]) if (!want.includes(id)) { disposeEntry(cast.get(id)); cast.delete(id); }
    order = want;
    for (const id of want) if (!cast.has(id)) loadChar(id);
    computeLayout();
  }

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
    const active = env.playing !== false;
    const now = performance.now();
    if (!t0) t0 = now;
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016; last = now;

    const conf = clamp(env.confidence || 0, 0, 1), locked = active && conf > LOCK;
    const beatA = frac(env.beatA || 0), barA = frac(env.barA || 0), beatIndex = env.beatIndex | 0;
    const bar = Math.floor(beatIndex / 4), phrase = Math.floor(beatIndex / 16);
    const barTick = locked && bar !== lastBar; if (locked) lastBar = bar;
    const phraseTick = locked && phrase !== lastPhrase; if (locked) lastPhrase = phrase;
    if (barTick) colorIdx = bar % BAR_COLORS.length;

    if (!still && active && pulse > prevPulse + 0.05 && pulse > 0.26) kick = 1; else kick *= Math.pow(0.008, dt);
    kick = clamp(kick, 0, 1); prevPulse = pulse;
    const lit = still ? 0 : (locked ? conf : 0);
    const beatEnv = Math.exp(-beatA * 6) * lit;
    const hit = Math.max(kick, beatEnv);
    sEnergy += ((env.energy ?? pulse) - sEnergy) * clamp(dt * 3, 0, 1);
    calm += (((tier === "calm") ? 1 : 0) - calm) * clamp(dt * 4, 0, 1);

    const target = !active ? "calm" : sEnergy < 0.14 ? "light" : sEnergy < 0.36 ? "groove" : "drive";
    const dwell = (target === "calm" || tier === "calm") ? 500 : 5000;
    const may = (target === "calm" || tier === "calm") ? now - lastTierAt > dwell : (locked ? phraseTick : now - lastTierAt > dwell);
    if (target !== tier && may) {
      tier = target; lastTierAt = now; rotation++;
      if (tier === "calm") assignMoves(0.6);
      else for (const id of order) { const e = cast.get(id); if (e) { e.phraseEnd = beatIndex; e.swapAt = now; } }
    }

    const day = clamp(env.day || 0, 0, 1), pal = env.pal;
    if (pal && pal.length >= 32) {
      for (let i = 0; i < 4; i++) { washes[i].color.setRGB(pal[i * 4], pal[i * 4 + 1], pal[i * 4 + 2]); BAR_COLORS[i].copy(washes[i].color); }
      _sun.setRGB(pal[16], pal[17], pal[18]); _bot.setRGB(pal[24], pal[25], pal[26]); _key.setRGB(pal[28], pal[29], pal[30]);
    } else { _sun.setHex(C_GOLD); _bot.copy(NIGHT_FLOOR); _key.setHex(C_KEY); }
    hemi.color.copy(NIGHT_SKY).lerp(washes[1].color, 0.35).lerp(_c.copy(WHITE).lerp(_sun, 0.25), day);
    hemi.groundColor.copy(NIGHT_GROUND).lerp(_bot, day);
    key.color.copy(_key).lerp(_c2.copy(_sun).lerp(WHITE, 0.5), day);
    floor.material.color.copy(NIGHT_FLOOR).lerp(_c.copy(_bot).multiplyScalar(0.85), day);
    floor.material.opacity = 0.85 - 0.3 * day;
    renderer.toneMappingExposure = 1.15 - 0.15 * day;
    gridU.uDay.value = day;

    const kEff = kick * (1 - calm * 0.85);
    const drive = tier === "drive" ? 1 : tier === "groove" ? 0.35 : 0;
    const dip = 1 - 0.55 * lit * (barA > 0.86 ? (barA - 0.86) / 0.14 : 0);
    const slam = lit * Math.exp(-barA * 4);
    const chase = beatIndex & 3;
    const dayDip = 1 - (1 - dip) * (1 - 0.7 * day);
    for (let i = 0; i < 4; i++) {
      const lead = chase === i ? 1 : 0.22;
      const on = Math.max(pulse * 0.8, beatEnv * lead, slam * 0.5);
      const idle = 0.55 * (1 - lit) + 0.12 * lit;
      washes[i].intensity = ((idle + 2.6 * on) * dayDip) * (1 - calm) * (1 - 0.6 * day) + 0.45 * calm * (1 - 0.5 * day);
    }
    const strobe = drive * lit * Math.exp(-beatA * 18) * (0.5 + 0.5 * Math.min(1, sEnergy * 2)) * (1 - 0.85 * day);
    const keyNight = (2.0 * (1 - 0.5 * lit * (1 - beatEnv)) + 0.7 * pulse + 5.5 * strobe) * dip * (1 - calm * 0.4) + 0.8 * calm;
    const keyDay = 3.2 * (1 - 0.12 * lit * (1 - beatEnv)) + 0.3 * pulse + 5.5 * strobe;
    key.intensity = keyNight + (keyDay - keyNight) * day;
    const hemiNight = (0.95 * (1 - 0.45 * lit * (1 - Math.max(beatEnv, slam)))) * dip * (1 - calm * 0.3) + 0.3 * calm;
    const hemiDay = 1.7 * (1 - 0.1 * lit * (1 - beatEnv));
    hemi.intensity = hemiNight + (hemiDay - hemiNight) * day;
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
    for (let i = 0; i < 4; i++) {
      const c = cones[i];
      c.material.uniforms.uColor.value.copy(washes[i].color);
      c.material.uniforms.uPower.value = clamp(washes[i].intensity / 2.8, 0, 1) * (1 - 0.75 * day) * (1 - 0.5 * calm);
      c.rotation.z = Math.sin(st * 0.45 + i * 1.9) * 0.28; c.rotation.x = Math.sin(st * 0.33 + i * 2.6) * 0.16;
    }
    lightPool.material.color.copy(washes[0].color);
    lightPool.material.opacity = (0.3 + 0.7 * hit) * dip * (1 - calm * 0.7) * (1 - 0.5 * day);
    lightPool.scale.setScalar(1 + 0.12 * hit);
    gridU.uTime.value = (now - t0) / 1000; gridU.uBeat.value = beatA; gridU.uBar.value = barA; gridU.uPulse.value = pulse;
    gridU.uConf.value = locked ? conf : 0.35; gridU.uCalm.value = calm;
    gridU.uColor.value.copy(BAR_COLORS[colorIdx]); gridU.uColor2.value.copy(BAR_COLORS[(colorIdx + 1) % BAR_COLORS.length]);

    const beatKick = Math.max(kEff, beatEnv * 0.85 * (1 - calm));
    const sq = 1 - 0.07 * beatKick, ex = 1 + 0.06 * beatKick, hop = 0.08 * beatKick;
    const list = tiers[tier] || tiers.groove;
    for (const id of order) {
      const e = cast.get(id); if (!e || !e.mixer || !e.root) continue;
      if (active && tier !== "calm" && e.currentAction) {
        if (e.phraseEnd == null) { e.phraseEnd = beatIndex + 8; e.swapAt = now + 3500 + Math.random() * 1500; }
        const due = e.current === "idle" ? true : (locked ? (barTick && beatIndex >= e.phraseEnd) : now >= e.swapAt);
        if (due) {
          const m = nextMove(e, list);
          if (m) { e.last = e.current; playMove(e, m, 0.3); }
          e.phraseEnd = beatIndex + (Math.random() < 0.33 ? 16 : 8); e.swapAt = now + 3500 + Math.random() * 1500;
        }
      }
      const src = pool.get(e.current);
      let ts = 1;
      if (locked && src && !still && tier !== "calm") {
        const want = (env.bpm || CLIP_BPM_REF) / src.bpm;
        ts = clamp(1 + (want - 1) * Math.max(SYNC_MIN, conf), 0.95, 1.35);
        const a = e.currentAction;
        if (barTick && a) {
          const beatLen = src.clip.duration / src.beats;
          const err = frac((env.beatPhase || 0) - frac(a.time / beatLen) + 0.5) - 0.5;
          if (Math.abs(err) > 0.04) { e.hold = e.hold || { x: e.hx, z: e.hz };
            a.time = ((a.time + err * beatLen * 0.5) % src.clip.duration + src.clip.duration) % src.clip.duration; }
        }
      }
      { const a = e.currentAction; if (a) { const d = a.getClip().duration; if (a.time + dt * ts >= d - 1e-3) e.hold = e.hold || { x: e.hx, z: e.hz }; } }
      e.mixer.timeScale = ts; e.mixer.update(dt);
      { const a = e.currentAction; if (a) { if (a.time < e.prevT) e.loops++; e.prevT = a.time; } }
      e.root.scale.set(e.baseScale * ex, e.baseScale * sq, e.baseScale * ex);
      if (e.feet && e.feet.length) {
        e.root.position.y = 0; e.root.updateMatrixWorld(true);
        let low = Infinity; for (const f of e.feet) { f.getWorldPosition(_v); if (_v.y < low) low = _v.y; }
        e.root.position.y = (Number.isFinite(low) ? -low : e.baseY) + hop;
      } else e.root.position.y = e.baseY + hop;
      if (e.hips && e.shadow) { e.root.updateMatrixWorld(); e.hips.getWorldPosition(_v); e.shadow.position.x = _v.x; e.shadow.position.z = _v.z; e.hx = _v.x; e.hz = _v.z; }
      if (e.hold && e.hips) { e.ox += e.hold.x - e.hx; e.oz += e.hold.z - e.hz; e.hx = e.hold.x; e.hz = e.hold.z; e.shadow.position.x = e.hx; e.shadow.position.z = e.hz; e.hold = null; }
    }

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
    env.crowdMin = crowdMin;
    env.moves = order.map((id) => cast.get(id)?.current || "");

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
      try { renderer.dispose(); renderer.forceContextLoss?.(); } catch { }
    },
  };
}
