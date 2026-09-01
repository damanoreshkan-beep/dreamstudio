// The core's tools, run from THIS tree's pin: `deno run -A .microspec/core.mjs <tool> [args]`.
// import.meta.resolve applies the import map, so the version is deno.json's alone; the tool executes in the
// registry realm as a child process with the caller's args (a CLI argument is never import-mapped).
const [tool, ...rest] = Deno.args;
if (!tool) { console.error("usage: core.mjs <tool> [args]"); Deno.exit(2); }
const spec = import.meta.resolve(`@microspec/core/${tool}`);
const out = await new Deno.Command(Deno.execPath(), { args: ["run", "-A", "--minimum-dependency-age", "0", spec, ...rest], stdin: "inherit", stdout: "inherit", stderr: "inherit" }).output();
Deno.exit(out.code);
