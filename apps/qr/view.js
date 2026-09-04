// QR Scanner — safe-link-preview philosophy. A QR hides where it points, and that is exactly how quishing
// works. So this never auto-opens: it decodes, then holds the result in a preview DIRECTLY BELOW the camera
// aperture — the host that matters, the full URL, and a colour-coded verdict — and lets YOU decide. The
// safety logic (/_rt/urlsafe.js, unit-tested) runs the same on the phone and in the headless gate, where
// there is no camera so we seed a decoded string and analyse it. Decode is native BarcodeDetector first;
// jsQR (bundled, offline, same-origin) is the lazy fallback for browsers without it (iOS Safari, Firefox).
import { html } from "htm/preact";
import { Fragment } from "preact";
import { useState, useEffect, useRef } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { camera, haptic } from "/_rt/sensors.js";
import { CameraPrime } from "/_rt/camprime.js";
import { analyzeQR } from "/_rt/urlsafe.js";
import { MOCK, gate } from "/_rt/gate.js";
import { Island } from "/_rt/ui.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
// `length:` — a bare var() in text-[…] reads as a COLOUR to Tailwind v4 and the size falls back to the parent's
const MONO = "font-mono text-[length:var(--ms-label)] uppercase tracking-wider";
const LABEL = `${MONO} text-base-content/70`;
// Gate/mock seed: a real-world scary-but-common code — a shortener, which HIDES its destination → a caution.
// ?mock=<raw> seeds any string, so the danger/wifi/safe states are all shootable.
const seedRaw = MOCK && MOCK !== "1" && MOCK !== "" ? MOCK : "https://bit.ly/3xR2k9q";

// decode(video, canvas) → the raw string in frame, or null. Draw once, try the native detector, else jsQR.
let _detector, _jsQR, _noBD = false;
async function decode(video, canvas) {
  const w = 360, h = Math.max(240, Math.round(360 * ((video.videoHeight || 4) / (video.videoWidth || 3))));
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(video, 0, 0, w, h);
  if (!_noBD && "BarcodeDetector" in window) {
    try { _detector ||= new window.BarcodeDetector({ formats: ["qr_code"] }); const c = await _detector.detect(canvas); return c[0]?.rawValue || null; }
    catch { _noBD = true; }                                            // detector unusable on this device → jsQR from here on
  }
  if (!_jsQR) _jsQR = (await import("./jsqr.js")).default;
  const res = _jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: "attemptBoth" });
  return res?.data || null;
}

const OPENABLE = new Set(["url", "scheme", "tel", "mailto", "sms", "geo"]);   // never "code" (would execute), text, wifi, contact
const KIND_KEY = { wifi: "kWifi", tel: "kTel", mailto: "kMailto", sms: "kSms", geo: "kGeo", contact: "kContact", text: "kText", code: "kCode", scheme: "kScheme" };
const FLAG_KEY = { insecure: "fInsecure", shortener: "fShortener", "mixed-script": "fMixed", userinfo: "fUserinfo", "code-scheme": "fCode", punycode: "fPunycode", "ip-host": "fIp", "no-scheme": "fNoScheme", "non-web-scheme": "fNonWeb", "otp-secret": "fOtp" };
// The frame's corners sit ON the camera feed — a picture, never the theme — so the idle frame is white in both
// themes; a verdict re-inks them with the theme's meaning colour (success / warning / error).
const EDGE_IDLE = "#fff";
const VERDICT = {
  safe: { key: "vSafe", icon: "lucide:shield-check", chip: "bg-success/15 text-success", edge: "var(--color-success)" },
  caution: { key: "vCaution", icon: "lucide:shield-alert", chip: "bg-warning/15 text-warning", edge: "var(--color-warning)" },
  danger: { key: "vDanger", icon: "lucide:shield-x", chip: "bg-error/15 text-error", edge: "var(--color-error)" },
  info: { key: "vInfo", icon: "lucide:info", chip: "bg-base-content/10 text-base-content/70", edge: EDGE_IDLE },
};

