// coins.js — BUYING COINS WITH TELEGRAM STARS (blackout, 2026-09-13; owner: «кнопку поповнити баланс зірками»).
// The packs are the edge's (stars.js COIN_PACKS); the invoice is minted for the sealed session and paid in
// Telegram — inside a Mini App through openInvoice, anywhere else by opening the invoice link (Telegram takes it)
// — and the webhook writes the purchase to the account. The app then CLAIMS: /feed/stars/claim hands over the
// coins not yet credited, once. Claim on boot and whenever the page comes back into view: a payment finished
// while the app was in the background is not lost.
import { VPS_PROXY } from "@microspec/core/runtime/feed.js";
import { gate } from "@microspec/core/runtime/gate.js";

// the Mini App SDK when the page runs inside Telegram (runtime/tma.js loads it at boot); tma.js itself is not a
// package export of core 1.2.69, so the object is read off the window here
const tg = () => { try { return (typeof window !== "undefined" && window.Telegram && window.Telegram.WebApp) || null; } catch { return null; } };

/** The packs the sheet lists, in the edge's order (mirrored here so the sheet renders before any call). */
export const PACKS = [
  { sku: "c500", coins: 500, stars: 25 },
  { sku: "c1500", coins: 1500, stars: 60 },
  { sku: "c5000", coins: 5000, stars: 150 },
];
/** A pack by sku, or null. Pure. */
export const packOf = (sku) => PACKS.find((p) => p.sku === sku) || null;
/** Stars per coin, for the sheet's "best value" mark: the pack with the lowest ratio. Pure. */
export const bestValue = (packs = PACKS) => packs.reduce((b, p) => (!b || p.stars / p.coins < b.stars / b.coins ? p : b), null)?.sku || "";

const H = { "content-type": "application/json" };

/**
 * Start a purchase. Resolves "paid" (Mini App: Telegram's own callback) | "opened" (the link went to Telegram; claim
 * later) | "cancelled" | "failed" | "eSignIn" | "error".
 */
export async function buyCoins(sku) {
  if (gate || !packOf(sku)) return "error";
  let link;
  try {
    const r = await fetch(`${VPS_PROXY}/stars/invoice`, { method: "POST", headers: H, body: JSON.stringify({ sku }) });
    if (r.status === 401) return "eSignIn";
    const j = await r.json().catch(() => ({}));
    link = j.link;
  } catch { return "error"; }
  if (!link) return "error";
  const w = tg();
  if (w && w.initData && w.openInvoice) return await new Promise((ok) => { try { w.openInvoice(link, (s) => ok(s || "failed")); } catch { ok("error"); } });
  try { const win = window.open(link, "_blank", "noopener"); if (!win) location.href = link; } catch { location.href = link; }
  return "opened";
}

// the sealed session's id where the runtime keeps it — no session, no claim (the edge would answer 401 anyway)
const sidNow = () => { try { return localStorage.getItem("ms:gh:sid") || ""; } catch { return ""; } };

/** The coins paid for and not yet credited: {coins, purchases}; {coins: 0} offline, signed out, or under the gate. */
export async function claimCoins() {
  if (gate || !sidNow()) return { coins: 0, purchases: 0 };
  try {
    const r = await fetch(`${VPS_PROXY}/stars/claim`, { method: "POST", headers: H, body: "{}" });
    if (!r.ok) return { coins: 0, purchases: 0 };
    const j = await r.json().catch(() => ({}));
    return { coins: Number(j.coins) || 0, purchases: Number(j.purchases) || 0 };
  } catch { return { coins: 0, purchases: 0 }; }
}

/**
 * Keep a wallet in sync with the account: claim now, and again each time the page becomes visible or gains
 * focus (the payment finished in Telegram while this page was behind it). `credit(n)` adds to the wallet.
 * Returns the teardown.
 */
export function watchPurchases(credit) {
  if (gate || typeof document === "undefined") return () => {};
  let busy = false;
  const tick = async () => { if (busy) return; busy = true; try { const { coins } = await claimCoins(); if (coins > 0) credit(coins); } finally { busy = false; } };
  const onVis = () => { if (document.visibilityState === "visible") tick(); };
  setTimeout(tick, 0);
  document.addEventListener("visibilitychange", onVis); addEventListener("focus", tick);
  return () => { document.removeEventListener("visibilitychange", onVis); removeEventListener("focus", tick); };
}
