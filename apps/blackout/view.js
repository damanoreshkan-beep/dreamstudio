// blackout — a lane runner in an endless night city: she runs by herself, a swipe moves her a lane, up jumps, down
// slides, coins on the way, the horde at her heels. ONE fit screen: the Three.js stage (stage.js) under a thin DOM
// layer that is the truth the gate/e2e read (data-state/dist/coins/lane/near/acts). The stage is probe-guarded and
// SKIPPED under the headless gate (Draco and GLBs over CDNs flake CI) — the HUD then shows a fixed mid-run frame and
// the verbs still move the mirrored lane. The second tab spends the coins: the cast's skins, and a runner of your own.
import { html } from "htm/preact";
import { Fragment } from "preact";
import { useEffect, useRef, useState, useCallback } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { gate } from "/_rt/gate.js";
import { haptic, wakeLock } from "/_rt/sensors.js";
import { report } from "/_rt/telemetry.js";
import { SKINS, GEN_PRICE, skinById, avatarUrl, owned, myChars, pickSkin, removeMyChar, finishRun, $best, $coins, $owned, $skin, $myChars, $state, $run, $phys, $why, $last, $newChar } from "./state.js";
import { GenSheet } from "./gen.js";

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const SWIPE_PX = 40;   // neon-rush inputManager: one action per touch, the first axis past the threshold wins
const KEYS = { ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right", ArrowUp: "jump", KeyW: "jump", Space: "jump", ArrowDown: "slide", KeyS: "slide" };

export function blackout({ S }) {
  const t = useStore(S.t);
  const state = useStore($state), run = useStore($run), phys = useStore($phys), why = useStore($why);
  const best = useStore($best), skin = useStore($skin), last = useStore($last);
  const [acts, setActs] = useState(0);
  const canvasRef = useRef(null), hud = useRef(null);
  const engine = useRef(null);
  const touch = useRef(null);   // { id, x, y, done }

  // one verb: the engine moves her; under the gate the mirrored lane moves so the DOM still tells the truth
  const act = useCallback((what) => {
    if ($state.get() !== "run") return;
    setActs((n) => n + 1);
    if (engine.current) { if (engine.current.act(what)) haptic.tick(); return; }
    if (!gate) return;
    const r = $run.get(), lane = what === "left" ? Math.max(0, r.lane - 1) : what === "right" ? Math.min(3, r.lane + 1) : r.lane;
    $run.set({ ...r, lane });
  }, []);
  const start = useCallback(() => {
    if (!gate && !engine.current) return;
    $state.set("run"); $run.set({ frame: 0, dist: 0, coins: 0, speed: 0, fps: 0, lane: 1, near: 0 });
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
          getInput: () => ({}),
          onStatus: (s, w) => { $phys.set(s); $why.set(w || ""); if (s === "failed") report("stage.fail", { why: w || "" }); },
          onStat: (s) => $run.set(s),
          onEvent: (e, v) => {
            if (e === "coin") haptic.tick();
            else if (e === "stumble") haptic.bump();
            else if (e === "over") { haptic.buzz([30, 60, 30]); setTimeout(() => finishRun(v.dist, v.coins), 1100); }
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

  // keyboard: arrows / WASD / Space are the four verbs, Enter starts
  useEffect(() => {
    const typing = (el) => el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable);
    const dn = (e) => {
      if (typing(e.target) || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      if (e.code === "Enter") { if ($state.get() !== "run") { e.preventDefault(); start(); } return; }
      const what = KEYS[e.code]; if (!what) return;
      e.preventDefault(); act(what);
    };
    addEventListener("keydown", dn);
    return () => removeEventListener("keydown", dn);
  }, [start, act]);

  // the swipe: the whole stage listens; the first axis past SWIPE_PX decides, once per touch
  const swDown = (e) => { if (touch.current) return; touch.current = { id: e.pointerId, x: e.clientX, y: e.clientY, done: false }; };
  const swMove = (e) => {
    const s = touch.current; if (!s || e.pointerId !== s.id || s.done) return;
    const dx = e.clientX - s.x, dy = e.clientY - s.y;
    if (Math.abs(dx) < SWIPE_PX && Math.abs(dy) < SWIPE_PX) return;
    s.done = true;
    act(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "slide" : "jump"));
  };
  const swUp = (e) => { if (touch.current && e.pointerId === touch.current.id) touch.current = null; };

  const sk = skinById(skin), ready = gate || phys === "ready";
  const m = Math.round(run.dist), near = clamp(run.near || 0, 0, 1);
  return html`<${Fragment}>
    <style>${CSS}</style>
    <div class="bo-bg fixed inset-0 z-0"></div>
    <canvas ref=${canvasRef} data-stage aria-hidden="true" class="fixed inset-0 z-0 w-full h-full"></canvas>
    <div class="bo-edge fixed inset-0 z-0 pointer-events-none" aria-hidden="true" style=${`opacity:${(near * near).toFixed(2)}`}></div>

    <div ref=${hud} data-game data-state=${state} data-phys=${phys} data-why=${why} data-dist=${m} data-coins=${run.coins} data-lane=${run.lane}
      data-near=${near.toFixed(2)} data-frame=${run.frame} data-best=${best} data-skin=${skin} data-acts=${acts}
      class="relative z-10 h-full min-h-0 flex flex-col select-none">
      ${/* the HUD: the distance and the coins, nothing else — on the run only */""}
      <div class="flex items-start justify-between px-1 pt-1 pointer-events-none">
        <div class="bo-chip flex flex-col items-start leading-none">
          <span class="font-mono tabular-nums text-3xl font-bold">${m}<span class="text-base font-normal opacity-70 ml-1">${T(t, "unitM")}</span></span>
          <span class="font-mono tabular-nums text-sm mt-1 bo-gold" data-hud-coins><iconify-icon icon="lucide:circle-dollar-sign" class="align-[-2px]"></iconify-icon> ${run.coins}</span>
        </div>
        ${state === "run" ? html`<div class="bo-chip font-mono tabular-nums text-xs opacity-70 leading-none">${T(t, "best")} ${best}</div>` : null}
      </div>

      ${/* the control layer: the whole stage takes the swipe */""}
      <div class="flex-1 min-h-0 relative">
        <div data-swipe class="absolute inset-0 touch-none" onPointerDown=${swDown} onPointerMove=${swMove} onPointerUp=${swUp} onPointerCancel=${swUp} aria-hidden="true"></div>

        ${state === "idle" ? html`<div data-cover class="absolute inset-0 flex flex-col items-center justify-center gap-5 text-center px-6 bo-scrim">
          <span class="font-mono uppercase tracking-[0.35em] text-4xl font-bold bo-title">${T(t, "title")}</span>
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

// the skins: a runner of your own (made from words or a photo, GEN_PRICE coins) above the cast, priced in the
// coins the runs earn; a tap buys and wears, or wears what is owned
export function skins({ S, openScreen, closeScreen }) {
  const t = useStore(S.t), loc = useStore(S.locale), screen = useStore(S.screen);
  const coins = +useStore($coins) || 0, skin = useStore($skin), best = useStore($best), fresh = useStore($newChar);
  useStore($owned); useStore($myChars);
  const have = owned(), mine = myChars();
  const tap = (id) => { if (!pickSkin(id)) haptic.tick(); else haptic.bump(); };
  const genOpen = screen === "gen";
  const cell = (g, own, extra) => { const on = g.id === skin, can = own || coins >= g.price; return html`
    <button key=${g.id} data-skin=${g.id} data-owned=${own ? "yes" : "no"} type="button" aria-pressed=${on ? "true" : "false"} aria-label=${`${g.name}${own ? "" : ` · ${g.price}`}`} onClick=${() => tap(g.id)}
      class=${`relative w-full flex flex-col items-center gap-1.5 min-w-0 rounded-2xl p-2 active:scale-[.96] transition-transform ${fresh === g.id ? "animate-pulse" : ""}`}>
      <span class="rounded-full p-0.5 bg-base-content/5" style=${on ? `box-shadow:0 0 0 2.5px ${g.tint},0 0 16px ${g.tint}66` : ""}>
        ${g.avatar || !g.glb ? html`<img src=${avatarUrl(g.id)} alt="" width="72" height="72" loading="lazy" decoding="async" class=${`w-16 h-16 sm:w-[4.5rem] sm:h-[4.5rem] rounded-full object-cover block ${on || can ? "" : "opacity-40 grayscale"}`} />`
          : html`<span class="w-16 h-16 sm:w-[4.5rem] sm:h-[4.5rem] rounded-full flex items-center justify-center text-2xl" style=${`background:${g.tint}33;color:${g.tint}`}><iconify-icon icon=${g.kind === "creature" ? "lucide:ghost" : "lucide:user"}></iconify-icon></span>`}
      </span>
      <span class="text-[0.75rem] leading-tight truncate max-w-full">${g.name}</span>
      ${extra}
    </button>`; };
  return html`<div class="flex flex-col gap-3 pb-6">
    <div class="flex items-center justify-between gap-3 flex-wrap">
      <span class="badge badge-lg badge-warning font-mono tabular-nums gap-1" data-wallet=${coins}><iconify-icon icon="lucide:circle-dollar-sign"></iconify-icon> ${coins}</span>
      <span class="font-mono text-xs opacity-70">${T(t, "best")} ${best} ${T(t, "unitM")}</span>
    </div>
    <h2 class="font-mono uppercase tracking-widest text-[0.7rem] text-base-content/70 mt-1">${T(t, "mine")}</h2>
    <div data-mine-grid class="grid grid-cols-3 sm:grid-cols-4 gap-x-2 gap-y-3">
      <button data-gen-open type="button" onClick=${() => openScreen("gen")} aria-label=${`${T(t, "genOpen")} · ${GEN_PRICE}`}
        class="w-full flex flex-col items-center gap-1.5 min-w-0 rounded-2xl p-2 active:scale-[.96] transition-transform">
        <span class="w-16 h-16 sm:w-[4.5rem] sm:h-[4.5rem] rounded-full border border-dashed border-base-content/30 flex items-center justify-center text-2xl text-base-content/80"><iconify-icon icon="lucide:sparkles"></iconify-icon></span>
        <span class="text-[0.75rem] leading-tight">${T(t, "genOpen")}</span>
        <span class="font-mono text-[0.7rem] leading-none tabular-nums">${GEN_PRICE} <iconify-icon icon="lucide:circle-dollar-sign" class="align-[-1px]"></iconify-icon></span>
      </button>
      ${mine.map((g) => cell(g, true, html`<span class="font-mono text-[0.7rem] leading-none text-base-content/70">${g.id === skin ? T(t, "worn") : T(t, "ownedSkin")}</span>
        <span data-remove=${g.id} role="button" tabindex="0" aria-label=${T(t, "remove")} data-haptic="bump" class="absolute top-1 right-1 w-6 h-6 rounded-full bg-base-100/70 flex items-center justify-center text-xs" onClick=${(e) => { e.stopPropagation(); removeMyChar(g.id); }}><iconify-icon icon="lucide:x"></iconify-icon></span>`))}
    </div>
    <h2 class="font-mono uppercase tracking-widest text-[0.7rem] text-base-content/70 mt-1">${T(t, "cast")}</h2>
    <div data-skin-grid class="grid grid-cols-3 sm:grid-cols-4 gap-x-2 gap-y-3">
      ${SKINS.map((g) => { const own = have.includes(g.id), on = g.id === skin; return cell(g, own, html`<span class=${`font-mono text-[0.7rem] leading-none tabular-nums ${own ? "text-base-content/70" : "text-base-content"}`}>${on ? T(t, "worn") : own ? T(t, "ownedSkin") : html`${g.price} <iconify-icon icon="lucide:circle-dollar-sign" class="align-[-1px]"></iconify-icon>`}</span>`); })}
    </div>
    <${GenSheet} t=${t} loc=${loc} open=${genOpen} onClose=${closeScreen} />
  </div>`;
}

const CSS = `
.bo-bg{background:radial-gradient(120% 70% at 50% 100%,#1a1230 0%,#07060c 60%)}
.bo-edge{background:radial-gradient(80% 70% at 50% 55%,rgba(0,0,0,0) 45%,rgba(120,10,16,.55) 100%);transition:opacity .25s linear}
.bo-chip{padding:.4rem .6rem;border-radius:1rem;background:rgba(7,6,12,.55);backdrop-filter:blur(8px);color:#f2eee6}
.bo-gold{color:#f5b942}
.bo-scrim{background:radial-gradient(60% 45% at 50% 50%,rgba(7,6,12,.82) 0%,rgba(7,6,12,.55) 60%,rgba(7,6,12,0) 100%);color:#f2eee6}
.bo-title{color:#f2eee6;text-shadow:0 0 24px rgba(245,185,66,.55)}
.bo-go{background:#f5b942;color:#07060c;box-shadow:0 6px 28px rgba(245,185,66,.4)}
.bo-card{background:rgba(7,6,12,.82);backdrop-filter:blur(14px);border:1px solid rgba(242,238,230,.12);color:#f2eee6}
`;
