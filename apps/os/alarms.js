import { html } from "htm/preact";
import { useState, useEffect } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { Panel, Segmented } from "/_rt/ui.js";
import { shell, ERR } from "/_rt/shell.js";
import { Icon, LABEL } from "./ui.js";

const MINUTES = [1, 5, 15, 60];

export function alarms({ S, t, toast }) {
  const loc = useStore(S.locale);
  const [list, setList] = useState(null);
  const [mins, setMins] = useState(5);
  const [busy, setBusy] = useState(false);
  const why = shell.whyCapability("alarm");

  const refresh = async () => {
    if (why) { setList([]); return; }
    try { const r = await shell.call("alarm.list", {}); setList(r.alarms || []); }
    catch { setList([]); }
  };
  useEffect(() => { refresh(); }, []);

  const schedule = async () => {
    if (busy || why) return;
    setBusy(true);
    try {
      const at = Date.now() + mins * 60_000;
      const r = await shell.call("alarm.set", { id: `os-${at}`, at, title: T(t, "probeAlarmTitle"), body: T(t, "probeAlarmBody") });
      toast?.(r.exact ? T(t, "alExact") : T(t, "alInexact"));
      await refresh();
    } catch (e) { toast?.(e?.code || T(t, "alFailed")); } finally { setBusy(false); }
  };

  const drop = async (id) => {
    try { await shell.call("alarm.cancel", { id }); await refresh(); } catch { toast?.(T(t, "alFailed")); }
  };

  return html`<div data-alarms data-blocked=${why ? "1" : "0"} data-mins=${mins} class="flex flex-col gap-[var(--ms-gap)] pt-1">
    ${why ? html`<${Panel} data-alarm-blocked>
      <div class="flex items-center gap-3">
        ${Icon("lucide:smartphone", "text-xl text-muted")}
        <span class="text-sm text-muted">${why === ERR.staleBridge ? T(t, "stStale") : T(t, "stNone")}</span>
      </div>
    <//>` : html`<${Panel} title=${T(t, "alNew")}>
      ${""}
      <${Segmented} attr="data-min" label=${T(t, "alNew")} value=${mins} onChange=${setMins}
        items=${MINUTES.map((m) => ({ id: m, label: `${m} ${T(t, "alMin")}` }))} />
      <button id="al-set" class="btn btn-sm btn-primary rounded-full w-full gap-2" disabled=${busy} onClick=${schedule}>
        ${Icon("lucide:alarm-clock-plus")}<span>${T(t, "alSet")}</span>
      </button>
    <//>`}

    <${Panel} title=${T(t, "alPending")}>
      ${list === null ? null
        : list.length === 0 ? html`<div data-alarm-empty class="py-3 text-sm text-muted">${T(t, "alNone")}</div>`
        : list.map((a) => html`<div key=${a.id} data-alarm=${a.id} class="flex items-center gap-3 py-2.5 border-b border-base-content/10 last:border-0">
            ${Icon("lucide:alarm-clock", "text-base text-primary shrink-0")}
            <div class="min-w-0 flex-1">
              <div class="text-sm truncate">${a.title}</div>
              <div class=${`${LABEL} text-muted tabular-nums`}>${new Date(a.at).toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit" })}</div>
            </div>
            <button class="btn btn-sm btn-circle btn-ghost shrink-0" data-drop=${a.id}
                aria-label=${`${T(t, "alDrop")} ${a.title}`} onClick=${() => drop(a.id)}>
              ${Icon("lucide:x", "text-base")}
            </button>
          </div>`)}
    <//>
  </div>`;
}
