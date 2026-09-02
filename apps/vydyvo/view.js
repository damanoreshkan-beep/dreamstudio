// Видиво — a living screensaver. One fit screen: the picture is a fixed layer BEHIND the chrome (the header
// is transparent, so the wordmark sits on it), the controls are one island at the foot. The SHOW is the
// same stage subtree taken fullscreen — a top-layer element is drawn alone, so the chrome outside it is
// gone and the clock, the line and the exit tap live inside it; where fullscreen is denied the stage
// simply rises over the chrome (fixed, z-60). Contract and precedents: apps/vydyvo/RESEARCH.md.
import { html } from "htm/preact";
import { Fragment } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { Sheet, Segmented, Island } from "/_rt/ui.js";
import { Battery } from "/_rt/render.js";
import { wakeLock } from "/_rt/sensors.js";
import { downloadBlob } from "/_rt/apk.js";
import { gate } from "/_rt/gate.js";
import { GlStage, hasWebGL2 } from "/_rt/glstage.js";
import { LINES, activeWorld } from "./worlds.js";
import { $opts, setOpts, $frames, $stage, $gen, EVERY, startLoop, skip, unshown, nudge, generateNow } from "./state.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const fsSupported = typeof document !== "undefined" && !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
const LOCALE = { uk: "uk-UA", en: "en-GB" };

// a 1 s tick — the clock and the countdown re-render on it; nothing audible rides on it
function useTick() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);
  return now;
}
const mmss = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

// A text that arrives as a WAVE: one span per character, each a beat later (owner: "моушн анімація зміни
// тексту хвилями"). Keyed by the text, so a change remounts and the wave replays; the delay is capped so a
// long line never takes seconds to finish. Used only inside the show's aria-hidden layer.
// Characters are grouped into UNBREAKABLE word spans — a bare run of inline-block letters wraps mid-word
// ("до бе / рега", eye 2026-09-01); the real spaces between word spans keep line breaks where words end.
const Waved = ({ text, cls = "" }) => {
  let i = 0;
  return html`<span key=${text} class=${cls}>${String(text).split(" ").map((w, wi) =>
    html`<${Fragment} key=${wi}>${wi ? " " : ""}<span class="vy-w">${[...w].map((ch) =>
      html`<span key=${i} class="vy-ch" style=${`--ci:${i++}`}>${ch}</span>`)}</span><//>`)}</span>`;
};

// The typographic layer of the show: the clock, the date, the line born with THIS frame, the words it
// grew from. Fixed white on a scrim on purpose — it sits on a photograph, not on a farm surface, and must
// read the same in both themes (wall's precedent).
function ShowType({ t, loc, frame }) {
  const now = useTick(), d = new Date(now), lc = LOCALE[loc] || LOCALE.en;
  const time = new Intl.DateTimeFormat(lc, { hour: "2-digit", minute: "2-digit" }).format(d);
  const date = new Intl.DateTimeFormat(lc, { weekday: "long", day: "numeric", month: "long" }).format(d);
  return html`<div class="vy-type" aria-hidden="true">
    <div data-clock class="vy-clock"><${Waved} text=${time} /></div>
    <div class="vy-date"><${Waved} text=${date} /></div>
    ${frame ? html`<p data-line class="vy-line"><${Waved} text=${frame.line || T(t, `l_${((frame.li ?? 0) % LINES) + 1}`)} /></p>` : null}
    ${frame?.prompt ? html`<p class="vy-caption">${frame.prompt}</p>` : null}
  </div>`;
}

