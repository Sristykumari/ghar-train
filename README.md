# Ghar Train

Train tracking and journey planning for Indian Railways passengers. It covers live train status, station platform boards, approaching trains, and a **faster-route finder** for when you're on a slow train and need to get home sooner.

Every time, platform and position is labelled **Live**, **Estimated**, **Scheduled**, **Simulated** or **Unavailable**. The app never invents live positions or platforms.

## Quick start

```bash
npm install
cp .env.example .env.local     # defaults to the built-in sample network
npm run dev                    # http://localhost:3000
```

With the default `RAIL_DATA_PROVIDER=sample`, the app runs on our own **demo network** from [data/demo-network.json](data/demo-network.json). It covers Delhi, Mumbai, Kolkata, Chennai, Bengaluru, Jaipur, Lucknow, Pune, Ahmedabad and more, with ~100 trains running both ways all day. Edit that file to add or change stations and trains (the format is explained at the top of the file). In this mode:
- stations are real places, but trains are invented: numbered 9xxxx and named "Demo …";
- live running data is simulated;
- a purple banner marks every page.

Try these:
- train `90001` (live status);
- station `GWL` (board, plus the approaching view with a sample track layout);
- `/planner` with a train that is currently running.

To use real data, set up the RailRadar adapter (see [docs/DATA_SOURCES.md](docs/DATA_SOURCES.md)):

```bash
RAIL_DATA_PROVIDER=railradar
RAILRADAR_API_KEY=your-key
npm run verify:railradar       # checks the field mapping against the real API (~4 requests)
```

## Our own API

Everything the app shows comes from its own API under `/api/...`. Open **`/api-docs`** for the list of endpoints, with a **Try it** button on each that calls it live.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Frontend and backend (Next.js dev server) |
| `npm run build` / `npm start` | Production build and server |
| `npm test` | Unit, service, planner and API tests (Vitest) |
| `npm run typecheck` | TypeScript |
| `npm run lint` | ESLint |
| `npm run verify:railradar` | Opt-in live check of the RailRadar adapter (needs a key; uses quota) |

## Environment variables (server-only)

| Variable | Default | Purpose |
|---|---|---|
| `RAIL_DATA_PROVIDER` | `sample` in dev; **required** in production | `sample` or `railradar` |
| `RAILRADAR_API_KEY` | — | RailRadar Bearer key. Never sent to the browser |
| `RAILRADAR_BASE_URL` | `https://api.railradar.in/v1` | Override for testing |
| `LIVE_STALE_AFTER_MINUTES` | `15` | Live data older than this is shown as possibly outdated |
| `PLANNER_MAX_STATION_LOOKUPS` | `12` | Upstream budget per planner request |
| `LOG_LEVEL` | `info` | `debug`/`info`/`warn`/`error`; JSON logs |

## Screens

1. **Home and search** — `/`: train and station search.
2. **Live status** — `/train/[number]`:
   - status, delay, next stop and platform;
   - stop timeline;
   - a schematic map, shown only when the provider gives coordinates.
3. **Station board** — `/station/[code]`: arrivals and departures, plus filters by train, destination, platform and time window.
4. **Approaching trains** — `/station/[code]/approaching`: trains near the station, and a track diagram when a layout exists.
5. **Route and stoppages** — `/train/[number]/route`.
6. **Alternative train finder** — `/planner`.
7. **Journey comparison** — `/planner/compare`: a timeline chart and a table, sortable by fastest, fewest changes or lowest risk.
8. **Journey details** — `/planner/journey`.

There is also `/station`, for station search and opt-in "stations near me".

## Feature status

| Feature | Status |
|---|---|
| Search, timetable, stoppage list | ✅ Works with any provider that supplies timetables |
| Journey planner (transfers, minimum change time, missed connections, multi-change, ranking) | ✅ Implemented and tested on fixtures. On real data it depends on timetable coverage and the API quota |
| Live status, delays, live platforms, live board, approach detection | ⚠️ Implemented. **Only simulated so far.** The RailRadar adapter follows its docs but hasn't been run against the real API (no key was available) |
| Train position on a map | ⚠️ Schematic SVG from station coordinates. RailRadar coordinates aren't verified; there are no map tiles |
| Left/right approach direction | ✅ Works at any station once you set which way you're facing (one tap, remembered per station). Built-in station diagrams are optional; no real layout source was found |
| Trains between stations (A → B, by date) | ✅ From timetables (sample now; RailRadar `/trains/between` adapter written, not yet verified) |
| Coach position (where your coach stops) | ⚠️ Simulated in sample mode; RailRadar `/trains/{n}/coaches/{station}` adapter written, not yet verified |
| Destination alarm (sound, vibration, notification) | ✅ Works while the page is open; uses live expected times, or the timetable when there is no live data |
| Train speed | ⚠️ Simulated in sample mode; read from RailRadar live data when available |
| Offline | ✅ Shows the last saved train status / board with "You're offline — saved at …". Can be added to the home screen (web app manifest) |
| PNR, seat availability, fare | ❌ Not available from our data source — the app links to the official Indian Railways / IRCTC sites instead |
| Tracking with no internet (mobile-tower based) | ❌ Not possible in a web app; needs a native Android app |
| Nearby stations | ⚠️ Works with the sample provider. Not yet available with RailRadar (needs its station directory with coordinates) |

How to test (automated + step-by-step manual test cases): [docs/TEST_PLAN.md](docs/TEST_PLAN.md).

Details: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) (layers, planning algorithm, limitations) and [docs/DATA_SOURCES.md](docs/DATA_SOURCES.md) (providers, fields, quotas, licensing).

## Next steps for genuine real-time tracking

1. Get a RailRadar key, run `npm run verify:railradar`, and fix any field-mapping differences it reveals.
2. Review RailRadar's terms (caching, redistribution, attribution) and choose a plan that fits the traffic. The free sandbox only allows about 100 requests a month.
3. For authoritative data, ask CRIS / Indian Railways about official NTES access.
4. Add station coordinates (RailRadar directory or OpenStreetMap) to enable nearby search and maps.
5. Swap the in-memory cache for a shared one (e.g. Redis) before running more than one server instance.
6. Add browser end-to-end tests (e.g. Playwright) for the interactive screens.
