# Test plan — Ghar Train

How to test the app: automated tests first, then manual test cases you can follow step by step.

All manual tests use the built-in **sample network** (`RAIL_DATA_PROVIDER=sample`). Its trains are invented (numbers 9xxxx) and their live status is simulated. The same pattern of trains repeats every 6 hours, so **exact times depend on when you test**. The expected results below describe what must be true, not exact times.

---

## 1. Setup

```bash
npm install
cp .env.example .env.local      # RAIL_DATA_PROVIDER=sample
npm run dev                     # open http://localhost:3000
```

Handy sample data:

| What | Use | Why |
|---|---|---|
| A train running right now | The first train chip under **"Try the sample network"** on the home page | Always picks a run that left 1–7 hours ago |
| Train with **no live data** | `90041`, `91041`, `92041`, `93041` (Bina–Katni Link) | Never has a live feed |
| Train with **stale live data** | `93001` | Its simulated feed is always 45 min old |
| Station **with** a track layout | `GWL` (Gwalior), `MTJ` (Mathura) | Left/right sides can be shown |
| Station **without** a layout | `AGC`, `BPL`, `BINA` … | Left/right must never be shown |
| Destination **not** on the main line | `SGO` (Saugor), `KTE` (Katni) | Forces the planner to find a change |

---

## 2. Automated tests

```bash
npm test             # 72 unit, service, planner and API tests (Vitest)
npm run typecheck    # TypeScript
npm run lint         # ESLint
npm run build        # production build (also checks Suspense / cacheComponents rules)
```

**Expected:** `72 passed | 3 skipped`, no type errors, no lint errors, and the build finishes.

The 3 skipped tests are the opt-in RailRadar checks (see section 5).

| File | What it covers |
|---|---|
| `tests/domain/domain.test.ts` | IST time handling, input validation, invalid or incomplete timetables |
| `tests/providers/providers.test.ts` | Train/station search, nearby stations, RailRadar errors (401/403/429/500/503, network, bad JSON), field mapping, caching |
| `tests/services/services.test.ts` | Stop display, missing/stale/delayed live data, station board, track sides, approaching trains |
| `tests/planner/planner.test.ts` | Alternative routes, minimum transfer time, missed connections, multiple changes, delays, invalid situations |
| `tests/api/routes.test.ts` | API envelopes, 400/404/503 errors, missing configuration, planner rate limit |

All tests use a hand-written fixture network (`tests/fixtures/network.ts`) and a fixed clock, so they give the same result every time.

Run one file: `npx vitest run tests/planner`. Watch mode: `npm run test:watch`.

---

## 3. Manual test cases

Record each result as **Pass / Fail** with a note. Test on a phone-width window (about 390 px) and on desktop.

### A. Home and search

| ID | Steps | Expected result |
|---|---|---|
| A1 | Open `/` | Gradient header "Where's my train?". The purple **Sample data** banner is visible. Search box shows **Train** selected |
| A2 | Type `sample` in the train search | The list shows sample trains after a short pause. Arrow keys move the highlight; Enter opens the train |
| A3 | Type `9` (one character) | No list appears (search needs 2+ characters) |
| A4 | Type `92001` and press Enter without picking from the list | Opens `/train/92001` |
| A5 | Switch to **Station**, type `gwa` | "GWL Gwalior Junction" is suggested; choosing it opens the board |
| A6 | Type text, then press the **×** button | The box clears and keeps focus |
| A7 | Tap a chip under **Try the sample network** | Opens that train or station |
| A8 | Visit a train, then return home | The train appears under **Recent** |
| A9 | Phone width: look at the bottom of the screen | Tab bar with Trains / Stations / Faster route. The current section is highlighted |

### B. Train live status (`/train/[number]`)

