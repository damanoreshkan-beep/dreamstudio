# DreamStudio

The product. **74 installable apps** — the store, the brand, the captures — built on the open
[microspec](https://github.com/damanoreshkan-beep/microspec) core, which this repo consumes as a pinned
dependency (see `microspec.lock` and `setup.sh`).

Live: **https://dreamstudio.mooo.com/store/**

## Layout

| Here (the product) | From microspec (the technology) |
|---|---|
| `apps/` — every app + the store, specs, i18n, icons, per-screen captures | `packages/` — runtime (`/_rt/`), schema, gen, gates |
| `docs/` — product art (logo master, shots) | `tools/` — 8n8 orchestrator, affected-CI, art importers |
| `counts.rules.json` — this README's own claims | `deploy/` — build, sw, og, manifest, counts |

`packages`, `tools` and `deploy` are symlinks created by `./setup.sh` — locally they point at the
`/root/microspec` working copy; in CI at the checkout of the tag pinned in `microspec.lock`. Nothing under
them belongs to this repo.

## Working on it

```
./setup.sh              # link the framework (reads microspec.lock; MICROSPEC_DIR overrides)
deno task gates         # the full local gate DAG — green before every push
git push                # verify runs on the self-hosted runner; deploy is gated on green
```

The farm's rules (authoring, design, ship flow) live with the framework; the DreamStudio style contract is
`docs/research/dreamstudio-style.md` there.
