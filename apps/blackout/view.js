// blackout — an endless night city in 3D: run (joystick), punch (one key), vault automatically, grab coins, outrun
// the Blackout that kills the lights behind you. ONE fit screen: the Three.js + Rapier stage (stage.js) under a thin
// DOM layer that is the truth the gate/e2e read (data-state/dist/coins/gap/move/punches). The stage is probe-guarded
// and SKIPPED under the headless gate (Rapier WASM, Draco and GLBs over CDNs flake CI) — the HUD then shows a fixed
// mid-run frame. A second tab spends the coins on skins.

import { html } from "htm/preact";
import { Fragment } from "preact";
import { useEffect, useRef, useState, useCallback } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { gate } from "/_rt/gate.js";
import { haptic, wakeLock } from "/_rt/sensors.js";
import { report } from "/_rt/telemetry.js";
import { keyboardOnly, markPointer } from "/_rt/dpad.js";
import { SKINS, skinById, avatarUrl, owned, pickSkin, finishRun, $best, $coins, $owned, $skin, $state, $run, $phys, $why, $last } from "./state.js";

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const CAM = { pitchMin: 0.02, pitchMax: 0.75, zoomMin: 0.6, zoomMax: 1.8 };
const JOY_R = 44;

// the stage reads this by ref every frame: the joystick vector (camera space), the orbit target, the last drag
const env = { move: { x: 0, z: 0 }, cam: { yaw: 0, pitch: 0.2, zoom: 1 }, dragT: 0 };
globalThis.__blackoutEnv = env;   // debug handle (camera/joystick by ref), like afterdark's __afterdark
const keys = new Set();
const keyVector = () => {
  const x = (keys.has("ArrowRight") || keys.has("KeyD") ? 1 : 0) - (keys.has("ArrowLeft") || keys.has("KeyA") ? 1 : 0);
  const z = (keys.has("ArrowDown") || keys.has("KeyS") ? 1 : 0) - (keys.has("ArrowUp") || keys.has("KeyW") ? 1 : 0);
  const l = Math.hypot(x, z) || 1; return { x: x / l, z: z / l };
};