export function qr({ S, toast }) {
  const t = useStore(S.t), loc = useStore(S.locale);
  const [result, setResult] = useState(gate ? analyzeQR(seedRaw) : null);
  const [err, setErr] = useState(null);
  const [enabled, setEnabled] = useState(gate);
  const videoRef = useRef(), canvasRef = useRef(), scanRef = useRef(!gate);
  useEffect(() => { scanRef.current = !result; }, [result]);          // a held result pauses sampling; "scan again" resumes

  useEffect(() => {
    if (gate || !enabled) return;
    if (!camera.supported) { setErr("unsupported"); return; }
    let live = true, timer = null, stop = () => {}, busy = false;
    const tick = async () => {
      const v = videoRef.current, cv = canvasRef.current;
      if (!v || !cv || v.readyState < 2 || !scanRef.current || busy) return;
      busy = true;
      try { const raw = await decode(v, cv); if (raw && live && scanRef.current) { scanRef.current = false; setResult(analyzeQR(raw)); haptic.bump?.(); } }
      catch { /* transient decode */ } finally { busy = false; }
    };
    camera.start(videoRef.current, (e) => { if (live) setErr(e); }).then((s) => { if (!live) { s(); return; } stop = s; timer = setInterval(tick, 250); });
    return () => { live = false; clearInterval(timer); stop(); };
  }, [enabled]);

  const openIt = () => { if (!result) return; try { if (result.kind === "url") window.open(result.url, "_blank", "noopener,noreferrer"); else location.href = result.raw; } catch { /* blocked */ } };
  const copyIt = async () => { const v = result?.url || result?.value || result?.raw || ""; try { await navigator.clipboard.writeText(v); toast?.(T(t, "copied")); } catch { /* clipboard blocked */ } };
  const again = () => setResult(null);

  const V = result ? VERDICT[result.verdict] : null;
  const primary = result && (result.host || result.ssid || result.value || result.raw) || "";
  const secondary = result && result.host ? (result.url || result.raw) : null;
  const openable = result && OPENABLE.has(result.kind);
  const edge = V ? V.edge : EDGE_IDLE;

  return html`<div class="ms-stage z-20 flex flex-col" data-verdict=${result ? result.verdict : "idle"} data-kind=${result ? result.kind : ""}>
    <!-- camera aperture -->
    ${/* Everything in the aperture sits on the FEED: the black ground, the half-black scrim around the frame
         (a box-shadow spread, not a material shadow) and the corner marks are picture colours in both themes. */""}
    <div class="relative flex-1 min-h-0 overflow-hidden bg-black flex items-center justify-center">
      ${enabled && !err && !gate ? html`<video ref=${videoRef} autoplay muted playsinline class="absolute inset-0 w-full h-full object-cover"></video>` : null}
      ${/* the gate has no camera: a flat neutral frame stands in for the feed */""}
      ${gate ? html`<div class="absolute inset-0 bg-neutral" aria-hidden="true"></div>` : null}
      <canvas ref=${canvasRef} class="hidden"></canvas>
      ${enabled && !err ? html`<div class="relative" data-aperture style="width:min(64vw,15rem);aspect-ratio:1">
        <div class="absolute inset-0 rounded-[var(--ms-r)]" style=${`box-shadow:0 0 0 100vmax rgba(0,0,0,.5)`}></div>
        ${[["top-0 left-0", "border-t-[3px] border-l-[3px] rounded-tl-[var(--ms-r)]"], ["top-0 right-0", "border-t-[3px] border-r-[3px] rounded-tr-[var(--ms-r)]"], ["bottom-0 left-0", "border-b-[3px] border-l-[3px] rounded-bl-[var(--ms-r)]"], ["bottom-0 right-0", "border-b-[3px] border-r-[3px] rounded-br-[var(--ms-r)]"]]
          .map(([pos, b]) => html`<div class=${`absolute w-8 h-8 ${pos} ${b} transition-colors`} style=${`border-color:${edge}`} key=${pos}></div>`)}
      </div>` : null}
    </div>

    <!-- safe preview — an island directly under the aperture -->
    <div class="shrink-0 p-[var(--ms-gap)]">
      <${Island} tag="section" data-preview className="w-full max-w-md mx-auto flex flex-col gap-2">
      ${result ? html`<${Fragment}>
        <div class="flex items-center gap-2">
          <span class=${`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full ${MONO} ${V.chip}`}>${Icon(V.icon, "text-sm")}${T(t, V.key)}</span>
          ${KIND_KEY[result.kind] ? html`<span class=${`${LABEL} ml-auto truncate`}>${T(t, KIND_KEY[result.kind])}</span>` : null}
        </div>
        <div data-live class="min-w-0">
          <div class="font-mono font-bold text-lg leading-tight truncate">${primary}</div>
          ${secondary ? html`<div class="font-mono text-xs text-muted break-all line-clamp-2 mt-0.5">${secondary}</div>` : null}
        </div>
        ${result.flags.length ? html`<div class="flex flex-wrap gap-1.5">${result.flags.map((f) => html`<span class=${`text-sm px-2 py-0.5 rounded-full ${f.level === "danger" ? "bg-error/15 text-error" : "bg-warning/15 text-warning"}`} key=${f.code}>${T(t, FLAG_KEY[f.code] || "vInfo")}</span>`)}</div>` : null}
        <div class="flex gap-2 pt-0.5">
          ${openable ? html`<button data-open class=${`btn btn-sm flex-1 gap-1.5 ${result.verdict === "danger" ? "btn-error" : result.verdict === "caution" ? "btn-warning" : "btn-primary"}`} onClick=${openIt}>${Icon("lucide:external-link", "text-base")}${T(t, "open")}</button>` : null}
          <button data-copy class=${`btn btn-sm btn-outline gap-1.5 ${openable ? "" : "flex-1"}`} onClick=${copyIt}>${Icon("lucide:copy", "text-base")}${T(t, "copy")}</button>
          <button data-again class="btn btn-sm btn-ghost btn-square" aria-label=${T(t, "again")} onClick=${again}>${Icon("lucide:refresh-cw", "text-base")}</button>
        </div>
      </${Fragment}>` : html`<div data-live class="font-mono text-muted text-center py-3 select-none">—</div>`}
      <//>
    </div>

    ${!enabled || err ? html`<${CameraPrime} loc=${loc} reason=${T(t, "primeReason")} onEnable=${() => setEnabled(true)} onSettings=${() => S.screen.set("perms")} denied=${err === "denied"} unavailable=${err === "unavailable" || err === "unsupported"} />` : null}
  </div>`;
}
