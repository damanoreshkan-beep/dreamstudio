// coinsheet.js — THE TOP-UP SHEET, the farm wallet's one way in for bought coins (promoted from blackout 2026-09-15,
// when afterdark's characters started costing coins too). The packs (rt/coins.js), paid in Telegram Stars; the edge
// credits the account and the app's wallet (rt/wallet.js) reads the new balance — `wallet.purchasing()` makes it
// look while the payment lands. The strings are the app's own i18n keys: topUpTitle · topUpSub · topUpHint ·
// bestValue · opened · payCancel · payFailed · eSignIn.
import { html } from "htm/preact";
import { useState } from "preact/hooks";
import { Sheet } from "@microspec/core/runtime/ui.js";
import { T } from "@microspec/core/runtime/i18n.js";
import { gate } from "@microspec/core/runtime/gate.js";
import { PACKS, bestValue, buyCoins } from "./coins.js";

/** `wallet` is the app's makeWallet(); `coinClass` tints the coin count (the app's own gold). */
export function CoinSheet({ t, loc, open, onClose, wallet, coinClass = "text-warning" }) {
  const [busy, setBusy] = useState(""), [note, setNote] = useState("");
  const best = bestValue();
  const buy = async (sku) => {
    if (busy || gate) return;
    setBusy(sku); setNote("");
    const r = await buyCoins(sku);
    if (r === "paid" || r === "opened") wallet.purchasing();
    if (r === "paid") { setNote(""); onClose(); }
    else setNote(r === "opened" ? "opened" : r === "cancelled" ? "payCancel" : r === "eSignIn" ? "eSignIn" : "payFailed");
    setBusy("");
  };
  return html`<${Sheet} id="coin-sheet" open=${open} onClose=${onClose} title=${T(t, "topUpTitle")} subtitle=${T(t, "topUpSub")} icon="lucide:star" locale=${loc}>
    <div data-coin-form class="flex flex-col gap-3">
      <div data-coin-packs class="grid grid-cols-3 gap-2">
        ${PACKS.map((p) => html`<button key=${p.sku} data-pack=${p.sku} type="button" disabled=${!!busy} onClick=${() => buy(p.sku)}
          class=${`relative flex flex-col items-center gap-1 rounded-2xl p-3 border active:scale-[.97] transition-transform ${p.sku === best ? "border-warning" : "border-base-content/10"}`}>
          ${p.sku === best ? html`<span class="absolute -top-2 badge badge-warning badge-sm font-mono uppercase text-[9px] tracking-wider">${T(t, "bestValue")}</span>` : null}
          <span class=${`font-mono tabular-nums text-2xl font-bold ${coinClass}`}>${p.coins}</span>
          <span class="font-mono text-[0.65rem] uppercase tracking-wider text-base-content/70"><iconify-icon icon="lucide:circle-dollar-sign" class="align-[-1px]"></iconify-icon></span>
          <span class="font-mono tabular-nums text-sm flex items-center gap-1"><iconify-icon icon="lucide:star" class="text-warning"></iconify-icon>${p.stars}</span>
        </button>`)}
      </div>
      <p class="text-[0.8rem] text-base-content/70">${T(t, "topUpHint")}</p>
      ${note ? html`<p data-coin-note class=${`text-[0.85rem] ${note === "opened" ? "text-base-content" : "text-error"}`} aria-live="polite">${T(t, note)}</p>` : null}
    </div>
  </${Sheet}>`;
}