export function blackout({ S }) {
  const t = useStore(S.t);
  const state = useStore($state), run = useStore($run), phys = useStore($phys), why = useStore($why);
  const best = useStore($best), skin = useStore($skin), last = useStore($last);
  const [punches, setPunches] = useState(0);
  const canvasRef = useRef(null), hud = useRef(null), knob = useRef(null), base = useRef(null);
  const engine = useRef(null);
  const joy = useRef(null);         // { id, ox, oy }
  const orbit = useRef(new Map()); const pinch = useRef(0);

  const setMove = (x, z) => { env.move = { x, z }; if (hud.current) hud.current.dataset.move = `${x.toFixed(2)},${z.toFixed(2)}`; if (knob.current) knob.current.style.transform = `translate(${x * JOY_R}px, ${z * JOY_R}px)`; };
  const punch = useCallback(() => { setPunches((n) => n + 1); engine.current?.punch(); }, []);
  const start = useCallback(() => {
    if (!gate && !engine.current) return;
    $state.set("run"); $run.set({ frame: 0, dist: 0, coins: 0, gap: 30, speed: 0, fps: 0 });
    engine.current?.start((Math.random() * 0xffffffff) >>> 0);
  }, []);

  // the stage: created once, skipped under the gate; the skin follows the store
  useEffect(() => {
    if (gate) return () => {};
    let eng = null, gone = false;
    (async () => {
      try {
        const { createStage } = await import("./stage.js");
        if (!canvasRef.current || gone) return;
        eng = await createStage(canvasRef.current, {
          getInput: () => env,
          onStatus: (s, w) => { $phys.set(s); $why.set(w || ""); if (s === "failed") report("stage.fail", { why: w || "" }); },
          onStat: (s) => $run.set(s),
          onEvent: (e, v) => {
            if (e === "coin") haptic.tick();
            else if (e === "smash") { haptic.ok(); }
            else if (e === "vault") haptic.bump();
            else if (e === "over") { haptic.buzz([30, 60, 30]); setTimeout(() => finishRun(v.dist, v.coins), 900); }
          },
        }, $skin.get());
        if (gone) { eng?.dispose(); return; }
        engine.current = eng;
      } catch (e) { $phys.set("failed"); $why.set(String(e && e.message || e).slice(0, 80)); report("stage.fail", { why: $why.get() }); }
    })();
    return () => { gone = true; engine.current = null; eng?.dispose(); if ($state.get() === "run") $state.set("idle"); };
  }, []);
  useEffect(() => { engine.current?.setSkin(skin); }, [skin]);
  // the screen stays awake for the run only
  useEffect(() => { if (state !== "run" || gate) return () => {}; const wl = wakeLock.acquire(); return () => wl?.release?.(); }, [state]);

  // keyboard: WASD/arrows run, Space vaults, X/C punch, Enter starts
  useEffect(() => {
    const typing = (el) => el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable);
    const dn = (e) => {
      if (typing(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.code === "Enter") { const s = $state.get(); if (s !== "run") { e.preventDefault(); start(); } return; }
      if (e.code === "Space") { e.preventDefault(); if (!e.repeat) engine.current?.jump(); return; }
      if (e.code === "KeyX" || e.code === "KeyC") { e.preventDefault(); if (!e.repeat) punch(); return; }
      if (/^(Arrow(Up|Down|Left|Right)|Key[WASD])$/.test(e.code)) { e.preventDefault(); keys.add(e.code); const v = keyVector(); setMove(v.x, v.z); }
    };
    const up = (e) => { if (keys.delete(e.code)) { const v = keys.size ? keyVector() : { x: 0, z: 0 }; setMove(v.x, v.z); } };
    const drop = () => { if (keys.size) { keys.clear(); setMove(0, 0); } };
    addEventListener("keydown", dn); addEventListener("keyup", up); addEventListener("blur", drop); document.addEventListener("visibilitychange", drop);
    return () => { removeEventListener("keydown", dn); removeEventListener("keyup", up); removeEventListener("blur", drop); document.removeEventListener("visibilitychange", drop); };
  }, [start, punch]);

  // the joystick: the base floats to the finger, the knob follows within JOY_R, the vector is the knob
  const joyDown = (e) => {
    if (joy.current) return;
    const r = e.currentTarget.getBoundingClientRect();
    joy.current = { id: e.pointerId, ox: e.clientX, oy: e.clientY };
    if (base.current) { base.current.style.left = `${clamp(e.clientX - r.left, 60, r.width - 60)}px`; base.current.style.top = `${clamp(e.clientY - r.top, 60, r.height - 60)}px`; base.current.dataset.on = ""; }
  };
  const joyMove = (e) => {
    const j = joy.current; if (!j || e.pointerId !== j.id) return;
    let x = (e.clientX - j.ox) / JOY_R, z = (e.clientY - j.oy) / JOY_R; const l = Math.hypot(x, z);
    if (l > 1) { x /= l; z /= l; }
    setMove(x, z);
  };
  const joyUp = (e) => { if (!joy.current || e.pointerId !== joy.current.id) return; joy.current = null; setMove(0, 0); if (base.current) { base.current.style.left = ""; base.current.style.top = ""; delete base.current.dataset.on; } };
  // the right half orbits the camera (one finger) and zooms (two); a tap there is nothing — the key punches
  const orbDown = (e) => { orbit.current.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (orbit.current.size === 2) { const [a, b] = [...orbit.current.values()]; pinch.current = Math.hypot(a.x - b.x, a.y - b.y); } };
  const orbMove = (e) => {
    const p = orbit.current.get(e.pointerId); if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
    if (Math.abs(dx) + Math.abs(dy) > 1) env.dragT = performance.now();
    if (orbit.current.size === 1) { env.cam.yaw -= dx * 0.006; env.cam.pitch = clamp(env.cam.pitch + dy * 0.004, CAM.pitchMin, CAM.pitchMax); }
    else if (orbit.current.size === 2) { const [a, b] = [...orbit.current.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); if (pinch.current > 0 && d > 0) env.cam.zoom = clamp(env.cam.zoom * (pinch.current / d), CAM.zoomMin, CAM.zoomMax); pinch.current = d; }
  };
  const orbUp = (e) => { orbit.current.delete(e.pointerId); pinch.current = 0; };

  const sk = skinById(skin), ready = gate || phys === "ready";
  const m = Math.round(run.dist);
  return html`<${Fragment}>
    <style>${CSS}</style>
    <div class="bo-bg fixed inset-0 z-0"></div>
    <canvas ref=${canvasRef} data-stage aria-hidden="true" class="fixed inset-0 z-0 w-full h-full"></canvas>

    <div ref=${hud} data-game data-state=${state} data-phys=${phys} data-why=${why} data-dist=${m} data-coins=${run.coins} data-gap=${Math.round(run.gap)}
      data-frame=${run.frame} data-best=${best} data-skin=${skin} data-punches=${punches} data-move="0.00,0.00"
      class="relative z-10 h-full min-h-0 flex flex-col select-none">
      ${/* the HUD: distance + coins left, the light left before the dark right — on the run only */""}
      <div class="flex items-start justify-between px-1 pt-1 pointer-events-none">
        <div class="bo-chip flex flex-col items-start leading-none">
          <span class="font-mono tabular-nums text-3xl font-bold">${m}<span class="text-base font-normal opacity-70 ml-1">${T(t, "unitM")}</span></span>
          <span class="font-mono tabular-nums text-sm mt-1 bo-gold" data-hud-coins><iconify-icon icon="lucide:circle-dollar-sign" class="align-[-2px]"></iconify-icon> ${run.coins}</span>
        </div>
        <div class="bo-chip flex flex-col items-end leading-none">
          <span class="font-mono uppercase tracking-widest text-[10px] opacity-70">${T(t, "dark")}</span>
          <span class="font-mono tabular-nums text-xl font-bold" data-hud-gap>${Math.max(0, Math.round(run.gap))} ${T(t, "unitM")}</span>
          <span class="bo-bar mt-1" aria-hidden="true"><i style=${`width:${clamp(run.gap / 30, 0, 1) * 100}%`}></i></span>
        </div>
      </div>

      ${/* the control layer: the joystick owns the left, the orbit the right, the punch key on top */""}
      <div class="flex-1 min-h-0 relative">
        <div data-joy class="absolute inset-y-0 left-0 w-1/2 touch-none" onPointerDown=${joyDown} onPointerMove=${joyMove} onPointerUp=${joyUp} onPointerCancel=${joyUp} aria-hidden="true">
          <div ref=${base} class="bo-joy">
            <span ref=${knob} class="bo-knob"></span>
          </div>
        </div>
        <div data-orbit class="absolute inset-y-0 right-0 w-1/2 touch-none" onPointerDown=${orbDown} onPointerMove=${orbMove} onPointerUp=${orbUp} onPointerCancel=${orbUp} aria-hidden="true"></div>
        <button data-punch type="button" aria-label=${T(t, "punch")} class="bo-key absolute right-4 bottom-4 w-[4.5rem] h-[4.5rem] rounded-full flex items-center justify-center text-3xl active:scale-95 transition-transform"
          onPointerDown=${(e) => { markPointer(e.currentTarget); punch(); }} onClick=${keyboardOnly(punch)}>
          <iconify-icon icon="lucide:hand"></iconify-icon>
        </button>

        ${state === "idle" ? html`<div data-cover class="absolute inset-0 flex flex-col items-center justify-center gap-4 text-center px-6 bo-scrim">
          <span class="font-mono uppercase tracking-[0.35em] text-4xl font-bold bo-title">${T(t, "title")}</span>
          <span class="text-sm opacity-80 max-w-[18rem]">${T(t, "howto")}</span>
          <div class="flex items-center gap-3 bo-chip px-3 py-2 rounded-2xl">
            <img src=${avatarUrl(sk.id)} alt="" width="40" height="40" class="w-10 h-10 rounded-full object-cover" style=${`box-shadow:0 0 0 2px ${sk.tint}`} />
            <div class="flex flex-col items-start leading-tight"><span class="text-sm">${sk.name}</span><span class="font-mono text-xs opacity-70">${T(t, "best")} ${best} ${T(t, "unitM")}</span></div>
          </div>
          <button data-start type="button" disabled=${!ready} class="bo-go font-mono uppercase tracking-[0.25em] px-8 py-4 rounded-full text-lg font-bold disabled:opacity-50" onClick=${start}>
            ${ready ? T(t, "go") : (phys === "failed" ? T(t, "failed") : T(t, "loading"))}
          </button>
          ${phys === "failed" && why ? html`<span class="font-mono text-[11px] opacity-60" data-why>${why}</span>` : null}
        </div>` : null}

        ${state === "over" ? html`<div data-over class="absolute inset-0 flex items-center justify-center px-6">
          <div class="bo-card flex flex-col items-center gap-2 text-center px-6 py-5 rounded-3xl max-w-full">
            <span class="font-mono uppercase tracking-widest text-xs opacity-70">${T(t, "caught")}</span>
            <span class="font-mono tabular-nums text-5xl font-bold" data-over-dist>${last.dist}<span class="text-lg font-normal opacity-70 ml-1">${T(t, "unitM")}</span></span>
            ${last.record ? html`<span class="badge badge-warning font-mono uppercase text-[10px] tracking-wider" data-record>${T(t, "newRecord")}</span>` : html`<span class="font-mono text-xs opacity-70">${T(t, "best")} ${best} ${T(t, "unitM")}</span>`}
            <span class="font-mono tabular-nums text-base bo-gold">+${last.coins} <iconify-icon icon="lucide:circle-dollar-sign" class="align-[-2px]"></iconify-icon></span>
            <button data-restart type="button" class="bo-go font-mono uppercase tracking-[0.25em] px-8 py-3 rounded-full text-base font-bold mt-2" onClick=${start}>${T(t, "again")}</button>
          </div>
        </div>` : null}
      </div>
    </div>
  </${Fragment}>`;
}

