const PODS = ["microspec-vpn-p1", "microspec-vpn-p2", "microspec-vpn-p3", "microspec-vpn-p4"];
const POOL = [
  { id: "fffiloni/audiogen", fields: () => [] },
  { id: "stabilityai/stable-audio-3", fields: (s) => [{ label: "^model", value: "Small SFX", kind: "choice" }, { label: "duration", value: String(s) }] },
  { id: "fffiloni/audioldm2-text2audio-text2music-API", fields: (s) => [{ label: "duration", value: String(Math.max(5, s)) }] },
];
const JOBS = JSON.parse(Deno.env.get("JOBS") || "[]");
const t0 = Date.now();
const log = (...a) => console.error(((Date.now() - t0) / 1000).toFixed(0) + "s", ...a);
const ROUNDS = 4, PAUSE_MS = 25000;
async function one(pod, name, prompt, seconds = 5) {
  for (let round = 0; round < ROUNDS; round++) {
    if (await attempt(pod, name, prompt, seconds, round)) return true;
    await new Promise((ok) => setTimeout(ok, PAUSE_MS));
  }
  log(pod, name, "GAVE UP after", ROUNDS, "rounds"); return false;
}
async function attempt(pod, name, prompt, seconds, round) {
  const base = `http://${pod}:8765`;
  for (const row of POOL.slice(round % 2, round % 2 + 2)) {
    let job;
    const fields = row.fields(seconds);
    try {
      const r = await fetch(`${base}/gen`, { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids: [row.id], prompt, kind: "audio", k: 1, concurrency: 1, ...(fields.length ? { fields } : {}) }) });
      job = (await r.json()).job;
    } catch (e) { log(pod, name, row.id, "SUBMIT-FAIL", e.message); continue; }
    const deadline = Date.now() + 200_000;
    let done = false;
    while (Date.now() < deadline) {
      await new Promise((ok) => setTimeout(ok, 2500));
      let jr; try { jr = await fetch(`${base}/job/${job}`, { signal: AbortSignal.timeout(10000) }); } catch { continue; }
      const ct = jr.headers.get("content-type") || "";
      if (ct.startsWith("audio/") || ct === "application/octet-stream") {
        const buf = new Uint8Array(await jr.arrayBuffer());
        let s = ""; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
        console.log([name, jr.headers.get("x-audio-by") || row.id, ct, btoa(s)].join("|"));
        log(pod, name, row.id, "DONE", buf.length); return true;
      }
      const j = await jr.json().catch(() => null);
      if (j && (j.status === "error" || j.status === "cancelled")) { log(pod, name, row.id, "FAIL", j.error); done = true; break; }
    }
    if (!done) log(pod, name, row.id, "TIMEOUT");
  }
  return false;
}
await Promise.all(PODS.map(async (pod, i) => { for (let k = i; k < JOBS.length; k += PODS.length) await one(pod, JOBS[k][0], JOBS[k][1], JOBS[k][2]); }));
log("sfx batch finished");
