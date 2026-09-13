// blackout — the street: an endless night avenue along −z built from 24 m chunks (buildings both sides, kerbs,
// lamps, obstacles, coins), born 4 ahead of the runner and freed 2 behind. Static colliders only for what the
// body must stop on (kerb, step, crate, barrier, bin); coins and punch targets are plain JS boxes. The Blackout
// is a wall of dark following from +z whose speed grows with distance; the chunks it passes lose their lights.
import * as THREE from "three";

export const STREET_W = 10, CHUNK = 24, AHEAD = 4, BEHIND = 2;
const LANES = [-3, 0, 3];

// seeded, so a run replays and the daily seed is a date
export function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// a facade: dark concrete with a grid of lit windows, most on, a few dark — one canvas, cloned per building
function facadeTexture() {
  const c = document.createElement("canvas"); c.width = c.height = 256;
  const g = c.getContext("2d");
  g.fillStyle = "#17131f"; g.fillRect(0, 0, 256, 256);
  const r = rng(7);
  for (let y = 8; y < 256; y += 32) for (let x = 8; x < 256; x += 32) {
    const on = r() < 0.55, warm = r() < 0.5;
    g.fillStyle = on ? (warm ? "#ffd9a0" : "#c9d9ff") : "#221c2c";
    g.globalAlpha = on ? 0.55 + r() * 0.45 : 1;
    g.fillRect(x, y, 14, 18);
  }
  g.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
function emissiveTexture(map) {
  const c = document.createElement("canvas"); c.width = c.height = 256;
  const g = c.getContext("2d"); g.drawImage(map.image, 0, 0);
  const d = g.getImageData(0, 0, 256, 256); const p = d.data;
  for (let i = 0; i < p.length; i += 4) { const lit = p[i] + p[i + 1] + p[i + 2] > 300; if (!lit) p[i] = p[i + 1] = p[i + 2] = 0; }
  g.putImageData(d, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}

export function createWorld(scene, RAPIER, world) {
  const facade = facadeTexture(), glow = emissiveTexture(facade);
  const box = new THREE.BoxGeometry(1, 1, 1);
  const M = {
    kerb: new THREE.MeshStandardMaterial({ color: 0x2a2436, roughness: 0.9 }),
    step: new THREE.MeshStandardMaterial({ color: 0x5a4a2a, roughness: 0.8 }),
    crate: new THREE.MeshStandardMaterial({ color: 0xf5b942, roughness: 0.6, emissive: 0x6a4a10, emissiveIntensity: 0.4 }),
    barrier: new THREE.MeshStandardMaterial({ color: 0xff3eb5, roughness: 0.5, emissive: 0xff3eb5, emissiveIntensity: 0.35 }),
    bin: new THREE.MeshStandardMaterial({ color: 0x39ff6a, roughness: 0.5, emissive: 0x39ff6a, emissiveIntensity: 0.45 }),
    pole: new THREE.MeshStandardMaterial({ color: 0x3a3450, roughness: 0.6, metalness: 0.4 }),
    lamp: new THREE.MeshBasicMaterial({ color: 0xffe2b0 }),
    coin: new THREE.MeshStandardMaterial({ color: 0xf5b942, emissive: 0xf5b942, emissiveIntensity: 0.9, roughness: 0.3, metalness: 0.6 }),
  };
  const coinGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.06, 18); coinGeo.rotateX(Math.PI / 2);
  const poleGeo = new THREE.CylinderGeometry(0.06, 0.08, 4.2, 8);
  const lampGeo = new THREE.SphereGeometry(0.22, 12, 10);
  const group = new THREE.Group(); scene.add(group);

  const chunks = new Map();   // index → { group, colliders, mats, obstacles[], coins[] }
  let seedBase = 1, difficulty = 0;

  const staticBox = (w, h, d, x, y, z) => world.createCollider(RAPIER.ColliderDesc.cuboid(w / 2, h / 2, d / 2).setTranslation(x, y, z));
  const mesh = (mat, w, h, d, x, y, z, parent) => { const m = new THREE.Mesh(box, mat); m.scale.set(w, h, d); m.position.set(x, y, z); parent.add(m); return m; };

  function build(i) {
    const r = rng(seedBase * 7919 + i * 104729);
    const z0 = -i * CHUNK, g = new THREE.Group(); group.add(g);
    const ch = { group: g, colliders: [], mats: [], obstacles: [], coins: [], z: z0 - CHUNK / 2 };
    // buildings: fill the 24 m on each side with 2–3 blocks, facades lit from inside
    for (const side of [-1, 1]) {
      let z = z0;
      while (z > z0 - CHUNK + 1) {
        const d = Math.min(6 + r() * 7, z - (z0 - CHUNK)), w = 8 + r() * 8, h = 8 + r() * 24;
        const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: facade.clone(), emissive: 0xffffff, emissiveMap: glow.clone(), emissiveIntensity: 1, roughness: 0.85 });
        mat.map.repeat.set(Math.max(1, Math.round(d / 4)), Math.max(1, Math.round(h / 4))); mat.map.needsUpdate = true;
        mat.emissiveMap.repeat.copy(mat.map.repeat); mat.emissiveMap.needsUpdate = true;
        mesh(mat, w, h, d, side * (STREET_W / 2 + 1.2 + w / 2), h / 2, z - d / 2, g);
        ch.mats.push(mat);
        z -= d + 0.4;
      }
      // the kerb (0.15 m, walked over) and a lamp every 12 m
      mesh(M.kerb, 1.2, 0.15, CHUNK, side * (STREET_W / 2 + 0.6), 0.075, z0 - CHUNK / 2, g);
      ch.colliders.push(staticBox(1.2, 0.15, CHUNK, side * (STREET_W / 2 + 0.6), 0.075, z0 - CHUNK / 2));
      for (const lz of [z0 - 6, z0 - 18]) {
        const p = new THREE.Mesh(poleGeo, M.pole); p.position.set(side * (STREET_W / 2 + 0.6), 2.1, lz); g.add(p);
        const l = new THREE.Mesh(lampGeo, M.lamp); l.position.set(side * (STREET_W / 2 + 0.3), 4.2, lz); g.add(l);
      }
    }
    // the phrases: run-up → obstacle → coins, density rising with distance (chunk 0–1 stay clear)
    if (i >= 2) {
      const n = 1 + Math.min(2, Math.floor(difficulty * 2.5 + r() * 0.8));
      for (let k = 0; k < n; k++) {
        const z = z0 - 4 - k * (CHUNK - 8) / n - r() * 4, kind = r();
        if (kind < 0.28) {                                   // a low step across the street — autostep
          mesh(M.step, STREET_W, 0.35, 0.8, 0, 0.175, z, g); ch.colliders.push(staticBox(STREET_W, 0.35, 0.8, 0, 0.175, z));
          coins(ch, r, 0, z - 2, 0.9, 5);
        } else if (kind < 0.6) {                             // a crate in a lane — vaulted, coins arc over it
          const x = LANES[Math.floor(r() * 3)];
          mesh(M.crate, 2.2, 1.0, 1.0, x, 0.5, z, g); ch.colliders.push(staticBox(2.2, 1.0, 1.0, x, 0.5, z));
          ch.obstacles.push({ kind: "crate", x, z, w: 2.2, d: 1.0, h: 1.0 });
          coins(ch, r, x, z + 1.8, 0.9, 5, true);
        } else if (kind < 0.82) {                            // a barrier over 60 % of the width — steer around
          const side = r() < 0.5 ? -1 : 1, w = STREET_W * 0.6, x = side * (STREET_W / 2 - w / 2);
          mesh(M.barrier, w, 1.6, 0.4, x, 0.8, z, g); ch.colliders.push(staticBox(w, 1.6, 0.4, x, 0.8, z));
          coins(ch, r, -side * 3.2, z + 1, 0.9, 4);
        } else {                                             // a bin in a lane — punched for coins, otherwise a wall
          const x = LANES[Math.floor(r() * 3)];
          const m = mesh(M.bin, 0.9, 1.2, 0.9, x, 0.6, z, g); const c = staticBox(0.9, 1.2, 0.9, x, 0.6, z); ch.colliders.push(c);
          ch.obstacles.push({ kind: "bin", x, z, w: 0.9, d: 0.9, h: 1.2, mesh: m, collider: c });
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
    for (const m of ch.mats) { m.map.dispose(); m.emissiveMap.dispose(); m.dispose(); }
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
    wallZ: () => wallZ,
    reset(seed) {
      seedBase = seed || 1; difficulty = 0; wallZ = 30;
      for (const i of [...chunks.keys()]) free(i);
    },
    // keep AHEAD chunks in front of the runner and BEHIND behind; advance the dark; dim what it has swallowed
    update(z, dist, dt, running) {
      difficulty = Math.min(1, dist / 900);
      const cur = Math.max(0, Math.floor(-z / CHUNK));
      for (let i = cur; i <= cur + AHEAD; i++) if (!chunks.has(i)) build(i);
      for (const i of [...chunks.keys()]) if (i < cur - BEHIND) free(i);
      if (running) wallZ -= (2.6 + Math.min(2.2, dist / 350)) * dt;
      wall.position.z = wallZ; tongue.position.z = wallZ - 7;
      for (const ch of chunks.values()) {
        const lit = Math.max(0, Math.min(1, (wallZ - ch.z - 8) / 14));
        for (const m of ch.mats) m.emissiveIntensity = lit;
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
    smash(o) { o.gone = true; o.mesh.parent?.remove(o.mesh); world.removeCollider(o.collider, true); const i = [...chunks.values()].find((c) => c.obstacles.includes(o)); if (i) i.colliders = i.colliders.filter((c) => c !== o.collider); },
    dispose() { for (const i of [...chunks.keys()]) free(i); scene.remove(group, wall, tongue); facade.dispose(); glow.dispose(); box.dispose(); coinGeo.dispose(); poleGeo.dispose(); lampGeo.dispose(); for (const m of Object.values(M)) m.dispose(); wallMat.dispose(); },
  };
  return api;
}