export function vydyvo({ t, S, screen, closeScreen, toast }) {
  const opts = useStore($opts), frames = useStore($frames), stage = useStore($stage), gen = useStore($gen), loc = useStore(S.locale);
  useStore(S.theme);   // the veil and the field follow the APPLIED mode, re-read off the document below
  const now = useTick();
  const show = screen === "show";
  const stageRef = useRef(null);
  // the mode the DOCUMENT is in (`?theme=` overrides the atom without writing it)
  const docMode = (typeof document !== "undefined" && document.documentElement.getAttribute("data-theme")) === "signal-light" ? "light" : "dark";
  const docModeRef = useRef(docMode); docModeRef.current = docMode;
  const ambRef = useRef(0);
  // THE THEME IS THE WORLD (owner: "у нас все тема рішає"): no preset of vydyvo's own, and the island does
  // not name the theme either (owner 2026-09-02: "прибери все зайве") — the whole page already wears it.
  useStore(S.material);   // a picker change re-renders, so the veil re-checks the world below
  const wid = activeWorld();
  const byId = (id) => frames.find((f) => f.id === id) || null;
  const cur = byId(stage.cur);
  const next = unshown()[0];   // preloaded below, so the cross-fade never fades in a half-decoded picture

  useEffect(() => { startLoop({ t, loc }); }, [t, loc]);

  // THE VEIL (owner: a wrong-mode frame "виїдає очі"; 2026-09-02: a theme change must show the waiting
  // field, never the old world's picture or emptiness): a frame FITS when it carries the page's mode AND
  // world. When the collection holds no fitting frame, the pictures give way to the waiting field below;
  // when one exists but the stage shows something else, switch at once instead of waiting out the timer.
  const fitsDoc = (f) => f.mode === docMode && f.preset === wid;
  const matched = frames.some(fitsDoc);
  const curMatches = !!cur && fitsDoc(cur);
  // `?mock&veil=1` forces the field for the eye: the gate always paints frames in the CURRENT mode and
  // `?theme=` pins the document, so the real mismatch can never be arranged in a headless shot
  const veiled = !curMatches || (gate && typeof location !== "undefined" && new URLSearchParams(location.search).get("veil") === "1");
  useEffect(() => { if (!curMatches && matched) skip(); }, [docMode, wid, curMatches, matched]);
  useEffect(() => { if (!matched) nudge(); }, [docMode, wid, matched]);
  // the field's motes take the ACTIVE theme's ink — the waiting screen belongs to the material it waits
  // for, not to luminous alone; --color-accent is mode-aware in every theme module (fallback: amber/gold)
  const accentRef = useRef(null);
  useEffect(() => {
    try {
      const v = getComputedStyle(document.documentElement).getPropertyValue("--color-accent").trim();
      const m = /^#([0-9a-f]{6})$/i.exec(v);
      accentRef.current = m ? [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255).concat(1) : null;
    } catch { accentRef.current = null; }
  }, [docMode, wid]);

  // The show: fullscreen on the stage subtree + the screen kept awake, both released on the way out. The
  // browser leaving fullscreen on its own (ESC, the system gesture) closes the route so state and display
  // never disagree; the route closing (Back, a tap) leaves fullscreen.
  useEffect(() => {
    if (!show) return;
    const el = stageRef.current, wl = wakeLock.acquire();
    let entered = false;
    if (fsSupported && el) {
      try {
        const r = el.requestFullscreen?.({ navigationUI: "hide" }) || el.webkitRequestFullscreen?.();
        if (r && r.then) r.then(() => { entered = true; }, () => {}); else entered = true;
      } catch { /* a denied request leaves the fixed layer, which still covers the chrome */ }
    }
    const onChange = () => { if (entered && !document.fullscreenElement) { entered = false; if (S.screen.get() === "show") S.screen.set(null); } };
    document.addEventListener("fullscreenchange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      wl?.release?.();
      if (document.fullscreenElement === el) { try { document.exitFullscreen?.(); } catch { /* */ } }
    };
  }, [show]);

  // what the status line says: painting · next in m:ss · showing the collection · the last refusal
  const left = opts.every * 1000 - (now - stage.since);
  const working = gen.phase === "working";
  const counting = !working && !gen.error && frames.length > 1 && stage.cur;
  const status = working ? T(t, "working") : gen.error ? T(t, gen.error) : counting ? mmss(left) : T(t, "resting");

  const label = "font-mono text-[var(--ms-label)] uppercase tracking-wider text-base-content/70";
  return html`<div class="h-full min-h-0 flex flex-col">
    <div data-stage ref=${stageRef} data-vy-world=${wid} data-vy-every=${opts.every} data-vy-mode=${cur?.mode || null} data-show=${show ? "1" : null} data-veil=${veiled ? "1" : null}
      class=${`vy-stage fixed inset-0 ${show ? "z-[60]" : "z-0"} bg-black overflow-hidden`}
      onClick=${show ? () => S.screen.set(null) : null}>
      ${[0, 1].map((slot) => {
        const f = stage.slot === slot ? cur : byId(stage.prev), on = !!f && f.id === stage.cur;
        return html`<img key=${slot} data-frame data-slot=${slot} data-on=${on ? "1" : null} src=${f?.url || ""} alt="" aria-hidden="true" decoding="async" class="vy-layer pointer-events-none" style=${`--vy-every:${opts.every}s`} />`;
      })}
      ${next ? html`<img src=${next.url} alt="" decoding="async" class="absolute w-px h-px opacity-0 pointer-events-none" aria-hidden="true" />` : null}
      ${/* THE WAITING FIELD — shown while no frame of the page's mode exists (a wrong-mode frame burns the
           eyes on a theme flip): the pre-generated ambient texture breathing under a quiet WebGL field
           (vydyvo.frag — the texture rides in as GlStage's palette sampler; motes in the accent's tint).
           Where WebGL2 is absent the texture breathes alone. */""}
      ${veiled ? html`<div data-veiled class="absolute inset-0 pointer-events-none" aria-hidden="true">
        <img src=${new URL(`assets/amb-${docMode === "light" ? "d" : "n"}.webp`, import.meta.url).href} alt="" decoding="async" class="vy-amb" />
        ${hasWebGL2() ? html`<${GlStage} shader=${new URL("vydyvo.frag", import.meta.url)} seed=${7} zClass="z-0"
          ink=${() => accentRef.current || (docModeRef.current === "dark" ? [0.95, 0.72, 0.29, 1] : [0.55, 0.42, 0.16, 1])}
          vary=${() => [docModeRef.current === "dark" ? 1 : 0, ambRef.current, 0, 0]}
          tex=${new URL(`assets/amb-${docMode === "light" ? "d" : "n"}.webp`, import.meta.url).href}
          texReady=${(r) => { ambRef.current = r ? 1 : 0; }} />` : null}
      </div>` : null}
      <div class="vy-vignette" aria-hidden="true"></div>
      ${show ? html`<${ShowType} t=${t} loc=${loc} frame=${cur} />` : null}
      ${show ? html`<div class="absolute right-[clamp(1rem,5vw,2.5rem)] top-[max(env(safe-area-inset-top),clamp(1rem,4vh,2rem))] text-white/85" style="text-shadow:0 1px 2px rgba(0,0,0,.5)"><${Battery} force=${true} /></div>` : null}
      ${show ? html`<span class="sr-only">${T(t, "exitShow")}</span>` : null}
    </div>

    <div class="relative z-10 flex-1 min-h-0 flex flex-col justify-end p-[var(--ms-pad)]">
      <${Island} tone="glass" className="flex flex-col gap-2">
        <div class="flex items-center gap-2">
          <input data-prompt type="text" value=${opts.prompt} spellcheck="false" autocomplete="off"
            aria-label=${T(t, "promptLabel")} placeholder=${T(t, "promptPlaceholder")}
            onInput=${(e) => {
              const v = e.currentTarget.value, had = opts.prompt;
              setOpts({ prompt: v });
              // erased to empty while the old words were still painting → those words are WITHDRAWN
              // (owner: "я стер промпт але генерується він"): supersede the race, the world speaks again
              if (!v && had && gen.phase === "working") generateNow();
            }}
            onKeyDown=${(e) => { if (e.key === "Enter") { e.currentTarget.blur(); generateNow(); } }}
            class="flex-1 min-w-0 h-[var(--ms-ctl)] bg-transparent text-[0.95rem] focus:outline-none placeholder:text-base-content/45" />
          ${opts.prompt ? html`<button data-clear class="btn btn-ghost btn-sm btn-circle shrink-0" aria-label=${T(t, "clearPrompt")}
            onClick=${() => { setOpts({ prompt: "" }); generateNow(); }}>${Icon("lucide:x", "text-base")}</button>` : null}
          <button data-show-btn class="btn btn-sm btn-primary rounded-full gap-1.5 shrink-0" onClick=${() => S.screen.set("show")}>${Icon("lucide:expand", "text-base")}${T(t, "show")}</button>
        </div>
        <div class="flex items-center gap-2 min-w-0">
          <button data-settings class=${`flex items-center gap-2 min-w-0 flex-1 text-left ${label}`} onClick=${() => S.screen.set("settings")}>
            ${/* the state ARRIVES (owner: "стани з анімацією") — a remount per state change replays the
                 entrance; the countdown keys once so the ticking seconds never re-run it. Working breathes
                 through animated dots, never a spinner. */""}
            <span data-status key=${counting ? "count" : status} class=${`vy-st truncate ${counting ? "tabular-nums" : "font-sans normal-case tracking-normal text-sm"}`}>${status}${working ? html`<span class="vy-dots" aria-hidden="true"><span>.</span><span>.</span><span>.</span></span>` : null}</span>
            ${Icon("lucide:sliders-horizontal", "ml-auto text-base shrink-0")}
          </button>
          ${/* the explicit "paint NOW" (owner: "я ввів текст і хочу одразу запустити") — supersedes the
               running race and starts a fresh one with the words as they stand; Enter in the field does the
               same. The timer keeps advancing frames on its own; this button replaced the skip. */""}
          <button data-save class="btn btn-ghost btn-sm btn-circle shrink-0" aria-label=${T(t, "saveFrame")} disabled=${!cur}
            onClick=${async () => { try { const b = await (await fetch(cur.url)).blob(); await downloadBlob(b, `vydyvo-${cur.preset}-${cur.id}.${b.type.includes("png") ? "png" : b.type.includes("webp") ? "webp" : "jpg"}`); toast?.(T(t, "savedFrame")); } catch { toast?.(T(t, "eFailed")); } }}>${Icon("lucide:download", "text-base")}</button>
          <button data-gen-now class=${`btn btn-ghost btn-sm btn-circle shrink-0 ${gen.phase === "working" ? "text-secondary" : ""}`} aria-label=${T(t, "genNow")} onClick=${generateNow}>${Icon("lucide:wand-sparkles", "text-base")}</button>
        </div>
      <//>
    </div>

    <${Sheet} id="vy-settings" open=${screen === "settings"} onClose=${closeScreen} title=${T(t, "settings")} icon="lucide:sliders-horizontal" locale=${loc}>
      <div class="flex flex-col gap-[var(--ms-gap)]">
        <div class=${label}>${T(t, "every")}</div>
        <${Segmented} attr="data-every" label=${T(t, "every")} value=${String(opts.every)} onChange=${(v) => setOpts({ every: Number(v) })}
          items=${EVERY.map((s) => ({ id: String(s), label: T(t, "s" + s) }))} />
        <div class=${label}>${T(t, "quality")}</div>
        <${Segmented} attr="data-q" label=${T(t, "quality")} value=${opts.quality} onChange=${(q) => setOpts({ quality: q })}
          items=${[{ id: "fast", label: T(t, "qFast"), icon: "lucide:zap" }, { id: "2k", label: T(t, "q2k"), icon: "lucide:gem" }]} />
        <div class=${`flex items-center justify-between ${label}`}><span>${T(t, "collection")}</span><span data-collection class="tabular-nums">${frames.length}</span></div>
      </div>
    <//>
  </div>`;
}
