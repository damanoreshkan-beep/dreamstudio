# «Перевірити» — what a find's identifiers can honestly be turned into

Research only, 2026-09-04. Every claim below was probed from this machine against the live internet; no
production edge was touched and no product code was changed. Probe transcripts are at the bottom, and
§10 names what did **not** work so nobody spends the afternoon re-discovering it.

## 0. The answer in one paragraph

There is exactly one source that answers our three questions anonymously, with no key, under a licence we
can live with: **beaconDB** (`https://api.beacondb.net/v1/geolocate`), the community successor to Mozilla
Location Service, speaking MLS/Ichnaea's API. It answers **cell → location** (7.99 M towers, including
MLS's final public-domain dump), **Wi-Fi BSSID → location** (164 M networks) and even **BLE MAC →
location** (6.0 M bluetooth beacons) through one route, one request shape, one response shape. It answered
a real LTE cell in 0.37 s with 60 m accuracy while I wrote this. Everything else is either dead
(Mozilla, radiocells.org), key-walled (OpenCelliD, UnwiredLabs, WiGLE, Google), or a private undocumented
Apple endpoint we should not build a product on.

The one thing that must not be got wrong: **beaconDB silently falls back to IP geolocation.** From our
edge in France that would answer "France" for a Ukrainian phone's cell, with a 25 km circle and no visible
sign it was a guess. `considerIp: false` turns that off, and the presence of a `fallback` key in the
response is the exact discriminator between a real match and a guess. §4.3 is the honesty rule.

## 1. Source table

| Source | Answers | Keyless? | Licence | Rate limit | Verdict |
|---|---|---|---|---|---|
| **beaconDB** `api.beacondb.net` | cell, Wi-Fi, BLE → lat/lon/accuracy | **yes**, anonymous | public domain, data obfuscated by the operator; `_nomap` opt-out honoured | none observed; 40 rapid requests all 200, no 429, no rate headers | **BUILD ON THIS** |
| macvendors.com | MAC → vendor string | yes | undeclared | 1000/day, 1 req/s (429 measured at 2/s) | reject — our local OUI file already answers, offline and unlimited |
| OpenCelliD `opencellid.org` | cell → lat/lon | **no** — free key by registration | CC-BY-SA 4.0 | 1000 req/day per key | fallback only; the **full CSV download** is the interesting half (§4.5) |
| UnwiredLabs `us1.unwiredlabs.com` | cell + Wi-Fi → lat/lon | no — token, paid balance | commercial | by plan | reject — paid |
| WiGLE `api.wigle.net` | Wi-Fi/BLE/cell → lat/lon | no — account + basic auth | non-commercial, attribution, no redistribution | a few queries/day free | reject — key + a licence that forbids what we'd do |
| Apple `gs-loc.apple.com/clls/wloc` | Wi-Fi BSSID → lat/lon **+ ~100 neighbours** | **yes**, anonymous, undocumented | none — private API, no terms granting use | unknown | reject on terms; see §5.2, it *works* |
| Google Geolocation API | cell + Wi-Fi | no — key with billing enabled | commercial | by plan | reject — paid |
| Mozilla Location Service | — | — | — | — | **DEAD**, 404 (§10) |
| radiocells.org / openBmap | — | — | — | — | **DEAD**, 404 on every path (§10) |
| mylnikov.org | Wi-Fi BSSID → lat/lon | yes | CC-BY-SA (open dataset) | unknown | alive but never returned a hit; keep as a second opinion at most |
| openwifimap.net | community mesh nodes | yes | ODbL | — | wrong data — mesh node metadata, not a BSSID index |

## 2. What the radio actually gives us

Ground truth is `template/app/src/main/java/apk/microspec/Radios.java` in `microspec-edge` (the `cell.info`
and `wifi.scan` shell actions), not the shell docs. What it puts on the wire per cell:

