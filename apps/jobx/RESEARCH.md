# jobx — research & build plan (3D Kyiv)

**What it is.** jobx is a **3D map of Kyiv** (Kyiv only, location-based): jobs are glowing columns standing on a
dark, tilted, theme-aware 3D city; a side panel lists them (logo, title, $/₴, tags, "X км від центру"). The
farm's own job board — a signed-in user posts a vacancy at a point in Kyiv, the owner approves it from Telegram,
it appears on the map. Reference look: `~/jobx/screenshot-3d-v2.png` (the original React/deck.gl build).

## The pivot history
- v0: Jooble API — dropped (country-level only, 500/day, not our data).
- v1: flat 2D Ukraine bubble map — **failed the design eye** (tiny letterboxed silhouette, clashing colours,
  wrong concept). Hidden. Lesson booked: a green gate is a floor, not a verdict — shoot and LOOK before "done".
- v2 (this plan): 3D Kyiv, deck.gl, reusing the original jobx's baked data 1:1.

## The decisive architecture constraint (verified in-repo)
- `/_rt/globe.js`: a canvas-2D d3-geo renderer, "**no WebGL — so it renders in the headless gate too**".
- `/_rt/glstage.js`: WebGL is "**guard by PROBE, never by gate** … every meaning the stage carries is also in
  the DOM, which is the only thing axe [+e2e] can see."
- `/_rt/gate.js`: `gate = isGate || MOCK != null` → seed a deterministic fixture when true.

**Therefore:** deck.gl (WebGL2) can only be a **probe-guarded enhancement**. The gate/reviewer/e2e see the
**DOM**, and offline needs a non-network path. So jobx has two render layers:
1. **DOM job panel = the source of truth** (list of vacancies, every string via `T()`), always present →
   satisfies the gate, a11y, e2e, and offline.
2. **deck.gl 3D map** on top, initialised only when `getContext("webgl2")` answers; absent under the gate
   (canvas stub → null) and offline-first-load. A light 2D placeholder fills the map region when GL is absent.

## Data — reuse `~/jobx/apps/api/src/data/*` 1:1 (user: "ото печені і юзай, 1 в 1")
`kyiv-buildings.json` (34M), `kyiv-water.json` (3.7M), `kyiv-roads.json` (1.3M), `kyiv-metro.json` (200K),
`kyiv-districts.json` (101K).
- **Served as nginx STATIC** on the VPS (gzip + long Cache-Control), NOT through `core` — core runs with no
  `--allow-read` and cannot read files off disk. Path e.g. `https://dreamstudio.mooo.com/kyiv/<layer>.json`.
- App fetches them for the WebGL layer; **SW CacheFirst** (30d) so the map is offline after first load
  (mirrors the original PWA). The gate never fetches them (fixture only).

## Map (deck.gl) — port the original layer stack, THEME-AWARE (user: mandatory light/dark)
- View: `longitude 30.5241, latitude 50.4500, zoom 10.38, pitch 55, bearing -15` (Kyiv centre, from the original).
- Layers bottom→top: districts → water → roads → metro → **buildings** (GeoJsonLayer, `getElevation` from
  `properties.h`, LOD by zoom via DataFilterExtension) → **job columns** (ColumnLayer) → pulse (ScatterplotLayer).
- **Theme:** every `getFillColor` has a light/dark branch keyed on the app theme (`S.theme` → isDark). The
  original already carries `isDark` branches — carry them, and recolour to the farm's tokens, not raw hex.
- Job columns coloured by vacancy density (green→yellow→red), like the original legend "1+ 3+ 5+ …".

## Backend rework (edge)
Jobs move from a **country city-key** to a **Kyiv point**:
- `jobs` table: replace `city` with `lat double precision, lon double precision` (+ keep an optional `address`
  text). Additive migration (add cols; leave `city` for old rows).
- `/feed/jobs/post {sid, title, company, lat, lon, salary?, employment?, description, contact}` — validate
  lat/lon inside the Kyiv bbox (50.21–50.59, 30.24–30.83); still auth + moderation.
- `/feed/jobs/list` → jobs with `{lat, lon, …}`. Drop `/feed/jobs/cities`.
- Kyiv geo files served static via nginx (VPS ops), not core.

## Build phases
1. **Backend**: schema lat/lon + post/list rework + Kyiv-bbox validation. Gate: edge tests green.
2. **Kyiv geo serving**: place the 5 files on the VPS, nginx `location /kyiv/`, gzip+cache. Verify live.
3. **Frontend**: DOM panel (truth) + deck.gl 3D map (probe-guarded, theme-aware) + gate fixture + SW precache.
4. **THE EYE**: shoot both themes at the reference device, critique as a demanding designer, iterate until it
   reads like the reference. jobx stays `hidden:true` until it passes the eye.

## Gotchas booked
- deck.gl over esm.sh: import sub-packages (`@deck.gl/core`, `@deck.gl/layers`, `@deck.gl/geo-layers`), pin
  exact versions, `?external=@deck.gl/core`; WebGL2 mandatory → probe-guard.
- core has no `--allow-read` → Kyiv geo is nginx static, never a core route.
- Map is theme-aware (light/dark), tokens not raw hex where possible.
- Muted text = `.text-muted`; PWA chrome colours = theme base; importing `/_rt/auth.js` needs `needs:["auth"]`.
