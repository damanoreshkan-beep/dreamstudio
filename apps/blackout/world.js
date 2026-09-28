import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";
import { hipsOf, fit, retarget } from "./rig.js";
import { glbUrl } from "./state.js";

export const STREET_W = 10, CHUNK = 24, AHEAD = 4, BEHIND = 2;
export const LANE_W = 2.2, LANES = 4;
export const laneX = (i) => (i - (LANES - 1) / 2) * LANE_W;
export const DECK_H = 2.4, RAMP = 5;
const WALK = 1.6, KERB = STREET_W / 2 + WALK / 2, WALL = STREET_W / 2 + WALK + 0.2;
const TILE = 9;
const Z_H = 1.7, Z_MIN = 8, Z_MAX = 12;
const WALKER_HP = 2, WALKER_SPEED = 0.7;
export const CHASE = { menace: 4.6, surge: 2.3, catchAt: 1.1, relax: 1.4, decayM: 150, surgeS: 0.6, closing: 6 };
const DRACO_PATH = "https://www.gstatic.com/draco/versioned/decoders/1.5.7/";
const A = (p) => new URL(p, import.meta.url).href;
const CARS = ["sedan", "taxi", "suv", "van", "hatch"];
const HORDE_SKINS = ["arissa", "michelle", "sophie", "eve", "nightshade"];
const NEON = [0x22d3ee, 0xff3eb5, 0x7c5cff, 0x39ff6a, 0xf5b942];

const clamp01 = (v) => Math.max(0, Math.min(1, v));
export function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

export function rowStates(r, d) {
  const roll = r(), st = Array(LANES).fill("open");
  const shuffled = () => [...Array(LANES).keys()].sort(() => r() - 0.5);
  if (roll < 0.22) { for (const i of shuffled().slice(0, d > 0.5 ? 2 : 1)) st[i] = "dodge"; }
  else if (roll < 0.42) { for (const i of shuffled().slice(0, d > 0.4 ? 2 : 1)) st[i] = "walker"; }
  else if (roll < 0.64) { const chance = 0.55 + d * 0.25; let n = 0; for (let i = 0; i < LANES; i++) if (r() < chance) { st[i] = "jump"; n++; } if (!n) st[Math.floor(r() * LANES)] = "jump"; }
  else if (roll < 0.86) { const chance = 0.5 + d * 0.25; let n = 0; for (let i = 0; i < LANES; i++) if (r() < chance) { st[i] = "slide"; n++; } if (!n) st[Math.floor(r() * LANES)] = "slide"; }
  else { const opts = ["open", "jump", "slide", "dodge", "walker"]; for (let i = 0; i < LANES; i++) st[i] = opts[Math.floor(r() * 5)]; }
  const block = st.map((s, i) => (s === "dodge" || s === "walker" ? i : -1)).filter((i) => i >= 0);
  for (const i of block.slice(2)) st[i] = "open";
  if (!st.includes("open") && r() < 0.5) st[Math.floor(r() * LANES)] = "open";
  return st;
}