| Field | LTE | GSM | WCDMA | NR (5G) |
|---|---|---|---|---|
| `type` | `lte` | `gsm` | `wcdma` | `nr` |
| `mcc` / `mnc` | yes (SDK ≥ 28) | yes (SDK ≥ 28) | yes (SDK ≥ 28) | yes |
| `cid` | `getCi()` — 28-bit ECI | `getCid()` | `getCid()` | **absent** |
| `lac` | `getTac()` | `getLac()` | `getLac()` | **absent** |
| `pci` | `getPci()` | — | — | `getPci()` |
| `arfcn` | `getEarfcn()` | `getArfcn()` (SDK ≥ 28) | `getUarfcn()` (SDK ≥ 28) | `getNrarfcn()` |
| `rssi`, `serving` | yes | yes | yes | yes |

Three consequences that decide the feature:

- **We have MCC and MNC on the wire, and hive throws them away.** `sweepRadios` in `view.js:150` copies
  `cid`, `lac`, `pci`, `arfcn`, `rssi` and `serving` off the bridge reply and never reads `c.mcc` / `c.mnc`.
  Without those two numbers a cell identifier means nothing to any database on earth. This is the single
  smallest change that unblocks the whole feature, and it is a change to hive, not to the APK.
- **5G cells cannot be looked up at all**, and it is our own bridge's fault, not the radio's.
  `CellIdentityNr` exposes `getNci()` (36-bit NR Cell Identity) and `getTac()` since API 30 and we target
  31, but `Radios.java` reads only `pci` and `nrarfcn` for NR. beaconDB rejects an NR query without
  `locationAreaCode` at the schema level (`400 missing field 'locationAreaCode'`), so today every 5G find
  is honestly unlookupable. Adding two lines to `Radios.java` would fix it; until then the UI must say so.
- **Neighbour cells carry no identity.** Non-serving cells report `CellInfo.UNAVAILABLE` (2147483647) for
  `cid`/`lac`; `cellNum` at `view.js:137` correctly rejects anything ≥ 2²⁸ and yields `null`. So the
  «Перевірити» button belongs only on a find that has `mcc`, `mnc`, `lac` and `cid` — in practice the
  serving cell. The gate fixture already encodes this: `GATE_FIELD` gives the serving LTE cell a CID and
  its neighbour none.

Wi-Fi gives us everything a lookup wants: `bssid`, `ssid`, `freq`, `rssi`, `caps`, `ftm`, `width`, `std`.
BLE gives us the address and the raw advertisement, nothing more.

## 3. The recommended edge route

One route, one upstream, three kinds of find. It belongs in a new `edge/hive.js` shaped exactly like
`edge/telemetry.js` (origin check → rate limit → read body → validate → upstream → send), registered in
`main.js` next to `handleLog`, and it is **core-only** — it fetches a fixed allowlisted host, so it never
belongs in the `open` process.

```
POST /feed/hive/lookup            (through the sealed tunnel, like every other /feed call)
```

Request — the client sends only what the radio broadcast, never a position:

```jsonc
// a cell
{ "kind": "cell", "cell": { "radio": "lte", "mcc": 262, "mnc": 1, "lac": 2, "cid": 1 } }
// a Wi-Fi AP  (bssid REQUIRED, ssid included when the AP broadcast one — see §5.1 on why ssid matters)
{ "kind": "wifi", "wifi": [ { "bssid": "aa:bb:cc:dd:ee:ff", "ssid": "Freifunk", "rssi": -52 } ] }
// a BLE device
{ "kind": "ble", "ble": { "mac": "b8:27:eb:0a:0b:0c" } }
```

Response — a closed set of three verdicts, so the UI can never accidentally render a guess as a fact:

```jsonc
{ "found": true,  "lat": 51.58578, "lon": 8.071889, "accuracy": 60, "source": "beacondb" }
{ "found": false, "reason": "unknown" }        // the database answered and does not know this transmitter
{ "found": false, "reason": "unavailable" }    // upstream down, timed out, or rate-limited us
```

`reason` matters: **"nobody has surveyed this transmitter" and "the lookup is broken" are different
sentences** and the app must be able to say which. Do not collapse them into one empty state.