// the skins: afterdark's cast, priced in the coins the runs earn; a tap buys and wears, or wears what is owned
export function skins({ S }) {
  const t = useStore(S.t);
  const coins = +useStore($coins) || 0, skin = useStore($skin), best = useStore($best);
  useStore($owned);
  const have = owned();
  const tap = (id) => { if (!pickSkin(id)) haptic.tick(); else haptic.bump(); };
  return html`<div class="flex flex-col gap-3 pb-6">
    <div class="flex items-center justify-between gap-3 flex-wrap">
      <span class="badge badge-lg badge-warning font-mono tabular-nums gap-1" data-wallet=${coins}><iconify-icon icon="lucide:circle-dollar-sign"></iconify-icon> ${coins}</span>
      <span class="font-mono text-xs opacity-70">${T(t, "best")} ${best} ${T(t, "unitM")}</span>
    </div>
    <p class="text-sm opacity-70">${T(t, "skinsHint")}</p>
    <div data-skin-grid class="grid grid-cols-3 sm:grid-cols-4 gap-x-2 gap-y-3">
      ${SKINS.map((g) => { const own = have.includes(g.id), on = g.id === skin, can = own || coins >= g.price; return html`
        <button key=${g.id} data-skin=${g.id} data-owned=${own ? "yes" : "no"} type="button" aria-pressed=${on ? "true" : "false"} aria-label=${`${g.name}${own ? "" : ` · ${g.price}`}`} onClick=${() => tap(g.id)}
          class="w-full flex flex-col items-center gap-1.5 min-w-0 rounded-2xl p-2 active:scale-[.96] transition-transform">
          <span class="rounded-full p-0.5 bg-base-content/5" style=${on ? `box-shadow:0 0 0 2.5px ${g.tint},0 0 16px ${g.tint}66` : ""}>
            <img src=${avatarUrl(g.id)} alt="" width="72" height="72" loading="lazy" decoding="async" class=${`w-16 h-16 sm:w-[4.5rem] sm:h-[4.5rem] rounded-full object-cover block ${on || can ? "" : "opacity-40 grayscale"}`} />
          </span>
          <span class="text-[0.75rem] leading-tight truncate max-w-full">${g.name}</span>
          <span class=${`font-mono text-[0.7rem] leading-none tabular-nums ${own ? "text-base-content/70" : "text-base-content"}`}>${on ? T(t, "worn") : own ? T(t, "ownedSkin") : html`${g.price} <iconify-icon icon="lucide:circle-dollar-sign" class="align-[-1px]"></iconify-icon>`}</span>
        </button>`; })}
    </div>
  </div>`;
}