const texLoader = new THREE.TextureLoader();
async function tex(url, repeat) {
  const t = await texLoader.loadAsync(url);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.MirroredRepeatWrapping; t.anisotropy = 4;
  if (repeat) t.repeat.set(repeat[0], repeat[1]);
  return t;
}
function facadeSet(img, seed) {
  const N = 1024, px = N / TILE, r = rng(seed);
  const c = document.createElement("canvas"), e = document.createElement("canvas"); c.width = c.height = e.width = e.height = N;
  const g = c.getContext("2d"), ge = e.getContext("2d");
  g.drawImage(img, 0, 0, N, N); ge.fillStyle = "#000"; ge.fillRect(0, 0, N, N);
  const ww = 1.25 * px, wh = 1.7 * px;
  for (let f = 0; f < 3; f++) for (let b = 0; b < 3; b++) {
    const x = (0.9 + b * 3) * px, y = N - (1.0 + f * 3 + 1.7) * px, on = r() < 0.22, warm = r() < 0.6;
    g.fillStyle = "#121514"; g.fillRect(x - 5, y - 5, ww + 10, wh + 10);
    const col = on ? (warm ? "#8f7a52" : "#5e6f6c") : "#0b0d0c";
    g.fillStyle = col; g.globalAlpha = on ? 0.55 + r() * 0.4 : 1; g.fillRect(x, y, ww, wh); g.globalAlpha = 1;
    if (on) { ge.fillStyle = col; ge.globalAlpha = 0.45 + r() * 0.5; ge.fillRect(x, y, ww, wh); ge.globalAlpha = 1; }
  }
  const mk = (cv) => { const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t; };
  return { map: mk(c), glow: mk(e) };
}
function buildingGeo(w, h, d) {
  const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv, dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let i = 0; i < 24; i++) { const [u, v] = dims[i >> 2]; uv.setXY(i, uv.getX(i) * u / TILE, uv.getY(i) * v / TILE); }
  return g;
}
const RUST_M = 2.2;
let swatch = null;
function bake(g, map) {
  const img = map.image;
  if (swatch?.img !== img) { const c = document.createElement("canvas"); c.width = img.width; c.height = img.height; const x = c.getContext("2d"); x.drawImage(img, 0, 0); swatch = { img, w: img.width, h: img.height, px: x.getImageData(0, 0, img.width, img.height).data }; }
  const { w, h, px } = swatch, uv = g.attributes.uv, n = uv.count, col = new Float32Array(n * 3), c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const j = (Math.min(h - 1, Math.floor(uv.getY(i) * h)) * w + Math.min(w - 1, Math.floor(uv.getX(i) * w))) * 4;
    c.setRGB(px[j] / 255, px[j + 1] / 255, px[j + 2] / 255, THREE.SRGBColorSpace);
    const l = 0.3 * c.r + 0.59 * c.g + 0.11 * c.b; c.lerp(new THREE.Color(l, l, l), 0.75);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
}
function boxUv(g) {
  const p = g.attributes.position, nr = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), ax = Math.abs(nr.getX(i)), ay = Math.abs(nr.getY(i)), az = Math.abs(nr.getZ(i));
    if (ax >= ay && ax >= az) uv.setXY(i, z / RUST_M, y / RUST_M); else if (ay >= az) uv.setXY(i, x / RUST_M, z / RUST_M); else uv.setXY(i, x / RUST_M, y / RUST_M);
  }
}
function propGeo(node, rust = false) {
  node.updateWorldMatrix(true, true);
  const parts = []; let mat = null;
  node.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry.clone();
    if (rust && g.attributes.uv && o.material.map?.image) bake(g, o.material.map);
    for (const k of Object.keys(g.attributes)) if (!/^(position|normal|uv|color)$/.test(k)) g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    g.applyMatrix4(o.matrixWorld); if (rust) boxUv(g);
    parts.push(g); mat ||= o.material;
  });
  const geo = mergeGeometries(parts, false); for (const p of parts) p.dispose();
  geo.computeBoundingBox();
  return { geo, mat };
}
function pool(geo, mat, cap, parent) {
  const im = new THREE.InstancedMesh(geo, mat, cap); im.count = 0; im.frustumCulled = false;
  const zero = new THREE.Matrix4().makeScale(0, 0, 0), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3();
  for (let i = 0; i < cap; i++) im.setMatrixAt(i, zero);
  im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  parent.add(im);
  const free = Array.from({ length: cap }, (_, i) => cap - 1 - i), used = new Set();
  const recount = () => { let n = 0; for (const i of used) if (i >= n) n = i + 1; im.count = n; };
  return {
    im,
    take(x, y, z, ry = 0, sc = 1) { const i = free.pop(); if (i == null) return -1; e.set(0, ry, 0); q.setFromEuler(e); p.set(x, y, z); s.setScalar(sc); m4.compose(p, q, s); im.setMatrixAt(i, m4); im.instanceMatrix.needsUpdate = true; used.add(i); recount(); return i; },
    drop(i) { if (i < 0) return; im.setMatrixAt(i, zero); im.instanceMatrix.needsUpdate = true; free.push(i); used.delete(i); recount(); },
    dispose() { parent.remove(im); im.dispose(); geo.dispose(); },
  };
}
const radial = (inner, outer) => { const c = document.createElement("canvas"); c.width = c.height = 128; const g = c.getContext("2d"); const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, inner); gr.addColorStop(1, outer); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };
const grade = (m, k = 0.25) => { m.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace("#include <map_fragment>", "#include <map_fragment>\n diffuseColor.rgb = mix(vec3(dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114))), diffuseColor.rgb, " + k.toFixed(2) + ") * vec3(0.82, 0.9, 0.88);"); }; m.needsUpdate = true; return m; };
const vertical = () => { const c = document.createElement("canvas"); c.width = 4; c.height = 128; const g = c.getContext("2d"); const gr = g.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, "rgba(255,255,255,0.55)"); gr.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = gr; g.fillRect(0, 0, 4, 128); return new THREE.CanvasTexture(c); };