Implementation notes, in the order they will bite:

1. **`considerIp: false` on every upstream request, no exception.** Without it an unknown transmitter
   comes back as the *edge's own* IP location — a French centroid with 25 km accuracy — and the response
   is shaped exactly like a real hit apart from one extra key. Measured, §11-C.
2. **Reject any response carrying a `fallback` key**, even with `considerIp:false` set, as belt and
   braces. `fallback: "ipf"` is IP, `fallback: "lacf"` would be a LAC centroid. A real match has no
   `fallback` key at all. This is the honesty gate and it is one `if`.
3. **Set a real User-Agent.** beaconDB's own docs ask for it ("please make sure to set a user agent to
   identify your client!!"). `microspec-hive/1.0 (+https://dreamstudio.mooo.com)`.
4. **Add `api.beacondb.net` to `FIXED_NON_CAP` in `edge/hosts.js`**, then remember `compose.yml` carries a
   *copy* of `allowNet()`'s output — `deno task check-allowlist` catches the first half, and the comment
   at `check-allowlist.js:29` records the 2026-08-20 incident where the copy drifted and core answered
   `NotCapable` in production. Update both.
5. **Cache in Postgres, keyed on the identifier, not the request.** A cell or an AP does not move; a
   negative answer does change, because beaconDB grows daily. Suggested: positive results kept
   indefinitely, negative results kept ~7 days then re-asked. Upstream latency measured at 0.37 s best
   case and ~0.9 s under a rapid loop, so cache is about politeness to a donation-funded service, not
   about our own speed.
6. **Rate-limit per IP** with `rateOk(ipOf(req), n, "hive")` as `telemetry.js:41` does. beaconDB showed no
   limiter of its own across 40 rapid requests, which is a reason to impose one on ourselves rather than a
   reason not to.
7. Timeout the upstream at ~5 s and map anything non-200/404 to `reason: "unavailable"`.

Client side, `installSealedFetch` already seals a plain `fetch` to `VPS_PROXY`, so hive calls it the way
`runtime/telemetry.js:78` calls `/feed/log` — `fetch(`${VPS_PROXY}/hive/lookup`, { method: "POST", … })`
and nothing else.

## 4. Cell → location

### 4.1 The exact request and a real response

```
$ curl -s -X POST https://api.beacondb.net/v1/geolocate \
    -H "content-type: application/json" -H "user-agent: microspec-hive/1.0" \
    -d '{"considerIp":false,"cellTowers":[{"radioType":"lte","mobileCountryCode":262,"mobileNetworkCode":1,"locationAreaCode":2,"cellId":1}]}'

{"location":{"lat":51.58578,"lng":8.071889},"accuracy":60}
HTTP 200  0.371845s
```

That is a real Telekom Germany LTE cell (MCC 262 / MNC 1, TAC 2, ECI 1) resolving to a point in North
Rhine-Westphalia with a 60 m circle. It is a stable, reproducible test vector — use it as the e2e fixture
and as the "is the upstream alive" probe. I found it by batching 200 candidate cells into one request and
bisecting; that batching trick is itself worth knowing, since the API accepts an array and matches any
member.

Field mapping from our bridge to Ichnaea:

| ours | Ichnaea |
|---|---|
| `type` | `radioType` — one of `gsm`, `wcdma`, `lte`, `nr` **only**; anything else is a hard 400 |
| `mcc` | `mobileCountryCode` |
| `mnc` | `mobileNetworkCode` |
| `lac` | `locationAreaCode` (LTE: the TAC) |
| `cid` | `cellId` (LTE: the 28-bit ECI, exactly what `getCi()` returns) |
| `pci` | `primaryScramblingCode` — accepted, ignored for matching |
| `rssi` | `signalStrength` — accepted, ignored for matching |

`arfcn` has no home in the Ichnaea schema. It is not lost information, it is simply not how any database
is indexed; keep showing it as a radio fact and do not try to send it.

### 4.2 Matching is exact — there is no LAC fallback

