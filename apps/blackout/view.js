// blackout — a lane runner in Gotham's night: she runs by herself, a swipe moves her a lane, up jumps, down slides, a TAP
// fires her weapon down the lane; coins and energy cans on the way, walkers in the lanes, the horde at her heels. ONE
// fit screen: the Three.js stage (stage.js) under a thin DOM layer that is the truth the gate/e2e read
// (data-state/dist/coins/lane/near/acts/shots/ammo/boost). Before the run the same stage is the MENU's backdrop —
// she idles under the moon while the camera circles — with the runner, the weapon and the wallet as cards that
// lead to the shop. The stage is probe-guarded and SKIPPED under the headless gate (Draco and GLBs over CDNs flake
// CI) — the HUD then shows a fixed mid-run frame and the verbs still move the mirrored lane. The second tab spends
// the coins: the armoury (rendered pictures, not glyphs), a runner of your own, the cast — and tops the wallet up
// in Telegram Stars (rt/coins.js).
import { html } from "htm/preact";
import { Fragment } from "preact";
import { useEffect, useRef, useState, useCallback } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { Sheet } from "/_rt/ui.js";
import { T } from "/_rt/i18n.js";
import { gate } from "/_rt/gate.js";
import { haptic, wakeLock } from "/_rt/sensors.js";
import { report } from "/_rt/telemetry.js";
import { PACKS, bestValue, buyCoins, claimCoins } from "/_rt/coins.js";
import { SKINS, WEAPONS, GEN_PRICE, skinById, weaponById, avatarUrl, owned, arms, myChars, pickSkin, pickWeapon, removeMyChar, finishRun, credit, $bought, $best, $runs, $coins, $owned, $arms, $weapon, $skin, $myChars, $muted, $state, $run, $phys, $why, $last, $newChar } from "./state.js";
import { GenSheet } from "./gen.js";

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const SWIPE_PX = 40;   // neon-rush inputManager: one action per touch, the first axis past the threshold wins; a touch that never gets there is a TAP = a shot
const KEYS = { ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right", ArrowUp: "jump", KeyW: "jump", ArrowDown: "slide", KeyS: "slide" };
const WEAPON_ICON = { pistol: "lucide:crosshair", shotgun: "lucide:flame", smg: "lucide:zap" };
const armUrl = (id) => new URL(`assets/arm-${id}.webp`, import.meta.url).href;

// ── the wallet's top-up: the packs, paid in Telegram Stars (rt/coins.js), claimed into the wallet ──
function CoinSheet({ t, loc, open, onClose }) {
  const [busy, setBusy] = useState(""), [note, setNote] = useState("");
  const best = bestValue();
  const buy = async (sku) => {
    if (busy || gate) return;
    setBusy(sku); setNote("");
    const r = await buyCoins(sku);
    if (r === "paid") { const { coins } = await claimCoins(); credit(coins); setNote(""); onClose(); }
    else setNote(r === "opened" ? "opened" : r === "cancelled" ? "payCancel" : r === "eSignIn" ? "eSignIn" : "payFailed");
    setBusy("");
  };
  return html`<${Sheet} id="coin-sheet" open=${open} onClose=${onClose} title=${T(t, "topUpTitle")} subtitle=${T(t, "topUpSub")} icon="lucide:star" locale=${loc}>
    <div data-coin-form class="flex flex-col gap-3">
      <div data-coin-packs class="grid grid-cols-3 gap-2">
        ${PACKS.map((p) => html`<button key=${p.sku} data-pack=${p.sku} type="button" disabled=${!!busy} onClick=${() => buy(p.sku)}
          class=${`relative flex flex-col items-center gap-1 rounded-2xl p-3 border active:scale-[.97] transition-transform ${p.sku === best ? "border-warning" : "border-base-content/10"}`}>
          ${p.sku === best ? html`<span class="absolute -top-2 badge badge-warning badge-sm font-mono uppercase text-[9px] tracking-wider">${T(t, "bestValue")}</span>` : null}
          <span class="font-mono tabular-nums text-2xl font-bold bo-gold">${p.coins}</span>
          <span class="font-mono text-[0.65rem] uppercase tracking-wider text-base-content/70"><iconify-icon icon="lucide:circle-dollar-sign" class="align-[-1px]"></iconify-icon></span>
          <span class="font-mono tabular-nums text-sm flex items-center gap-1"><iconify-icon icon="lucide:star" class="text-warning"></iconify-icon>${p.stars}</span>
        </button>`)}
      </div>
      <p class="text-[0.8rem] text-base-content/70">${T(t, "topUpHint")}</p>
      ${note ? html`<p data-coin-note class=${`text-[0.85rem] ${note === "opened" ? "text-base-content" : "text-error"}`} aria-live="polite">${T(t, note)}</p>` : null}
    </div>
  </${Sheet}>`;
}

export function blackout({ S, openScreen, closeScreen }) {
  const t = useStore(S.t), loc = useStore(S.locale), screen = useStore(S.screen);
  const state = useStore($state), run = useStore($run), phys = useStore($phys), why = useStore($why);
  const best = useStore($best), runs = +useStore($runs) || 0, coins = +useStore($coins) || 0, skin = useStore($skin), last = useStore($last), mutedNow = useStore($muted) === "1", weapon = useStore($weapon);
  const [acts, setActs] = useState(0), [shots, setShots] = useState(0), [moodNow, setMood] = useState("");
  const canvasRef = useRef(null), hud = useRef(null);
  const engine = useRef(null);
  const touch = useRef(null);   // { id, x, y, done, t0 }
  const moodTimer = useRef(0);

  // one verb: the engine moves her; under the gate the mirrored lane moves so the DOM still tells the truth
  const act = useCallback((what) => {
    if ($state.get() !== "run") return;
    setActs((n) => n + 1);
    if (engine.current) { if (engine.current.act(what)) haptic.tick(); return; }
    if (!gate) return;
    const r = $run.get(), lane = what === "left" ? Math.max(0, r.lane - 1) : what === "right" ? Math.min(3, r.lane + 1) : r.lane;
    $run.set({ ...r, lane });
  }, []);
  // a tap: one round; under the gate the mirrored magazine empties one by one
  const fire = useCallback(() => {
    if ($state.get() !== "run") return;
    setShots((n) => n + 1);
    if (engine.current) { if (engine.current.fire()) haptic.bump(); return; }
    if (!gate) return;
    const r = $run.get(); $run.set({ ...r, ammo: Math.max(0, r.ammo - 1) });
  }, []);
  const start = useCallback(() => {
    if (!gate && !engine.current) return;
    $state.set("run"); $run.set({ frame: 0, dist: 0, coins: 0, speed: 0, fps: 0, lane: 1, near: 0, boost: 0, ammo: weaponById($weapon.get()).mag, reload: false, kills: 0 });
    engine.current?.start((Math.random() * 0xffffffff) >>> 0);
  }, []);

  // the stage: created once, skipped under the gate; the skin and the weapon follow the store
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
            else if (e === "kill") haptic.ok?.();
            else if (e === "mood") { setMood(v); clearTimeout(moodTimer.current); moodTimer.current = setTimeout(() => setMood(""), 700); }
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
  useEffect(() => { engine.current?.setWeapon(weapon); }, [weapon]);
  // the screen stays awake for the run only
  useEffect(() => { if (state !== "run" || gate) return () => {}; const wl = wakeLock.acquire(); return () => wl?.release?.(); }, [state]);

  // keyboard: arrows / WASD are the four verbs, Space fires, Enter starts
  useEffect(() => {
    const typing = (el) => el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable);
    const dn = (e) => {
      if (typing(e.target) || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      if (e.code === "Enter") { if ($state.get() !== "run") { e.preventDefault(); start(); } return; }
      if (e.code === "Space" || e.code === "KeyX") { e.preventDefault(); fire(); return; }
      const what = KEYS[e.code]; if (!what) return;
      e.preventDefault(); act(what);
    };
    addEventListener("keydown", dn);
    return () => removeEventListener("keydown", dn);
  }, [start, act, fire]);

  // the touch: the whole stage listens; the first axis past SWIPE_PX decides, once per touch; a touch that lifts short of it is a shot
  const swDown = (e) => { if (touch.current) return; touch.current = { id: e.pointerId, x: e.clientX, y: e.clientY, done: false, t0: performance.now() }; };
  const swMove = (e) => {
    const s = touch.current; if (!s || e.pointerId !== s.id || s.done) return;
    const dx = e.clientX - s.x, dy = e.clientY - s.y;
    if (Math.abs(dx) < SWIPE_PX && Math.abs(dy) < SWIPE_PX) return;
    s.done = true;
    act(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "slide" : "jump"));
  };
  const swUp = (e) => { const s = touch.current; if (!s || e.pointerId !== s.id) return; touch.current = null; if (!s.done && e.type === "pointerup" && performance.now() - s.t0 < 400) fire(); };
  const toShop = () => S.tab.set("skins");

  const sk = skinById(skin), W = weaponById(weapon), ready = gate || phys === "ready";
  const m = Math.round(run.dist), near = clamp(run.near || 0, 0, 1), boost = run.boost || 0;
  return html`<${Fragment}>
    <style>${CSS}</style>
    <div class="bo-bg fixed inset-0 z-0"></div>
    <canvas ref=${canvasRef} data-stage aria-hidden="true" class="fixed inset-0 z-0 w-full h-full"></canvas>
    <div class="bo-edge fixed inset-0 z-0 pointer-events-none" aria-hidden="true" style=${`opacity:${(near * near).toFixed(2)}`}></div>
    <div class="bo-boost fixed inset-0 z-0 pointer-events-none" aria-hidden="true" style=${`opacity:${boost ? 1 : 0}`}></div>

    <div ref=${hud} data-game data-state=${state} data-phys=${phys} data-why=${why} data-dist=${m} data-coins=${run.coins} data-lane=${run.lane}
      data-near=${near.toFixed(2)} data-frame=${run.frame} data-best=${best} data-skin=${skin} data-acts=${acts} data-shots=${shots} data-ammo=${run.ammo} data-boost=${boost} data-weapon=${weapon} data-kills=${run.kills || 0}
      class="relative z-10 h-full min-h-0 flex flex-col select-none">
      ${/* the HUD: the distance and the coins; the sound key; the weapon and its magazine; the energy — on the run only */""}
      ${state !== "idle" ? html`<div class="flex items-start justify-between px-1 pt-1 pointer-events-none">
        <div class="bo-chip flex flex-col items-start leading-none">
          <span class="font-mono tabular-nums text-3xl font-bold">${m}<span class="text-base font-normal opacity-70 ml-1">${T(t, "unitM")}</span></span>
          <span class="font-mono tabular-nums text-sm mt-1 bo-gold" data-hud-coins><iconify-icon icon="lucide:circle-dollar-sign" class="align-[-2px]"></iconify-icon> ${run.coins}</span>
        </div>
        <div class="flex items-center gap-2 pointer-events-auto">
          ${state === "run" ? html`<div class="bo-chip font-mono tabular-nums text-xs opacity-70 leading-none">${T(t, "best")} ${best}</div>` : null}
          <button data-mute type="button" aria-label=${T(t, "sound")} aria-pressed=${mutedNow ? "true" : "false"} data-muted=${mutedNow ? "1" : "0"} onClick=${() => $muted.set(mutedNow ? "0" : "1")}
            class="bo-chip w-10 h-10 rounded-full flex items-center justify-center text-lg active:scale-95 transition-transform"><iconify-icon icon=${mutedNow ? "lucide:volume-x" : "lucide:volume-2"}></iconify-icon></button>
        </div>
      </div>` : null}
      ${state === "run" ? html`<div class="flex items-center justify-end gap-2 px-2 pt-2 pointer-events-none">
        ${boost ? html`<div data-hud-boost class="bo-chip bo-cyan font-mono tabular-nums text-xs leading-none flex items-center gap-1.5"><iconify-icon icon="lucide:zap"></iconify-icon>${boost}</div>` : null}
        <div data-hud-arms class="bo-chip font-mono tabular-nums text-xs leading-none flex items-center gap-1.5" style=${`color:${W.tint}`}>
          <iconify-icon icon=${WEAPON_ICON[W.id] || "lucide:crosshair"}></iconify-icon><span class=${run.reload ? "opacity-50" : ""}>${run.reload ? "···" : `${run.ammo}/${W.mag}`}</span>
        </div>
      </div>` : null}
      ${/* the selfie ring sits over the stage's second viewport (stage.js FACE_PX at 16,150); the mood tints its rim */""}
      ${state === "run" && !gate ? html`<div data-face data-mood=${moodNow} class="bo-face" aria-hidden="true"></div>` : null}

      ${/* the control layer: the whole stage takes the swipe, a tap fires */""}
      <div class="flex-1 min-h-0 relative">
        <div data-swipe class="absolute inset-0 touch-none" onPointerDown=${swDown} onPointerMove=${swMove} onPointerUp=${swUp} onPointerCancel=${swUp} aria-hidden="true"></div>

        ${/* THE MENU: her on the stage behind, the title, three cards to the shop, the run key, the last run */""}
        ${state === "idle" ? html`<div data-cover class="absolute inset-0 flex flex-col justify-between px-4 pt-3 pb-3 bo-menu">
          <div class="flex items-start justify-between">
            <div class="flex flex-col leading-none">
              <span class="font-mono uppercase tracking-[0.35em] text-[2.6rem] font-bold bo-title">${T(t, "title")}</span>
              <span class="font-mono text-[0.7rem] uppercase tracking-[0.25em] text-white/60 mt-1">${T(t, "tagline")}</span>
            </div>
            <button data-mute type="button" aria-label=${T(t, "sound")} aria-pressed=${mutedNow ? "true" : "false"} data-muted=${mutedNow ? "1" : "0"} onClick=${() => $muted.set(mutedNow ? "0" : "1")}
              class="bo-chip w-10 h-10 rounded-full flex items-center justify-center text-lg active:scale-95 transition-transform"><iconify-icon icon=${mutedNow ? "lucide:volume-x" : "lucide:volume-2"}></iconify-icon></button>
          </div>
          <div class="flex flex-col gap-2">
            <div class="grid grid-cols-2 gap-2">
              <button data-menu-runner type="button" onClick=${toShop} class="bo-card rounded-2xl p-3 flex items-center gap-3 text-left active:scale-[.98] transition-transform">
                <img src=${avatarUrl(sk.id)} alt="" width="44" height="44" class="w-11 h-11 rounded-full object-cover shrink-0" style=${`box-shadow:0 0 0 2px ${sk.tint}`} />
                <div class="flex flex-col leading-tight min-w-0"><span class="font-mono text-[0.6rem] uppercase tracking-wider text-white/50">${T(t, "menuRunner")}</span><span class="text-sm font-semibold truncate">${sk.name}</span><span class="font-mono text-[0.7rem] text-white/60">${T(t, "best")} ${best} ${T(t, "unitM")}</span></div>
              </button>
              <button data-menu-arms type="button" onClick=${toShop} class="bo-card rounded-2xl p-3 flex items-center gap-3 text-left active:scale-[.98] transition-transform">
                <img src=${armUrl(W.id)} alt="" width="56" height="56" class="w-14 h-14 rounded-xl object-cover shrink-0" style=${`box-shadow:0 0 0 1.5px ${W.tint}55`} />
                <div class="flex flex-col leading-tight min-w-0"><span class="font-mono text-[0.6rem] uppercase tracking-wider text-white/50">${T(t, "menuArms")}</span><span class="text-sm font-semibold truncate">${W.name}</span><span class="font-mono text-[0.7rem] text-white/60">${W.mag} · ${W.rate}/s</span></div>
              </button>
            </div>
            <div class="bo-card rounded-2xl p-3 flex items-center gap-3">
              <div class="flex flex-col leading-tight min-w-0 flex-1"><span class="font-mono text-[0.6rem] uppercase tracking-wider text-white/50">${T(t, "menuCoins")}</span><span class="font-mono tabular-nums text-2xl font-bold bo-gold"><iconify-icon icon="lucide:circle-dollar-sign" class="align-[-3px] text-lg"></iconify-icon> ${coins}</span></div>
              <button data-menu-topup type="button" onClick=${() => openScreen("topup")} class="btn btn-sm rounded-full gap-1.5 normal-case bo-star"><iconify-icon icon="lucide:star"></iconify-icon>${T(t, "topUp")}</button>
            </div>
            <button data-start type="button" disabled=${!ready} class="bo-go font-mono uppercase tracking-[0.3em] w-full py-4 rounded-2xl text-xl font-bold disabled:opacity-50 active:scale-[.98] transition-transform" onClick=${start}>
              ${ready ? T(t, "go") : (phys === "failed" ? T(t, "failed") : T(t, "loading"))}
            </button>
            ${runs > 0 ? html`<div data-last-run class="font-mono text-[0.72rem] text-white/60 text-center tabular-nums">${T(t, "lastRun")} · ${last.dist} ${T(t, "unitM")} · +${last.coins} <iconify-icon icon="lucide:circle-dollar-sign" class="align-[-1px]"></iconify-icon></div>` : null}
            ${phys === "failed" && why ? html`<span class="font-mono text-[11px] opacity-60 text-center" data-why>${why}</span>` : null}
          </div>
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
    ${/* mounted only while open: a closed dialog on the fit screen still widened the page by 42 px (CI, 2026-09-13) */""}
    ${screen === "topup" ? html`<${CoinSheet} t=${t} loc=${loc} open=${true} onClose=${closeScreen} />` : null}
  </${Fragment}>`;
}

// the shop: the armoury (rendered pictures), a runner of your own (made from words or a photo, GEN_PRICE coins), the
// cast, priced in the coins the runs earn — and the wallet's top-up in Telegram Stars; a tap buys and wears (or
// wields), or wears what is owned
export function skins({ S, openScreen, closeScreen }) {
  const t = useStore(S.t), loc = useStore(S.locale), screen = useStore(S.screen);
  const coins = +useStore($coins) || 0, skin = useStore($skin), best = useStore($best), fresh = useStore($newChar), weapon = useStore($weapon), bought = useStore($bought);
  useStore($owned); useStore($myChars); useStore($arms);
  useEffect(() => { if (!bought) return; const id = setTimeout(() => $bought.set(0), 3000); return () => clearTimeout(id); }, [bought]);
  const have = owned(), mine = myChars(), held = arms();
  const tap = (id) => { if (!pickSkin(id)) haptic.tick(); else haptic.bump(); };
  const wield = (id) => { if (!pickWeapon(id)) haptic.tick(); else haptic.bump(); };
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
      <div class="flex items-center gap-2">
        <span class="badge badge-lg badge-warning font-mono tabular-nums gap-1" data-wallet=${coins}><iconify-icon icon="lucide:circle-dollar-sign"></iconify-icon> ${coins}</span>
        <button data-topup type="button" onClick=${() => openScreen("topup")} class="btn btn-sm rounded-full gap-1.5 normal-case"><iconify-icon icon="lucide:star" class="text-warning"></iconify-icon>${T(t, "topUp")}</button>
        ${bought ? html`<span data-bought class="font-mono text-xs tabular-nums text-success" aria-live="polite">+${bought} ${T(t, "bought")}</span>` : null}
      </div>
      <span class="font-mono text-xs opacity-70">${T(t, "best")} ${best} ${T(t, "unitM")}</span>
    </div>
    <h2 class="font-mono uppercase tracking-widest text-[0.7rem] text-base-content/70 mt-1">${T(t, "arms")}</h2>
    <div data-arms-grid class="grid grid-cols-3 gap-2">
      ${WEAPONS.map((w) => { const own = held.includes(w.id), on = w.id === weapon, can = own || coins >= w.price; return html`
        <button key=${w.id} data-arm=${w.id} data-owned=${own ? "yes" : "no"} type="button" aria-pressed=${on ? "true" : "false"} aria-label=${`${w.name}${own ? "" : ` · ${w.price}`}`} onClick=${() => wield(w.id)}
          class=${`flex flex-col items-stretch gap-1.5 rounded-2xl p-2 text-left active:scale-[.97] transition-transform border ${on ? "border-transparent" : "border-base-content/10"}`} style=${on ? `box-shadow:0 0 0 2px ${w.tint},0 0 18px ${w.tint}55` : ""}>
          <img src=${armUrl(w.id)} alt="" width="160" height="160" loading="lazy" decoding="async" class=${`w-full aspect-square rounded-xl object-cover bg-black ${on || can ? "" : "opacity-40 grayscale"}`} />
          <span class="text-[0.8rem] font-semibold leading-tight px-1">${w.name}</span>
          <span class="font-mono text-[0.65rem] leading-tight text-base-content/70 px-1">${w.mag} · ${w.rate}/s${w.lanes ? " · ×3" : ""}</span>
          <span class=${`font-mono text-[0.7rem] leading-none tabular-nums px-1 pb-1 ${own ? "text-base-content/70" : "text-base-content"}`}>${on ? T(t, "wielded") : own ? T(t, "ownedSkin") : html`${w.price} <iconify-icon icon="lucide:circle-dollar-sign" class="align-[-1px]"></iconify-icon>`}</span>
        </button>`; })}
    </div>
    <h2 class="font-mono uppercase tracking-widest text-[0.7rem] text-base-content/70 mt-1">${T(t, "mine")}</h2>
    <div data-mine-grid class="grid grid-cols-3 sm:grid-cols-4 gap-x-2 gap-y-3">
      <button data-gen-open type="button" onClick=${() => openScreen("gen")} aria-label=${`${T(t, "genOpen")} · ${GEN_PRICE}`}
        class="w-full flex flex-col items-center gap-1.5 min-w-0 rounded-2xl p-2 active:scale-[.96] transition-transform">
        <span class="w-16 h-16 sm:w-[4.5rem] sm:h-[4.5rem] rounded-full border border-dashed border-base-content/30 flex items-center justify-center text-2xl text-base-content/80"><iconify-icon icon="lucide:sparkles"></iconify-icon></span>
        <span class="text-[0.75rem] leading-tight">${T(t, "genOpen")}</span>
        <span class="font-mono text-[0.7rem] leading-none tabular-nums">${GEN_PRICE} <iconify-icon icon="lucide:circle-dollar-sign" class="align-[-1px]"></iconify-icon></span>
      </button>
      ${mine.map((g) => html`<div key=${g.id} class="relative min-w-0">
        ${cell(g, true, html`<span class="font-mono text-[0.7rem] leading-none text-base-content/70">${g.id === skin ? T(t, "worn") : T(t, "ownedSkin")}</span>`)}
        <button data-remove=${g.id} type="button" aria-label=${T(t, "remove")} title=${T(t, "remove")} data-haptic="bump" onClick=${() => removeMyChar(g.id)}
          class="absolute top-1 right-1 w-6 h-6 rounded-full bg-base-100 border border-base-content/15 text-base-content/70 flex items-center justify-center text-sm leading-none">×</button>
      </div>`)}
    </div>
    <h2 class="font-mono uppercase tracking-widest text-[0.7rem] text-base-content/70 mt-1">${T(t, "cast")}</h2>
    <div data-skin-grid class="grid grid-cols-3 sm:grid-cols-4 gap-x-2 gap-y-3">
      ${SKINS.map((g) => { const own = have.includes(g.id), on = g.id === skin; return cell(g, own, html`<span class=${`font-mono text-[0.7rem] leading-none tabular-nums ${own ? "text-base-content/70" : "text-base-content"}`}>${on ? T(t, "worn") : own ? T(t, "ownedSkin") : html`${g.price} <iconify-icon icon="lucide:circle-dollar-sign" class="align-[-1px]"></iconify-icon>`}</span>`); })}
    </div>
    <${GenSheet} t=${t} loc=${loc} open=${screen === "gen"} onClose=${closeScreen} />
    <${CoinSheet} t=${t} loc=${loc} open=${screen === "topup"} onClose=${closeScreen} />
  </div>`;
}