export function createWorld(scene) {
  const group = new THREE.Group(); scene.add(group);
  const loader = new GLTFLoader(); const draco = new DRACOLoader(); draco.setDecoderPath(DRACO_PATH); loader.setDRACOLoader(draco);
  const chunks = new Map();
  const decks = [];
  let seedBase = 1, difficulty = 0, deckUntil = 0, lastTunnel = -9;
  const box = new THREE.BoxGeometry(1, 1, 1);
  const mesh = (geo, mat, x, y, z, parent, sx = 1, sy = 1, sz = 1) => { const m = new THREE.Mesh(geo, mat); m.scale.set(sx, sy, sz); m.position.set(x, y, z); parent.add(m); return m; };

  const M = {
    barrier: new THREE.MeshStandardMaterial({ color: 0x6a4a3a, roughness: 0.9, emissive: 0x3a1c14, emissiveIntensity: 0.35 }),
    post: new THREE.MeshStandardMaterial({ color: 0x3a3d3c, roughness: 0.85, metalness: 0.3 }),
    deck: new THREE.MeshStandardMaterial({ color: 0x2c2f33, roughness: 0.95, metalness: 0.15 }),
    rail: new THREE.MeshStandardMaterial({ color: 0x5a5e62, roughness: 0.7, metalness: 0.5, emissive: 0x22d3ee, emissiveIntensity: 0.12 }),
    tunnel: new THREE.MeshStandardMaterial({ color: 0x1a1d20, roughness: 1 }),
    tube: new THREE.MeshBasicMaterial({ color: 0xc8b48a }),
    spire: new THREE.MeshStandardMaterial({ color: 0x0c0d10, roughness: 1 }),
    coin: new THREE.MeshStandardMaterial({ color: 0x9a7a3a, emissive: 0x7a5a1e, emissiveIntensity: 0.5, roughness: 0.6, metalness: 0.5 }),
    can: new THREE.MeshStandardMaterial({ color: 0x1a3a2a, emissive: 0x39ff6a, emissiveIntensity: 1.4, roughness: 0.4, metalness: 0.6 }),
    head: new THREE.MeshBasicMaterial({ color: 0x9a8a5c }),
    pool: new THREE.MeshBasicMaterial({ color: 0x8a8060, map: radial("rgba(255,255,255,0.18)", "rgba(255,255,255,0)"), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
    beam: new THREE.MeshBasicMaterial({ color: 0x8a8060, alphaMap: vertical(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, opacity: 0.035 }),
    bat: new THREE.MeshBasicMaterial({ color: 0x050608, side: THREE.DoubleSide }),
    moon: new THREE.MeshBasicMaterial({ color: 0xe9e3cc, fog: false }),
    halo: new THREE.SpriteMaterial({ map: radial("rgba(233,227,204,0.35)", "rgba(233,227,204,0)"), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
    stars: new THREE.PointsMaterial({ color: 0xcfd6e6, size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.85 }),
  };
  const neonMats = NEON.map((c) => new THREE.MeshBasicMaterial({ color: c }));
  const coinGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.06, 18); coinGeo.rotateX(Math.PI / 2);
  const canGeo = new THREE.CylinderGeometry(0.17, 0.17, 0.52, 14);
  const headGeo = new THREE.SphereGeometry(0.16, 10, 8);
  const poolGeo = new THREE.CircleGeometry(4.2, 24); poolGeo.rotateX(-Math.PI / 2);
  const coneGeo = new THREE.ConeGeometry(2.3, 4.6, 18, 1, true); coneGeo.translate(0, -2.3, 0);
  const binGeo = new THREE.CylinderGeometry(0.32, 0.28, 0.9, 14); binGeo.translate(0, 0.45, 0);
  const roadGeo = new THREE.PlaneGeometry(STREET_W + WALK * 2, CHUNK); roadGeo.rotateX(-Math.PI / 2);
  const walkGeo = new THREE.BoxGeometry(WALK, 0.15, CHUNK);
  { const uv = walkGeo.attributes.uv; for (let i = 8; i < 12; i++) uv.setXY(i, uv.getX(i) * WALK / 2, uv.getY(i) * CHUNK / 2); }
  const spireGeo = new THREE.ConeGeometry(1, 1, 6);
  const batGeo = (() => { const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute([-0.45, 0.12, 0, 0, 0, 0.08, -0.15, -0.04, 0, 0.45, 0.12, 0, 0, 0, 0.08, 0.15, -0.04, 0], 3)); g.computeVertexNormals(); return g; })();

  const sky = new THREE.Group(); scene.add(sky);
  const moon = new THREE.Mesh(new THREE.SphereGeometry(7, 24, 16), M.moon); moon.position.set(-9, 40, -170); sky.add(moon);
  const halo = new THREE.Sprite(M.halo); halo.scale.set(46, 46, 1); halo.position.copy(moon.position); sky.add(halo);
  { const n = 420, p = new Float32Array(n * 3), r = rng(7); for (let i = 0; i < n; i++) { const th = r() * Math.PI * 2, ph = Math.acos(1 - r() * 0.9); p[i * 3] = 190 * Math.sin(ph) * Math.cos(th); p[i * 3 + 1] = Math.abs(190 * Math.cos(ph)) + 6; p[i * 3 + 2] = 190 * Math.sin(ph) * Math.sin(th); } const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(p, 3)); sky.add(new THREE.Points(g, M.stars)); }
  const BATS = 14, bats = new THREE.InstancedMesh(batGeo, M.bat, BATS); bats.frustumCulled = false; bats.count = 0; scene.add(bats);
  const flock = { on: false, t0: 0, next: 12000, x0: 0, dir: 1, off: Array.from({ length: BATS }, () => ({ x: (Math.random() - 0.5) * 6, y: (Math.random() - 0.5) * 2.5, z: (Math.random() - 0.5) * 8, ph: Math.random() * 6.28, w: 9 + Math.random() * 6 })) };
  const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
  let onBats = null;
  function updateBats(now, camZ, px) {
    if (!flock.on) { if (now > flock.next) { flock.on = true; flock.t0 = now; flock.dir = Math.random() < 0.5 ? -1 : 1; flock.x0 = flock.dir * 14; flock.next = now + 26000 + Math.random() * 30000; bats.count = BATS; onBats?.(); } return; }
    const t = (now - flock.t0) / 1000, T = 4.2;
    if (t > T) { flock.on = false; bats.count = 0; return; }
    const k = t / T, cx = flock.x0 - flock.dir * 28 * k, cy = 5.5 + Math.sin(k * Math.PI) * 4, cz = camZ - 26 + 30 * k;
    for (let i = 0; i < BATS; i++) {
      const o = flock.off[i], flap = Math.sin(t * o.w + o.ph);
      _p.set(cx + o.x, cy + o.y + Math.sin(t * 2 + o.ph) * 0.4, cz + o.z); _e.set(0, Math.atan2(-flock.dir, 0.3), flap * 0.5); _q.setFromEuler(_e); _s.set(1, 1, 1);
      _m4.compose(_p, _q, _s); bats.setMatrixAt(i, _m4);
    }
    bats.instanceMatrix.needsUpdate = true;
  }

  const P = {}, facades = [], carTex = [];
  let road = null, walk = null, bandMat = null, roadReady = false;
  const ready = (async () => {
    const [facadeImg, graffiti, asphalt, metal, sidewalk, props, ...rust] = await Promise.all([
      new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = A("assets/tex-facade.webp"); }),
      tex(A("assets/tex-graffiti.webp")), tex(A("assets/tex-asphalt.webp"), [(STREET_W + WALK * 2) / 7, CHUNK / 7]), tex(A("assets/tex-metal.webp"), [2, 1]), tex(A("assets/tex-sidewalk.webp")),
      loader.loadAsync(A("assets/props.glb")),
      ...CARS.map((k) => tex(A(`assets/tex-car-${k}.webp`))),
    ]);
    carTex.push(...rust);
    for (const s of [3, 11]) facades.push(facadeSet(facadeImg, s));
    road = grade(new THREE.MeshStandardMaterial({ map: asphalt, color: 0x3c3e3d, roughness: 1 }));
    walk = grade(new THREE.MeshStandardMaterial({ map: sidewalk, color: 0x45474a, roughness: 1 }));
    bandMat = grade(new THREE.MeshStandardMaterial({ map: graffiti, color: 0x5e5c5a, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }), 0.35);
    M.bin = grade(new THREE.MeshStandardMaterial({ map: metal, color: 0x4e524c, roughness: 0.9, metalness: 0.2 }));
    M.bar = grade(new THREE.MeshStandardMaterial({ map: metal, color: 0x7a6a4a, roughness: 0.8, metalness: 0.35, emissive: 0x2a1a0a, emissiveIntensity: 0.4 }));
    const deckTex = asphalt.clone(); deckTex.repeat.set(1, 9); deckTex.needsUpdate = true;
    M.deck.map = deckTex; M.deck.color.set(0x4a4c50); M.deck.needsUpdate = true; grade(M.deck);
    M.rail.map = metal; M.rail.color.set(0x8a8e92); M.rail.needsUpdate = true;
    M.post.map = metal; M.post.color.set(0x6a6e70); M.post.needsUpdate = true;
    const canTex = await tex(A("assets/tex-can.webp")).catch(() => null);
    if (canTex) { canTex.wrapS = THREE.RepeatWrapping; canTex.repeat.set(2, 1); M.can.map = canTex; M.can.emissiveMap = canTex; M.can.color.set(0xffffff); M.can.emissive.set(0x9bffb0); M.can.emissiveIntensity = 0.9; M.can.needsUpdate = true; }
    const cap = { sedan: 16, taxi: 16, suv: 16, van: 16, hatch: 16, bin: 24, lamp: 32, barrier: 16, planter: 16, cone: 16 };
    for (const node of props.scene.children) {
      const car = CARS.indexOf(node.name);
      const { geo, mat } = propGeo(node, car >= 0); const m = grade(mat.clone(), car >= 0 ? 0.6 : 0.2);
      m.color.multiplyScalar(0.5); m.roughness = 0.92; m.metalness = 0.1;
      if (car >= 0) { m.map = carTex[car]; m.vertexColors = true; m.color.setScalar(0.9); m.roughness = 0.8; m.metalness = 0.2; }
      if (node.name === "bin") { m.emissive = new THREE.Color(0x1c2a1a); m.emissiveIntensity = 0.5; }
      if (node.name === "lamp") { m.roughness = 0.85; m.metalness = 0.25; }
      P[node.name] = pool(geo, m, cap[node.name] || 16, group);
      P[node.name].size = geo.boundingBox.getSize(new THREE.Vector3());
    }
    P.can = pool(binGeo, M.bin, 48, group);
    P.head = pool(headGeo, M.head, 32, group);
    P.pool = pool(poolGeo, M.pool, 32, group);
    P.beam = pool(coneGeo, M.beam, 32, group);
    roadReady = true;
  })();

  const horde = { chars: [], run: null, attack: null, walk: null, die: null, hit: null };
  const hordeReady = (async () => {
    const [zrun, zattack, zwalk, zdie, zhit] = await Promise.all(["zrun", "zattack", "zwalk", "zdie", "zhit"].map((n) => loader.loadAsync(A(`assets/clip-${n}.glb`)).catch(() => null)));
    const of = (g) => (g ? { clip: g.animations[0], rig: hipsOf(g.scene) } : null);
    horde.run = of(zrun); horde.attack = of(zattack); horde.walk = of(zwalk); horde.die = of(zdie); horde.hit = of(zhit);
    const loaded = await Promise.all(HORDE_SKINS.map((id) => loader.loadAsync(glbUrl(id)).then((g) => ({ root: undead(fit(g.scene, Z_H)), rig: hipsOf(g.scene) })).catch(() => null)));
    horde.chars = loaded.filter(Boolean);
  })();
  hordeReady.catch(() => {});
  const zombies = [], deadMats = [];
  const ZBONES = [["Head", 0.55], ["Neck", 0.3], ["Spine1", 0.35], ["Spine2", 0.25], ["LeftArm", 1.0], ["RightArm", 1.0], ["LeftForeArm", 1.2], ["RightForeArm", 1.2], ["LeftHand", 0.6], ["RightHand", 0.6]];
  function undead(root) {
    root.traverse((o) => {
      if (!o.isMesh) return;
      const m = grade(o.material.clone(), 0.12);
      m.color.multiply(new THREE.Color(0.68, 0.74, 0.64)); m.roughness = 1; m.metalness = 0; m.envMapIntensity = 0;
      m.emissive = new THREE.Color(0x8fa093); m.emissiveMap = m.map; m.emissiveIntensity = 0.16;
      o.material = m; deadMats.push(m);
    });
    return root;
  }
  function twist(root, c, clip) {
    const rr = Math.random, tracks = new Set(clip.clip.tracks.map((t) => t.name.replace(clip.rig.prefix, c.rig.prefix))), bones = [];
    for (const [name, amp] of ZBONES) {
      const b = root.getObjectByName(c.rig.prefix + name); if (!b || !tracks.has(b.name + ".quaternion") || rr() < 0.3) continue;
      const axis = new THREE.Vector3(rr() - 0.5, rr() - 0.5, rr() - 0.5).normalize();
      bones.push({ b, q: new THREE.Quaternion().setFromAxisAngle(axis, (0.5 + rr() * 0.5) * amp * (rr() < 0.5 ? -1 : 1)) });
    }
    return bones;
  }
  function spawnZombie(px, pz) {
    const c = horde.chars[Math.floor(Math.random() * horde.chars.length)], root = cloneSkinned(c.root);
    const holder = new THREE.Group(); holder.rotation.order = "YXZ"; holder.add(root); group.add(holder);
    const mixer = new THREE.AnimationMixer(root), rr = Math.random;
    const run = mixer.clipAction(retarget(horde.run.clip, horde.run.rig, c.rig, true));
    run.play(); run.time = rr() * run.getClip().duration; run.setEffectiveTimeScale(0.85 + rr() * 0.3);
    const attack = horde.attack ? mixer.clipAction(retarget(horde.attack.clip, horde.attack.rig, c.rig, true)) : null;
    const gap = rr() * 3.5, x = (rr() - 0.5) * (STREET_W - 1);
    holder.position.set(x, 0, pz + chase.dist + gap + 1);
    zombies.push({ holder, mixer, run, attack, bones: twist(root, c, horde.run), x, z: holder.position.z, gap, off: (rr() - 0.5) * 6, offT: 0, w1: 0.6 + rr() * 0.8, w2: 1.7 + rr() * 1.5, ph: rr() * 6.28, lean: 0.08 + rr() * 0.14, yaw: Math.PI, grabbing: false });
  }
  function killZombie(i) { const z = zombies[i]; z.mixer.stopAllAction(); group.remove(z.holder); zombies.splice(i, 1); }

  const chase = { dist: CHASE.menace + 4, target: CHASE.menace, mistakes: 0, cleanM: 0, surgeT: 0, caught: false, closeT: 0 };
  function updateHorde(px, pz, dt, running, speed, t, metres) {
    if (!horde.chars.length || !horde.run) return;
    if (running && !chase.caught) {
      if (chase.surgeT > 0) chase.surgeT -= dt;
      if (chase.dist > chase.target) chase.dist = Math.max(chase.target, chase.dist - (CHASE.closing * (chase.surgeT > 0 ? 2 : 1)) * dt);
      else if (chase.dist < chase.target) chase.dist = Math.min(chase.target, chase.dist + CHASE.relax * dt);
    } else if (chase.caught) chase.dist = Math.max(0.6, chase.dist - 8 * dt);
    const want = Z_MIN + Math.round(difficulty * (Z_MAX - Z_MIN));
    while (zombies.length < want && running) spawnZombie(px, pz);
    const lim = STREET_W / 2 - 0.4;
    for (let i = zombies.length - 1; i >= 0; i--) {
      const zb = zombies[i];
      if ((zb.offT -= dt) < 0) { zb.offT = 2 + Math.random() * 4; zb.off = (Math.random() - 0.5) * 6; }
      const surge = Math.sin(t * zb.w1 + zb.ph) * Math.sin(t * zb.w2);
      const tz = pz + chase.dist + zb.gap * (chase.caught ? 0.3 : 1);
      zb.z -= metres; zb.z += (tz - zb.z) * Math.min(1, dt * 2.5);
      const tx = Math.max(-lim, Math.min(lim, chase.caught ? px + zb.off * 0.25 : px + zb.off));
      zb.x += (tx - zb.x) * Math.min(1, dt * 1.4);
      const yaw = Math.atan2(tx - zb.x, -2.5);
      zb.yaw += Math.atan2(Math.sin(yaw - zb.yaw), Math.cos(yaw - zb.yaw)) * Math.min(1, dt * 3);
      zb.holder.position.set(zb.x, 0, zb.z); zb.holder.rotation.set(zb.lean + surge * 0.05, zb.yaw, Math.sin(t * zb.w2 * 0.7 + zb.ph) * 0.06);
      if (chase.caught && zb.attack && !zb.grabbing && zb.z - pz < 2.2) { zb.grabbing = true; zb.attack.reset().play(); zb.run.crossFadeTo(zb.attack, 0.15, false); }
      zb.mixer.update(dt * (chase.caught ? 1 : Math.max(0.6, speed / 6) * (0.9 + 0.25 * surge)));
      for (const { b, q } of zb.bones) b.quaternion.multiply(q);
    }
  }
  function spawnWalker(ch, lane, z) {
    if (!horde.chars.length || !horde.walk) { ch.obstacles.push({ kind: "dodge", lane, z, zHalf: 0.5 }); return; }
    const c = horde.chars[Math.floor(Math.random() * horde.chars.length)], root = cloneSkinned(c.root);
    const holder = new THREE.Group(); holder.rotation.order = "YXZ"; holder.position.set(laneX(lane), 0, z); holder.add(root); ch.group.add(holder);
    const mixer = new THREE.AnimationMixer(root);
    const walk = mixer.clipAction(retarget(horde.walk.clip, horde.walk.rig, c.rig, true)); walk.play(); walk.time = Math.random() * walk.getClip().duration;
    const die = horde.die ? mixer.clipAction(retarget(horde.die.clip, horde.die.rig, c.rig, true)) : null; if (die) { die.setLoop(THREE.LoopOnce, 1); die.clampWhenFinished = true; }
    const hit = horde.hit ? mixer.clipAction(retarget(horde.hit.clip, horde.hit.rig, c.rig, true)) : null; if (hit) hit.setLoop(THREE.LoopOnce, 1);
    const w = { holder, mixer, walk, die, hit, bones: twist(root, c, horde.walk), lane, z, hp: WALKER_HP, dead: false, deadT: 0 };
    ch.walkers.push(w);
    ch.obstacles.push({ kind: "walker", lane, z, zHalf: 0.45, walker: w });
  }
  function updateWalkers(pz, dt, running) {
    for (const ch of chunks.values()) for (const w of ch.walkers) {
      if (Math.abs(w.z - pz) > 70) continue;
      if (!w.dead && running) { w.z += WALKER_SPEED * dt; w.holder.position.z = w.z; const o = ch.obstacles.find((o) => o.walker === w); if (o) o.z = w.z; }
      if (w.dead) { w.deadT += dt; if (w.deadT > 6) continue; }
      w.mixer.update(dt);
      for (const { b, q } of w.bones) b.quaternion.multiply(q);
    }
  }

  const place = (ch, kind, x, y, z, ry, sc = 1) => { const i = P[kind].take(x, y, z, ry, sc); ch.slots.push([kind, i]); return i; };
  function lamp(ch, side, z) {
    const x = side * (STREET_W / 2 + 0.55), ry = side > 0 ? Math.PI / 2 : -Math.PI / 2;
    place(ch, "lamp", x, 0.15, z, ry);
    const hx = x - side * 1.4, hy = 4.6;
    place(ch, "head", hx, hy, z, 0); place(ch, "beam", hx, hy - 0.1, z, 0); place(ch, "pool", hx, 0.03, z, 0);
  }
  function car(ch, r, x, z, across) {
    const kind = CARS[Math.floor(r() * CARS.length)], ry = across ? (r() < 0.5 ? Math.PI / 2 : -Math.PI / 2) : (r() < 0.5 ? 0 : Math.PI);
    place(ch, kind, x, 0, z, ry + (r() - 0.5) * 0.08);
  }
  function obstacle(ch, r, kind, lane, z) {
    const x = laneX(lane), g = ch.group, y = floorAt(lane, z);
    if (kind === "jump") {
      mesh(box, M.barrier, x, y + 0.3, z, g, LANE_W - 0.3, 0.6, 0.35);
      mesh(box, M.post, x - LANE_W / 2 + 0.25, y + 0.32, z, g, 0.1, 0.64, 0.1); mesh(box, M.post, x + LANE_W / 2 - 0.25, y + 0.32, z, g, 0.1, 0.64, 0.1);
      ch.obstacles.push({ kind, lane, z, zHalf: 0.35 });
    } else if (kind === "slide") {
      mesh(box, M.post, x - LANE_W / 2 + 0.15, y + 0.85, z, g, 0.14, 1.7, 0.14); mesh(box, M.post, x + LANE_W / 2 - 0.15, y + 0.85, z, g, 0.14, 1.7, 0.14);
      mesh(box, M.bar, x, y + 1.45, z, g, LANE_W - 0.1, 0.3, 0.3);
      ch.obstacles.push({ kind, lane, z, zHalf: 0.3 });
    } else if (kind === "walker") {
      spawnWalker(ch, lane, z);
    } else {
      if (r() < 0.5) { const sc = 1.25; place(ch, "bin", x, y, z, Math.PI / 2, sc); ch.obstacles.push({ kind: "bin", lane, z, zHalf: 0.9 }); }
      else { car(ch, r, x, z, true); ch.obstacles.push({ kind: "car", lane, z, zHalf: 1.0 }); }
    }
  }
  function deck(ch, lanes, z0, z1) {
    const xs = lanes.map(laneX), xc = (Math.min(...xs) + Math.max(...xs)) / 2, w = (Math.max(...xs) - Math.min(...xs)) + LANE_W - 0.15, g = ch.group;
    const len = z0 - z1, flat = len - 2 * RAMP;
    mesh(box, M.deck, xc, DECK_H - 0.2, z0 - RAMP - flat / 2, g, w, 0.4, flat);
    for (const [zc, sign] of [[z0 - RAMP / 2, 1], [z1 + RAMP / 2, -1]]) { const m = mesh(box, M.deck, xc, DECK_H / 2 - 0.2, zc, g, w, 0.4, Math.hypot(RAMP, DECK_H)); m.rotation.x = sign * Math.atan2(DECK_H, RAMP); }
    for (const side of [-1, 1]) { mesh(box, M.rail, xc + side * (w / 2 - 0.05), DECK_H + 0.5, z0 - len / 2, g, 0.08, 1.0, len - 1); for (let zz = z0 - 1; zz > z1 + 1; zz -= 4) mesh(box, M.post, xc + side * (w / 2 - 0.05), DECK_H + 0.3, zz, g, 0.08, 0.6, 0.08); }
    for (let zz = z0 - 2; zz > z1 + 2; zz -= 3) for (const side of [-1, 1]) mesh(box, M.post, xc + side * (w / 2 - 0.4), DECK_H / 2 - 0.3, zz, g, 0.18, DECK_H - 0.4, 0.18);
    decks.push({ lanes: new Set(lanes), z0, z1 });
  }
  function floorAt(lane, z) {
    for (const d of decks) {
      if (!d.lanes.has(lane) || z > d.z0 || z < d.z1) continue;
      if (z > d.z0 - RAMP) return DECK_H * (d.z0 - z) / RAMP;
      if (z < d.z1 + RAMP) return DECK_H * (z - d.z1) / RAMP;
      return DECK_H;
    }
    return 0;
  }
  function tunnel(ch, z0) {
    const g = ch.group, w = STREET_W + WALK * 2 + 0.4, h = 6.5, zc = z0 - CHUNK / 2;
    for (const side of [-1, 1]) mesh(box, M.tunnel, side * (w / 2 + 0.3), h / 2, zc, g, 0.6, h, CHUNK + 0.2);
    mesh(box, M.tunnel, 0, h + 0.3, zc, g, w + 1.2, 0.6, CHUNK + 0.2);
    for (const side of [-1, 1]) mesh(box, M.tunnel, side * (w / 2 - 0.8), h - 0.4, zc, g, 1.6, 0.8, CHUNK + 0.2);
    for (let zz = z0 - 2; zz > z0 - CHUNK; zz -= 4) { const t = mesh(box, M.tube, 0, h - 0.15, zz, g, 5, 0.12, 0.3); ch.tubes.push(t); }
  }
  function roof(ch, r, side, x, y, z, w, d) {
    const g = ch.group;
    if (r() < 0.45) { const sh = 5 + r() * 12, sw = Math.min(w, d) * 0.28; const s = mesh(spireGeo, M.spire, x + (r() - 0.5) * w * 0.4, y + sh / 2, z + (r() - 0.5) * d * 0.4, g, sw, sh, sw); ch.geos.push(); void s; }
    if (r() < 0.35) mesh(box, M.post, x + (r() - 0.5) * w * 0.6, y + 3, z + (r() - 0.5) * d * 0.6, g, 0.12, 6, 0.12);
    if (r() < 0.5) { const nh = 0.5 + r() * 0.5, nw = 2 + r() * 4, ny = 4 + r() * Math.max(2, y - 8); const m = mesh(box, neonMats[Math.floor(r() * neonMats.length)], side * (WALL - 0.05), ny, z - d / 2 + (r() - 0.5) * (d - nw - 1), g, 0.08, nh, nw); ch.neon.push(m); }
  }

  function build(i) {
    const r = rng(seedBase * 7919 + i * 104729);
    const z0 = -i * CHUNK, g = new THREE.Group(); group.add(g);
    const ch = { group: g, mats: [], obstacles: [], coins: [], cans: [], slots: [], geos: [], walkers: [], tubes: [], neon: [], z: z0 - CHUNK / 2, tunnel: false };
    mesh(roadGeo, road, 0, 0.005, z0 - CHUNK / 2, g);
    ch.tunnel = i >= 4 && i - lastTunnel >= 6 && deckUntil < i && r() < 0.35;
    if (ch.tunnel) { lastTunnel = i; tunnel(ch, z0); }
    for (const side of [-1, 1]) {
      mesh(walkGeo, walk, side * KERB, 0.075, z0 - CHUNK / 2, g);
      if (!ch.tunnel) {
        const fm = facades.map((f) => grade(new THREE.MeshStandardMaterial({ color: 0x5a5e5c, map: f.map, emissive: 0xffffff, emissiveMap: f.glow, emissiveIntensity: 0.6, roughness: 1 }), 0.3));
        ch.mats.push(...fm);
        let z = z0;
        while (z > z0 - CHUNK + 1) {
          const d = Math.min(6 + r() * 7, z - (z0 - CHUNK)), w = 8 + r() * 8, h = 14 + r() * 42;
          const geo = buildingGeo(w, h, d); ch.geos.push(geo);
          mesh(geo, fm[Math.floor(r() * fm.length)], side * (WALL + w / 2), h / 2, z - d / 2, g);
          roof(ch, r, side, side * (WALL + w / 2), h, z, w, d);
          if (r() < 0.55) {
            const bw = d - 0.4, band = new THREE.PlaneGeometry(bw, 3.2); ch.geos.push(band);
            const uv = band.attributes.uv, u0 = r() * 2, v0 = r() < 0.5 ? 0 : 0.5;
            for (let k = 0; k < 4; k++) uv.setXY(k, u0 + uv.getX(k) * bw / 8, v0 + uv.getY(k) * 0.5);
            const m = mesh(band, bandMat, side * (WALL - 0.02), 1.6, z - d / 2, g); m.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
          }
          z -= d + 0.4;
        }
        for (const lz of [z0 - 6, z0 - 18]) lamp(ch, side, lz);
        for (const cz of [z0 - 5, z0 - 16]) if (r() < 0.5) car(ch, r, side * (STREET_W / 2 + 0.9), cz - r() * 3, false);
      }
      for (const cz of [z0 - 3, z0 - 11, z0 - 19]) if (r() < 0.8) place(ch, "can", side * (STREET_W / 2 + 0.5), 0.15, cz - r() * 2, r() * 6.28);
      if (r() < 0.6) { const kind = ["planter", "barrier", "cone"][Math.floor(r() * 3)]; place(ch, kind, side * (STREET_W / 2 + 1.1), 0.15, z0 - 2 - r() * 20, r() * 6.28); }
    }
    if (i >= 3 && deckUntil < i && !ch.tunnel && r() < 0.3) {
      const two = r() < 0.5, l0 = Math.floor(r() * (two ? LANES - 1 : LANES)), lanes = two ? [l0, l0 + 1] : [l0];
      const len = CHUNK * (1.5 + r() * 0.5);
      deck(ch, lanes, z0 - 2, z0 - 2 - len); deckUntil = i + Math.ceil(len / CHUNK);
    }
    const rows = [];
    if (i >= 2) {
      const n = Math.min(4, 1 + Math.floor(difficulty * 2.5) + (r() < 0.35 ? 1 : 0)), step = 16 / n;
      for (let k = 0; k < n; k++) {
        const z = z0 - 4 - k * step - r() * step * 0.5, st = rowStates(r, difficulty);
        st.forEach((s, lane) => { if (s === "open") return; const f0 = floorAt(lane, z + 1.5), f1 = floorAt(lane, z - 1.5); if (Math.abs(f0 - f1) > 0.01) return; obstacle(ch, r, s, lane, z); });
        rows.push({ z, st });
      }
    }
    let cursor = z0 - 1.5;
    for (const row of rows) {
      const open = row.st.map((s, l) => (s === "open" ? l : -1)).filter((l) => l >= 0);
      const len = cursor - (row.z + 1.6);
      if (len >= 3 && open.length && r() < 0.75) { const lane = open[Math.floor(r() * open.length)]; coins(ch, lane, cursor - 0.6, Math.min(7, Math.floor(len / 1.2))); }
      row.st.forEach((s, lane) => { if (s === "jump" && r() < 0.6) coins(ch, lane, row.z + 2.4, 5, true); });
      cursor = row.z - 1.6;
    }
    if (i >= 1 && cursor - (z0 - CHUNK) >= 4 && r() < 0.6) coins(ch, Math.floor(r() * LANES), cursor - 0.6, 6);
    if (i >= 3 && r() < 0.2) { const lane = Math.floor(r() * LANES), z = z0 - 8 - r() * 10; if (!rows.some((rw) => Math.abs(rw.z - z) < 2.5 && rw.st[lane] !== "open")) can(ch, lane, z); }
    chunks.set(i, ch);
  }
  function coins(ch, lane, z, n, arc = false) {
    const x = laneX(lane);
    for (let k = 0; k < n; k++) {
      const cz = z - k * 1.2, base = floorAt(lane, cz) + 0.9, cy = arc ? base + Math.sin((k / (n - 1)) * Math.PI) * 1.3 : base;
      const m = new THREE.Mesh(coinGeo, M.coin); m.position.set(x, cy, cz); ch.group.add(m);
      ch.coins.push({ x, y: cy, z: cz, mesh: m, taken: false });
    }
  }
  function can(ch, lane, z) {
    const x = laneX(lane), y = floorAt(lane, z) + 0.9;
    const m = new THREE.Mesh(canGeo, M.can); m.position.set(x, y, z); ch.group.add(m);
    ch.cans.push({ x, y, z, mesh: m, taken: false });
  }
  function free(i) {
    const ch = chunks.get(i); if (!ch) return;
    for (const [kind, slot] of ch.slots) P[kind].drop(slot);
    for (const m of ch.mats) m.dispose();
    for (const g of ch.geos) g?.dispose?.();
    for (const w of ch.walkers) w.mixer.stopAllAction();
    for (const d of [...decks]) if (d.z0 <= ch.z + CHUNK / 2 && d.z0 > ch.z - CHUNK / 2) decks.splice(decks.indexOf(d), 1);
    group.remove(ch.group);
    chunks.delete(i);
  }

  const api = {
    ready,
    chase, floorAt,
    onBats: (fn) => { onBats = fn; },
    reset(seed) {
      seedBase = seed || 1; difficulty = 0; deckUntil = 0; lastTunnel = -9;
      Object.assign(chase, { dist: CHASE.menace + 4, target: CHASE.menace, mistakes: 0, cleanM: 0, surgeT: 0, caught: false, closeT: 0 });
      for (const i of [...chunks.keys()]) free(i);
      decks.length = 0;
      while (zombies.length) killZombie(zombies.length - 1);
      flock.on = false; bats.count = 0; flock.next = performance.now() + 12000;
    },
    zombies: () => zombies.map((z) => ({ x: +z.x.toFixed(2), z: +z.z.toFixed(2) })),
    pulse(k) { const v = 0.55 + 0.45 * clamp01(k); M.head.color.setScalar(v); M.pool.opacity = 0.5 + 0.5 * v; M.beam.opacity = 0.02 + 0.03 * v; M.tube.color.setScalar(0.6 + 0.4 * v); },
    update(z, dist, dt, running, px, speed, metres, camPos, now) {
      if (!roadReady) return;
      difficulty = Math.min(1, dist / 800);
      const cur = Math.max(0, Math.floor(-z / CHUNK));
      for (let i = cur; i <= cur + AHEAD; i++) if (!chunks.has(i)) build(i);
      for (const i of [...chunks.keys()]) if (i < cur - BEHIND) free(i);
      if (running && !chase.caught && chase.mistakes > 0) { chase.cleanM += metres; if (chase.cleanM >= CHASE.decayM) { chase.cleanM = 0; chase.mistakes--; if (!chase.mistakes) chase.target = CHASE.menace; } }
      updateHorde(px, z, dt, running, speed, now / 1000, metres);
      updateWalkers(z, dt, running);
      if (camPos) { sky.position.set(camPos.x, 0, camPos.z); updateBats(now, camPos.z, px); }
      const inTunnel = chunks.get(cur)?.tunnel || false;
      return inTunnel;
    },
    inTunnel(z) { return !!chunks.get(Math.max(0, Math.floor(-z / CHUNK)))?.tunnel; },
    stumble() { chase.mistakes++; chase.cleanM = 0; if (chase.mistakes >= 2) { api.catch(); return true; } chase.target = CHASE.surge; chase.surgeT = CHASE.surgeS; return false; },
    catch() { chase.caught = true; chase.target = 0.6; },
    near: () => Math.max(0, Math.min(1, 1 - (chase.dist - CHASE.catchAt) / (CHASE.menace - CHASE.catchAt))),
    hit(lane, pz) {
      for (const ch of chunks.values()) for (const o of ch.obstacles) {
        if (o.done || o.lane !== lane || (o.walker && o.walker.dead)) continue;
        if (Math.abs(o.z - pz) < o.zHalf + 0.45) { o.done = true; return o; }
      }
      return null;
    },
    binAhead(lane, pz, reach) {
      for (const ch of chunks.values()) for (const o of ch.obstacles) if (!o.done && (o.kind === "bin" || o.kind === "car") && o.lane === lane && o.z < pz && pz - o.z < reach) return true;
      return false;
    },
    shoot(lane, pz, range, dmg, spread = 0) {
      let best = null;
      for (const ch of chunks.values()) for (const w of ch.walkers) {
        if (w.dead || Math.abs(w.lane - lane) > spread || w.z > pz - 0.5 || pz - w.z > range) continue;
        if (!best || w.z > best.z) best = w;
      }
      if (!best) return null;
      best.hp -= dmg;
      if (best.hp <= 0) { best.dead = true; if (best.die) { best.die.reset().play(); best.walk.crossFadeTo(best.die, 0.1, false); } return { walker: best, dead: true, lane: best.lane, z: best.z }; }
      if (best.hit) { best.hit.reset().play(); best.hit.setEffectiveWeight(1); }
      return { walker: best, dead: false, lane: best.lane, z: best.z };
    },
    fell(w) { if (!w || w.dead) return; w.dead = true; if (w.die) { w.die.reset().play(); w.walk.crossFadeTo(w.die, 0.1, false); } },
    collect(px, py, pz) {
      let n = 0;
      for (const ch of chunks.values()) for (const c of ch.coins) {
        if (c.taken) continue;
        if (Math.abs(c.x - px) < 0.9 && Math.abs(c.z - pz) < 0.9 && Math.abs(c.y - py - 0.9) < 1.1) { c.taken = true; ch.group.remove(c.mesh); n++; }
      }
      return n;
    },
    drink(px, py, pz) {
      for (const ch of chunks.values()) for (const c of ch.cans) {
        if (c.taken) continue;
        if (Math.abs(c.x - px) < 0.9 && Math.abs(c.z - pz) < 0.9 && Math.abs(c.y - py - 0.9) < 1.2) { c.taken = true; ch.group.remove(c.mesh); return true; }
      }
      return false;
    },
    spin(t) { for (const ch of chunks.values()) { for (const c of ch.coins) if (!c.taken) c.mesh.rotation.y = t * 3; for (const c of ch.cans) if (!c.taken) { c.mesh.rotation.y = t * 2; c.mesh.position.y = c.y + Math.sin(t * 4) * 0.12; } } },
    dispose() {
      for (const i of [...chunks.keys()]) free(i);
      while (zombies.length) killZombie(zombies.length - 1);
      for (const m of deadMats) m.dispose();
      scene.remove(group, sky, bats);
      for (const p of Object.values(P)) p.dispose();
      for (const f of facades) { f.map.dispose(); f.glow.dispose(); }
      for (const t of carTex) t.dispose();
      for (const m of [road, walk, bandMat, ...Object.values(M), ...neonMats]) { m?.map?.dispose(); m?.alphaMap?.dispose(); m?.dispose(); }
      for (const g of [box, coinGeo, canGeo, headGeo, poolGeo, coneGeo, binGeo, roadGeo, walkGeo, spireGeo, batGeo]) g.dispose();
    },
  };
  return api;
}
