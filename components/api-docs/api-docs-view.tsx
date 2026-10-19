"use client";

import { useEffect, useState } from "react";

interface Endpoint {
  method: "GET" | "POST";
  path: string;
  title: string;
  description: string;
  example: string;
  body?: Record<string, unknown>;
  params?: { name: string; text: string }[];
}

const ENDPOINTS: Endpoint[] = [
  {
    method: "GET",
    path: "/api/meta",
    title: "Data source",
    description: "Which data source is active, what it can do, and example trains running right now.",
    example: "/api/meta",
  },
  {
    method: "GET",
    path: "/api/trains/search?q=",
    title: "Search trains",
    description: "Find trains by number or name (at least 2 characters).",
    example: "/api/trains/search?q=rajdhani",
    params: [{ name: "q", text: "Number or part of the name" }],
  },
  {
    method: "GET",
    path: "/api/stations/search?q=",
    title: "Search stations",
    description: "Find stations by code or name.",
    example: "/api/stations/search?q=mumbai",
    params: [{ name: "q", text: "Code or part of the name" }],
  },
  {
    method: "GET",
    path: "/api/trains/{number}",
    title: "Timetable",
    description: "Every stop with arrival, departure, day, distance and usual platform.",
    example: "/api/trains/92001",
  },
  {
    method: "GET",
    path: "/api/trains/{number}/live?date=",
    title: "Live status",
    description: "Where the train is, delay, next stop, speed, and every stop with expected times. Each value says if it is live, estimated, scheduled or simulated.",
    example: "/api/trains/90001/live",
    params: [{ name: "date", text: "Optional. Day the train left its first station (YYYY-MM-DD). Default: the run in progress" }],
  },
  {
    method: "GET",
    path: "/api/trains/between?from=&to=&date=",
    title: "Trains between stations",
    description: "All direct trains from one station to another on a date.",
    example: "/api/trains/between?from=NDLS&to=MMCT",
    params: [
      { name: "from, to", text: "Station codes" },
      { name: "date", text: "Optional. Travel date at the from station. Default: today" },
    ],
  },
  {
    method: "GET",
    path: "/api/trains/{number}/coaches/{station}",
    title: "Coach position",
    description: "Coach order from the engine at a station.",
    example: "/api/trains/92001/coaches/KOTA",
  },
  {
    method: "GET",
    path: "/api/stations/{code}/board?hours=",
    title: "Station board",
    description: "Arrivals and departures with platform, delay, previous and next stop.",
    example: "/api/stations/GWL/board?hours=2",
    params: [{ name: "hours", text: "Optional. 1–8, default 4" }],
  },
  {
    method: "GET",
    path: "/api/stations/nearby?lat=&lng=",
    title: "Nearby stations",
    description: "Stations within a radius of a location, nearest first.",
    example: "/api/stations/nearby?lat=28.64&lng=77.22&radiusKm=30",
  },
  {
    method: "POST",
    path: "/api/journeys/alternatives",
    title: "Faster route",
    description: "Ways to reach a destination sooner by changing trains, ranked by arrival time. Limited to 10 requests a minute.",
    example: "/api/journeys/alternatives",
    body: { trainNumber: "90001", currentStation: "AGC", destination: "BPL", minTransferMinutes: 15, maxChanges: 2 },
  },
];