This is the most useful negative result of the day. I swept the **entire** LAC space, 0–65535, for
Telekom Germany in both GSM and LTE with `fallbacks: {lacf: true}` and a wildcard cell id, batched 200 at
a time: **zero hits**. The same MCC/MNC/LAC with the *correct* cell id answers instantly. So beaconDB
matches the full `(radio, mcc, mnc, lac, cid)` tuple and offers no LAC-level approximation.

That is good news for us. It means there is no "roughly this district" answer to accidentally render as a
fact — beaconDB either knows the exact transmitter or says `notFound`. The `lacf` flag is worth sending as
`false` anyway, in case the operator turns it on later.

### 4.3 The honesty rule, stated once

```
200 + no "fallback" key   → a real surveyed position. Show it.
200 + "fallback":"ipf"    → the edge's own IP. NEVER show it. Treat as unknown.
200 + "fallback":"lacf"   → an area centroid. NEVER show it as the cell. Treat as unknown.
404 notFound              → honestly unknown. Say "нема в базі", not "помилка".
400                       → our bug, not the user's. Log it, say "unavailable".
```

### 4.4 Coverage is thin and honest about it

beaconDB is young and opt-in. Its own front page says so: "beaconDB is experimental and may be inaccurate
or unreliable… there is likely no wifi coverage for your area." Live counters at the time of writing:

| | count |
|---|---|
| Wi-Fi networks | 164,145,999 |
| cell towers | 7,994,789 |
| Bluetooth beacons | 6,003,901 |
| countries | 219 |
| total reports | 343,186,478 |

Design the UI for "not found" as the *common* case, not the error case. A find that returns nothing is the
normal outcome and should read like a fact about the database, not like a failure of the app.

### 4.5 If coverage proves too thin: self-host, don't buy

OpenCelliD publishes the **whole database as CSV** at `opencellid.org/downloads/` under CC-BY-SA 4.0. The
download needs the same free key as the API, but a key used once a month by a human to fetch a file is a
completely different thing from a key in the request path, and it sidesteps the 1000/day API limit
entirely. That would put cell→location in our own Postgres with no third party at query time and no
egress at all. Worth doing only if beaconDB's coverage disappoints in real use — measure first.

## 5. Wi-Fi BSSID → location

### 5.1 beaconDB, same route, one trap

Same endpoint, `wifiAccessPoints` instead of `cellTowers`. Accepted fields, all verified as parsed
(a malformed value gives a schema 400, so acceptance is provable even without a hit): `macAddress`,
`ssid`, `signalStrength`, `age`, `channel`.

**Send the SSID.** beaconDB's privacy notice states the published data is "obfuscated so that others must
observe the exact same MAC **and SSID** to be able to use any location information." Read plainly, the
lookup key is derived from both, so a BSSID-only query cannot match by construction. hive already has the
SSID from `wifi.scan` — pass it. A hidden AP with an empty SSID is therefore honestly unlookupable, which
is a real limitation to surface rather than paper over.

Two further constraints from the Ichnaea lineage: a Wi-Fi query conventionally needs **at least two** APs
before the service will answer, and an AP whose SSID ends in `_nomap` is excluded by the owner's choice.
Both argue for the same client behaviour: when the user checks a Wi-Fi find, send that AP **plus its
strongest neighbours from the same sweep**, and say in the UI that the neighbours help. I could not
isolate the ≥2 rule experimentally, because with no known-good AP in hand a one-AP query and a two-AP
query both return the same `404 notFound`.

I tried hard to produce a real Wi-Fi hit and failed: 1221 real Freifunk mesh routers in Germany, with
ground-truth coordinates published by the mesh itself, queried singly, in pairs, and with the three
plausible gluon BSSID derivations. Zero hits, on beaconDB and on Apple both. The honest reading is that a
mesh node's management MAC is not the MAC it beacons, so this was the wrong ground truth rather than
evidence of empty coverage. **A five-minute test on the owner's own phone against his own router will
settle Wi-Fi coverage better than another hour of desk research** — that is the next probe, and it needs
hardware I do not have.

