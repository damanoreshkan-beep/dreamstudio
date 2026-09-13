// sfxpack — the batch's base64 lines (sfxraw.mjs output: name|by|content-type|<base64 wav>) → apps/<app>/assets/sfx-<name>.mp3
//   deno run -A docs/research/sfx-tools/sfxpack.mjs <app> <out.txt> [more.txt …] [--keep-tail=run,wind,…]
// ffmpeg on this box: mono, 44.1 kHz, VBR ~110 kb/s; a one-shot's trailing silence is cut (-45 dB), a bed named in
// --keep-tail keeps its full length so it loops.
const args = Deno.args.filter((a) => !a.startsWith("--")), app = args[0], files = args.slice(1);
const keep = new Set((Deno.args.find((a) => a.startsWith("--keep-tail=")) || "").slice(12).split(",").filter(Boolean));
// --trim=jump:1.2,land:1 — a one-shot cut to that many seconds with a 0.15 s fade (AudioGen fills its 5 s with room tone)
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