function Endpoint({ e }: { e: Endpoint }) {
  const [url, setUrl] = useState(e.example);
  const [body, setBody] = useState(e.body ? JSON.stringify(e.body, null, 2) : "");
  const [result, setResult] = useState<{ status: number; ms: number; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    const started = performance.now();
    try {
      const res = await fetch(url, e.method === "POST" ? { method: "POST", headers: { "Content-Type": "application/json" }, body } : undefined);
      const text = await res.text();
      let pretty = text;
      try {
        pretty = JSON.stringify(JSON.parse(text), null, 2);
      } catch {
        // not JSON — show as is
      }
      setResult({ status: res.status, ms: Math.round(performance.now() - started), text: pretty });
    } catch {
      setResult({ status: 0, ms: 0, text: "Could not reach the server." });
    } finally {
      setBusy(false);
    }
  }

  const id = e.path.replace(/[^a-z]+/gi, "-");
  return (
    <section className="rounded-2xl border border-border bg-surface p-4 sm:p-5" aria-labelledby={id}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-md px-2 py-0.5 font-mono text-xs font-bold ${e.method === "GET" ? "bg-teal-bg text-teal" : "bg-accent-bg text-accent"}`}>{e.method}</span>
        <code className="font-mono text-sm break-all">{e.path}</code>
      </div>
      <h2 id={id} className="mt-2 text-lg font-semibold">
        {e.title}
      </h2>
      <p className="text-sm text-muted">{e.description}</p>
      {e.params && (
        <ul className="mt-2 space-y-0.5 text-sm">
          {e.params.map((p) => (
            <li key={p.name}>
              <code className="font-mono text-xs font-semibold">{p.name}</code> — <span className="text-muted">{p.text}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          id={`${id}-url`}
          value={url}
          onChange={(ev) => setUrl(ev.target.value)}
          aria-label="Request URL"
          className="min-w-0 flex-1 rounded-xl border border-border bg-surface-2 px-3 py-2 font-mono text-sm"
        />
        <button type="button" onClick={run} disabled={busy} className="rounded-xl bg-primary px-4 py-2 font-semibold text-primary-fg hover:opacity-90 disabled:opacity-60">
          {busy ? "Calling…" : "Try it"}
        </button>
      </div>
      {e.method === "POST" && (
        <textarea
          id={`${id}-body`}
          value={body}
          onChange={(ev) => setBody(ev.target.value)}
          aria-label="Request body (JSON)"
          rows={6}
          className="mt-2 w-full rounded-xl border border-border bg-surface-2 px-3 py-2 font-mono text-xs"
        />
      )}
      {result && (
        <div className="mt-3 min-w-0">
          <p className="mb-1 text-xs font-semibold">
            <span className={result.status >= 200 && result.status < 300 ? "text-ok" : "text-bad"}>HTTP {result.status}</span>
            <span className="text-muted"> · {result.ms} ms</span>
          </p>
          <pre className="max-h-80 overflow-auto rounded-xl bg-board p-3 font-mono text-xs text-board-fg">{result.text}</pre>
        </div>
      )}
    </section>
  );
}

/**
 * Fills the faster-route example with a demo train that is running right now
 * and its real next station, so "Try it" works whenever the demo is shown.
 */
function useLiveExample(): Record<string, unknown> | null {
  const [body, setBody] = useState<Record<string, unknown> | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const meta = await (await fetch("/api/meta")).json();
        for (const t of meta?.data?.examples?.trains ?? []) {
          const live = await (await fetch(`/api/trains/${t.number}/live`)).json();
          const next = live?.data?.nextStop?.stationCode;
          const dest = live?.data?.train?.destinationCode;
          if (next && dest && next !== dest) {
            if (!cancelled) setBody({ trainNumber: t.number, currentStation: next, destination: dest, minTransferMinutes: 15, maxChanges: 2 });
            return;
          }
        }
      } catch {
        // keep the static example
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return body;
}

export function ApiDocsView() {
  const liveBody = useLiveExample();
  return (
    <div className="space-y-5">
      <header>
        <p className="text-sm font-semibold tracking-wide text-primary uppercase">Developers</p>
        <h1 className="text-2xl font-bold sm:text-3xl">Ghar Train API</h1>
        <p className="mt-1 max-w-2xl text-muted">
          The same API the app uses. Every response is JSON: <code className="font-mono text-sm">{"{ ok: true, data, meta }"}</code> or{" "}
          <code className="font-mono text-sm">{"{ ok: false, error: { code, message } }"}</code>. Press <strong>Try it</strong> to call it live.
        </p>
        <p className="mt-2 max-w-2xl rounded-xl bg-sim-bg px-3 py-2 text-sm text-sim">
          Running on the demo network: real station names, invented trains (9xxxx) with simulated live running. Edit <code className="font-mono">data/demo-network.json</code> to change it.
        </p>
      </header>
      {ENDPOINTS.map((e) =>
        e.method === "POST" && liveBody ? (
          <Endpoint key={`${e.path}-live`} e={{ ...e, body: liveBody }} />
        ) : (
          <Endpoint key={e.path} e={e} />
        ),
      )}
    </div>
  );
}
