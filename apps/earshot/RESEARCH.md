# earshot — a chat that reaches exactly as far as the radio does

One screen: the conversation (voices caught from BLE advertisements + your own lines), a scanner line with
the packet count, and a pinned Island holding the input, the byte budget and Send. The protocol and every
pure decision live in `/_rt/earshot.js` (unit-tested); the reasons there is no bearing and no multi-packet
message are in the core's `docs/research/ble-ether.md`.

## Design refresh 2026-09-04

State map of the main screen (`[data-earshot]`):

- `data-lines="0"` — the room is quiet: the runtime's empty-state shape (mascot hook + glyph + one line),
  the scatter decor on `data-empty`; the Island is still there, the input still works.
- `data-lines>0` — the conversation: a voice from the air is a raised card (`sf-raised sf-e2`) with the
  sender's hue on a dot and their callsign in a micro-label; YOUR line is a well (`sf-inset`) ringed by the
  accent (`.es-mine`), the accent dot beside your callsign.
- `data-listening="1"` — the scanner dot is the accent and breathes (`.es-live`); `"0"` — a 30 % ink dot.
- `data-blocked="1"` — the Island carries a warning/error row above the form (location off, BLE off, a
  refused permission with its Allow button, a stale bridge).

What changed and why:

- **The accent left the background.** My bubble was `bg-[var(--app-accent)]/20` under ink text — an
  arbitrary hue under text fails contrast in one theme. It is a `sf-inset` well now with the accent as its
  rim (head.html `.es-mine`: the well's own sink plus a 1 px accent ring) and the accent on the sender dot.
- **The pulse is a state light, not a placeholder.** `animate-pulse` on the live dot → a named keyframe
  (`.es-live`, reduced-motion off) so the farm's "no animate-pulse" sweep does not read it as a skeleton.
- **Micro-labels take the token**: `text-[0.7rem]` ×4 → `font-mono text-[length:var(--ms-label)]
  tracking-wider text-base-content/70` (one `LABEL` constant); `text-[0.8rem]` → `text-sm`; icon sizes →
  `--ms-icon`; the bubble radius → `--ms-r`; the column gap → `--ms-gap`.
- **Colour = meaning**: the "budget spent" counter and the blocked/error rows use `text-warning`/`text-error`
  instead of the accent as a text colour; the Send button is a circle (the farm's icon-button shape).
- The empty state gained the mascot hook and a glyph so it is the same object as `render.js`'s `Empty`.

Deliberately kept: the `hsl()` sender dots (a mark per sender, never text); the pinned Island's
`pb-[calc(var(--dock-h)+11rem)]` clearance under the conversation.