### 5.2 Apple's endpoint works, and we should still not use it

`https://gs-loc.apple.com/clls/wloc` is alive, accepts anonymous requests and returns well-formed
protobuf. I built a working client for it and it round-trips: HTTP 200, one `WifiDevice` per queried MAC,
and for a MAC Apple does not know, the sentinel `lat = lon = -180`, `accuracy = -1`. For a MAC it does
know it additionally returns up to ~100 *neighbouring* APs with their coordinates, which is exactly why it
is famous and exactly why it is a privacy problem.

Two mechanics worth recording so nobody re-derives them:

- The header's payload-length field is a **2-byte big-endian short**, not a protobuf varint. Every public
  code sample gets away with a varint because their payloads are under 128 bytes. Ours were not, and the
  service answered a bare `400` with 11 bytes and no message until I fixed the framing. After the fix a
  60-MAC batch returned 4030 bytes cleanly.
- Reply shape: skip a 10-byte header, then repeated field 2 = `WifiDevice { 1: string mac, 2: Location }`,
  where `Location { 1: int64 lat, 2: int64 lon, 3: int32 accuracy }` and lat/lon are scaled by 1e8.

**Verdict: do not ship it.** It is an undocumented private API with no terms that grant us use, it
requires impersonating `locationd`'s User-Agent to work, and its neighbour-dump behaviour is the opposite
of this app's honesty posture. Recorded here as evidence and as a dead end that is closed on purpose, not
for lack of a working client.

## 6. BLE MAC → what is honestly knowable

Three separate questions, three different answers.

**Vendor.** Our local OUI file is the whole truth. `vendorOf` in `/_rt/oui.js` reads the IEEE registry that
hive already ships in `assets/oui.txt`, and the IEEE registry is *the* authority — macvendors.com is a
mirror of it, so an online lookup cannot know something the local file does not. macvendors does answer
keyless (`B8:27:EB:…` → `Raspberry Pi Foundation`, verbatim) but is capped at 1000/day and 1 req/s, and I
measured the 429 at the second request of a 2-per-second burst. Adding it would cost a network round trip
and an egress host to learn nothing. **Do not add an online vendor lookup.**

**Address type.** Already correct and already local. `rotates()` in `/_rt/radar.js` reads the two top bits
of the first octet, which is the definition of a random/resolvable-private address, and hive already
refuses to name a vendor for one — the comment at `view.js:425` says exactly why. A rotating address has
no vendor, and saying "rotating" is the true statement. Nothing online improves on this; the address is
meaningless by design.

**Location.** beaconDB does hold 6.0 M Bluetooth beacons and its `bluetoothBeacons: [{ macAddress }]`
field is accepted by the schema (a well-formed query returns `404 notFound`, not `400`). So a *static,
publicly-surveyed* beacon — a shop's iBeacon, a bus-stop transmitter — genuinely can come back with a
position. But this only ever works for a device with a **stable public address**, which is a small
minority of what hive sees: phones, watches, earbuds and trackers all rotate precisely so this cannot be
done. Offer «Перевірити» on a BLE find only when `rotates(addr)` is false, and expect it to answer
"unknown" nearly always.

## 7. What stays honestly unknown

Say these plainly in the UI rather than hiding the button:

- **Every 5G (NR) cell**, until `Radios.java` learns `getNci()` and `getTac()`. Not a database gap — we do
  not currently transmit the identifiers.
- **Every neighbour cell.** The radio reports no CID or LAC for a cell it is not camped on. This is the
  radio's own rule and the gate fixture already models it.
- **Every hidden Wi-Fi AP**, if the MAC+SSID obfuscation reading in §5.1 holds: no SSID, no key, no match.
- **Every rotating BLE address.** No vendor, no location, and both of those are facts about the address
  rather than failures of the lookup.
- **Distance and bearing to a located transmitter.** We can show where the database says the transmitter
  is; RSSI does not honestly give metres. The one exception hive already knows about is an FTM/802.11mc
  responder, and that is a different mechanism entirely.
