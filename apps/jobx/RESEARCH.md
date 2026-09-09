# jobx — research & design note

**What it is.** Jobs on a map of Ukraine. jobx is the farm's **own** job board — not a wrapper over a
third-party API. A signed-in user posts a vacancy; the owner approves it from Telegram; it appears as a
bubble on the city it belongs to.

## Why not Jooble (the pivot, 2026-09-09)
The first cut used the Jooble free API. Measured, it was wrong for this app:
- A global `jooble.org` key resolves only at **country** level — `location:"Ukraine"` returned ~92 jobs all
  tagged "Ukraine", `location:"Kyiv"` returned **0**. A per-city bubble map was impossible without a
  per-country-domain key.
- 500 requests/day is a hard ceiling for a map that queries per city.
- The data is someone else's; the farm's north star is that the apps are **our** asset.

So Jooble was removed entirely (route, `jooble.org` allowlist entry, `JOOBLE_KEY`) and replaced with our
own board. `jobs_cache` stays as a dead, additive table (never dropped in place).

## Architecture
- **Backend** (`microspec-edge/edge/jobs.js` + `db.js`):
  - `POST /feed/jobs/post {sid, title, company, city, salary?, employment?, description, contact}` — requires
    a valid sealed session (`session.open`), validates every field, inserts `status='pending'`, pings the
    owner (`ADMIN_TG_ID`) in Telegram with ✅/🗑 buttons.
  - `POST /feed/jobs/list {city?}` — approved vacancies, mem-cached (public).
  - `POST /feed/jobs/cities` — the gazetteer + approved count per city, for the map.
  - Bot callback `job:ok|no:<id>` — owner-only approve/reject (bot.js delegates to jobs.js).
  - **Security:** every query is a parameterised tagged template (bound params, no SQL text); `city` is a
    gazetteer KEY not free text; `employment` a fixed set; every field length-capped + control-char-stripped;
    nothing is public until the owner approves it.
- **Map** (`uamap.js`): a real Ukraine border (johan/world.geo.json, Douglas-Peucker simplified) projected
  equirectangular with an aspect correction (lon·cos(midLat)). **The same projection places every city**, so
  a bubble always sits on its true location. 22 oblast centres + Kyiv; keys mirror the edge gazetteer exactly.
  Bubble area ∝ openings; an empty city is a faint, still-tappable dot ("be the first to post here").
- **Frontend** (`view.js`): the map tab (fit) with a `+` post button and per-city job sheets; the Me tab
  offers sign-in (`profile.account: "any"` → GitHub / Google / Telegram). Posting is gated on a session.

## Gotchas learned
- Douglas-Peucker on a **closed** GeoJSON ring collapses to 2 points (baseline segment length 0) — simplify
  the OPEN ring (drop the closing duplicate) and let `Z` close the path.
- Muted text must be the `.text-muted` token, never a `text-base-content/NN` alpha (a11y gate).
- PWA chrome colours (`manifest` + meta `theme-color`) must be a theme base (`#000000` for a dark theme).
- Importing `/_rt/auth.js` requires declaring `"auth"` in a tab's `needs` (capabilities gate).