const CSS = `
.bo-bg{background:radial-gradient(120% 70% at 50% 100%,#141a30 0%,#05070c 60%)}
.bo-edge{background:radial-gradient(80% 70% at 50% 55%,rgba(0,0,0,0) 45%,rgba(120,10,16,.55) 100%);transition:opacity .25s linear}
.bo-boost{background:radial-gradient(70% 60% at 50% 50%,rgba(0,0,0,0) 55%,rgba(34,211,238,.28) 100%);transition:opacity .4s ease}
.bo-chip{padding:.4rem .6rem;border-radius:1rem;background:rgba(7,6,12,.82);backdrop-filter:blur(8px);color:#f2eee6}   /* .82, not .55: the boost's cyan rim showed through and the light theme's HUD lost its 4.5:1 (CI, 2026-09-13) */
.bo-gold{color:#f5b942}
.bo-cyan{color:#22d3ee}
.bo-star{background:rgba(245,185,66,.16);color:#f5b942;border:1px solid rgba(245,185,66,.35)}
.bo-face{position:fixed;left:16px;top:150px;width:132px;height:132px;border-radius:50%;--rim:rgba(242,238,230,.35);--glow:rgba(0,0,0,.6);box-shadow:0 0 0 2px var(--rim),0 0 18px var(--glow),0 0 0 30px #05070c;transition:box-shadow .15s ease}
.bo-face[data-mood="hit"],.bo-face[data-mood="caught"]{--rim:#ff3b3b;--glow:#ff3b3b99}
.bo-face[data-mood="boost"],.bo-face[data-mood="kill"],.bo-face[data-mood="smash"]{--rim:#22d3ee;--glow:#22d3ee99}
.bo-face[data-mood="coins"]{--rim:#f5b942;--glow:#f5b94299}
.bo-face[data-mood="jump"],.bo-face[data-mood="land"]{--rim:rgba(242,238,230,.9)}
.bo-menu{background:linear-gradient(180deg,rgba(5,7,12,.55) 0%,rgba(5,7,12,0) 30%,rgba(5,7,12,0) 55%,rgba(5,7,12,.85) 100%);color:#f2eee6}
.bo-title{color:#f2eee6;text-shadow:0 0 28px rgba(245,185,66,.55),0 0 2px rgba(0,0,0,.8)}
.bo-go{background:#f5b942;color:#07060c;box-shadow:0 6px 28px rgba(245,185,66,.4)}
.bo-card{background:rgba(7,6,12,.7);backdrop-filter:blur(14px);border:1px solid rgba(242,238,230,.12);color:#f2eee6}
`;
