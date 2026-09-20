# How to work in this repository

## Every change lands through a pull request

`main` is protected and carries a required `gate` check. Push a branch, open a PR, let the gate run, merge
when it is green. **Never push to `main` directly** — the owner's credentials can bypass the rule and GitHub
prints the requirement as a warning rather than refusing, so a direct push looks like it failed and lands
anyway. That has happened; this file exists because of it.

The sibling backend repository (`microspec-edge`) works the opposite way — commits go straight to `main`
there, because its `main` is unprotected and single-author. The two are different on purpose. What you
learned there does not transfer here.

## Branches do not accumulate

Auto-merge deletes the head branch when a PR lands (`--delete-branch`). If you ever merge by hand, delete the
branch in the same breath. A list of merged branches is a list you have to read past to find the one that is
still open.

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