- **Accuracy is the database's claim, not ours.** Render the 60 m as a circle, never as a pin with a
  decimal coordinate that implies more precision than was surveyed.

## 8. The globe recipe

Smallest honest path, already proven twice in the farm. Import the systemic component and pass one point:

```js
import { Globe } from "/_rt/globe.js";

html`<${Globe}
  points=${[{ lat, lon, r: 16, color: "rgba(245,185,77,.16)" },   // the accuracy halo
            { lat, lon, r: 5,  color: "#F5B94D" }]}               // the transmitter
  focus=${{ lat, lon }}
  spin=${false}
  height=${320} />`;
```

That is `apps/globe/track.js:84` verbatim — the ISS tracker's two-ring marker, which is exactly the shape
we want: a soft halo standing for uncertainty and a hard dot for the reported position. `apps/sun/view.js:94`
is the other precedent and uses `marker=${{lat, lon}}` instead, a single pin with no halo; prefer `points`
here precisely *because* the halo lets the accuracy circle be visible instead of implied.

Facts about the module that matter to us, from its own docblock at `packages/runtime/globe.js`:

- Canvas + d3-geo, **no WebGL**, so it renders in the headless gate and can be photographed by the eye.
- `points` are hit-tested on tap and ride back through `onPick` as `point`, so the marker is tappable for
  free if we later want a detail sheet.
- `focus` animates the globe to centre the coordinate, and is the initial view when supplied at mount.
- `spin={false}` whenever something is selected — an auto-rotating globe under a located point reads as
  decoration rather than as an answer.
- The topology loads once from `/_rt/world-110m.json` and is cached across every globe on the page.
- `countryAt(lat, lon)` returns `{id, name}` or null, and returns null until `worldReady()`. If we want to
  name the country under a located cell, poll `worldReady` the way `track.js` does rather than reading it
  once at mount.

Nothing new is needed in the core. hive imports `Globe`, passes two numbers, and the accuracy circle is
the only bespoke decision.

## 9. Suggested build order

1. Carry `mcc`/`mnc` through `sweepRadios` — without this nothing else can work. Extend `GATE_FIELD`'s
   serving cell to carry them so the gate covers it.
2. `edge/hive.js` + the `hosts.js` and `compose.yml` allowlist entries, using the §4.1 vector as the test
   fixture.
3. The «Перевірити» button, present only on a find that has enough identity to ask about (§7), with the
   three-verdict UI from §3.
4. The globe view, per §8.
5. Only then, if coverage disappoints: measure it properly on the owner's own radio before considering the
   OpenCelliD dump.

## 10. Dead ends — do not retry

- **Mozilla Location Service** (`location.services.mozilla.com/v1/geolocate`) — **404**. Shut down in 2024.
  beaconDB is its successor and imported its final dump; there is nothing left to query.
- **radiocells.org / openBmap** — the host resolves and answers, but `/`, `/downloads`,
  `/geolocation/geolocate` and `/backend/geolocate` are all 404 and the root page is a single hyphen. The
  project is gone.
- **The old MLS CSV export CDN** (`d17pt8qph6ncyq.cloudfront.net/export/…`) — connection fails outright.
- **openwifimap.net** — alive, but it maps community mesh *nodes*, not BSSIDs. `view_nodes` is 405 on GET.
  Wrong dataset for this question.
- **`las.apple.com`** — does not resolve. The endpoint that exists is `gs-loc.apple.com` (§5.2).
- **Freifunk meshviewer MACs as Wi-Fi test vectors** — 1221 real nodes with ground-truth coordinates,
  queried raw, in pairs and with three gluon BSSID derivations, against both beaconDB and Apple: zero hits.
  The published `mac` is the node's management address, not a broadcast BSSID. Do not spend another hour
  here; test on a real phone instead.
- **A varint payload length in the Apple request header** — works below 128 bytes and returns a bare 400
  above it. It is a 2-byte big-endian short.
