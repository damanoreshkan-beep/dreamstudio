// Видиво — a living screensaver. One fit screen: the picture is a fixed layer BEHIND the chrome (the header
// is transparent, so the wordmark sits on it), the controls are one island at the foot. The SHOW is the
// same stage subtree taken fullscreen — a top-layer element is drawn alone, so the chrome outside it is
// gone and the clock, the line and the exit tap live inside it; where fullscreen is denied the stage
// simply rises over the chrome (fixed, z-60). Contract and precedents: apps/vydyvo/RESEARCH.md.
import { html } from "htm/preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { Sheet, Segmented, Island } from "/_rt/ui.js";
import { Battery } from "/_rt/render.js";
import { wakeLock } from "/_rt/sensors.js";
import { Pixels } from "/_rt/skeleton.js";
import { PRESETS, presetOf } from "./presets.js";
import { $opts, setOpts, $frames, $stage, $gen, EVERY, startLoop, skip, unshown } from "./state.js";

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

// The typographic layer of the show: the clock, the date, the preset's line for THIS frame, the words it
// grew from. Fixed white on a scrim on purpose — it sits on a photograph, not on a farm surface, and must
// read the same in both themes (wall's precedent).
function ShowType({ t, loc, frame }) {
  const now = useTick(), d = new Date(now), lc = LOCALE[loc] || LOCALE.en;
  const time = new Intl.DateTimeFormat(lc, { hour: "2-digit", minute: "2-digit" }).format(d);
  const date = new Intl.DateTimeFormat(lc, { weekday: "long", day: "numeric", month: "long" }).format(d);
  return html`<div class="vy-type" aria-hidden="true">
    <div data-clock class="vy-clock">${time}</div>
    <div class="vy-date">${date}</div>
    ${frame ? html`<p data-line class="vy-line">${T(t, `l_${frame.preset}_${(frame.li ?? 0) + 1}`)}</p>` : null}
    ${frame?.prompt ? html`<p class="vy-caption">${frame.prompt}</p>` : null}
  </div>`;
}

export function vydyvo({ t, S, screen, closeScreen }) {
  const opts = useStore($opts), frames = useStore($frames), stage = useStore($stage), gen = useStore($gen), loc = useStore(S.locale);
  const now = useTick();
  const show = screen === "show";
  const stageRef = useRef(null);
  const preset = presetOf(opts.preset);
  const byId = (id) => frames.find((f) => f.id === id) || null;
  const cur = byId(stage.cur);
  const next = unshown()[0];   // preloaded below, so the cross-fade never fades in a half-decoded picture

  useEffect(() => { startLoop({ t }); }, []);

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
  const counting = gen.phase !== "working" && !gen.error && frames.length > 1 && stage.cur;
  const status = gen.phase === "working" ? T(t, "working") : gen.error ? T(t, gen.error) : counting ? mmss(left) : T(t, "resting");

  const label = "font-mono text-[var(--ms-label)] uppercase tracking-wider text-base-content/70";
  return html`<div class="h-full min-h-0 flex flex-col">
    <div data-stage ref=${stageRef} data-vy-preset=${opts.preset} data-vy-every=${opts.every} data-show=${show ? "1" : null}
      class=${`vy-stage fixed inset-0 ${show ? "z-[60]" : "z-0"} bg-black overflow-hidden`}
      onClick=${show ? () => S.screen.set(null) : null}>
      ${[0, 1].map((slot) => {
        const f = stage.slot === slot ? cur : byId(stage.prev), on = !!f && f.id === stage.cur;
        return html`<img key=${slot} data-frame data-slot=${slot} data-on=${on ? "1" : null} src=${f?.url || ""} alt="" aria-hidden="true" decoding="async" class="vy-layer pointer-events-none" style=${`--vy-every:${opts.every}s`} />`;
      })}
      ${next ? html`<img src=${next.url} alt="" decoding="async" class="absolute w-px h-px opacity-0 pointer-events-none" aria-hidden="true" />` : null}
      <div class="vy-vignette" aria-hidden="true"></div>
      ${!cur ? html`<div class="absolute inset-0 grid place-items-center pointer-events-none" aria-hidden="true"><${Pixels} cls="w-36 h-60 rounded-[var(--ms-r)]" /></div>` : null}
      ${show ? html`<${ShowType} t=${t} loc=${loc} frame=${cur} />` : null}
      ${show ? html`<div class="absolute right-[clamp(1rem,5vw,2.5rem)] top-[max(env(safe-area-inset-top),clamp(1rem,4vh,2rem))] text-white/85" style="text-shadow:0 1px 2px rgba(0,0,0,.5)"><${Battery} force=${true} /></div>` : null}
      ${show ? html`<span class="sr-only">${T(t, "exitShow")}</span>` : null}
    </div>

    <div class="relative z-10 flex-1 min-h-0 flex flex-col justify-end p-[var(--ms-pad)]">
      <${Island} tone="glass" className="flex flex-col gap-2">
        <div class="flex items-center gap-2">
          <input data-prompt type="text" value=${opts.prompt} spellcheck="false" autocomplete="off"
            aria-label=${T(t, "promptLabel")} placeholder=${T(t, "promptPlaceholder")}
            onInput=${(e) => setOpts({ prompt: e.currentTarget.value })}
            class="flex-1 min-w-0 h-[var(--ms-ctl)] bg-transparent text-[0.95rem] focus:outline-none placeholder:text-base-content/45" />
          <button data-show-btn class="btn btn-sm btn-primary rounded-full gap-1.5 shrink-0" onClick=${() => S.screen.set("show")}>${Icon("lucide:expand", "text-base")}${T(t, "show")}</button>
        </div>
        <div class="flex items-center gap-2 min-w-0">
          <button data-settings class=${`flex items-center gap-2 min-w-0 flex-1 text-left ${label}`} onClick=${() => S.screen.set("settings")}>
            <span class="size-2 rounded-full shrink-0" style=${`background:hsl(${preset.hue} 60% 60%)`}></span>
            <span class="shrink-0">${T(t, "p_" + opts.preset)}</span><span class="opacity-40">·</span>
            <span data-status class=${`truncate ${counting ? "tabular-nums" : "font-sans normal-case tracking-normal text-sm"}`}>${status}</span>
            ${Icon("lucide:sliders-horizontal", "ml-auto text-base shrink-0")}
          </button>
          <button data-skip class="btn btn-ghost btn-sm btn-circle shrink-0" aria-label=${T(t, "skip")} disabled=${frames.length < 2} onClick=${skip}>${Icon("lucide:skip-forward", "text-base")}</button>
        </div>
      <//>
    </div>

    <${Sheet} id="vy-settings" open=${screen === "settings"} onClose=${closeScreen} title=${T(t, "settings")} icon="lucide:sliders-horizontal" locale=${loc}>
      <div class="flex flex-col gap-[var(--ms-gap)]">
        <div class=${label}>${T(t, "preset")}</div>
        <${Segmented} attr="data-preset" scroll=${true} label=${T(t, "preset")} value=${opts.preset} onChange=${(id) => setOpts({ preset: id })}
          items=${PRESETS.map((p) => ({ id: p.id, label: T(t, "p_" + p.id), dot: `hsl(${p.hue} 60% 60%)` }))} />
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
