# mayak («Маяк») — the state map and the facts the build stands on

Our lens into Shodan plus the path between our node and anywhere. Three tool tabs over one key that lives
on the edge (`edge/shodan.js`, `edge/net.js` in microspec-edge). Accent `#F5B94D` — the beam.

## Facts (measured 2026-09-25, `GET /api-info`, no credit spent)
- Plan `edu`, `query_credits 0`, `scan_credits 62648`, `monitored_ips 0`. `/api-info` is free; every page of
  `/shodan/host/search` costs one query credit → the live map is blocked until the balance is topped up, and
  the edge answers `{error:"no_query_credits"}` for it. The globe therefore plots `fixture.json` and says so.
- A browser cannot traceroute; every edge process exits through the VPN, so a trace leaves from OUR node
  (`from:"vpn"`) and the page names that origin instead of pretending it is the phone's path.
- Signed-in routes raise the runtime's authwall on a 401. A tab must not open the wall by merely being
  opened: the state card fetches only when `session` is set; the trace runs on a tap (a gesture), so a 401
  there is the wall doing its job.
- The paid heart («Нагляд»: monitors → Telegram alerts, model A in `meta/decisions.md`) needs a Shodan plan
  with Monitor; it is not wired and is NOT shown — a tab with a dead top-up button fails the premium bar.

## State map

| Tab · state | Stage | Island / controls | Primary verb | Demotes at 412×430 · 360×340 |
|---|---|---|---|---|
| map · idle (fixture) | globe spinning, amber points, `data-shown` | search field + country strip + «ХОСТИ · N» with a `sample` chip | type = filter locally; Enter = live search | globe keeps 340px max, page scrolls to the island |
| map · typed | points filtered, spin on | same, count updates; 0 → «Нічого за запитом» | — | same |
| map · live refused | fixture stays | status line names the reason (`creditsWarn` / `noKey`) | — | same |
| map · picked | spin stops, point pulses, globe flies | host panel above the island: ip · port · org · place, × closes | × | panel stacks; still one column |
| state · fixture | — | `sample` chip, warning panel when query credits = 0, two panels of rows | — | rows stay one column |
| state · live | — | chip gone, numbers from `/feed/shodan/info`, `data-live` | — | same |
| path · idle (fixture) | — | mode strip (to a site · to me), target field, «Трасувати»; DNS panel; hops panel with `sample` chip | Трасувати | field and button share the row; hops list scrolls |
| path · running | — | button disabled, `data-busy` | — | same |
| path · live | — | hops from `/feed/net/trace`, DNS from `/feed/net/dns`, `data-live`, origin line «від нашого вузла» | — | same |
| path · failed | — | status line `traceFail` under the island; fixture stays | Трасувати again | same |

Precedents: the globe consumer is `apps/globe` (`view.js`, its `e2e.spec.mjs` seeds on `canvas`); the
signed-in fetch shape is `apps/blackout` (wallet); the Island-with-Segmented shape is the kit's own.
