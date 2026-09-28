import { html } from "htm/preact";
import { Fragment } from "preact";
import { useState, useRef, useEffect } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { VPS_PROXY } from "/_rt/feed.js";
import { gate } from "/_rt/gate.js";
import { Island, Panel } from "/_rt/ui.js";
import { Chooser, Camera, mockArt, toDataURL } from "/_rt/intake.js";
import { Scramble } from "/_rt/skeleton.js";
import { promptHandoff, editHandoff } from "./handoff.js";
import { usePromptHistory, HistorySheet } from "./history.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const buzz = (ms = 8) => { try { navigator.vibrate?.(ms); } catch { } };
const ASK = {
  uk: { read: "Опиши це зображення українською: 2–3 речення про те, що на ньому і який настрій, потім окремим рядком до 5 ключових тегів через кому.", q: "Відповідай українською, коротко і по суті, спираючись лише на це зображення. Питання: " },
  en: { read: "Describe this image in English: 2–3 sentences on what is in it and its mood, then, on a separate line, up to 5 key tags separated by commas.", q: "Answer in English, briefly and to the point, from this image alone. Question: " },
};
const gateText = "Гірське озеро на світанку: дзеркальна вода віддзеркалює рожеві піки, над берегом стелиться легкий туман. Тиша, прохолода і золоте світло перших променів.\n\nгори, озеро, світанок, туман, тиша";
const tool = "btn btn-ghost btn-sm btn-circle text-base-content/70";
const oneLine = (s) => s.replace(/\s*\n+\s*/g, ". ").replace(/\.\s*\./g, ".").trim();

