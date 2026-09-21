# launches — the countdown, the map and the month

## Design refresh 2026-09-21

The app was one screen (a feed of upcoming launches) plus a saved list. Two things were already in the
data and thrown away: **every pad carries a latitude and a longitude**, and **every launch carries how far
its date is to be believed**. The refresh is those two facts made visible, on two new tabs and inside the
drill-down.

### The finding that shaped everything: most launch dates are not dates

Launch Library answers "sometime in Q4" the same way it answers a confirmed T-0 — with a timestamp. Of the
next 40 launches (measured 2026-09-21 against `ll.thespacedevs.com/2.2.0/launch/upcoming/`):

| `net_precision` | count | what `net` actually says |
|---|---|---|
| SEC / MIN / HR | 11 | a real T-0 |
| DAY | 2 | the day, at 00:00Z |
| M (month) | 12 | the **last day of the month**, at 00:00Z |
| Q4 (quarter) | 15 | the **last day of the quarter**, at 00:00Z |

Thirteen of those forty sat on 31 December. Rendered through the old card meta each one read
`31 груд., 00:00 · за 101 дн` — a confirmed minute with a countdown ticking towards it, for a launch nobody
has scheduled. So:

- `data.js` maps `net_precision` to how far the date is to be believed and returns it as `precision`;
- the runtime's `whenLabel` takes that (`meta.precision` names the companion field) and stops where the
  timestamp stops being true — `жовтень 2026`, `IV кв. 2026`, or the full clock when there is one;
- `day` is filled ONLY for a launch someone has dated, so the calendar's marks cannot lie;
- the feed groups into **Найближчі сім днів · З датою · Без точної дати**, the last collapsed — the shape
  of the schedule is now the first thing the list says.

### Земля — the pads

The systemic globe (`/_rt/globe.js`), the same Earth the globe and sun apps spin. It plots **sites, not
launches**: launches cluster (25 of the next 40 leave from the USA), so one dot per fix and its radius
carries how many launches wait there. A tap hit-tests the points and the row below expands to the same
selection — the pin and the row are one control. The expanded row prints the fix as a map writes it
(`28.56° N, 80.58° W`), never as signed decimals.

A pad with no fix, or one at (0, 0), is simply not plotted — a pin in the Gulf of Guinea is worse than a
missing pin.

### Календар — the month

The systemic month grid (`/_rt/calendar.js`, added for this app and built to know nothing about launches).
Marked days carry an accent dot; `pick="marked"` means an empty day is plain text rather than a disabled
button. Under it: the picked day's launches, or the whole month's when no day is picked — and then the
block this app exists to be honest about, **Цього місяця, без точної дати**, holding the launches the
source placed in the month but not on a day.

The arrows are bounded by the months the app actually holds. Paging into four empty years is a control
that answers nothing.

### The drill-down's body

`detail.view` — the runtime keeps the overlay, the app bar, the favourite star and Back; the body is a
live **T-minus** clock (one interval, and only where there is something to count) over the pad on the
globe. A month-precision launch gets the Earth and the fix, and no clock.

### One request, not three

The globe and the calendar read the items the list loaded — a tool tab has no `load` of its own. At the
old `limit=15` both screens looked at a fortnight. `limit=40` reaches 2026-12-31 in one call: three
months, eleven countries, thirty-one sites, against a budget of fifteen requests an hour per IP.
