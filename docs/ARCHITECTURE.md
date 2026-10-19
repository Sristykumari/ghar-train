# Architecture

Next.js 16 App Router with React 19, TypeScript and Tailwind v4. This is the stack the project started with; no extra frameworks were added. The backend is made of Next.js Route Handlers under `app/api`. There is no database: everything is fetched from the configured provider and cached in memory.

```
Browser (client components)
  │  fetch /api/*  (lib/client/api-client.ts)
  ▼
Route handlers  app/api/**/route.ts      validation, envelope, errors, rate limit (lib/server/*)
  ▼
Services        lib/services/*           train status, station board, freshness
Planner         lib/planner/*            journey planning (pure; no UI, no provider specifics)
  ▼
Provider        lib/providers/*          RailDataProvider interface + TTL cache
  ├─ railradar/  third-party API adapter (server-only key)
  └─ in-memory/  sample network + simulator (dev/test only)
Domain          lib/domain/*             types, time (IST), validation, errors
```

## Folder structure

```
app/
  page.tsx                       Home: train + station search
  station/page.tsx               Station search + nearby (opt-in geolocation)
  station/[code]/page.tsx        Station platform board
  station/[code]/approaching/    Approaching trains + track diagram
  train/[number]/page.tsx        Live status
  train/[number]/route/          Route & stoppage timetable
  planner/page.tsx               Alternative train finder
  planner/compare/               Journey comparison
  planner/journey/               Journey details
  api/meta                       Active provider + capabilities
  api/trains/search, api/stations/search, api/stations/nearby
  api/trains/[number]            Timetable
  api/trains/[number]/live       Live status view
  api/stations/[code]/board      Station board view
  api/journeys/alternatives      POST: plan alternatives
components/{ui,layout,search,train,station,planner}
lib/{domain,providers,services,planner,server,client}
tests/{domain,providers,services,planner,api,live,fixtures}
docs/
```

## Data honesty rules (enforced in code)

- Every time, platform and position carries a `DataQuality`:
  - `live`: reported by the feed, fresh;
  - `estimated`: derived from live data, or live data that has gone stale;
  - `scheduled`: from the timetable;
  - `simulated`: sample data only;
  - `unavailable`: no data.
- Live data older than `LIVE_STALE_AFTER_MINUTES` drops to `estimated`, and the UI says it may be outdated.
- A platform comes from the live feed when it's reported. Otherwise it's the timetable's *usual* platform, and it's labelled that way. It is never guessed.
- Track side (left/right) needs to know which way you are facing, so it comes from one of two honest sources:
  - **your setting**, made once per station on the Approaching screen ("Trains towards X leave on my left/right") and stored only in your browser;
  - a verified **station layout**.
  
  The side of each train then follows from the station it actually comes from on its route (`lib/services/orientation.ts`). Map bearing and GPS are never used. With neither source, no side is shown.
- Positions interpolated between stations are never marked `isActual`.
- In production, `RAIL_DATA_PROVIDER` must be set explicitly, so sample data can't be served by accident. Whenever sample data is active, the UI shows a banner.

## Journey planning algorithm

**Model.** Stations are nodes. Each dated run of a train (a *trip*) gives time-dependent edges: from each halt where it can be boarded to each later halt where it can be left. An edge is only usable if the passenger reaches the boarding halt by `departure − minTransfer` and the train hasn't already left there (checked against the clock and live data).

**Search: round-based earliest arrival (RAPTOR-style), in `lib/planner/raptor.ts`.**
- Round *k* computes the earliest arrival at every station using exactly *k* trains after leaving the current one.
- A label is kept only if it beats every earlier round.
- So the destination labels form the Pareto set of (arrival time, number of changes).
- Pruning: a ride is abandoned once it can't beat the best known arrival at the destination.

**Alternative finder (`lib/planner/planner.ts`):**
1. Load the passenger's train and apply its live status if available. Reject impossible situations: the run has finished, the train has already left the given station, or the station isn't on its route.
2. The candidate interchanges are the halts still ahead: the current one, if the train hasn't left it, plus later halts before the destination.
3. From each interchange X, readiness time = expected arrival of the current train at X. Run RAPTOR up to `maxChanges` rides. Also collect up to two direct trains, and record near-misses (too little time to change, or already gone) to show the user.
4. Overlay live data. Every candidate is evaluated against timetable times. Then live status is fetched for the connecting trains in the most promising options (6 lookups at most), and every connection is checked again.
5. Ranking and filtering:
   - collapse options that reach the same final train;
   - drop options that are Pareto-dominated on (arrival, changes, risk);
   - drop options slower than staying on (their count is reported);
   - rank by arrival time at the destination, then changes, then risk.
6. Each change gets a risk level, based on slack over the minimum transfer time:
   - **high:** less than 10 min of slack;
   - **medium:** less than 25 min;
   - **low:** otherwise.

   Risk goes up one level when the arriving train's time comes only from the timetable. Notes mention long delays and unknown or usual-only platforms.
7. Confidence comes from the risk and the worst data quality among the legs.

**Lazy timetable loading** (`TimetableSource`):
- The planner only asks the provider about stations the search actually reaches.
- Station timetables are filtered by departure time before any full train timetable is fetched.
- A per-request budget (`PLANNER_MAX_STATION_LOOKUPS`) caps upstream calls. When it's hit, the result is flagged as truncated.

### Limitations

- Live data is applied to the current train and to the connecting trains of the top options only. A connection rejected on timetable times (for example, a train that will in fact be late enough to catch) isn't re-checked against live data.
- The search horizon is 24 hours. Only trains leaving at most 3 days earlier are considered (enough for long-distance runs).
- No walking time between platforms; the minimum transfer time covers it. Different stations in the same city aren't linked as interchanges.
- Delays are assumed to stay constant over the rest of a run; there's no prediction of recovery or growth.
- No fares, seat or ticket availability. A reserved ticket may not be valid on another train.
- With a quota-limited provider the search can be truncated. This is always shown to the user.

## Caching and quotas

`withCache` (`lib/providers/cached.ts`):
- timetables: 6 h;
- live data: 60 s (15 s for the sample provider);
- in-flight de-duplication, and failures are never cached.

It works per process; use a shared cache such as Redis when running several instances. `POST /api/journeys/alternatives` is limited to 10 requests per minute per client.

## Rendering

`cacheComponents` is enabled. Pages are static shells. Dynamic params are read inside `<Suspense>`, and client components fetch from `/api/*` and poll live views (every 60 s; 30 s for approaching trains). Polling pauses when the tab is hidden. API handlers call `connection()` so that responses are never prerendered.