export function describe({ S, toast }) {
  const t = useStore(S.t), loc = useStore(S.locale), screen = useStore(S.screen);
  const [phase, setPhase] = useState(gate ? "done" : "empty");
  const [srcUrl, setSrcUrl] = useState(gate ? mockArt(5) : null);
  const [question, setQuestion] = useState("");
  const [text, setText] = useState(gate ? gateText : "");
  const [error, setError] = useState(null);
  const runRef = useRef(0), blobs = useRef([]);
  const [hist, remember] = usePromptHistory("read");

  const own = (url) => { if (url?.startsWith?.("blob:")) blobs.current.push(url); return url; };
  useEffect(() => () => { blobs.current.forEach((u) => { try { URL.revokeObjectURL(u); } catch { } }); }, []);

  const loadSource = (url) => { runRef.current++; setText(""); setError(null); setQuestion(""); setSrcUrl(own(url)); setPhase("ready"); };
  const backToChooser = () => { runRef.current++; setText(""); setError(null); setPhase("empty"); };
  const fail = (run, key) => { if (run === runRef.current) { setError(key); setPhase("error"); } };

  const read = async () => {
    if (!srcUrl || phase === "reading") return;
    const run = ++runRef.current, q = question.trim();
    buzz(); setError(null); setText(""); setPhase("reading");
    if (q) remember(q);
    if (gate) { await sleep(120); if (run === runRef.current) { setText(q ? `${gateText.split("\n")[0]}` : gateText); setPhase("done"); } return; }
    let image;
    try { image = (await toDataURL(srcUrl)).data; } catch { return fail(run, "dsFailed"); }
    if (run !== runRef.current) return;
    if (image.length > 9_000_000) return fail(run, "eBig");
    const ask = ASK[loc] || ASK.en;
    try {
      const r = await fetch(`${VPS_PROXY}/vision`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ image, prompt: q ? ask.q + q : ask.read, maxTokens: 400 }) });
      if (run !== runRef.current) return;
      if (!r.ok) return fail(run, r.status === 429 ? "eRate" : r.status === 413 ? "eBig" : "dsFailed");
      const j = await r.json().catch(() => null);
      if (run !== runRef.current) return;
      const out = String(j?.text || "").trim();
      if (!out) return fail(run, "dsFailed");
      setText(out); setPhase("done"); buzz(12);
    } catch { fail(run, "eNetwork"); }
  };

  const copy = async () => { try { await navigator.clipboard.writeText(text); toast?.(T(t, "copied")); } catch { toast?.(T(t, "eNetwork")); } };
  const toMake = () => { buzz(); promptHandoff.set(oneLine(text)); S.tab.set("make"); };
  const toEdit = () => { buzz(); editHandoff.set({ url: srcUrl, prompt: oneLine(text) }); S.tab.set("edit"); };
  const askAgain = () => { buzz(); setText(""); setError(null); setPhase("ready"); };
  const onKey = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); read(); } };

  const [body, tags] = (() => { const lines = text.trim().split(/\n+/); const last = lines[lines.length - 1] || ""; const isTags = lines.length > 1 && last.split(",").length >= 3 && last.length < 120; return isTags ? [lines.slice(0, -1).join("\n"), last.split(",").map((s) => s.trim()).filter(Boolean)] : [text, []]; })();
  const showStage = phase === "ready" || phase === "reading" || phase === "done" || phase === "error";
  const placeholder = T(t, "dsPlaceholder");

  return html`<div class="ms-stage z-20 bg-base-100 flex flex-col" data-phase=${phase}>
    <${HistorySheet} id="hist-read" open=${screen === "hist"} onClose=${() => S.screen.set(null)} items=${hist} onPick=${setQuestion} t=${t} locale=${loc} />

    ${""}
    <div class=${`relative flex-1 min-h-0 overflow-hidden flex items-center justify-center ${phase === "empty" ? "bg-base-100" : "bg-black"}`}>
      ${phase === "empty" ? html`<${Chooser} loc=${loc} onPick=${loadSource} onCamera=${() => { buzz(); setPhase("camera"); }} />` : null}
      ${phase === "camera" ? html`<${Camera} loc=${loc} reason=${T(t, "dsPrimeReason")} privacy=${T(t, "primePrivacy")}
        onCapture=${(d) => { buzz(14); loadSource(d); }} onClose=${backToChooser} onSettings=${() => S.screen.set("perms")} />` : null}

      ${showStage && srcUrl ? html`<${Fragment}>
        <img data-result src=${srcUrl} alt="" class=${`absolute inset-0 w-full h-full object-contain transition-opacity duration-300 ${phase === "reading" ? "opacity-40" : "opacity-100"}`} />
        <button data-new aria-label=${T(t, "newImg")} class="absolute top-3 left-3 btn btn-circle btn-sm im-chip border-0" onClick=${backToChooser}>${Icon("lucide:x", "text-base")}</button>
      </${Fragment}>` : null}
    </div>

    ${""}
    ${phase === "reading" || phase === "done" ? html`<div class="shrink-0 p-[var(--ms-gap)] max-h-[45%] flex flex-col min-h-0">
    <${Panel} data-read className="w-full max-w-xl mx-auto min-h-0 overflow-y-auto">
      ${phase === "reading"
        ? html`<div role="status" aria-busy="true" class="flex flex-col gap-2 text-sm text-muted">${[26, 30, 22, 14].map((n, i) => html`<div key=${i} class="truncate"><${Scramble} len=${n} /></div>`)}</div>`
        : html`<${Fragment}>
          <p data-text class="text-[0.95rem] leading-relaxed whitespace-pre-line">${body}</p>
          ${tags.length ? html`<div data-tags class="flex flex-wrap gap-1.5">${tags.map((tg) => html`<span key=${tg} class="badge badge-ghost rounded-full font-mono text-[length:var(--ms-label)] uppercase tracking-wider">${tg}</span>`)}</div>` : null}
          <div class="flex gap-2">
            <button data-to-make class="btn btn-sm btn-primary flex-1 min-w-0 rounded-full gap-1.5" onClick=${toMake}>${Icon("lucide:sparkles", "text-base shrink-0")}<span class="truncate">${T(t, "toMake")}</span></button>
            <button data-to-edit class="btn btn-sm flex-1 min-w-0 rounded-full gap-1.5" onClick=${toEdit}>${Icon("lucide:wand-sparkles", "text-base shrink-0")}<span class="truncate">${T(t, "toEdit")}</span></button>
          </div>
          <div class="flex justify-center gap-2">
            <button data-copy class="btn btn-ghost btn-sm rounded-full gap-1.5" onClick=${copy}>${Icon("lucide:copy", "text-base")}${T(t, "copy")}</button>
            <button data-ask class="btn btn-ghost btn-sm rounded-full gap-1.5" onClick=${askAgain}>${Icon("lucide:message-circle-question", "text-base")}${T(t, "askMore")}</button>
          </div>
        </${Fragment}>`}
    <//>
    </div>` : null}

    ${phase === "ready" || phase === "error" ? html`<div class="shrink-0 p-[var(--ms-gap)]">
    <${Island} className="w-full max-w-xl mx-auto flex flex-col gap-[var(--ms-gap)]">
      <div data-field class="sf-inset rounded-[var(--ms-r-in)] p-2 flex flex-col gap-1 focus-within:ring-1 focus-within:ring-base-content/25">
        <textarea id="question" rows="2" aria-label=${placeholder}
          class="w-full resize-none bg-transparent border-0 outline-none px-2 pt-1 text-[0.95rem] leading-snug text-base-content placeholder:text-muted"
          placeholder=${placeholder} value=${question} onInput=${(e) => setQuestion(e.target.value)} onKeyDown=${onKey}></textarea>
        <div class="flex items-center gap-0.5">
          <button data-new aria-label=${T(t, "newImg")} class=${tool} onClick=${backToChooser}>${Icon("lucide:image-plus", "text-lg")}</button>
          <button data-history aria-label=${T(t, "history")} class=${tool} onClick=${() => S.screen.set("hist")}>${Icon("lucide:history", "text-lg")}</button>
          <div class="flex-1"></div>
          <button data-read-go class="btn btn-primary btn-sm rounded-full gap-1.5 shrink-0" onClick=${read}>${Icon("lucide:scan-eye", "text-base")}${T(t, question.trim() ? "answer" : phase === "error" ? "dsAgain" : "readBtn")}</button>
        </div>
      </div>
      ${phase === "error" ? html`<p data-error role="alert" class="text-sm text-error px-1">${T(t, error || "dsFailed")}</p>` : null}
    <//>
    </div>` : null}
  </div>`;
}
