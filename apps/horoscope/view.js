// Horoscope — the REAL daily reading for your sign, yesterday · today · tomorrow, from horoscope.com
// (professional astrologers), plus the day's four star ratings (love/work/vibe/success). Fetched through
// our allowlisted VPS proxy (VPS_PROXY + /horoscope → parsed compact JSON, CORS *), then cached
// per (sign, day) in localStorage so the last reading stays instant and readable offline. English prose is
// translated to the active locale AND lightly rewritten into natural prose via the systemic /_rt/localize.js
// hook, which holds a skeleton until the FINAL text is ready (never the wooden intermediate). Fail-open.
// The sign glyph is the hand-drawn SVG from /_rt/zodiac.js — never an emoji.
import { html } from "htm/preact";
import { Fragment } from "preact";
import { useState, useEffect, useRef } from "preact/hooks";
import { Sheet, Segmented, Panel } from "/_rt/ui.js";
import { useStore } from "@nanostores/preact";
import { persistentAtom } from "@nanostores/persistent";
import { T } from "/_rt/i18n.js";
import { Sign } from "/_rt/zodiac.js";
import { sunSign } from "/_rt/horoscope.js";
import { useLocalized } from "/_rt/localize.js";
import { VPS_PROXY } from "/_rt/feed.js";
import { Scramble, Pixels } from "/_rt/skeleton.js";
import { gate } from "/_rt/gate.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
// The farm's mono micro-label: the SIZE is `length:` — `text-[var(--ms-label)]` would be a colour to Tailwind v4.
const LABEL = "font-mono text-[length:var(--ms-label)] uppercase tracking-wider text-base-content/70";
const QS = new URLSearchParams(location.search);
const SIGN_OVERRIDE = QS.get("sign"); // ?sign=0..11 previews any sign (for a phone/mock check)

// From the runtime, not a literal: the proxy domain has now moved once, and a hardcoded host here would have
// kept working right up until the old vhost was retired, then broken this app alone.
const API = `${VPS_PROXY}/horoscope`;
const DAY_IDS = ["yesterday", "today", "tomorrow"], DAY_KEYS = ["dYesterday", "dToday", "dTomorrow"];

// The four real ratings horoscope.com publishes per day → [i18n label, response key]. They are categories,
// not states, so no rating owns a hue: a filled step is the app's MARK colour (--app-accent), the one place
// the design system lets an arbitrary colour touch a fill.
const RATINGS = [["love", "sex"], ["work", "hustle"], ["vibe", "vibe"], ["success", "success"]];

// Remembered sign ("" → default to today's sun sign on first launch, then whatever you pick).
const $sign = persistentAtom("horoscope.sign", "");
const clampSign = (n) => Math.max(0, Math.min(11, Number(n) || 0));
const ck = (s, d) => `horoscope:v3:${s}:${d}`;
const readCache = (s, d) => { try { return JSON.parse(localStorage.getItem(ck(s, d)) || "null"); } catch { return null; } };
const writeCache = (s, d, v) => { try { localStorage.setItem(ck(s, d), JSON.stringify(v)); } catch { /* quota / private mode */ } };

// Gate/mock fixture: fixed real readings (Leo, Jul 2027) so the shot + e2e are deterministic and offline —
// three distinct days so the day-switch test sees the reading change without hitting the network.
const GATE = {
  yesterday: { date: "Jul 22, 2027", ratings: { sex: 2, hustle: 2, vibe: 2, success: 2 }, text: "Tension in your romantic life is apt to well up today, Leo. More than likely, there are certain responsibilities that you feel you have to attend to that take you away from your intimate experience with another. Try to find a healthy balance between work and play." },
  today: { date: "Jul 23, 2027", ratings: { sex: 4, hustle: 2, vibe: 3, success: 4 }, text: "Be prepared to work diligently toward making your dreams a reality today, Leo. Success is definitely on the way, though it may not be approaching quite as quickly as you might like. Take time periodically throughout the day to sit quietly and recoup your energy." },
  tomorrow: { date: "Jul 24, 2027", ratings: { sex: 4, hustle: 4, vibe: 3, success: 3 }, text: "Your heart has been active, Leo, and you're probably feeling the need to take charge of a certain relationship. Instead of being too hasty in your pursuit of this romance, you should probably do more planning. Look at the situation from a long-term perspective." },
};

