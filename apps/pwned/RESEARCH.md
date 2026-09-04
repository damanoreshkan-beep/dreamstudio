# pwned — research note

**Goal:** check whether a password appears in known breaches **without ever sending the password or its full
hash** — and *show the user why it's safe* (the hash + the step-by-step), to earn trust.

## The model (k-anonymity range API) — probed live, closed

1. **Local SHA-1.** `crypto.subtle.digest("SHA-1", …)` on-device → 40 hex chars. (Web Crypto exists in both
   browsers and Deno, so the pipeline is unit-tested headless.)
2. **Split 5 + 35.** Only the **first 5 hex chars** (the "range prefix") are ever sent.
3. **Query the bucket.** `GET https://api.pwnedpasswords.com/range/{prefix}` → **probed:
   `access-control-allow-origin: *`**, `text/plain`, cacheable → a direct fetch from the static host works,
   **no VPS proxy needed**. Returns ~500–1900 lines of `SUFFIX:count`.
4. **Match locally.** The 35-char suffix is looked up in the returned bucket on-device. The server only ever
   learns the 5-char prefix — shared by hundreds of unrelated hashes — so it cannot tell which password (or
   even which full hash) you hold.

Pure logic (`splitHash`/`parseRange`/`lookup`/`checkPassword` + `sha1hex`) lives in `/_rt/pwned.js` with unit
tests (known SHA-1 vectors; "only the prefix is queried" asserted). The app owns the transport + the taste.

## Design — transparency IS the feature (the owner's ask)

- The **full SHA-1 is shown**, split-coloured: the 5-char prefix in the accent tagged *sent to server*, the
  35-char remainder muted, tagged *stays on device*. The user literally sees what leaves.
- A **4-step explainer** (hash → split → send-5 → match-local) makes the protection self-evident. This is
  content, not hand-holding (like a tarot card's meaning) — it's exactly what the owner asked to surface.
- Verdict: compromised (error) with the breach count, or not-found (success). Ink brand; accent = the sent
  bytes; success/error = the verdict only.

## Safety / gate

- The password is **never persisted, never logged**; `autocomplete/autocapitalize/spellcheck` off; a
  show/hide toggle. Nothing sensitive is stored.
- **The gate never hits the live API** (nondeterministic): under `gate` it seeds a deterministic fixture
  (`"password"` → a canned breached result) so the shot shows a populated verdict, and `checkPassword`'s
  transport is stubbed. Real fetch only off-gate.

## Design refresh 2026-09-04

State map (`data-status`): **idle · empty** (the field alone, the pipeline Panel with its beam) · **idle ·
hashed** (`[data-hash]` Panel: the 5-char chip and the 35 that stay, the legend; the Check verb enabled) ·
**checking** (the verb in its progressive form) · **done** (`[data-verdict][data-pwned]`: the aura, the
icon well, the heading in error/success, the odometer) · **error** (`[data-error]`).

What changed and why: the app used no kit — `rounded-3xl sf-raised p-4` (view.js:92, :110, :125) is the
"this is a Panel" tell, so the hash, the pipeline and the verdict are `Panel`s now (the verdict's spring
animates a wrapper, since a ref cannot reach a function component's element; the pipeline's stagger
queries an inner wrapper). `text-[11px] … font-mono uppercase` (:93) → the Panel's own title; the legend
and the count caption (`text-xs`) → `LABEL` at `--ms-label`. The field → a pill well; the chip → a pill;
the verdict's icon well → `--ms-r-in`. `rounded-2xl h-12` on the verb → the theme radius and `--ms-ctl`.
`text-base-content/40–45` → `.text-muted`. The beam's gradient stays — it IS the light travelling the
pipeline (the hero's state), now in the warm pole (`--app-accent`) instead of `primary`; its left is
`calc(var(--ms-pad) + 1.125rem)` so it tracks the nodes through the density ladder.
