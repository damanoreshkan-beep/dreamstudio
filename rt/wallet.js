// wallet.js — THE FARM WALLET, the client half (2026-09-15). One balance per account, kept and moved by the edge
// (/feed/wallet — its prices, its ledger, its caps); every app that earns or spends coins binds this module with
// its own id. The browser holds a DISPLAY copy and nothing else: nothing here adds or takes a coin on its own —
// a purchase, a run's coins and a character's price are all the edge's answer, and the atom repaints from it.
//
// Signed out there is no wallet: `signedIn: false`, balance 0, nothing owned but what is free. A guest plays;
// the coins of that run are not kept (owner, 2026-09-15). Under the gate the wallet is a fixed LOCAL one (no
// network in CI), so the e2e still walks a purchase end to end through the same calls.
import { atom } from "nanostores";
import { VPS_PROXY } from "@microspec/core/runtime/feed.js";
import { session } from "@microspec/core/runtime/auth.js";
import { gate } from "@microspec/core/runtime/gate.js";
import { report } from "@microspec/core/runtime/telemetry.js";

const H = { "content-type": "application/json" };
const sidNow = () => { try { return localStorage.getItem("ms:gh:sid") || ""; } catch { return ""; } };

// a buy's outcome from an edge status
const buyOutcome = (status) => (status === 200 ? "ok" : status === 402 ? "poor" : status === 401 ? "eSignIn" : "error");

/**
 * The wallet an app shows. `app` is its id in the edge's catalogue; `gateBalance` seeds the local wallet under the
 * gate. Returns {$wallet, $bought, refresh, buy, startRun, finishRun, purchasing, owns}; boots itself (refresh on
 * load, on every session change, and whenever the page comes back into view).
 */
export function makeWallet(app, { gateBalance = 0 } = {}) {
  const $wallet = atom({ ready: gate, signedIn: gate, balance: gate ? gateBalance : 0, owned: [] });
  const $bought = atom(0);   // the coins a Stars purchase just brought, for the toast
  const set = (patch) => $wallet.set({ ...$wallet.get(), ...patch });
  const call = (route, body = {}) => fetch(`${VPS_PROXY}/wallet/${route}`, { method: "POST", headers: H, body: JSON.stringify({ app, ...body }) });
  let awaitingPurchase = 0;   // a deadline: while it runs, a balance that grows is a purchase landing

  async function refresh() {
    if (gate) return;
    if (!sidNow()) { set({ ready: true, signedIn: false, balance: 0, owned: [] }); return; }
    try {
      const r = await call("me");
      if (r.status === 401) { set({ ready: true, signedIn: false, balance: 0, owned: [] }); return; }
      if (!r.ok) return;
      const j = await r.json();
      const was = $wallet.get(), balance = Math.max(0, Number(j.balance) || 0);
      if (was.ready && was.signedIn && balance > was.balance && Date.now() < awaitingPurchase) { $bought.set(balance - was.balance); awaitingPurchase = 0; }
      set({ ready: true, signedIn: true, balance, owned: Array.isArray(j.owned) ? j.owned.map(String) : [] });
    } catch { /* offline: the last answer stays on screen */ }
  }

  /** Does the viewer own `item` (or is it free — `price` 0)? */
  const owns = (item, price) => price === 0 || $wallet.get().owned.includes(item);

  /** Buy an item by id: "ok" | "poor" | "eSignIn" (the runtime's sign-in wall is already up) | "error". `price` is display data, used only by the gate's local wallet. */
  async function buy(item, price) {
    if (owns(item, price)) return "ok";
    if (gate) {
      const w = $wallet.get();
      if (w.balance < price) return "poor";
      set({ balance: w.balance - price, owned: [...w.owned, item] });
      return "ok";
    }
    try {
      const r = await call("buy", { item });
      const j = await r.json().catch(() => ({}));
      if (r.ok) set({ ready: true, signedIn: true, balance: Math.max(0, Number(j.balance) || 0), owned: Array.isArray(j.owned) ? j.owned.map(String) : [] });
      else if (r.status === 402) set({ balance: Math.max(0, Number(j.balance) || 0) });
      return buyOutcome(r.status);
    } catch { return "error"; }
  }

  /** A run starts: a ticket from the edge (a promise of it — the run does not wait), or null for a guest. */
  function startRun() {
    if (gate || !sidNow()) return Promise.resolve(null);
    return call("run").then((r) => (r.ok ? r.json() : null)).then((j) => (j && j.ticket ? String(j.ticket) : null)).catch(() => null);
  }
  /** The run is over: claim its coins. Resolves {granted, kept} — kept false for a guest (nothing is saved). */
  async function finishRun(ticketP, coins) {
    const n = Math.max(0, Math.floor(Number(coins) || 0));
    if (gate) { set({ balance: $wallet.get().balance + n }); return { granted: n, kept: true }; }
    const ticket = await ticketP;
    // every claim reports what happened (logs.sh <app> 1h wallet.earn) — a run whose coins did not land is a
    // missing ticket, a refusal or a thrown call, and the number that tells them apart is here
    if (!ticket) { report("wallet.earn", { app, coins: n, ticket: false, signedIn: !!sidNow() }, "warn"); return { granted: 0, kept: !!sidNow() }; }
    try {
      const r = await call("earn", { ticket, coins: n });
      if (!r.ok) { report("wallet.earn", { app, coins: n, ticket, status: r.status }, "warn"); return { granted: 0, kept: r.status !== 401 }; }
      const j = await r.json();
      set({ balance: Math.max(0, Number(j.balance ?? $wallet.get().balance) || 0) });
      report("wallet.earn", { app, coins: n, ticket, status: 200, granted: j.granted, why: j.why || "" }, "info");
      return { granted: Math.max(0, Number(j.granted) || 0), kept: true };
    } catch (e) { report("wallet.earn", { app, coins: n, ticket, thrown: String(e && e.message || e).slice(0, 80) }, "warn"); return { granted: 0, kept: true }; }
  }

  /** A Stars payment went to Telegram: for the next two minutes a growing balance is announced; look a few times now. */
  function purchasing() {
    awaitingPurchase = Date.now() + 120_000;
    for (const ms of [1500, 4000, 9000, 20000]) setTimeout(refresh, ms);
  }

  if (!gate && typeof document !== "undefined") {
    setTimeout(refresh, 0);   // after /_rt/index.js has installed the sealed fetch that carries the sid
    let seen = sidNow();
    session.listen((s) => { const sid = s ? s.sid : ""; if (sid === seen) return; seen = sid; refresh(); });
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") refresh(); });
    addEventListener("focus", refresh);
  }
  return { $wallet, $bought, refresh, buy, startRun, finishRun, purchasing, owns };
}