async function fetchReading(signIdx, dayId) {
  const r = await fetch(`${API}?sign=${signIdx + 1}&day=${dayId}`);
  if (!r.ok) throw new Error("status " + r.status);
  const j = await r.json();
  if (!j || !j.text) throw new Error("empty");
  return { date: j.date, ratings: j.ratings || {}, text: j.text };
}

export function horoscope({ S, screen, openScreen, closeScreen }) {
  const t = useStore(S.t);
  const loc = useStore(S.locale);
  const stored = useStore($sign);
  const now = gate ? new Date(2027, 6, 23) : new Date();          // Jul 23 (Leo) — a reproducible default
  const signIdx = (SIGN_OVERRIDE != null && SIGN_OVERRIDE !== "") ? clampSign(SIGN_OVERRIDE)
    : stored === "" ? sunSign(now.getMonth() + 1, now.getDate()) : clampSign(stored);
  const [day, setDay] = useState(1);                              // 0 yesterday · 1 today · 2 tomorrow
  const [data, setData] = useState(gate ? GATE[DAY_IDS[1]] : null);
  const [err, setErr] = useState(false);

  // Fetch (or seed) whenever sign or day changes: show cache instantly, then refresh from the live source.
  useEffect(() => {
    const dayId = DAY_IDS[day];
    if (gate) { setData(GATE[dayId]); setErr(false); return; }
    const cached = readCache(signIdx, dayId);
    setData(cached || null);
    setErr(false);
    let live = true;
    fetchReading(signIdx, dayId)
      .then((d) => { if (!live) return; setData(d); setErr(false); writeCache(signIdx, dayId, d); })
      .catch(() => { if (live) setErr(!cached); });               // keep cache on failure; error only if nothing to show
    return () => { live = false; };
  }, [signIdx, day]);

  // Translate → naturally rewrite the reading for the active locale, as one systemic step: `localizing` stays
  // true until the FINAL text is ready, so the UI animates a skeleton instead of flashing the wooden
  // intermediate. Fail-open + gate-safe (the hook handles the network + the gate — no guard needed here).
  const { text: readingText, pending: localizing } = useLocalized(data?.text, loc);
  const dateLabel = data?.date ? new Date(now.getFullYear(), now.getMonth(), now.getDate() + (day - 1))
    .toLocaleDateString(loc === "en" ? "en-GB" : loc || "uk", { day: "numeric", month: "long" }) : "";
  // The screen's state, as one hook the driver can read: error (nothing to show) · loading · localizing · ready.
  const state = err && !data ? "error" : !data ? "loading" : localizing ? "localizing" : "ready";
  // The prose skeleton, shared by the loading and the localizing states: four decoding lines, the reading's shape.
  const proseSkeleton = html`<div class="flex flex-col gap-2 text-muted">${[26, 30, 28, 18].map((n, i) => html`<div class="text-[0.97rem]" key=${i}><${Scramble} len=${n} /></div>`)}</div>`;

  return html`<${Fragment}>
    <div class="flex flex-col gap-[var(--ms-gap)]" data-state=${state} data-day-sel=${DAY_IDS[day]} data-sign-idx=${signIdx}>
      ${/* Sign card → picker. The page extruded (`sf-raised`) on the shallow rung, and pressed IN under a
           finger (`sf-press`) — the material's own press, so no scale nudge on top of the extrusion. */""}
      <button data-sign class="w-full flex items-center gap-[var(--ms-gap)] rounded-[var(--ms-r)] sf-raised sf-e2 sf-press p-[var(--ms-pad)] transition-colors" onClick=${() => openScreen("signs")}>
        <span class="shrink-0" style="color:var(--app-accent)"><${Sign} i=${signIdx} cls="w-11 h-11" /></span>
        <span class="flex-1 min-w-0 text-left">
          <span class="block font-bold text-lg leading-tight">${(t.signs || "").split("|")[signIdx] || ""}</span>
          <span class=${`block mt-0.5 ${LABEL}`}>${(t.signDates || "").split("|")[signIdx] || ""}</span>
        </span>
        ${Icon("lucide:chevrons-up-down", "text-muted text-xl shrink-0")}
      </button>

      ${/* The day is a one-of-N choice and the screen's primary mode, so it is the kit's Segmented in its
           solid skin — the same strip every other app switches modes with. `attr` keeps the e2e hook. */""}
      <${Segmented} attr="data-day" label=${T(t, "dToday")}
        items=${[0, 1, 2].map((i) => ({ id: DAY_IDS[i], label: T(t, DAY_KEYS[i]) }))}
        value=${DAY_IDS[day]} onChange=${(id) => setDay(DAY_IDS.indexOf(id))} />

      ${err && !data
      ? html`<div class="flex flex-col items-center text-muted py-16 gap-3 text-center px-6">${Icon("lucide:cloud-off", "text-3xl")}<span class="text-sm">${T(t, "noConnection")}</span></div>`
      : !data
        ? html`<!-- structure-shaped skeleton (date · prose lines · ratings) — never a bare spinner -->
          <div class="flex flex-col gap-[var(--ms-gap)]">
            <div class=${LABEL}><${Scramble} len=${11} /></div>
            ${proseSkeleton}
            <div class="rounded-[var(--ms-r)] sf-inset overflow-hidden h-32"><${Pixels} /></div>
          </div>`
        : html`<!-- reading -->
          <div class="flex flex-col gap-[var(--ms-gap)]">
            <div class="flex items-baseline justify-between gap-2">
              <span class=${LABEL}>${dateLabel}</span>
              ${err ? html`<span class="font-mono text-[length:var(--ms-label)] uppercase tracking-wider text-warning truncate">${T(t, "offline")}</span>` : null}
            </div>
            ${localizing
      ? proseSkeleton   /* translating + rewriting: hold the skeleton until the final natural text is ready */
      : html`<p data-reading data-live class="text-[0.97rem] leading-relaxed">${readingText}</p>`}

            <!-- the day's four real star ratings -->
            <${Panel} title=${T(t, "ratings")} data-ratings="">
              ${RATINGS.map(([label, key]) => html`<div class="flex items-center gap-[var(--ms-gap)]" key=${key}>
                <span class="w-16 shrink-0 text-sm text-muted">${T(t, label)}</span>
                ${/* Five 6px segments — a track too thin to hold a shadow pair, which is the ONE place the
                     system lets tone stand in for depth (--sf-track-face, see theme.css). The empty steps
                     used to be base-300, which the repaint made identical to base-100: an unrated day drew
                     four invisible bars. A filled step is the app's mark colour. */""}
                <span class="flex-1 flex gap-1">${[0, 1, 2, 3, 4].map((n) => html`<span class="flex-1 h-1.5 rounded-full" style=${`background:${n < (data.ratings[key] || 0) ? "var(--app-accent)" : "var(--sf-track-face)"}`} key=${n}></span>`)}</span>
              </div>`)}
            <//>
          </div>`}
    </div>

    <${SignSheet} open=${screen === "signs"} onClose=${closeScreen} t=${t} signIdx=${signIdx} />
  </${Fragment}>`;
}