| ID | Steps | Expected result |
|---|---|---|
| B1 | Open the running train from the Try chip | Dark status card shows: **Simulated** badge, delay pill, a headline (e.g. "Departed Morena" or "Approaching …"), current location, progress bar, and the **Next stop** card with arrival/departure time, "in X min", timetable time and platform |
| B2 | Check the stop list | Passed stops are hidden behind **Show N earlier stops**. The next stop has a **Next stop** tag. Delays show as "+25m". Late times show the timetable time crossed out |
| B3 | Press **Show N earlier stops** | All passed stops appear, with filled dots |
| B4 | Tick **Show non-stop stations** | Stations the train passes without stopping appear, marked "(passes)" |
| B5 | Change **Train started** to Yesterday / 2 days ago | The page reloads for that run; the URL gets `?date=` |
| B6 | Open `/train/90041` | **Scheduled** badge, "Live position unavailable", "Current location unavailable — no live running data". No delay is shown and no train marker on the map |
| B7 | Open `/train/93001` | Yellow notice **"Live data may be outdated"**, saying the last update was 45 minutes ago |
| B8 | Open `/train/12345` | Error message "Train 12345 was not found." with a **Try again** button |
| B9 | Open `/train/abc` | Error "Train number must be 4–5 digits." |
| B10 | Wait about 1 minute on the page | "Fetched …" updates by itself (auto-refresh). **Refresh** also works |
| B11 | Check platforms | Each platform shows its source: "simulated" or "usual" (timetable). A platform is never shown as confirmed without live data |
| B12 | Route map card | Schematic line with station codes. The train marker says it is "interpolated", not a real GPS position |
| B13 | Press **Full timetable** | Opens `/train/[number]/route`: a table of stops with arrival/departure, halt, day, km and **Usual PF** |
| B14 | Press **Find a faster alternative** | Opens the planner with the train and next station already filled in |

### C. Station board (`/station/[code]`)

| ID | Steps | Expected result |
|---|---|---|
| C1 | Open `/station/GWL` | Teal "GWL" tag, station name, "Simulated live board". Dark board with rows: time (amber), "in X min", train, from → to, previous/next stop, status, delay, platform |
| C2 | Use the tabs Upcoming / At station / Delayed / Arrived-departed | Each tab shows only matching trains; the counts match |
| C3 | Type `bhopal` in the filter | Only trains to or from Bhopal remain |
| C4 | Choose a platform | Only trains at that platform remain |
| C5 | Change **Time window** to Next 8 hours | More trains appear |
| C6 | Filter something that matches nothing | "No trains match" message |
| C7 | Look for a 9xx51 train in slot 2 (e.g. `92051`) | It is shown as **Scheduled** with a "usual" platform: no live data, no invented status |
| C8 | Open `/station/ZZZ` | "Station ZZZ was not found." |
| C9 | Phone width | Nothing overlaps; the filters fit in two rows |

### D. Approaching trains (`/station/[code]/approaching`)

| ID | Steps | Expected result |
|---|---|---|
| D1 | Open `/station/GWL/approaching` | **Track view** with platforms PF 1–4. "← MRA / DHO" on the left and "DAA / VGLJ →" on the right. Train chips sit on their platform (at the station) or on the side they come from |
| D2 | Read a card for a train arriving from Delhi | "From Morena — enters from the left" (left/right comes from the route, not the map) |
| D3 | Open `/station/AGC/approaching` | Message "No verified track layout for this station". Cards say "From X" **without** left/right |
| D4 | Leave the page open for 30 s | It refreshes by itself; trains move between approaching, at platform and just departed |
| D5 | Check the note at the bottom | It explains that GPS can't tell the exact platform or track, so the app never guesses |
| D6 | At a station **without** a layout (e.g. `AGC` or `BPL`), look at the **"Which trains come from your left or right?"** card | It asks one question: "Trains towards X leave on ← My left / My right →" |
| D7 | Answer it (e.g. **My right**) | The card becomes **Your left and right**, showing both stations: one answer sets both sides at a simple station. Trains are grouped under **← From your left** / **From your right →**, and the track view appears with your sides |
| D8 | Press **← From left** / **From right →** filter chips | Only trains coming in from that side are listed; the counts match the groups |
| D9 | Press **⇄ I'm facing the other way** | Every side flips |
| D10 | Reload the page / come back later | Your setting is remembered for that station (this device only). **Reset** clears it |
| D11 | Open the station's full board after setting sides | Rows show **← From left** / **From right →** tags |
| D12 | At `GWL` (has a station diagram) before setting anything | Sides follow the diagram, labelled "the diagram's left". After you set your own, they say "your left" and your setting wins |

### E. Faster-route planner (`/planner`)

