# Railway data sources

Evaluation done on 2026-10-16. Re-check before going to production: terms, quotas and endpoints change.

## Summary

| Need | Source used | Status |
|---|---|---|
| Timetables & stoppages | RailRadar `GET /v1/trains/{number}` | Adapter written from the docs, **not yet verified with a key** |
| Live running status | RailRadar `GET /v1/trains/{number}/live` | Adapter written from the docs, **not yet verified** |
| Station timetable | RailRadar `GET /v1/stations/{code}/trains` | Adapter written from the docs, **not yet verified** |
| Live station board & platforms | RailRadar `GET /v1/stations/{code}/live` | Adapter written from the docs, **not yet verified** |
| Station / train search | RailRadar `GET /v1/lookup/search/{stations,trains}` | Adapter written from the docs, **not yet verified** |
| Trains between two stations | RailRadar `GET /v1/trains/between/{from}/{to}` | Adapter written from the docs, **not yet verified** |
| Coach position | RailRadar `GET /v1/trains/{number}/coaches/{station}` | Adapter written from the docs, **not yet verified**. The docs don't say whether it is live or planned, so the UI labels it as timetable data |
| PNR, seat availability, fare | None available to this app | **Not offered.** The app links to indianrail.gov.in and irctc.co.in |
| Station coordinates (nearby, map) | RailRadar `GET /v1/lookup/stations` lists coordinates | **Not integrated yet** (nearby search returns "unsupported") |
| Track layouts (left/right sides) | None found | **Not available**. The UI never shows left/right without layout data |
| Development & tests | Built-in sample network (`lib/providers/in-memory`) | Working. Invented trains, simulated live data, always labelled |

## Candidates evaluated

### NTES — National Train Enquiry System (official)
- Operator: CRIS (Centre for Railway Information Systems) for Indian Railways. Public site: `enquiry.indianrail.gov.in`.
- Has the authoritative live running and platform data.
- **No public developer API.** The only report found is an older (~2013) Medianama report that CRIS has internal APIs but no plans to open them. Nothing newer turned up.
- Scraping the site is not used: it is not an authorised integration and is fragile.
- **Action:** if official access is a requirement, contact CRIS / Indian Railways directly about a data-sharing agreement.

### RailRadar (third-party) — integrated
- Docs: https://railradar.in/docs · Base URL `https://api.railradar.in/v1`
- **Not affiliated** with Indian Railways, IRCTC or NTES. It describes itself as an independent, crowd-powered tracker.
- **Auth:** `Authorization: Bearer <key>` (the docs also mention `X-API-Key`). The key is held server-side in `RAILRADAR_API_KEY`.
- **Response envelope:** `{ success, data, meta: { traceId, timestamp, executionTime, source } }`. Errors come back as `{ success: false, error: { code, message } }`.
- **Errors:** 400 bad input, 401 bad key, 404 not found, 429 quota exceeded, 503 upstream degraded.
- **Rate limits:** the free sandbox is "100 requests/month" on the docs landing page, but the error reference says 1,000/month. Paid tiers are in their developer console and are not published. **Confirm before launch.**
- **Update frequency:** not documented. Responses carry `lastUpdatedAt`, and `authoritative=true` bypasses their cache. This app treats data older than `LIVE_STALE_AFTER_MINUTES` (default 15) as stale.
- **Licensing / terms:** not stated on the docs pages reviewed. **Read their terms before production use**, especially on caching, redistribution and attribution.

Fields mapped, per the docs:

| Endpoint | Fields used |
|---|---|
| `/trains/{n}` | `train.{number,name,type,source,destination,runDays}`, `route[].{sequence,station.{code,name},arrival,departure,arrivalDay,departureDay,distance,isHalt,platform}` |
| `/trains/{n}/live?date=&includeCoordinates=true` | `lastUpdatedAt`, `status`, `delayMinutes`, `currentLocation.{stationCode,isActualPosition,segmentProgress}`, `route[].{stationCode,scheduledArrival/Departure,actualArrival/Departure,delayArrival/Departure,status,platform,lat,lng}`, `exceptions[]` |
| `/stations/{code}/trains` | `trains[].train.*`, `trains[].stop.{arrival,departure,arrivalDay,departureDay}` |
| `/stations/{code}/live?hours=` | `trains[].train.*`, `trains[].live.{type,expectedDepartureTime,platform,delayMinutes}` |

Known gaps:
- The schedule's `platform` is treated as the **usual** platform, not a confirmed one.
- The live board documents no expected **arrival** time. We derive it as scheduled + delay and label it *estimated*.
- A position interpolated between stations using `segmentProgress` is never labelled "actual", even when `isActualPosition` is true.

**Verifying the adapter** (uses about 4 requests):

```bash
RAILRADAR_API_KEY=... npm run verify:railradar
# optional: RAILRADAR_VERIFY_TRAIN=12951 RAILRADAR_VERIFY_STATION=NDLS
```

### Railway Engine (third-party)
- https://railengine.vercel.app/ — describes itself as a free, independent API for live status, position, delay, ETA and schedules.
- Unofficial. Its terms, reliability and quotas were not evaluated in depth. It's a possible second provider behind the same interface.

### Not yet checked
- **data.gov.in**: may hold static Indian Railways timetable datasets. Check the coverage and licence (usually GODL-India) before relying on it.
- **OpenStreetMap** (`railway=station`, track geometry; ODbL): a likely source of station coordinates and track geometry for maps. It's not suitable for live platform assignment.

## What this means for features

- **Truly real-time** (only with a working live provider): train position, delays, live platforms, approach detection.
- **Works from timetables alone:** route and stoppage lists, scheduled boards, the journey planner (labelled "scheduled", with lower confidence).
- **Cannot be built honestly with the sources found:** left/right approach direction (needs surveyed station track layouts), and exact track or platform from GPS.

## Adding another provider

Implement `RailDataProvider` (`lib/providers/types.ts`), map its fields into the domain types (`lib/domain/types.ts`), and register it in `lib/providers/index.ts`.

Rules for implementers:
- Return `null` when there's no data.
- Throw `RailDataError` on failures.
- Never fill gaps with guesses.
