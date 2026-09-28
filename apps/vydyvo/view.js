import { html } from "htm/preact";
import { Fragment } from "preact";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { Sheet, Segmented, Island } from "/_rt/ui.js";
import { Battery } from "/_rt/render.js";
import { wakeLock } from "/_rt/sensors.js";
import { downloadBlob } from "/_rt/apk.js";
import { gate } from "/_rt/gate.js";
import { GlStage, hasWebGL2 } from "/_rt/glstage.js";
import { LINES, WORLDS, nameOf, thumbOf } from "./worlds.js";
import { $opts, setOpts, $frames, $stage, $gen, EVERY, startLoop, skip, unshown, nudge, generateNow, activeWorld, ensureSeed } from "./state.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const fsSupported = typeof document !== "undefined" && !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
const LOCALE = { uk: "uk-UA", en: "en-GB" };

function useTick() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);
  return now;
}
const mmss = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

const Waved = ({ text, cls = "" }) => {
  let i = 0;
  return html`<span key=${text} class=${cls}>${String(text).split(" ").map((w, wi) =>
    html`<${Fragment} key=${wi}>${wi ? " " : ""}<span class="vy-w">${[...w].map((ch) =>
      html`<span key=${i} class="vy-ch" style=${`--ci:${i++}`}>${ch}</span>`)}</span><//>`)}</span>`;
};

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

function CharGrid({ t, loc, mode, picked, onPick }) {
  return html`<div data-chars class="mb-3">
    <div class="font-mono text-[length:var(--ms-label)] uppercase tracking-wider text-base-content/70 mb-2">${T(t, "whoSpeaks")}</div>
    <div class="vy-grid">
      ${Object.keys(WORLDS).map((id, i) => html`<button key=${id} type="button" data-char=${id} data-on=${picked === id ? "1" : null} class="vy-tile" style=${`--ti:${i}`}
        aria-label=${`${nameOf(id, mode, loc)} · ${nameOf(id, mode === "light" ? "dark" : "light", loc)}`} aria-pressed=${picked === id ? "true" : "false"} onClick=${() => onPick(id)}>
        <img src=${thumbOf(id, mode)} alt="" decoding="async" loading=${i < 6 ? "eager" : "lazy"} onError=${(e) => { e.currentTarget.style.visibility = "hidden"; }} />
        <span class="vy-name">${nameOf(id, mode, loc)}<span class="vy-side">${nameOf(id, mode === "light" ? "dark" : "light", loc)}</span></span>
      </button>`)}
    </div>
  </div>`;
}