| ID | Steps | Expected result |
|---|---|---|
| E1 | Open `/planner` | Three numbered steps. The station step is disabled until a train is chosen |
| E2 | Step 1: pick the running sample train | Step 2 fills itself with the train's **next station**. A blue note explains why ("We picked … — change it if that's wrong") |
| E3 | Step 3: tap a station chip from the route | The destination box shows that station |
| E4 | Destination `SGO`, press **Find faster options** | The form shrinks to a summary bar (Recheck / Edit). The **Our suggestion** card gives plain steps: stay on until Bina Junction → change (wait time and risk) → take the Bina–Katni train → reach Saugor. Then a notice that your train doesn't stop at Saugor, then the option cards |
| E5 | Check an option card | Arrival time, "in Xh", changes, risk (Comfortable / Tight / Risky change), confidence, and each leg with its data badge. Connecting trains without live data say so |
| E6 | Destination `BPL` (on your train's route) | Either faster options with "X earlier", or "Stay on your train — it's the quickest way". Options slower than staying on are not listed (a count is shown) |
| E7 | Open **Connections we ruled out** (if shown) | Each has a reason, e.g. "Only 12 min to change; at least 15 min needed" or "already departed" |
| E8 | **More options** → minimum change time 10 min, run again | Tighter connections can appear, marked "Risky change" |
| E9 | **More options** → most changes 1 | No option has more than 1 change |
| E10 | Choose a station your train has **already passed** as step 2 | Error: "Your train has already left X. Choose the station it reaches next (Y)." |
| E11 | Pick the same station for steps 2 and 3 | "Your destination must be different from your current station." |
| E12 | Press **Edit**, change the destination, search | The new result shows and the form collapses again |
| E13 | Press **Compare routes** | Opens the comparison (section F) |
| E14 | Press **Journey details** on an option | Opens the details (section G) |
| E15 | Reload the results page | The same search comes back (the inputs are in the URL) |
| E16 | Press **Find faster options** 11 times within one minute | The 11th shows a rate-limit error ("Too many searches…") |

### F. Compare routes (`/planner/compare`)

| ID | Steps | Expected result |
|---|---|---|
| F1 | Open from the planner | Timeline chart: solid bars are time on a train, striped bars are waiting. Train numbers are on the bars and the time axis starts now. Below it, a table with arrival, time to go, vs staying, waiting, changes, delays, data and risk |
| F2 | Press **Fewest changes**, then **Lowest risk** | The order changes. A note says which route is best for that choice |
| F3 | Hover a bar (desktop) | A tooltip shows the train, stations and times |

### G. Journey details (`/planner/journey`)

| ID | Steps | Expected result |
|---|---|---|
| G1 | Open from an option | Arrival headline; "Your current train" card, a dashed **Change at …** card (arrive/depart/wait/minimum, risk, notes), then the **Connecting train** card with board/alight stations, times, platforms and delays |
| G2 | Press a train name | Opens that train's live status |
| G3 | Open a details link after a few minutes, once that option is no longer possible | "This option is no longer available" with a link back to current options |

### H. Nearby stations (`/station`)

| ID | Steps | Expected result |
|---|---|---|
| H1 | Press **Stations near me** and allow location | A list of stations within 50 km with distances (only near the sample corridor between Delhi and Bhopal). Otherwise: "No stations found within 50 km" |
| H2 | Press it and **deny** location | "Location permission was denied. Search by name instead." Nothing breaks |

### L. "Where Is My Train" features

| ID | Steps | Expected result |
|---|---|---|
| L1 | Home → **From → To** tab; From `NDLS`, To `GWL`, Today → **Find trains** | Opens `/between`: trains from New Delhi to Gwalior with departure, arrival, duration, stops, km and run-day dots. Trains that already left are hidden behind "Show N train(s) that already left" |
| L2 | Press **⇅** | From and To swap |
| L3 | From `GWL`, To `NDLS` | Only trains going that way (e.g. the Bhopal–Delhi Express) |
| L4 | On a running train's page → **Destination alarm**: pick the next stop, "45 min before", press **⏰ Set alarm** | The card shows "Alarm set … Will ring at about HH:MM". When that time comes: sound, vibration (phone), a notification if allowed, and an orange "… is coming up!" banner with **Stop** |
| L5 | Set an alarm on a train with no live data (e.g. `92051`) | Works using timetable times and says "Based on the timetable" |
| L6 | **Coach position**: choose a station, type your coach (e.g. `B2`) | Coach strip from the engine; your coach is highlighted with "Coach B2 is number 7 from the engine". A coach not on the train shows "not in this train's coach list" |
| L7 | Running train's status card | Shows "🚄 ~52 km/h" (simulated in sample mode) |
| L8 | Open a train once, then turn off Wi-Fi/data and reload | "You're offline — showing the status saved on this phone at HH:MM" |
| L9 | Home → **PNR, seats & fare** | Explains these are only on official sites, with links to indianrail.gov.in and irctc.co.in. No made-up PNR data |
| L10 | Chrome on Android → menu → **Add to Home screen** | Installs "Ghar Train" with its icon and opens without the browser bar |

### M. Demo network and API page

| ID | Steps | Expected result |
|---|---|---|
| M1 | Search `rajdhani`, `howrah`, `bengaluru` | Demo trains on those routes (both directions) |
| M2 | Trains between `NDLS` → `MMCT` | Demo Mumbai Rajdhani and Demo Frontier Mail |
| M3 | Station boards `HWH`, `MAS`, `CSMT`, `JP` | Trains listed with platforms |
| M4 | Open `/api-docs`, press **Try it** on each endpoint | HTTP 200 with JSON. The Faster route example is pre-filled with a train running now |
| M5 | Add a station and a train to `data/demo-network.json`, restart `npm run dev` | The new train appears in search. A mistake in the file gives a clear message naming the problem |

### I. Data honesty (most important)

| ID | Check | Expected result |
|---|---|---|
| I1 | Every time, platform and position has a source label | Live / Estimated / Scheduled / Simulated / Unavailable |
| I2 | Trains without a live feed (B6, C7) | No position, delay or live platform is ever made up |
| I3 | Stale data (B7) | Clearly marked as possibly outdated |
| I4 | Stations without a layout and without your setting (D3) | Never "from the left/right" |
| I5 | Sample mode | The purple banner shows on every page |
| I6 | Planner suggestions | Never a train that has already left, never a change shorter than the minimum |

### J. Errors and configuration

| ID | Steps | Expected result |
|---|---|---|
| J1 | Stop the server while a page is open, then press Refresh | "Could not reach the server. Check your connection." The last data stays visible |
| J2 | `npm run build && npm start` **without** `RAIL_DATA_PROVIDER` | Red banner "No railway data source configured…". No sample data is served by accident |
| J3 | `RAIL_DATA_PROVIDER=railradar` with no `RAILRADAR_API_KEY` | Error saying `RAILRADAR_API_KEY` is not set |
| J4 | Open `/does-not-exist` | "Page not found" with a link back to search |

### K. Accessibility and look

| ID | Check | Expected result |
|---|---|---|
| K1 | Use only the keyboard (Tab, arrows, Enter, Escape) | Every control can be reached and used. A focus outline is visible. "Skip to content" appears on the first Tab |
| K2 | Switch the OS to dark mode | Dark theme; all text stays readable |
| K3 | Screen reader (VoiceOver: Cmd+F5) on the search box | Announces the label and "N suggestions" |
| K4 | 390 px, 768 px and 1280 px widths | No sideways scrolling; nothing overlaps or is cut off |
| K5 | Turn on reduced motion in the OS | No animations |

---

## 4. Testing the API directly (optional)

With the dev server running:

```bash
B=http://localhost:3000
curl "$B/api/meta"                              # provider info + examples
curl "$B/api/trains/search?q=sample"
curl "$B/api/stations/search?q=gwa"
curl "$B/api/trains/92001"                      # timetable
curl "$B/api/trains/92001/live"                 # live status view
curl "$B/api/stations/GWL/board?hours=4"
curl "$B/api/stations/nearby?lat=26.2&lng=78.2"
curl -X POST "$B/api/journeys/alternatives" -H 'content-type: application/json' \
  -d '{"trainNumber":"92001","currentStation":"DHO","destination":"SGO"}'

# Errors
curl -i "$B/api/trains/search?q=a"              # 400
curl -i "$B/api/trains/12345/live"              # 404
curl -i "$B/api/stations/ZZZ/board"             # 404
```

Every response is `{ "ok": true, "data": …, "meta": … }` or `{ "ok": false, "error": { "code", "message" } }`.

For the planner, use the running train and its current next station (from `/api/trains/<n>/live` → `nextStop.stationCode`). Otherwise you get "already left" or "already completed" errors.

---

## 5. Testing with real data (RailRadar)

Only after getting an API key. This uses about 4 requests of your quota:

```bash
RAILRADAR_API_KEY=your-key npm run verify:railradar
```

**Expected:** 3 passing tests that print a real timetable, a live status (when the train is running) and a station board. Any failure points to a field-mapping difference to fix in `lib/providers/railradar/provider.ts`.

Then repeat sections B–E with `RAIL_DATA_PROVIDER=railradar` and real train numbers. Check that badges show **Live** (not Simulated) and that platforms are only "confirmed" when RailRadar reports them.

---

## 6. Known gaps in testing

- There are no automated browser (end-to-end) tests yet; sections A–K are manual. Playwright is the suggested next step.
- RailRadar has not been tested against the real API (needs a key).
- Results depend on the time of day in sample mode; the automated tests use a fixed clock to avoid this.
