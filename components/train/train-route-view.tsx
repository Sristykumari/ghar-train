"use client";

import Link from "next/link";
import { QualityBadge } from "@/components/ui/badges";
import { Card, ErrorState, LoadingState, Notice } from "@/components/ui/states";
import { useApi } from "@/lib/client/api-client";
import { formatOffset, journeyDay } from "@/lib/domain/time";
import type { TrainRouteView as RouteData } from "@/lib/services/train-route";

const DAY_NAMES: Record<string, string> = { sun: "Sun", mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat" };

/** Published timetable — route, halts, timings, distance and usual platforms. */
export function TrainRouteView({ number }: { number: string }) {
  const { data, error, loading, refresh } = useApi<RouteData>(`/api/trains/${number}`);
  if (loading) return <LoadingState label="Loading timetable" rows={6} />;
  if (error) return <ErrorState error={error} onRetry={refresh} />;
  if (!data) return null;
  const halts = data.stops.filter((s) => s.isHalt);

  return (
    <div className="space-y-4">
      <header>
        <p className="font-mono text-sm text-muted">{data.train.number}</p>
        <h1 className="text-2xl font-semibold">{data.train.name}</h1>
        <p className="text-muted">
          Timetable · {halts.length} stops · runs{" "}
          {data.train.runDays.length === 7 ? "daily" : data.train.runDays.map((d) => DAY_NAMES[d]).join(", ")}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <QualityBadge quality="scheduled" />
          <Link href={`/train/${data.train.number}`} className="text-sm font-medium text-primary underline">
            Live status
          </Link>
        </div>
      </header>

      {data.issues.length > 0 && (
        <Notice tone="warn" title="Some timetable entries look invalid">
          {data.issues.map((i) => `${i.stationCode}: ${i.problem}`).join("; ")}. They are shown but not used for journey planning.
        </Notice>
      )}

      <Card className="overflow-x-auto p-0 sm:p-0">
        <table className="w-full min-w-[560px] text-sm">
          <caption className="sr-only">Stops of train {data.train.number}</caption>
          <thead className="bg-surface-2 text-left text-xs tracking-wide text-muted uppercase">
            <tr>
              <th scope="col" className="px-3 py-2">#</th>
              <th scope="col" className="px-3 py-2">Station</th>
              <th scope="col" className="px-3 py-2">Arr</th>
              <th scope="col" className="px-3 py-2">Dep</th>
              <th scope="col" className="px-3 py-2">Halt</th>
              <th scope="col" className="px-3 py-2">Day</th>
              <th scope="col" className="px-3 py-2">Km</th>
              <th scope="col" className="px-3 py-2">Usual PF</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border tabular">
            {halts.map((s, i) => (
              <tr key={s.sequence}>
                <td className="px-3 py-2 text-muted">{i + 1}</td>
                <th scope="row" className="px-3 py-2 text-left font-medium">
                  {s.stationName} <span className="font-mono text-xs text-muted">{s.stationCode}</span>
                </th>
                <td className="px-3 py-2 font-mono">{s.arrival == null ? "Starts" : formatOffset(s.arrival)}</td>
                <td className="px-3 py-2 font-mono">{s.departure == null ? "Ends" : formatOffset(s.departure)}</td>
                <td className="px-3 py-2">{s.arrival != null && s.departure != null ? `${s.departure - s.arrival} min` : "—"}</td>
                <td className="px-3 py-2">{journeyDay(s.arrival ?? s.departure ?? 0)}</td>
                <td className="px-3 py-2">{s.distanceKm ?? "—"}</td>
                <td className="px-3 py-2">{s.scheduledPlatform ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <p className="text-xs text-muted">Times are IST. &ldquo;Usual PF&rdquo; is the platform in the timetable and can change on the day.</p>
    </div>
  );
}