export function vydyvo({ t, S, screen, closeScreen, toast }) {
  const opts = useStore($opts), frames = useStore($frames), stage = useStore($stage), gen = useStore($gen), loc = useStore(S.locale);
  useStore(S.theme);
  const now = useTick();
  const show = screen === "show";
  const stageRef = useRef(null);
  const docMode = (typeof document !== "undefined" && document.documentElement.getAttribute("data-theme")) === "signal-light" ? "light" : "dark";
  const docModeRef = useRef(docMode); docModeRef.current = docMode;
  const ambRef = useRef(0);
  const wid = activeWorld();
  const byId = (id) => frames.find((f) => f.id === id) || null;
  const cur = byId(stage.cur);
  const next = unshown()[0];

  useEffect(() => { startLoop({ t, loc }); }, [t, loc]);
  useLayoutEffect(() => { ensureSeed(docMode, wid); }, [docMode, wid]);

  const fitsDoc = (f) => f.mode === docMode && f.preset === wid;
  const matched = frames.some(fitsDoc);
  const curMatches = !!cur && fitsDoc(cur);
  const veiled = !curMatches || (gate && typeof location !== "undefined" && new URLSearchParams(location.search).get("veil") === "1");
  useEffect(() => { if (!curMatches && matched) skip(); }, [docMode, wid, curMatches, matched]);
  useEffect(() => { if (!matched) nudge(); }, [docMode, wid, matched]);
  const accentRef = useRef(null);
  useEffect(() => {
    try {
      const v = getComputedStyle(document.documentElement).getPropertyValue("--color-accent").trim();
      const m = /^#([0-9a-f]{6})$/i.exec(v);
      accentRef.current = m ? [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255).concat(1) : null;
    } catch { accentRef.current = null; }
  }, [docMode, wid]);

  useEffect(() => {
    if (!show) return;
    const el = stageRef.current, wl = wakeLock.acquire();
    let entered = false;
    if (fsSupported && el) {
      try {
        const r = el.requestFullscreen?.({ navigationUI: "hide" }) || el.webkitRequestFullscreen?.();
        if (r && r.then) r.then(() => { entered = true; }, () => {}); else entered = true;
      } catch { }
    }
    const onChange = () => { if (entered && !document.fullscreenElement) { entered = false; if (S.screen.get() === "show") S.screen.set(null); } };
    document.addEventListener("fullscreenchange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      wl?.release?.();
      if (document.fullscreenElement === el) { try { document.exitFullscreen?.(); } catch { } }
    };
  }, [show]);

  const left = opts.every * 1000 - (now - stage.since);
  const working = gen.phase === "working";
  const counting = !working && !gen.error && frames.length > 1 && stage.cur;
  const status = working ? T(t, "working") : gen.error ? T(t, gen.error) : counting ? mmss(left) : T(t, "resting");

  const label = "font-mono text-[length:var(--ms-label)] uppercase tracking-wider text-base-content/70";
  return html`<div class="h-full min-h-0 flex flex-col">
    <div data-stage ref=${stageRef} data-vy-world=${wid} data-vy-every=${opts.every} data-vy-mode=${cur?.mode || null} data-vy-ahead=${frames.filter((f) => !f.shown).length} data-vy-runs=${gen.runs || 0} data-show=${show ? "1" : null} data-veil=${veiled ? "1" : null}
      class=${`vy-stage fixed inset-0 ${show ? "z-[60]" : "z-0"} bg-black overflow-hidden`}
      onClick=${show ? () => S.screen.set(null) : null}>
      ${[0, 1].map((slot) => {
        const f = stage.slot === slot ? cur : byId(stage.prev), on = !!f && f.id === stage.cur;
        return html`<img key=${slot} data-frame data-slot=${slot} data-on=${on ? "1" : null} src=${f?.url || ""} alt="" aria-hidden="true" decoding="async" class="vy-layer pointer-events-none" style=${`--vy-every:${opts.every}s`} />`;
      })}
      ${next ? html`<img src=${next.url} alt="" decoding="async" class="absolute w-px h-px opacity-0 pointer-events-none" aria-hidden="true" />` : null}
      ${""}
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

    <div class="relative z-10 flex-1 min-h-0 flex flex-col p-[var(--ms-pad)]">
      ${""}
      <div class="flex-1 min-h-0 overflow-y-auto flex flex-col justify-end">
        <${CharGrid} t=${t} loc=${loc} mode=${docMode} picked=${wid}
          onPick=${(id) => { if (id !== wid) { setOpts({ char: id }); generateNow(); } S.screen.set("show"); }} />
      </div>
      <${Island} tone="glass" className="flex flex-col gap-2">
        <div class="flex items-center gap-2">
          <input data-prompt type="text" value=${opts.prompt} spellcheck="false" autocomplete="off"
            aria-label=${T(t, "promptLabel")} placeholder=${T(t, "promptPlaceholder")}
            onInput=${(e) => {
              const v = e.currentTarget.value, had = opts.prompt;
              setOpts({ prompt: v });
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
            ${""}
            <span data-status key=${counting ? "count" : status} class=${`vy-st truncate ${counting ? "tabular-nums" : "font-sans normal-case tracking-normal text-sm"}`}>${status}${working ? html`<span class="vy-dots" aria-hidden="true"><span>.</span><span>.</span><span>.</span></span>` : null}</span>
            ${Icon("lucide:sliders-horizontal", "ml-auto text-base shrink-0")}
          </button>
          ${""}
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
      </div>
    <//>
  </div>`;
}
