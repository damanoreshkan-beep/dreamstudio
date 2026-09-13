// blackout — the street: an endless night avenue along −z built from 24 m chunks, born 4 ahead of the runner and
// freed 2 behind. Ф2 (2026-09-13): photo textures (Z-Image: brick facades with a lit-window overlay, a graffiti
// plinth band, asphalt, painted metal), Kenney CC0 props merged into ONE draco GLB (5 cars, dumpster, lamp,
// barrier, planter, cone) drawn through INSTANCE POOLS (one draw per prop kind, slots taken per chunk and freed
// with it), lamps with an emissive head + additive cone + ground pool tinted per chunk, and NPCs — afterdark's
// cast idling or dancing on the sidewalks (SkeletonUtils clones, one mixer each, hidden past 55 m). Every solid
// thing is a static Rapier cuboid; coins and punch targets stay plain JS boxes. The Blackout is a wall of dark
// following from +z whose speed grows with distance; the chunks it passes lose their light.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";
import { hipsOf, fit, retarget } from "./rig.js";
import { glbUrl } from "./state.js";

export const STREET_W = 10, CHUNK = 24, AHEAD = 4, BEHIND = 2;
const LANES = [-3, 0, 3];
const WALK = 1.6, KERB = STREET_W / 2 + WALK / 2, WALL = STREET_W / 2 + WALK + 0.2;   // sidewalk centre, facade face
const TILE = 9;                                                                          // facade metres per texture tile
const NPC_H = 1.7, NPC_FAR = 55;
const DRACO_PATH = "https://www.gstatic.com/draco/versioned/decoders/1.5.7/";
const A = (p) => new URL(p, import.meta.url).href;
const CARS = ["sedan", "taxi", "suv", "van", "hatch"];
const NPC_SKINS = ["arissa", "michelle", "sophie", "eve", "nightshade"];   // arissa is bundled (dev); the rest are afterdark's
const NPC_DANCE = A("../afterdark/assets/move-108780901.glb");            // Quake — optional, a missing clip = idle only

// seeded, so a run replays and the daily seed is a date
export function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

