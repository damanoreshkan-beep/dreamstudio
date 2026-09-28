import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { report } from "/_rt/telemetry.js";
import { createWorld, LANES, laneX } from "./world.js";
import { hipsOf, fit, retarget } from "./rig.js";
import { glbUrl, muted, mix, weaponById, wieldedArm, $weapon } from "./state.js";
import { createSound } from "./sound.js";

const DRACO_PATH = "https://www.gstatic.com/draco/versioned/decoders/1.5.7/";
const CLIPS = {
  idle: { url: new URL("assets/clip-idle.glb", import.meta.url).href, loop: true },
  run: { url: new URL("assets/clip-run.glb", import.meta.url).href, loop: true, inPlace: true },
  jump: { url: new URL("assets/clip-jump.glb", import.meta.url).href, inPlace: true, fitTo: 0.7 },
  vault: { url: new URL("assets/clip-vault.glb", import.meta.url).href, inPlace: true, fitTo: 1.1 },
  slide: { url: new URL("assets/clip-slide.glb", import.meta.url).href, inPlace: true, fitTo: 0.85 },
  stumble: { url: new URL("assets/clip-stumble.glb", import.meta.url).href, inPlace: true, fitTo: 0.9 },
  death: { url: new URL("assets/clip-death.glb", import.meta.url).href, inPlace: true, hold: true },
};
const TARGET_H = 1.7, GRAVITY = -22, JUMP_V = 7.4, VAULT_V = 8.4, JUMP_SAFE_Y = 0.35, BIN_SAFE_Y = 0.85, SLIDE_S = 0.75, LANE_LERP = 13;
const BASE_SPEED = 6.5, MAX_SPEED = 15, RAMP_M = 1500, RUN_CLIP_MS = 4.4;
const BOOST_S = 6, BOOST_K = 2;
const FACE_PX = 132;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export async function createStage(canvas, { getInput, onStatus, onStat, onEvent }, skinId) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.6));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.autoClear = false;
  const scene = new THREE.Scene();
  const NIGHT = new THREE.Color(0x070a12);
  scene.background = NIGHT; scene.fog = new THREE.Fog(NIGHT, 8, 66);
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 260);
  const faceCam = new THREE.PerspectiveCamera(34, 1, 0.1, 30);
  const hemi = new THREE.HemisphereLight(0x3a4a58, 0x141816, 0.55); scene.add(hemi);
  const moon = new THREE.DirectionalLight(0x8090b0, 0.55); moon.position.set(-3, 10, -6); scene.add(moon);
  const fill = new THREE.DirectionalLight(0x8a8478, 0.9); fill.position.set(2, 7, 6); scene.add(fill);
  const key = new THREE.PointLight(0xffe2b0, 60, 9, 1.6); key.position.set(0.6, 2.6, 1.4);

  const street = createWorld(scene);

  const holder = new THREE.Group(); scene.add(holder);
  const loader = new GLTFLoader(); const draco = new DRACOLoader(); draco.setDecoderPath(DRACO_PATH); loader.setDRACOLoader(draco);
  const raw = {};
  let mixer = null, actions = {}, current = null, rig = null, oneShot = null, skin = null, hand = null;
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
      if (c.loop) a.setLoop(THREE.LoopRepeat, Infinity); else { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
      if (c.fitTo) a.setEffectiveTimeScale(a.getClip().duration / c.fitTo);
      actions[cid] = a;
    }
    mixer.addEventListener("finished", (e) => { if (e.action === actions.death) return; oneShot = null; });
    hand = root.getObjectByName(rig.prefix + "RightHand") || null;
    if (hand) { gun.position.set(0, 0.05, 0.02); gun.rotation.set(0, 0, -0.2); hand.add(gun); }
    skin = id;
  }
  function play(id, fade = 0.2, once = false) {
    const a = actions[id]; if (!a || current === id) return;
    a.enabled = true; a.setEffectiveWeight(1); a.reset(); a.play();
    const prev = actions[current]; if (prev && prev !== a) a.crossFadeFrom(prev, fade, true);
    current = id; if (once) oneShot = id;
  }
  const gun = new THREE.Group();
  const gunMat = new THREE.MeshStandardMaterial({ color: 0x1a1c20, roughness: 0.6, metalness: 0.7 });
  const muzzleMat = new THREE.MeshBasicMaterial({ color: 0xffd080, transparent: true, opacity: 0 });
  gun.add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.22), gunMat));
  const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), muzzleMat); muzzle.position.set(0, 0.04, -0.16); gun.add(muzzle);
  try { await Promise.all([loadClips(), street.ready]); await loadSkin(skinId); } catch (e) { onStatus("failed", "glb: " + String(e && e.message || e).slice(0, 70)); return null; }

  const sound = createSound({ muted, mix });
  const sfx = (name, o) => sound?.play(name, o);
  street.onBats(() => sfx("bats"));
  let nextAmbience = 0, coinStreak = 0, lastCoinAt = 0;

  const tracerGeo = new THREE.BoxGeometry(0.05, 0.05, 1.4), tracerMat = new THREE.MeshBasicMaterial({ color: 0xffe7a8 });
  const tracers = [];
  let W = null, ammo = 0, reloadT = 0, fireCd = 0, muzzleT = 0;
  function arm(id) { W = weaponById(id); ammo = W.mag; reloadT = 0; fireCd = 0; muzzleMat.color.set(W.tint); }
  arm(wieldedArm($weapon.get()));

  function resize() { const w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
  resize(); addEventListener("resize", resize);

  let state = "idle", lane = 1, x = laneX(1), y = 0, vy = 0, z = 2, slideT = 0, stumbleT = 0, dist = 0, coins = 0, seed = 1, speedK = 1, boostT = 0, boostK = 1, kills = 0;
  const camPos = new THREE.Vector3(0, 4, 9.8), look = new THREE.Vector3(), want = new THREE.Vector3();
  const face = { shake: 0, zoom: 0, mood: "" };
  const clock = new THREE.Clock();
  let raf = 0, dead = false, frame = 0, fpsN = 0, fpsT = 0, fps = 0, reported = false, airborne = false;
  const speedAt = (d) => BASE_SPEED + Math.min(1, d / RAMP_M) * (MAX_SPEED - BASE_SPEED);
  const mood = (m, shake = 0, zoom = 0) => { face.mood = m; face.shake = Math.max(face.shake, shake); face.zoom = zoom || face.zoom; onEvent("mood", m); };

  function tick() {
    if (dead) return;
    raf = requestAnimationFrame(tick);
    const dt = Math.min(clock.getDelta(), 0.05), now = performance.now();
    const running = state === "run";
    if (stumbleT > 0) { stumbleT -= dt; speedK = 0.45 + 0.55 * (1 - clamp(stumbleT / 1.1, 0, 1)); } else speedK = 1;
    if (boostT > 0 && (boostT -= dt) <= 0) { boostT = 0; onEvent("boost", 0); }
    boostK += ((boostT > 0 ? BOOST_K : 1) - boostK) * Math.min(1, dt * 3);
    const speed = running ? speedAt(dist) * speedK * boostK : 0;
    const metres = speed * dt;
    z -= metres; dist = Math.max(dist, 2 - z);
    const px = x; x += (laneX(lane) - x) * (1 - Math.exp(-LANE_LERP * dt));
    const vx = (x - px) / Math.max(dt, 1e-4);
    const floor = street.floorAt(lane, z);
    if (airborne) {
      vy += GRAVITY * dt; y += vy * dt;
      if (y <= floor && vy < 0) { y = floor; vy = 0; airborne = false; if (running) { sfx("land"); mood("land", 0.5); if (current !== "vault") { oneShot = null; play("run", 0.12); } } }
    } else if (floor - y > 0.6) {
      if (boostT > 0) { vy = JUMP_V; airborne = true; play("jump", 0.06, true); }
      else if (running) { sfx("hit-metal"); caught(now); }
      else y = floor;
    } else if (y > floor + 0.05 && vy <= 0) { airborne = true; vy = 0; }
    else y = floor;
    if (slideT > 0 && (slideT -= dt) <= 0) { slideT = 0; oneShot = null; }
    if (running) {
      const got = street.collect(x, y, z);
      if (got) { coins += got; coinStreak = now - lastCoinAt < 700 ? coinStreak + 1 : 0; lastCoinAt = now; sfx("coin", { rate: 1 + Math.min(coinStreak, 10) * 0.035 }); if (coinStreak === 4) mood("coins"); onEvent("coin", got); }
      if (street.drink(x, y, z)) { boostT = BOOST_S; sfx("can"); mood("boost", 0.4, 1); onEvent("boost", BOOST_S); }
      const o = street.hit(lane, z);
      if (o) {
        const safe = o.kind === "jump" ? y - floor > JUMP_SAFE_Y : o.kind === "bin" || o.kind === "car" ? y - floor > BIN_SAFE_Y : o.kind === "slide" ? slideT > 0 : false;
        if (!safe) {
          if (boostT > 0) {
            if (o.walker) { street.fell(o.walker); kills++; coins += 5; sfx("zombie-die"); onEvent("kill"); } else sfx(o.kind === "jump" ? "hit-wood" : o.kind === "slide" ? "hit-metal" : "hit-car");
            mood("smash", 0.6);
          } else {
            sfx(o.kind === "jump" ? "hit-wood" : o.kind === "slide" || o.kind === "bin" ? "hit-metal" : o.kind === "walker" ? "zombie-hit" : "hit-car");
            if (o.walker) street.fell(o.walker);
            if (o.kind === "dodge" || street.stumble()) caught(now);
            else { stumbleT = 1.1; slideT = 0; play("stumble", 0.06, true); sfx("stumble"); sfx(Math.random() < 0.5 ? "zombie-growl-1" : "zombie-growl-2"); mood("hit", 1); onEvent("stumble"); }
          }
        }
      }
      if (now > nextAmbience) { nextAmbience = now + 18000 + Math.random() * 30000; sfx(Math.random() < 0.5 ? "siren" : "crow"); }
      if (reloadT > 0 && (reloadT -= dt) <= 0) { reloadT = 0; ammo = W.mag; onEvent("ammo", ammo); }
      if (fireCd > 0) fireCd -= dt;
    }
    for (let i = tracers.length - 1; i >= 0; i--) { const t = tracers[i]; t.m.position.z -= 60 * dt; if (t.m.position.z < t.end) { scene.remove(t.m); tracers.splice(i, 1); } }
    if (muzzleT > 0) { muzzleT -= dt; muzzleMat.opacity = clamp(muzzleT / 0.08, 0, 1); }
    const inTunnel = street.update(z, dist, dt, running, x, speed, metres, camPos, now);
    street.spin(now / 1000);
    holder.position.set(x, y, z); holder.rotation.set(airborne ? -0.1 : 0, Math.PI, clamp(-vx * 0.035, -0.3, 0.3));
    if (!oneShot) play(running ? "run" : "idle", 0.2);
    if (current === "run") actions.run.setEffectiveTimeScale(clamp(speed / RUN_CLIP_MS, 0.9, boostT > 0 ? 1.9 : 1.6));
    mixer?.update(dt);
    const near = street.near();
    if (sound) {
      const b = sound.tick(now);
      street.pulse(1 - b.phase);
      sound.bedTo("run", running ? 1 : 0, clamp(speed / RUN_CLIP_MS, 0.7, 2.2));
      sound.bedTo("wind", state !== "idle" ? (inTunnel ? 0.3 : 1) : 0.4);
      sound.bedTo("lamp-hum", state !== "idle" ? 1 : 0);
      sound.bedTo("horde", running || state === "over" ? 0.25 + near * 0.75 : 0, 1);
      sound.bedTo("horde-run", running ? near * 0.8 : 0, 0.9 + near * 0.3);
      sound.bedTo("heartbeat", running && near > 0.45 ? (near - 0.45) * 1.6 : 0, 0.9 + near * 0.5, 0.08);
      sound.bedTo("boost", boostT > 0 ? 0.8 : 0, 1, 0.1);
    } else street.pulse(0.5);
    if (state === "idle") {
      const a = now / 11000, r = 6.2;
      look.set(x, 0.7, z); want.set(x + Math.sin(a) * r, 2.3 + Math.sin(a * 0.7) * 0.5, z + Math.cos(a) * r);
    } else {
      look.set(x * 0.35, floor + 0.9, z - 7);
      want.set(x * 0.45, floor + 4.0, z + 7.8);
    }
    camPos.lerp(want, 0.18); camera.position.copy(camPos); camera.lookAt(look);
    const fov = boostT > 0 ? 70 : 60; if (Math.abs(camera.fov - fov) > 0.05) { camera.fov += (fov - camera.fov) * 0.08; camera.updateProjectionMatrix(); }
    const dim = (1 - near * 0.55) * (inTunnel ? 0.6 : 1);
    hemi.intensity = 0.55 * dim; moon.intensity = 0.55 * dim; fill.intensity = 0.9 * dim;
    const cw = canvas.clientWidth || innerWidth, chh = canvas.clientHeight || innerHeight;
    renderer.setScissorTest(false); renderer.setViewport(0, 0, cw, chh); renderer.clear();
    renderer.render(scene, camera);
    face.shake *= Math.exp(-dt * 6); face.zoom *= Math.exp(-dt * 2.5);
    if (running) {
      const sh = face.shake * 0.08;
      faceCam.position.set(x + 0.25 + (Math.random() - 0.5) * sh, y + 1.72 + (Math.random() - 0.5) * sh, z - 1.15 + face.zoom * 0.25);
      faceCam.lookAt(x, y + 1.55, z); faceCam.aspect = 1; faceCam.fov = 34 - face.zoom * 8; faceCam.updateProjectionMatrix();
      renderer.setScissorTest(true); renderer.setScissor(16, chh - 150 - FACE_PX, FACE_PX, FACE_PX); renderer.setViewport(16, chh - 150 - FACE_PX, FACE_PX, FACE_PX);
      renderer.render(scene, faceCam);
    }
    fpsN++; if (now - fpsT >= 1000) { fps = fpsN; fpsN = 0; fpsT = now; }
    if (++frame % 6 === 0) onStat({ frame, dist, coins, speed, fps, lane, near, boost: boostT > 0 ? Math.ceil(boostT) : 0, ammo, reload: reloadT > 0, kills, x: +x.toFixed(2), y: +y.toFixed(2), z: +z.toFixed(2) });
    if (!reported && frame > 720 && running) { reported = true; report("stage.fps", { fps, dpr: renderer.getPixelRatio(), skin }, "info"); }
  }
  function caught(now) {
    state = "over"; street.catch(); slideT = 0; stumbleT = 0; boostT = 0;
    play("death", 0.1, true); mood("caught", 1.2);
    sfx("zombie-scream"); setTimeout(() => { sfx("bite"); sfx("fall"); }, 500); setTimeout(() => sfx("over"), 900);
    onEvent("over", { dist, coins, at: now });
  }
  onStatus("ready", ""); tick();
  globalThis.__blackout = { get mixer() { return mixer; }, get actions() { return actions; }, get current() { return current; }, get rig() { return rig; }, get fps() { return fps; }, get state() { return state; }, get lane() { return lane; }, get boost() { return boostT; }, get ammo() { return ammo; }, world: street, holder, sound, catch: () => { if (state === "run") caught(performance.now()); }, boost: () => { boostT = BOOST_S; } };

  return {
    start(s) {
      seed = s || 1; street.reset(seed);
      lane = 1; x = laneX(1); y = 0; vy = 0; z = 2; slideT = 0; stumbleT = 0; dist = 0; coins = 0; oneShot = null; state = "run"; reported = false; airborne = false; boostT = 0; boostK = 1; kills = 0;
      coinStreak = 0; nextAmbience = performance.now() + 12000; arm(wieldedArm($weapon.get()));
      if (sound) { sound.resume(); sound.load().then(() => sfx("whoosh-start")); sound.music(true); }
      onEvent("start");
    },
    act(what) {
      if (state !== "run") return false;
      if (what === "left") { if (lane <= 0) return false; lane--; sfx("lane"); return true; }
      if (what === "right") { if (lane >= LANES - 1) return false; lane++; sfx("lane"); return true; }
      if (what === "jump") {
        if (airborne) return false;
        slideT = 0; airborne = true;
        const vault = street.binAhead(lane, z, 3.2);
        vy = vault ? VAULT_V : JUMP_V; play(vault ? "vault" : "jump", 0.06, true); sfx("jump"); mood("jump", 0, 1); return true;
      }
      if (what === "slide") { if (airborne || slideT > 0) return false; slideT = SLIDE_S; play("slide", 0.06, true); sfx("slide"); return true; }
      return false;
    },
    fire() {
      if (state !== "run" || reloadT > 0 || fireCd > 0) return false;
      if (ammo <= 0) { reloadT = W.reloadS; sfx("reload"); onEvent("reload"); return false; }
      ammo--; fireCd = 1 / W.rate; muzzleT = 0.08; muzzleMat.opacity = 1;
      sfx(W.sfx); face.shake = Math.max(face.shake, 0.35);
      const r = street.shoot(lane, z, W.range, W.dmg, W.lanes);
      const end = r ? r.z : z - W.range;
      const m = new THREE.Mesh(tracerGeo, tracerMat); m.position.set(x + 0.2, y + 1.25, z - 0.8); scene.add(m); tracers.push({ m, end });
      if (r) { if (r.dead) { kills++; coins += 5; sfx("zombie-die"); mood("kill", 0.2); onEvent("kill"); } else sfx("zombie-hit"); }
      if (ammo <= 0) { reloadT = W.reloadS; sfx("reload"); onEvent("reload"); }
      onEvent("ammo", ammo);
      return true;
    },
    setWeapon(id) { arm(id); },
    preview(bus) { sound?.preview(bus); },
    async setSkin(id) { if (id === skin) return; try { await loadSkin(id); } catch (e) { onStatus("failed", "glb: " + String(e && e.message || e).slice(0, 70)); } },
    dispose() {
      dead = true; cancelAnimationFrame(raf); removeEventListener("resize", resize);
      sound?.dispose(); street.dispose(); tracerGeo.dispose(); tracerMat.dispose(); gunMat.dispose(); muzzleMat.dispose();
      try { renderer.dispose(); renderer.forceContextLoss?.(); } catch { }
    },
  };
}
