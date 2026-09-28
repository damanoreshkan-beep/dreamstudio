const args = Deno.args.filter((a) => !a.startsWith("--")), app = args[0], files = args.slice(1);
const keep = new Set((Deno.args.find((a) => a.startsWith("--keep-tail=")) || "").slice(12).split(",").filter(Boolean));
const trim = Object.fromEntries((Deno.args.find((a) => a.startsWith("--trim=")) || "").slice(7).split(",").filter(Boolean).map((p) => { const [k, v] = p.split(":"); return [k, Number(v)]; }));
if (!app || !files.length) { console.error("usage: sfxpack.mjs <app> <out.txt> …"); Deno.exit(2); }
const outDir = `apps/${app}/assets`, tmp = await Deno.makeTempDir({ prefix: "sfx-" });
let n = 0;
for (const f of files) {
  for (const line of (await Deno.readTextFile(f)).split("\n")) {
    const [name, by, , b64] = line.split("|"); if (!name || !b64) continue;
    const wav = `${tmp}/${name}.wav`, mp3 = `${outDir}/sfx-${name}.mp3`;
    await Deno.writeFile(wav, Uint8Array.from(atob(b64.trim()), (c) => c.charCodeAt(0)));
    const af = keep.has(name) ? []
      : trim[name] ? ["-t", String(trim[name]), "-af", `afade=t=out:st=${Math.max(0, trim[name] - 0.15)}:d=0.15`]
      : ["-af", "silenceremove=stop_periods=1:stop_duration=0.15:stop_threshold=-45dB"];
    const p = await new Deno.Command("ffmpeg", { args: ["-y", "-loglevel", "error", "-i", wav, ...af, "-ac", "1", "-ar", "44100", "-codec:a", "libmp3lame", "-q:a", "4", mp3] }).output();
    if (!p.success) { console.error(name, "ffmpeg failed:", new TextDecoder().decode(p.stderr).slice(0, 200)); continue; }
    const size = (await Deno.stat(mp3)).size;
    console.log(`${name.padEnd(16)} ${by.padEnd(32)} ${String(size).padStart(7)} B`); n++;
  }
}
console.log(`${n} effect(s) → ${outDir}/`);