const texLoader = new THREE.TextureLoader();
async function tex(url, repeat) {
  const t = await texLoader.loadAsync(url);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.MirroredRepeatWrapping; t.anisotropy = 4;
  if (repeat) t.repeat.set(repeat[0], repeat[1]);
  return t;
}
// a facade variant: the brick photo with a 3×3 window grid per 9 m tile drawn over it; the glow map holds the lit ones
function facadeSet(img, seed) {
  const N = 1024, px = N / TILE, r = rng(seed);
  const c = document.createElement("canvas"), e = document.createElement("canvas"); c.width = c.height = e.width = e.height = N;
  const g = c.getContext("2d"), ge = e.getContext("2d");
  g.drawImage(img, 0, 0, N, N); ge.fillStyle = "#000"; ge.fillRect(0, 0, N, N);
  const ww = 1.25 * px, wh = 1.7 * px;
  for (let f = 0; f < 3; f++) for (let b = 0; b < 3; b++) {
    const x = (0.9 + b * 3) * px, y = N - (1.0 + f * 3 + 1.7) * px, on = r() < 0.5, warm = r() < 0.6;
    g.fillStyle = "#1a1620"; g.fillRect(x - 5, y - 5, ww + 10, wh + 10);
    const col = on ? (warm ? "#ffd39a" : "#c6d6ff") : "#0d0b12";
    g.fillStyle = col; g.globalAlpha = on ? 0.55 + r() * 0.4 : 1; g.fillRect(x, y, ww, wh); g.globalAlpha = 1;
    if (on) { ge.fillStyle = col; ge.globalAlpha = 0.45 + r() * 0.5; ge.fillRect(x, y, ww, wh); ge.globalAlpha = 1; }
  }
  const mk = (cv) => { const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t; };
  return { map: mk(c), glow: mk(e) };
}
// a box whose faces tile the facade every TILE metres (one shared material per chunk, no texture clones)
function buildingGeo(w, h, d) {
  const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv, dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let i = 0; i < 24; i++) { const [u, v] = dims[i >> 2]; uv.setXY(i, uv.getX(i) * u / TILE, uv.getY(i) * v / TILE); }
  return g;
}
// one prop of the merged GLB → one geometry (the node's meshes baked through their world matrices) + its material
function propGeo(node) {
  node.updateWorldMatrix(true, true);
  const parts = []; let mat = null;
  node.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry.clone();
    for (const k of Object.keys(g.attributes)) if (!/^(position|normal|uv)$/.test(k)) g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    g.applyMatrix4(o.matrixWorld); parts.push(g); mat ||= o.material;
  });
  const geo = mergeGeometries(parts, false); for (const p of parts) p.dispose();
  geo.computeBoundingBox();
  return { geo, mat };
}
// an instance pool: one InstancedMesh per prop kind, free slots parked at scale 0, per-instance tint for the dark
function pool(geo, mat, cap, parent) {
  const im = new THREE.InstancedMesh(geo, mat, cap); im.count = 0; im.frustumCulled = false;
  const zero = new THREE.Matrix4().makeScale(0, 0, 0), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3(), col = new THREE.Color();
  for (let i = 0; i < cap; i++) { im.setMatrixAt(i, zero); im.setColorAt(i, new THREE.Color(1, 1, 1)); }
  im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.instanceColor.setUsage(THREE.DynamicDrawUsage);
  parent.add(im);
  const free = Array.from({ length: cap }, (_, i) => cap - 1 - i), used = new Set();
  const recount = () => { let n = 0; for (const i of used) if (i >= n) n = i + 1; im.count = n; };
  return {
    im,
    take(x, y, z, ry = 0, sc = 1) { const i = free.pop(); if (i == null) return -1; e.set(0, ry, 0); q.setFromEuler(e); p.set(x, y, z); s.setScalar(sc); m4.compose(p, q, s); im.setMatrixAt(i, m4); im.instanceMatrix.needsUpdate = true; used.add(i); recount(); return i; },
    drop(i) { if (i < 0) return; im.setMatrixAt(i, zero); im.instanceMatrix.needsUpdate = true; free.push(i); used.delete(i); recount(); },
    tint(i, k) { if (i < 0) return; im.setColorAt(i, col.setScalar(k)); im.instanceColor.needsUpdate = true; },
    dispose() { parent.remove(im); im.dispose(); geo.dispose(); },
  };
}
const radial = (inner, outer) => { const c = document.createElement("canvas"); c.width = c.height = 128; const g = c.getContext("2d"); const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, inner); gr.addColorStop(1, outer); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };
const vertical = () => { const c = document.createElement("canvas"); c.width = 4; c.height = 128; const g = c.getContext("2d"); const gr = g.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, "rgba(255,255,255,0.55)"); gr.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = gr; g.fillRect(0, 0, 4, 128); return new THREE.CanvasTexture(c); };

