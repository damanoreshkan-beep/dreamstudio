# lorawatch — a LoRa waterfall on a HackRF

The chirp detection and the decode run in `dsp.worker.js`; the presets are `rt/lora.js`; the USB session is
the product's `rt/usbsession.js`. Under the gate a demo stream drives the same screen.

## Design refresh 2026-09-04

State map (`data-lora-state`): **disconnected** (the plaque, the one verb `#connect`, or the no-WebUSB
well) · **listening** (the preset rail, the waterfall `[data-waterfall]`, the activity panel `[data-activity]`
at e2 with a dark LED) · **active** (the panel at e3, the LED lit and pulsing, the SF · bandwidth · bursts
line) · **packets** (`[data-packets]`, `data-lora-packets`: raised rows, the CRC pill with a success/error
dot, hex and ASCII). The pinned Island carries the preset and the disconnect.

What changed and why: `bg-[#08090e]` under the waterfall (view.js:158) → `bg-black` — the canvas paints,
the slab beneath it is the page's own black; `text-xs` ×4 and `text-[0.6–0.72rem]` ×3 → the ladder's label
token (`MONO` for readouts, `LABEL` for the packets caption); `rounded-3xl`/`rounded-2xl` on the plaque,
the waterfall, the activity panel and the packet rows → `--ms-r`; on the connect button → removed (theme
radius). Amber as text: the no-USB `alert … text-warning bg-warning/12` → an inset well in ink with the
glyph in the warm pole; the CRC pill's `text-warning`/`text-primary` on tint → ink with a success/error
DOT as the mark. `text-base-content/55–65` → `/70` or `.text-muted`. Kept: `animate-pulse` on the LED and
on the island's radio glyph — a live indicator, not a spinner; `bg-primary` on the lit LED (meaning).
