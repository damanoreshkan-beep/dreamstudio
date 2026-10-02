// After a successful deploy: tell the owner, in the DreamStudio bot, what changed for people.
//   deno run -A tools/announce.mjs <changelog as it was live BEFORE this deploy> [--dry]
// New = entries of apps/store/changelog.json the live one did not have. No new entry, no message: a deploy
// that changed nothing a person can notice is not news. Needs TG_BOT_TOKEN and TG_CHAT_ID (repo secrets).
//   deno run -A tools/announce.mjs --snapshot <file>    save the live changelog before the deploy replaces it
const SITE = "https://dreamstudio.mooo.com";
const dry = Deno.args.includes("--dry");
if (Deno.args.includes("--snapshot")) {
  let body = "[]";
  try { const r = await fetch(`${SITE}/store/changelog.json`, { cache: "no-store" }); if (r.ok) body = JSON.stringify(await r.json()); } catch { }
  await Deno.writeTextFile(Deno.args.find((a) => !a.startsWith("--")), body);
  console.log(`announce: the live changelog has ${JSON.parse(body).length} entr${JSON.parse(body).length === 1 ? "y" : "ies"}`);
  Deno.exit(0);
}
const read = async (p) => { try { const j = JSON.parse(await Deno.readTextFile(p)); return Array.isArray(j) ? j : []; } catch { return []; } };
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

const live = new Set((await read(Deno.args.find((a) => !a.startsWith("--")) || "")).map((e) => e.id));
const fresh = (await read("apps/store/changelog.json")).filter((e) => e?.id && !live.has(e.id)).slice(0, 10).reverse();
if (!fresh.length) { console.log("announce: nothing new for people in this deploy"); Deno.exit(0); }

const apps = await read("apps/store/apps.json");
const titleOf = (id) => (id === "store" ? "DreamStudio" : apps.find((a) => a.id === id)?.titles?.uk || id);
const text = `<b>DreamStudio · оновлення</b>\n\n` + fresh.map((e) => `<b>${esc(titleOf(e.app))}</b>\n${esc(e.uk)}`).join("\n\n");
const targets = [...new Set(fresh.map((e) => e.app))].slice(0, 3);
const keyboard = targets.map((id) => [{ text: titleOf(id), url: `${SITE}/${id}/` }]);

if (dry) { console.log(text); console.log(JSON.stringify(keyboard)); Deno.exit(0); }
const token = Deno.env.get("TG_BOT_TOKEN"), chat = Deno.env.get("TG_CHAT_ID");
if (!token || !chat) { console.log("announce: TG_BOT_TOKEN / TG_CHAT_ID are not set — skipped"); Deno.exit(0); }
const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ chat_id: chat, text, parse_mode: "HTML", disable_web_page_preview: true, reply_markup: { inline_keyboard: keyboard } }),
});
const j = await r.json().catch(() => ({}));
if (!j.ok) { console.error(`announce: Telegram refused — ${j.description || r.status}`); Deno.exit(1); }
console.log(`announce: ${fresh.length} entr${fresh.length === 1 ? "y" : "ies"} sent`);
