# trail — research

A day's movement, recorded by the shell's foreground service, rendered as a printable poster. The farm's
first real consumer of `location.watch`: 33 catalogue actions exist and only `os` (the diagnostic checklist)
and `hive` (radios) call any of them.

Read before touching `apps/trail/*` or `packages/runtime/trace.js`.

## The bridge contract — two calls, in this order

`location.watch` on its own emits **nothing**. `BackgroundService.sink` is fed by the service, and the
service only attaches its `LocationListener` when `bg.start` was called with `location: true`
(`BackgroundService.onStartCommand` → `startLocation`). So:

```js
await shell.call("bg.start", { title, body, location: true, minMs, minM });
const cancel = shell.subscribe("location.watch", {}, onFix, onError);   // {lat, lon, acc, at}
```

**The cadence is not settable from an app today, and the app must not pretend otherwise.** The catalogue
declares `minMs`/`minM` on `location.watch`, where `startStream` passes subscribe args nowhere; the Java
reads them off the *service intent* in `Background.start`, where the catalogue declares neither. So both
routes are dead ends and what you get is `Background.start`'s defaults — **10 s / 10 m**, which is a
reasonable walking cadence. Do not send undeclared args to close the gap: the catalogue is the contract, and
an app that ships a key the schema does not name is the drift this repo generates its two sides to avoid.
Fixing it properly is a catalogue + Java change and a bridge bump.

`bg.status()` → `{ running, since, fixes }`. All three are statics on the service, so they survive the page
and die with the process.

## The hole this app is built around: there is no backlog

`sink` is a single `volatile` callback, set while a page is subscribed and null otherwise. `fixes` is a
counter. **Nothing is buffered.** Every fix emitted while no page is listening is gone — not delayed, gone.
A foreground service raises the process's oom score a long way, so in practice the WebView usually survives
alongside it; "usually" is not a recorder.

The mitigation needs no Java, because the ground truth is already on the wire:

- persist every fix to IndexedDB **as it arrives**, never in a batch on stop;
- on resume, compare `bg.status().fixes` against the count stored for this session. The difference is
  exactly how many fixes were lost, and the app draws that stretch as a **gap** instead of a straight line
  through terrain nobody walked;
- `running === false` or `since === 0` means the process died — close the session rather than extending it.

A recorder that invents the missing middle is worse than one that admits it. The counter makes admitting it
free.

## Permissions — the trap is background location, and it is not grantable in-app

| Permission | Declared in |
|---|---|
| `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION` | `src/main/AndroidManifest.xml` |
| `ACCESS_BACKGROUND_LOCATION` | `src/full/AndroidManifest.xml` |

`MainActivity.grantPermissions` filters to dangerous-and-missing and asks for the whole array at once. On
Android 11+ **`ACCESS_BACKGROUND_LOCATION` cannot be granted in that dialog** — bundling it with foreground
permissions gets it silently denied, and a permission denied twice can never prompt again. The only route is
"Allow all the time" in system settings, which is `system.settings`.

`BackgroundService` is declared with **no `android:foregroundServiceType="location"`**
(`full/AndroidManifest.xml:107`). At targetSdk 31 that attribute is optional (mandatory from 34), so the
service runs — but location delivery to a backgrounded app then rests entirely on the background permission
above. **UNVERIFIED on device: whether fixes continue with only "While using the app" granted.** Assume they
stop; the app must state which grant it is missing and deep-link the one screen that fixes it.

## The gate sees one point in Kyiv

`shell.subscribe` under `isGate` calls `onEvent(mock)` **once** and returns a no-op cancel — a single fix at
`50.4501, 30.5234`. A poster drawn from one point is empty, and the empty branch is then the only thing axe,
the overflow matrix and the shot ever measure.

So the app seeds a deterministic **sample track** under `isGate || MOCK`, and seeds the *widest* state: a
route with a gap in it, a long distance readout, and the longest place label — the string nobody measures is
the one that overflows.

## Where the math goes

There is no lat/lon geometry in the runtime today. `geofix.js` is accuracy math (`meanFix`, `totalErr`,
`usableFix`), `radar.js` is RSSI, `df.js` is bearing roses. So **`packages/runtime/trace.js` is new**, and by
the standing invariant it carries the math with unit tests while the app carries only taste:

- `distanceM(a, b)` haversine · `length(points)` cumulative;
- `bbox(points)` and `project(points, box)` — **equirectangular with `cos(lat)` scaling**, not Mercator: over
  a day's walk Mercator's distortion is invisible and its poles are irrelevant, while equirect keeps the
  aspect ratio honest and is four lines;
- `segments(points, { maxGapMs, maxJumpM })` — split into drawn strokes so a gap is a gap;
- `simplify(points, epsilonM)` — Douglas–Peucker, because a day is thousands of fixes and a poster is a few
  hundred;
- `frame(box, aspect, pad)` — fit to the stage and report the subject's **share** of it. Underuse is
  invisible to every gate we have; assert the share in the unit test.

## Export

`downloadBlob` from `/_rt/apk.js`, never a hand-rolled `<a download>` — `blob:` cannot be downloaded by any
route inside the APK, which is how five apps broke at once. Precedent: `grain` (wav), `habits` (json),
`cam` (image).

## Risks, in the order they are likely to bite

1. **Background permission is refused or never asked** → the recorder silently records nothing. Highest
   risk, and the reason the first screen is about the grant, not about a map.
2. **The Activity dies while the service lives** → gaps. Handled above; visible, not invented.
3. **Battery.** `minMs`/`minM` are the whole budget. Default to a walking cadence and say what it costs.
4. **A day with no movement** is a legitimate outcome and must render as something, not as an error.

## Design refresh 2026-09-04

State map of the Today screen (`fit`): **gate** (no grant → a Panel with the one verb) · **idle**
(`[data-rec="off"]`, three readings in wells, the empty canvas well saying "nothing yet") · **recording**
(`[data-rec="on"]`, the day's stroke in the well, the outline Stop) · **gaps** (the lost-fixes sentence under
the canvas) · **error** (the error sentence). Month: the grid (`[data-month-grid]`, empty days as wells,
recorded days raised) → the day sheet (`[data-poster]`).

What changed and why:

- The label trap ×11 (`text-[var(--ms-label)]` at :229, :232, :233, :246, :247, :252, :316, :322, :343,
  :366, :376 — a colour to Tailwind v4, so every caption rendered at BODY size inside a fit screen). Split by
  what they are: the readings' captions and units and the month subline are real micro-labels →
  `text-[length:var(--ms-label)]` mono; the sentences (nothing yet, lost fixes, legend, empty month, at
  home, the gate body) are prose → `text-sm text-muted`, which is still smaller than what they rendered at.
- Surfaces: `bg-base-200/40–50` (the readings, the canvas box, the day poster) → `sf-inset` wells — a value
  sits in the page, it is not a lighter panel on it; the month cells' hairline boxes → empty = well,
  recorded = raised (depth is the meaning); `transition` → `transition-transform` (the material is
  box-shadow, a blanket transition cross-fades it).
- Radii: `rounded-2xl` ×5 on buttons → pills; the poster box inside the sheet → `--ms-r-in`.
- Kept: the share-card canvas literals (`#12181c`, `#5E8CA8`, `#e8eef2`) — a fixed export bitmap, not the
  screen; `#5E8CA8` is the app's own spec accent on that card.