- **beaconDB LAC fallback** — swept the full 0–65535 LAC space for one operator in two radio types.
  There is no LAC-level answer to be had. Exact tuple or nothing.

## 11. Probe log

**A — beaconDB, a real LTE cell, keyless and anonymous**

```
$ curl -s -X POST https://api.beacondb.net/v1/geolocate -H "content-type: application/json" \
  -H "user-agent: microspec-hive/1.0" \
  -d '{"considerIp":false,"cellTowers":[{"radioType":"lte","mobileCountryCode":262,
       "mobileNetworkCode":1,"locationAreaCode":2,"cellId":1}]}'
{"location":{"lat":51.58578,"lng":8.071889},"accuracy":60}
HTTP 200  0.371845s
```

**B — the same route says "unknown" cleanly**

```
{"considerIp":false,"cellTowers":[{...,"locationAreaCode":9999,"cellId":777777}]}
→ HTTP 404
{"error":{"code":404,"errors":[{"domain":"geolocation",
  "message":"No location could be estimated based on the data provided","reason":"notFound"}],
  "message":"Not found"}}
```

**C — the trap: the same unknown cell WITHOUT `considerIp:false`**

```
{"cellTowers":[{...,"locationAreaCode":9999,"cellId":777777}]}
→ HTTP 200
{"accuracy":25000,"fallback":"ipf",
 "license":"IP geolocation data sourced from IP to City Lite by DB-IP, licensed under CC BY 4.0.",
 "location":{"lat":49.8383,"lng":24.0232}}
```

49.8383, 24.0232 is this machine's own IP location in Lviv, returned as if it were the cell's. From the
edge it would be France. This is the whole reason §4.3 exists.

**D — schema is strictly validated, so field acceptance is provable**

```
{"cellTowers":[{"radioType":"banana"}]}
→ 400  Json deserialize error: unknown variant `banana`, expected one of `gsm`, `wcdma`, `lte`, `nr`
{"wifiAccessPoints":[{"macAddress":"zz"}]}
→ 400  Json deserialize error: invalid length
{"cellTowers":[{"radioType":"nr","mobileCountryCode":262,"mobileNetworkCode":1,
                "primaryScramblingCode":301}]}
→ 400  Json deserialize error: missing field `locationAreaCode`
```

The third one is the 5G finding: NR needs identifiers our bridge does not currently read.

**E — no LAC fallback, full sweep**

```
DE Telekom gsm  no lacf hit across FULL lac space 0..65535
DE Telekom lte  no lacf hit across FULL lac space 0..65535
```

**F — no observed rate limit**

```
40 rapid POSTs in 35709 ms -> {"200":40}       # ~0.9 s each, no 429, no rate-limit headers
```

**G — macvendors is keyless but capped, and the local OUI file already answers**

```
$ curl -s https://api.macvendors.com/B8:27:EB:0A:0B:0C
Raspberry Pi Foundation
$ for i in 1..6; do curl -o /dev/null -w "%{http_code} "; done
200 200 429 200 200 429                        # ~1 req/s, as documented
```

**H — key-walled sources, verbatim refusals**

```
opencellid.org/cell/get?…            {"error":"API Key not known: ","code":2}
us1.unwiredlabs.com/v2/process.php   {"status":"error","message":"Invalid token","balance":0}
api.wigle.net/api/v2/network/search  401  Not Authorized (WiGLE.net)
location.services.mozilla.com/…      404  (dead)
```

**I — Apple, anonymous, working, rejected on terms**

```
POST https://gs-loc.apple.com/clls/wloc
→ HTTP 200, 77 bytes for 1 MAC; 4030 bytes for 60 MACs after the 2-byte-length fix
  18:d6:c7:e8:a6:f6  lat -180  lon -180  acc -1     # Apple's "I do not know this MAC" sentinel
```

**J — beaconDB live counters**

```
$ curl -s https://beacondb.net/stats.json
{"total_wifi":164145999,"total_cell":7994789,"total_bluetooth":6003901,
 "total_countries":219,"total_reports":343186478}
```
