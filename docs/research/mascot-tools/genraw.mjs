// raw generator: JOBS env = [[name, FULL prompt]] — nothing appended (rerun.mjs appends the icon STYLE block,
// which is exactly wrong for style cards that must NOT glow).
const PODS = ["microspec-vpn-p1", "microspec-vpn-p2", "microspec-vpn-p3", "microspec-vpn-p4"];
const IDS = ["mrfakename/Z-Image-Turbo"];
const JOBS = JSON.parse(Deno.env.get("JOBS") || "[]");
const t0 = Date.now();
const log = (...a) => console.error(((Date.now() - t0) / 1000).toFixed(0) + "s", ...a);
async function one(pod, name, prompt) {
  const base = `http://${pod}:8765`;
  let job;
  try {
    const r = await fetch(`${base}/gen`, { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids: IDS, prompt, size: { w: 1024, h: 1024 }, k: 1, concurrency: 1, rotateEach: true }) });
    job = (await r.json()).job;
  } catch (e) { log(pod, name, "SUBMIT-FAIL", e.message); return false; }
  const deadline = Date.now() + 300_000;
  while (Date.now() < deadline) {
    await new Promise((ok) => setTimeout(ok, 3000));
    let jr; try { jr = await fetch(`${base}/job/${job}`, { signal: AbortSignal.timeout(10000) }); } catch { continue; }
    const ct = jr.headers.get("content-type") || "";
    if (ct.startsWith("image/")) {
      const buf = new Uint8Array(await jr.arrayBuffer());
      let s = ""; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
      console.log([name, jr.headers.get("x-image-by"), jr.headers.get("x-image-res"), ct, btoa(s)].join("|"));
      log(pod, name, "DONE", buf.length); return true;
    }
    const j = await jr.json();
    if (j.status === "error" || j.status === "cancelled") { log(pod, name, "FAIL", j.error); return false; }
  }
  log(pod, name, "TIMEOUT"); return false;
}
await Promise.all(PODS.map(async (pod, i) => { for (let k = i; k < JOBS.length; k += PODS.length) await one(pod, JOBS[k][0], JOBS[k][1]); }));
log("raw batch finished");