const CSS = `
.bo-bg{background:radial-gradient(120% 70% at 50% 100%,#1a1230 0%,#07060c 60%)}
.bo-chip{padding:.4rem .6rem;border-radius:1rem;background:rgba(7,6,12,.55);backdrop-filter:blur(8px);color:#f2eee6}
.bo-gold{color:#f5b942}
.bo-scrim{background:radial-gradient(60% 45% at 50% 50%,rgba(7,6,12,.82) 0%,rgba(7,6,12,.55) 60%,rgba(7,6,12,0) 100%);color:#f2eee6}
.bo-title{color:#f2eee6;text-shadow:0 0 24px rgba(245,185,66,.55)}
.bo-bar{display:block;width:5.5rem;height:3px;border-radius:2px;background:rgba(242,238,230,.15);overflow:hidden}
.bo-bar i{display:block;height:100%;background:#f5b942;transition:width .3s linear}
.bo-joy{position:absolute;left:5rem;top:calc(100% - 6rem);width:110px;height:110px;margin:-55px 0 0 -55px;border-radius:50%;border:1.5px solid rgba(242,238,230,.25);background:rgba(7,6,12,.25);display:grid;place-items:center;transition:opacity .2s}
.bo-joy[data-on]{border-color:rgba(245,185,66,.6)}
.bo-knob{display:block;width:48px;height:48px;border-radius:50%;background:rgba(242,238,230,.85);box-shadow:0 2px 12px rgba(0,0,0,.5)}
.bo-key{background:rgba(245,185,66,.9);color:#07060c;box-shadow:0 4px 18px rgba(245,185,66,.35)}
.bo-go{background:#f5b942;color:#07060c;box-shadow:0 6px 28px rgba(245,185,66,.4)}
.bo-card{background:rgba(7,6,12,.82);backdrop-filter:blur(14px);border:1px solid rgba(242,238,230,.12);color:#f2eee6}
`;