export function createWorld(scene, RAPIER, world) {
  const group = new THREE.Group(); scene.add(group);
  const loader = new GLTFLoader(); const draco = new DRACOLoader(); draco.setDecoderPath(DRACO_PATH); loader.setDRACOLoader(draco);
  const chunks = new Map();   // index → { group, colliders, mats, obstacles[], coins[], slots[], npcs[], z }
  let seedBase = 1, difficulty = 0;
  const staticBox = (w, h, d, x, y, z) => world.createCollider(RAPIER.ColliderDesc.cuboid(w / 2, h / 2, d / 2).setTranslation(x, y, z));
  const box = new THREE.BoxGeometry(1, 1, 1);
  const mesh = (geo, mat, x, y, z, parent, sx = 1, sy = 1, sz = 1) => { const m = new THREE.Mesh(geo, mat); m.scale.set(sx, sy, sz); m.position.set(x, y, z); parent.add(m); return m; };

  const M = {
    step: new THREE.MeshStandardMaterial({ color: 0x5a4a2a, roughness: 0.8 }),
    crate: new THREE.MeshStandardMaterial({ color: 0xf5b942, roughness: 0.6, emissive: 0x6a4a10, emissiveIntensity: 0.4 }),
    barrier: new THREE.MeshStandardMaterial({ color: 0xff3eb5, roughness: 0.5, emissive: 0xff3eb5, emissiveIntensity: 0.35 }),
    coin: new THREE.MeshStandardMaterial({ color: 0xf5b942, emissive: 0xf5b942, emissiveIntensity: 0.9, roughness: 0.3, metalness: 0.6 }),
    head: new THREE.MeshBasicMaterial({ color: 0xffe2b0 }),
    pool: new THREE.MeshBasicMaterial({ color: 0xffc98a, map: radial("rgba(255,255,255,0.32)", "rgba(255,255,255,0)"), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
    beam: new THREE.MeshBasicMaterial({ color: 0xffc98a, alphaMap: vertical(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, opacity: 0.09 }),
    grime: new THREE.MeshStandardMaterial({ color: 0x8a8a8a, roughness: 0.95 }),
  };
  const coinGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.06, 18); coinGeo.rotateX(Math.PI / 2);
  const headGeo = new THREE.SphereGeometry(0.16, 10, 8);
  const poolGeo = new THREE.CircleGeometry(4.2, 24); poolGeo.rotateX(-Math.PI / 2);
  const coneGeo = new THREE.ConeGeometry(2.3, 4.6, 18, 1, true); coneGeo.translate(0, -2.3, 0);
  const binGeo = new THREE.CylinderGeometry(0.32, 0.28, 0.9, 14); binGeo.translate(0, 0.45, 0);
  const roadGeo = new THREE.PlaneGeometry(STREET_W + WALK * 2, CHUNK); roadGeo.rotateX(-Math.PI / 2);
  const walkGeo = new THREE.BoxGeometry(WALK, 0.15, CHUNK);
  { const uv = walkGeo.attributes.uv; for (let i = 8; i < 12; i++) uv.setXY(i, uv.getX(i) * WALK / 2, uv.getY(i) * CHUNK / 2); }

  // the assets: textures, the facade variants, the prop pools — the street is not built before `ready`
  const P = {}, facades = [];
  let road = null, walk = null, bandMat = null, roadReady = false;
  const ready = (async () => {
    const [facadeImg, graffiti, asphalt, metal, sidewalk, props] = await Promise.all([
      new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = A("assets/tex-facade.webp"); }),
      tex(A("assets/tex-graffiti.webp")), tex(A("assets/tex-asphalt.webp"), [(STREET_W + WALK * 2) / 7, CHUNK / 7]), tex(A("assets/tex-metal.webp"), [2, 1]), tex(A("assets/tex-sidewalk.webp")),
      loader.loadAsync(A("assets/props.glb")),
    ]);
    for (const s of [3, 11]) facades.push(facadeSet(facadeImg, s));
    road = new THREE.MeshStandardMaterial({ map: asphalt, color: 0x6e6b7c, roughness: 0.95 });
    walk = new THREE.MeshStandardMaterial({ map: sidewalk, color: 0x7d7a8c, roughness: 0.92 });
    bandMat = new THREE.MeshStandardMaterial({ map: graffiti, color: 0xb8b4c4, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    M.bin = new THREE.MeshStandardMaterial({ map: metal, color: 0xbfc4bf, roughness: 0.55, metalness: 0.35 });
    const cap = { sedan: 16, taxi: 16, suv: 16, van: 16, hatch: 16, bin: 16, lamp: 32, barrier: 16, planter: 16, cone: 16 };
    for (const node of props.scene.children) {
      const { geo, mat } = propGeo(node); const m = mat.clone();
      if (CARS.includes(node.name)) { m.roughness = 0.35; m.metalness = 0.25; }
      if (node.name === "bin") { m.emissive = new THREE.Color(0x39ff6a); m.emissiveIntensity = 0.28; }
      if (node.name === "lamp") { m.roughness = 0.5; m.metalness = 0.5; }
      P[node.name] = pool(geo, m, cap[node.name] || 16, group);
      P[node.name].size = geo.boundingBox.getSize(new THREE.Vector3());
    }
    P.can = pool(binGeo, M.bin, 48, group);
    P.head = pool(headGeo, M.head, 32, group);
    P.pool = pool(poolGeo, M.pool, 32, group);
    P.beam = pool(coneGeo, M.beam, 32, group);
    roadReady = true;
  })();
  // the NPCs: afterdark's cast + the breathing idle (+ one dance when reachable); a failed skin is simply absent
  const npc = { chars: [], clips: [] };
  const npcReady = (async () => {
    const [idle, dance] = await Promise.all([loader.loadAsync(A("assets/clip-idle.glb")), loader.loadAsync(NPC_DANCE).catch(() => null)]);
    npc.clips.push({ clip: idle.animations[0], rig: hipsOf(idle.scene), w: 3 });
    if (dance) npc.clips.push({ clip: dance.animations[0], rig: hipsOf(dance.scene), w: 1 });
    const loaded = await Promise.all(NPC_SKINS.map((id) => loader.loadAsync(glbUrl(id)).then((g) => ({ root: fit(g.scene, NPC_H), rig: hipsOf(g.scene) })).catch(() => null)));
    npc.chars = loaded.filter(Boolean);
  })();
  npcReady.catch(() => {});

  function spawnNpc(ch, r, x, z, ry) {
    if (!npc.chars.length) return;
    const c = npc.chars[Math.floor(r() * npc.chars.length)], root = cloneSkinned(c.root);
    const holder = new THREE.Group(); holder.position.set(x, 0.15, z); holder.rotation.y = ry; holder.add(root); ch.group.add(holder);
    const pick = npc.clips[r() < 0.75 || npc.clips.length < 2 ? 0 : 1];
    const mixer = new THREE.AnimationMixer(root), a = mixer.clipAction(retarget(pick.clip, pick.rig, c.rig, true));
    a.play(); a.time = r() * a.getClip().duration;
    ch.npcs.push({ holder, mixer, z });
    ch.colliders.push(staticBox(0.7, NPC_H, 0.7, x, 0.15 + NPC_H / 2, z));
  }
  const place = (ch, kind, x, y, z, ry, sc = 1) => { const i = P[kind].take(x, y, z, ry, sc); ch.slots.push([kind, i]); return i; };
  // a lamp: pole + head + additive cone + ground pool, all tinted by the chunk's light
  function lamp(ch, side, z) {
    const x = side * (STREET_W / 2 + 0.55), ry = side > 0 ? Math.PI / 2 : -Math.PI / 2;
    place(ch, "lamp", x, 0.15, z, ry);
    const hx = x - side * 1.4, hy = 4.6;
    place(ch, "head", hx, hy, z, 0); place(ch, "beam", hx, hy - 0.1, z, 0); place(ch, "pool", hx, 0.03, z, 0);
  }
  // a car: parked along the kerb (a side obstacle) or abandoned across a lane (vaulted); the AABB is crate-height
  function car(ch, r, x, z, across) {
    const kind = CARS[Math.floor(r() * CARS.length)], s = P[kind].size, ry = across ? (r() < 0.5 ? Math.PI / 2 : -Math.PI / 2) : (r() < 0.5 ? 0 : Math.PI);
    const w = across ? s.z : s.x, d = across ? s.x : s.z, h = 1.05;
    place(ch, kind, x, 0, z, ry + (r() - 0.5) * 0.08);
    ch.colliders.push(staticBox(w, h, d, x, h / 2, z));
    ch.obstacles.push({ kind: "crate", x, z, w, d, h });
  }

  function build(i) {
    const r = rng(seedBase * 7919 + i * 104729);
    const z0 = -i * CHUNK, g = new THREE.Group(); group.add(g);
    const ch = { group: g, colliders: [], mats: [], obstacles: [], coins: [], slots: [], npcs: [], geos: [], z: z0 - CHUNK / 2 };
    // the road (its collider is per chunk — a near-infinite cuboid sank the capsule 0.14 m; chunk 0 also covers the start pad) and both sidewalks (0.15 m kerb, walked over)
    mesh(roadGeo, road, 0, 0.005, z0 - CHUNK / 2, g);
    const pad = i === 0 ? 8 : 0;
    ch.colliders.push(staticBox(STREET_W + WALK * 2 + 2, 0.2, CHUNK + pad, 0, -0.1, z0 + pad / 2 - CHUNK / 2));
    for (const side of [-1, 1]) {
      mesh(walkGeo, walk, side * KERB, 0.075, z0 - CHUNK / 2, g);
      ch.colliders.push(staticBox(WALK, 0.15, CHUNK, side * KERB, 0.075, z0 - CHUNK / 2));
      // buildings: 2–3 blocks per side, lit from inside; a graffiti plinth on some; one chunk material per variant
      const fm = facades.map((f) => new THREE.MeshStandardMaterial({ color: 0xffffff, map: f.map, emissive: 0xffffff, emissiveMap: f.glow, emissiveIntensity: 1, roughness: 0.85 }));
      ch.mats.push(...fm);
      let z = z0;
      while (z > z0 - CHUNK + 1) {
        const d = Math.min(6 + r() * 7, z - (z0 - CHUNK)), w = 8 + r() * 8, h = 8 + r() * 24;
        const geo = buildingGeo(w, h, d); ch.geos.push(geo);
        mesh(geo, fm[Math.floor(r() * fm.length)], side * (WALL + w / 2), h / 2, z - d / 2, g);
        if (r() < 0.55) {
          const bw = d - 0.4, band = new THREE.PlaneGeometry(bw, 3.2); ch.geos.push(band);
          const uv = band.attributes.uv, u0 = r() * 2, v0 = r() < 0.5 ? 0 : 0.5;
          for (let k = 0; k < 4; k++) uv.setXY(k, u0 + uv.getX(k) * bw / 8, v0 + uv.getY(k) * 0.5);
          const m = mesh(band, bandMat, side * (WALL - 0.02), 1.6, z - d / 2, g); m.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
        }
        z -= d + 0.4;
      }
      // a lamp every 12 m, a can every 8 m, some clutter, a parked car or two, a passer-by
      for (const lz of [z0 - 6, z0 - 18]) lamp(ch, side, lz);
      for (const cz of [z0 - 3, z0 - 11, z0 - 19]) {
        if (r() < 0.8) { const x = side * (STREET_W / 2 + 0.5), zz = cz - r() * 2; place(ch, "can", x, 0.15, zz, r() * 6.28); ch.colliders.push(staticBox(0.64, 0.9, 0.64, x, 0.6, zz)); }
      }
      if (r() < 0.6) { const kind = ["planter", "barrier", "cone"][Math.floor(r() * 3)], x = side * (STREET_W / 2 + 1.1), zz = z0 - 2 - r() * 20, s = P[kind].size; place(ch, kind, x, 0.15, zz, r() * 6.28); ch.colliders.push(staticBox(s.x, s.y, s.z, x, 0.15 + s.y / 2, zz)); }
      for (const cz of [z0 - 5, z0 - 16]) if (r() < 0.6) car(ch, r, side * (STREET_W / 2 - 0.95), cz - r() * 3, false);
      if (i >= 1 && r() < 0.5) spawnNpc(ch, r, side * (KERB + 0.15), z0 - 2 - r() * 20, -side * Math.PI / 2 + (r() - 0.5) * 0.8);
    }
    // the phrases: run-up → obstacle → coins, density rising with distance (chunk 0–1 stay clear)
    if (i >= 2) {
      const n = 1 + Math.min(2, Math.floor(difficulty * 2.5 + r() * 0.8));
      for (let k = 0; k < n; k++) {
        const z = z0 - 4 - k * (CHUNK - 8) / n - r() * 4, kind = r();
        if (kind < 0.22) {                                   // a low step across the street — autostep
          mesh(box, M.step, 0, 0.175, z, g, STREET_W, 0.35, 0.8); ch.colliders.push(staticBox(STREET_W, 0.35, 0.8, 0, 0.175, z));
          coins(ch, r, 0, z - 2, 0.9, 5);
        } else if (kind < 0.42) {                            // a crate in a lane — vaulted, coins arc over it
          const x = LANES[Math.floor(r() * 3)];
          mesh(box, M.crate, x, 0.5, z, g, 2.2, 1.0, 1.0); ch.colliders.push(staticBox(2.2, 1.0, 1.0, x, 0.5, z));
          ch.obstacles.push({ kind: "crate", x, z, w: 2.2, d: 1.0, h: 1.0 });
          coins(ch, r, x, z + 1.8, 0.9, 5, true);
        } else if (kind < 0.6) {                             // a car abandoned across a lane — vaulted like a crate
          const x = LANES[Math.floor(r() * 3)];
          car(ch, r, x, z, true);
          coins(ch, r, x, z + 2.2, 0.9, 6, true);
        } else if (kind < 0.8) {                             // a barrier over 60 % of the width — steer around
          const side = r() < 0.5 ? -1 : 1, w = STREET_W * 0.6, x = side * (STREET_W / 2 - w / 2);
          mesh(box, M.barrier, x, 0.8, z, g, w, 1.6, 0.4); ch.colliders.push(staticBox(w, 1.6, 0.4, x, 0.8, z));
          coins(ch, r, -side * 3.2, z + 1, 0.9, 4);
        } else {                                             // a dumpster in a lane — punched for coins, otherwise a wall
          const x = LANES[Math.floor(r() * 3)], s = P.bin.size, sc = 1.25, w = s.z * sc, d = s.x * sc, h = s.y * sc;
          const slot = place(ch, "bin", x, 0, z, Math.PI / 2, sc); const c = staticBox(w, h, d, x, h / 2, z); ch.colliders.push(c);
          ch.obstacles.push({ kind: "bin", x, z, w, d, h, slot, collider: c });
        }
      }
      if (r() < 0.5) coins(ch, r, LANES[Math.floor(r() * 3)], z0 - 12, 0.9, 6);
    }
    chunks.set(i, ch);
  }
  function coins(ch, r, x, z, y, n, arc = false) {
    for (let k = 0; k < n; k++) {
      const cz = z - k * 1.2, cy = arc ? y + Math.sin((k / (n - 1)) * Math.PI) * 1.3 : y;
      const m = new THREE.Mesh(coinGeo, M.coin); m.position.set(x, cy, cz); ch.group.add(m);
      ch.coins.push({ x, y: cy, z: cz, mesh: m, taken: false });
    }
  }
  function free(i) {
    const ch = chunks.get(i); if (!ch) return;
    for (const c of ch.colliders) world.removeCollider(c, true);
    for (const [kind, slot] of ch.slots) P[kind].drop(slot);
    for (const m of ch.mats) m.dispose();
    for (const g of ch.geos) g.dispose();
    group.remove(ch.group);
    chunks.delete(i);
  }

  // the Blackout: a tall dark wall + a dark tongue creeping along the ground ahead of it
  const wallMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.97, depthWrite: false });
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(60, 50), wallMat); wall.position.y = 25; wall.rotation.y = Math.PI; scene.add(wall);
  const tongue = new THREE.Mesh(new THREE.PlaneGeometry(60, 14), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.85, depthWrite: false }));
  tongue.rotation.x = -Math.PI / 2; tongue.position.y = 0.02; scene.add(tongue);
  let wallZ = 30;

  const api = {
    ready,
    wallZ: () => wallZ,
    reset(seed) {
      seedBase = seed || 1; difficulty = 0; wallZ = 30;
      for (const i of [...chunks.keys()]) free(i);
    },
    // keep AHEAD chunks in front of the runner and BEHIND behind; advance the dark; dim what it has swallowed; move the NPCs
    update(z, dist, dt, running) {
      if (!roadReady) return;
      difficulty = Math.min(1, dist / 900);
      const cur = Math.max(0, Math.floor(-z / CHUNK));
      for (let i = cur; i <= cur + AHEAD; i++) if (!chunks.has(i)) build(i);
      for (const i of [...chunks.keys()]) if (i < cur - BEHIND) free(i);
      if (running) wallZ -= (2.6 + Math.min(2.2, dist / 350)) * dt;
      wall.position.z = wallZ; tongue.position.z = wallZ - 7;
      for (const ch of chunks.values()) {
        const lit = Math.max(0, Math.min(1, (wallZ - ch.z - 8) / 14));
        if (ch.lit !== lit) { ch.lit = lit; for (const m of ch.mats) m.emissiveIntensity = lit; for (const [k, s] of ch.slots) if (k === "head" || k === "beam" || k === "pool") P[k].tint(s, lit); }
        for (const n of ch.npcs) { const near = Math.abs(n.z - z) < NPC_FAR; n.holder.visible = near; if (near) n.mixer.update(dt); }
      }
    },
    // the coins within reach; the punchable target in front; the vaultable crate ahead — plain boxes, no physics
    collect(px, py, pz) {
      let n = 0;
      for (const ch of chunks.values()) for (const c of ch.coins) {
        if (c.taken) continue;
        if (Math.abs(c.x - px) < 0.8 && Math.abs(c.z - pz) < 0.8 && Math.abs(c.y - py - 0.9) < 1.1) { c.taken = true; ch.group.remove(c.mesh); n++; }
      }
      return n;
    },
    spin(t) { for (const ch of chunks.values()) for (const c of ch.coins) if (!c.taken) c.mesh.rotation.y = t * 3; },
    ahead(px, pz, dx, dz, reach, kind) {
      for (const ch of chunks.values()) for (const o of ch.obstacles) {
        if (o.kind !== kind || o.gone) continue;
        const cx = o.x - px, cz = o.z - pz, along = cx * dx + cz * dz, across = Math.abs(-cx * dz + cz * dx);
        if (along > 0 && along < reach + o.d / 2 && across < o.w / 2 + 0.35) return o;
      }
      return null;
    },
    smash(o) {
      o.gone = true; P.bin.drop(o.slot); world.removeCollider(o.collider, true);
      const ch = [...chunks.values()].find((c) => c.obstacles.includes(o));
      if (ch) { ch.colliders = ch.colliders.filter((c) => c !== o.collider); ch.slots = ch.slots.filter(([k, s]) => !(k === "bin" && s === o.slot)); }
    },
    dispose() {
      for (const i of [...chunks.keys()]) free(i);
      scene.remove(group, wall, tongue);
      for (const p of Object.values(P)) p.dispose();
      for (const f of facades) { f.map.dispose(); f.glow.dispose(); }
      for (const m of [road, walk, bandMat, wallMat, ...Object.values(M)]) { m?.map?.dispose(); m?.alphaMap?.dispose(); m?.dispose(); }
      for (const g of [box, coinGeo, headGeo, poolGeo, coneGeo, binGeo, roadGeo, walkGeo]) g.dispose();
    },
  };
  return api;
}
