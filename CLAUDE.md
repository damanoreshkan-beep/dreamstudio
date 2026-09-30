# How to work in this repository

## Commit straight to main

Owner's decision (2026-10-01): run the local gates (`deno task gates`, then `deno task 8n8 clean` after the
commit), then push to `main`. The push runs `verify`; `deploy` chains off it, so a red main never deploys —
fix forward. GitHub still prints "Bypassed rule violations … gate" on the push: the old PR-only protection is
bypassed by the owner's credentials, and that warning is expected, not a failure.

If a branch or PR does get used, delete the branch once merged (`after-merge.yml` does it for PRs;
`prune-branches` is the net).

## The gate is the contract

`deno run -A .microspec/verify.mjs "$PWD/apps/<app>"` runs the app's own e2e spec in a real browser. It needs
a live backend and seeded state, so a sandbox without them reports failures that are not yours — before you
believe one, run the same gate on the unmodified HEAD and compare the two counts. Equal counts mean your edit
is neutral to the gate; CI has what the sandbox lacks.

## For the owner

The owner is a product owner, not a programmer. Do the whole task, including the obvious next step, and
report in a sentence or two: what changed, whether it is live, what the number says. Keep diagnostics, option
lists and reasoning out of chat — they belong in the commit message and in the comment at the site, where
this repository already keeps them.
