# code — a colour code-breaker (Mastermind)

One fixed stage (`.ms-stage`): the board of ten guess rows with their feedback pips above, the deck (the
current guess, the six-peg palette, Check) below. The deduction maths is `/_rt/codebreak.js`; the secret
is seeded (`/_rt/groove.js` mulberry32) so a game is shareable by its number and deterministic in the gate.
Every peg carries a symbol as well as a hue, so the game is playable without colour vision.

## Design refresh 2026-09-04

State map of the main screen (`[data-code]`):

- `data-tries=N data-over="0"` — playing: N rows scored, the deck live; Check enabled once four pegs sit
  in the guess. The gate seeds three rows and a half guess so the shot is populated.
- `data-over="won"|"lost"` + `S.screen="over"` — the win/lose screen (`[data-over-screen]`) over the stage:
  the secret, the game number, New game / Share. History-backed: Back closes it, never exits.
- `S.screen="rules"` — the rules screen (`[data-rules]`), opened from the "?" — also history-backed.
- Split windows: the board is the one scroller (the guesses are the evidence; clipping them would hide the
  game), the deck holds its height.

What changed and why:

- **The deck is the kit's Island**, not a hand-rolled `sf-raised sf-e2 px-4 pt-3 pb-3` bar welded to the
  bottom; it sits in the stage's flow with `--ms-pad`/`--ms-gap` air (`[data-deck]`).
- **Tokens**: labels (`text-[0.62rem]`) → `font-mono text-[length:var(--ms-label)] uppercase tracking-wider
  text-base-content/70`; board padding and every gap ride `--ms-gap`/`--ms-pad`; the game number is
  `.text-muted` (was `/50`); the primary buttons are pills (`rounded-full`, the farm's button shape).
- **A transition names its properties**: the pegs' `transition` (which cross-fades box-shadow, i.e. the
  material) → `transition-transform` — the press scales, the rim stays crisp.

Deliberately kept: the six-hue peg palette (game geometry — a peg's hue is a MARK and its symbol is the
second channel); the board's nested scroll (the instrument's display, not a page scroll); the full-screen
win/rules screens as screens rather than Sheets — the e2e asserts they leave the DOM on Back.