function SignSheet({ open, onClose, t, signIdx }) {
  const choose = (i) => { $sign.set(String(i)); onClose(); };
  return html`<${Sheet} id="signsheet" open=${open} onClose=${onClose} title=${T(t, "pickSign")} icon="lucide:sparkles">
      ${/* A 12-cell palette you SCAN — the 3x4 geometry is the affordance and stays exactly as it was. What
           it adopts is the farm's selection convention: the deck is a groove (sf-inset) and the chosen sign
           lifts out of it, which theme.css already applies to any [aria-pressed="true"] inside one, wearing
           the app's tint as its mark. The cells take the concentric radius of a box nested in a padded groove. */""}
      <div class="grid grid-cols-3 gap-2 sf-inset rounded-[var(--ms-r)] p-2">
        ${Array.from({ length: 12 }, (_, i) => html`<button data-signpick=${i} aria-pressed=${i === signIdx} class=${`flex flex-col items-center gap-1.5 py-3 rounded-[var(--ms-r-in)] transition-colors ${i === signIdx ? "bg-[var(--app-tint)]" : "text-base-content/80"}`} onClick=${() => choose(i)} key=${i}>
          <${Sign} i=${i} cls="w-6 h-6" />
          <span class="text-sm truncate max-w-full">${(t.signs || "").split("|")[i] || ""}</span>
        </button>`)}
      </div>
  </${Sheet}>`;
}
