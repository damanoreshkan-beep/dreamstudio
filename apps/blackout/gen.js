// blackout — A RUNNER OF YOUR OWN: the sheet behind the Create card on the skins tab. Words go the afterdark way
// (rt/genchar.js: a picture, then a rigged body); a PHOTO is first read by /feed/vision into the English look the
// picture model needs — the face never reaches the mesh Space. GEN_PRICE coins leave the wallet when the job
// starts and come back on any failure. Runs at module level: a tab switch does not kill it, a reload resumes it.
import { html } from "htm/preact";
import { useEffect, useState } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { Segmented, Sheet } from "/_rt/ui.js";
import { Chooser, Camera, toDataURL } from "/_rt/intake.js";
import { T } from "/_rt/i18n.js";
import { gate } from "/_rt/gate.js";
import { makeGenerator, nameFrom } from "/_rt/genchar.js";
import { GEN_PRICE, coins, spend, refund, addMyChar, $skin, $genLoading, $genPct, $genError, $newChar } from "./state.js";

const gen = makeGenerator({
  jobKey: "blackout:genJob",
  $loading: $genLoading, $pct: $genPct, $error: $genError,
  onDone: (c) => { addMyChar(c); $skin.set(c.id); $newChar.set(c.id); },
  onFail: () => refund(GEN_PRICE),
});
setTimeout(gen.resumeGeneration, 0);   // after /_rt/index.js has installed the sealed fetch

const STAGE_KEY = { look: "gLook", picture: "gPicture", queued: "gQueued", mesh: "gMesh", rig: "gRig", store: "gStore" };
const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

export function GenSheet({ t, loc, open, onClose }) {
  const stage = useStore($genLoading), pct = useStore($genPct), error = useStore($genError);
  const [mode, setMode] = useState("words");
  const [prompt, setPrompt] = useState("");
  const [photo, setPhoto] = useState("");
  const [cam, setCam] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState("human");
  const [, tick] = useState(0);
  useEffect(() => { if (!stage) return; const id = setInterval(() => tick((n) => n + 1), 1000); return () => clearInterval(id); }, [stage]);
  const p = prompt.trim(), canGo = mode === "words" ? !!p : !!photo;
  const go = async () => {
    if (!canGo || stage || gate) return;
    if (coins() < GEN_PRICE) { $genError.set("ePoor"); return; }
    let image = "";
    if (mode === "photo") { try { image = (await toDataURL(photo, 1024)).data; } catch { $genError.set("eFailed"); return; } }
    if (!spend(GEN_PRICE)) { $genError.set("ePoor"); return; }
    const nm = (name.trim() || (mode === "words" ? nameFrom(p) : "") || "—").slice(0, 40);
    gen.generateCharacter(mode === "words" ? { prompt: p, name: nm, kind } : { photo: image, name: nm, kind }).then((c) => { if (c) onClose(); });
  };
  return html`<${Sheet} id="gen-sheet" open=${open} onClose=${onClose} title=${T(t, "genTitle")} subtitle=${T(t, "genSub")} icon="lucide:sparkles" locale=${loc}>
    <div data-gen-form class="flex flex-col gap-3">
      <${Segmented} attr="data-gen-mode" size="sm" label=${T(t, "genTitle")} value=${mode} onChange=${setMode}
        items=${[{ id: "words", label: T(t, "genWords"), icon: "lucide:text" }, { id: "photo", label: T(t, "genPhoto"), icon: "lucide:camera" }]} />
      ${mode === "words"
        ? html`<textarea data-gen-prompt rows="3" value=${prompt} placeholder=${T(t, "genPrompt")} disabled=${!!stage} onInput=${(e) => setPrompt(e.currentTarget.value)} class="textarea textarea-bordered bg-base-100 w-full text-base leading-snug"></textarea>`
        : photo
          ? html`<div class="flex items-center gap-3">
              <img data-gen-photo src=${photo} alt="" class="w-20 h-20 rounded-2xl object-cover bg-base-content/5" />
              <button data-gen-other type="button" class="btn btn-ghost btn-sm rounded-full" disabled=${!!stage} onClick=${() => setPhoto("")}>${T(t, "genOther")}</button>
            </div>`
          : cam
            ? html`<div class="relative h-[52dvh] min-h-[16rem] rounded-2xl overflow-hidden bg-black"><${Camera} loc=${loc} reason=${T(t, "camReason")} privacy=${T(t, "camPrivacy")} onCapture=${(d) => { setPhoto(d); setCam(false); }} onClose=${() => setCam(false)} onSettings=${() => setCam(false)} /></div>`
            : html`<div class="relative h-40 rounded-2xl bg-base-content/5 overflow-hidden"><${Chooser} loc=${loc} onPick=${setPhoto} onCamera=${() => setCam(true)} /></div>`}
      <div class="flex items-center gap-2 flex-wrap">
        <input data-gen-name type="text" maxlength="40" value=${name} placeholder=${T(t, "genName")} disabled=${!!stage} onInput=${(e) => setName(e.currentTarget.value)} class="input input-sm input-bordered bg-base-100 flex-1 min-w-[8rem]" />
        <${Segmented} attr="data-gen-kind" size="sm" variant="ghost" label=${T(t, "kind")} value=${kind} onChange=${setKind}
          items=${[{ id: "human", label: T(t, "kindHuman"), icon: "lucide:user" }, { id: "creature", label: T(t, "kindCreature"), icon: "lucide:ghost" }]} />
      </div>
      ${stage ? html`<div data-gen-progress class="rounded-2xl bg-base-content/5 p-3 flex items-center gap-3">
          <div class="flex-1 min-w-0">
            <div class="text-[0.9rem] leading-tight">${T(t, STAGE_KEY[stage] || "gQueued")}${pct ? ` · ${pct}%` : ""}</div>
            <div class="font-mono text-[0.72rem] text-base-content/70 tabular-nums">${mmss(gen.genElapsed())} · ${T(t, "genHint")}</div>
          </div>
          <button data-gen-cancel type="button" class="btn btn-ghost btn-sm rounded-full" onClick=${gen.cancelGenerate}>${T(t, "genCancel")}</button>
        </div>`
        : html`<button data-gen-go type="button" disabled=${!canGo} onClick=${go} class="btn btn-primary rounded-full gap-2 normal-case">
            <iconify-icon icon="lucide:sparkles"></iconify-icon>${T(t, "genGo")}<span class="font-mono tabular-nums opacity-80">· ${GEN_PRICE}</span>
          </button>`}
      ${error ? html`<p data-gen-error class="text-[0.85rem] text-error" aria-live="polite">${T(t, error)}</p>` : null}
    </div>
  </${Sheet}>`;
}
