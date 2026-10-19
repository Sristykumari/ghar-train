"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { RouteIcon } from "@/components/layout/icons";
import { stationItem } from "@/components/search/quick-search";
import { QualityBadge } from "@/components/ui/badges";
import { SearchCombobox } from "@/components/ui/search-combobox";
import { useApi } from "@/lib/client/api-client";
import { formatJourneyDate } from "@/lib/client/format";
import { planQueryString, type PlanQuery } from "@/lib/client/use-plan";
import { addDays, istDateOf } from "@/lib/domain/time";
import type { StationSummary, TrainSummary } from "@/lib/domain/types";
import type { TrainRouteView } from "@/lib/services/train-route";
import type { TrainStatusView } from "@/lib/services/views";

function Step({ n, title, children, done }: { n: number; title: string; children: React.ReactNode; done?: boolean }) {
  return (
    <fieldset className="relative pl-11">
      <span
        aria-hidden
        className={`absolute top-0 left-0 grid h-8 w-8 place-items-center rounded-full text-sm font-bold ${done ? "bg-ok text-surface" : "bg-primary text-primary-fg"}`}
      >
        {done ? "✓" : n}
      </span>
      <legend className="mb-2 pt-1 font-semibold">{title}</legend>
      {children}
    </fieldset>
  );
}

/**
 * Step 1: your train. Step 2: where you are — pre-filled from live status
 * when available. Step 3: destination. Inputs go into the URL so results are
 * shareable and survive a reload.
 */
export function PlannerForm({ initial }: { initial: PlanQuery | null }) {
  const router = useRouter();
  const [train, setTrain] = useState(initial?.trainNumber ?? "");
  const [chosenFrom, setChosenFrom] = useState(initial?.currentStation ?? "");
  const [to, setTo] = useState(initial?.destination ?? "");
  const [toKey, setToKey] = useState(0);
  const [date, setDate] = useState(initial?.journeyDate ?? "");
  const [mt, setMt] = useState(initial?.minTransferMinutes ?? 15);
  const [mc, setMc] = useState(initial?.maxChanges ?? 2);
  const [formError, setFormError] = useState("");
  const [today] = useState(() => istDateOf(Date.now()));

  const validTrain = /^\d{4,5}$/.test(train);
  const route = useApi<TrainRouteView>(validTrain ? `/api/trains/${train}` : null);
  const live = useApi<TrainStatusView>(validTrain ? `/api/trains/${train}/live${date ? `?date=${date}` : ""}` : null);
  const halts = route.data?.stops.filter((s) => s.isHalt) ?? [];

  // Suggest the next station from live running status; the user can always override it.
  const suggested = live.data?.nextStop ?? null;
  const from = chosenFrom || suggested?.stationCode || "";
  const usingSuggestion = !chosenFrom && !!suggested;
  const fromIdx = halts.findIndex((s) => s.stationCode === from);
  const toName = halts.find((s) => s.stationCode === to)?.stationName;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!validTrain) return setFormError("Choose your current train.");
    if (!from) return setFormError("Choose the station you are at or will reach next.");
    if (!to) return setFormError("Choose your destination.");
    if (to === from) return setFormError("Your destination must be different from your current station.");
    setFormError("");
    router.push(
      `/planner?${planQueryString({ trainNumber: train, journeyDate: date || undefined, currentStation: from, destination: to, minTransferMinutes: mt, maxChanges: mc })}`,
    );
  }

  return (
    <form onSubmit={submit} className="space-y-6" aria-describedby={formError ? "planner-error" : undefined}>
      <Step n={1} title="Which train are you on?" done={!!route.data}>
        <SearchCombobox<TrainSummary>
          label="Train number or name"
          placeholder="e.g. 12951 or Rajdhani"
          endpoint="/api/trains/search"
          defaultValue={initial?.trainNumber ?? ""}
          toItem={(t) => ({ id: t.number, primary: t.number, secondary: t.name })}
          acceptRaw={(t) => (/^\d{4,5}$/.test(t) ? { id: t, primary: t } : null)}
          onSelect={(i) => {
            setTrain(i.id);
            setChosenFrom("");
          }}
          required
        />
        {route.error && <p className="mt-1 text-sm text-bad">{route.error.message}</p>}
      </Step>

      <Step n={2} title="Where are you now?" done={!!from}>
        <label className="block text-sm">
          <span className="mb-1 block text-muted">The station you&apos;re at, or the next one your train reaches</span>
          <select
            value={from}
            onChange={(e) => setChosenFrom(e.target.value)}
            disabled={!halts.length}
            className="w-full rounded-xl border border-border bg-surface px-3 py-3 text-base disabled:opacity-60"
          >
            <option value="">{route.loading ? "Loading route…" : halts.length ? "Select station" : "Choose your train first"}</option>
            {halts.map((s) => (
              <option key={s.sequence} value={s.stationCode}>
                {s.stationName} ({s.stationCode})
              </option>
            ))}
          </select>
        </label>
        {usingSuggestion && live.data && (
          <p className="mt-2 flex flex-wrap items-center gap-2 rounded-xl bg-info-bg px-3 py-2 text-sm text-info">
            <span>
              📍 {live.data.currentLocation} We picked <strong>{suggested!.stationName}</strong> — change it if that&apos;s wrong.
            </span>
            <QualityBadge quality={live.data.freshness.quality} />
          </p>
        )}
      </Step>

      <Step n={3} title="Where do you need to get to?" done={!!to}>
        <SearchCombobox<StationSummary>
          key={toKey}
          label="Destination station"
          placeholder="Station name or code"
          endpoint="/api/stations/search"
          defaultValue={to ? (toName ? `${to} — ${toName}` : to) : ""}
          toItem={stationItem}
          acceptRaw={(t) => (/^[A-Za-z]{2,6}$/.test(t) ? { id: t.toUpperCase(), primary: t.toUpperCase() } : null)}
          onSelect={(i) => setTo(i.id)}
          required
        />
        {fromIdx >= 0 && halts.length > fromIdx + 1 && (
          <div className="mt-3">
            <p className="mb-1.5 text-xs text-muted">Or tap a stop on your train&apos;s route:</p>
            <div className="flex flex-wrap gap-1.5">
              {halts.slice(fromIdx + 1).map((s) => (
                <button
                  key={s.sequence}
                  type="button"
                  aria-pressed={to === s.stationCode}
                  title={s.stationName}
                  onClick={() => {
                    setTo(s.stationCode);
                    setToKey((k) => k + 1);
                  }}
                  className={`rounded-full px-3 py-1 text-sm font-medium ${to === s.stationCode ? "bg-primary text-primary-fg" : "bg-surface-2 hover:bg-info-bg hover:text-info"}`}
                >
                  {s.stationCode}
                </button>
              ))}
            </div>
          </div>
        )}
      </Step>

      <details className="rounded-xl border border-border bg-surface-2/60 px-4 py-3 text-sm">
        <summary className="cursor-pointer font-medium">More options</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <label>
            <span className="mb-1 block text-muted">Train started on</span>
            <select value={date} onChange={(e) => setDate(e.target.value)} className="w-full rounded-lg border border-border bg-surface px-2 py-2">
              <option value="">Automatic</option>
              {[-2, -1, 0].map((d) => {
                const v = addDays(today, d);
                return (
                  <option key={v} value={v}>
                    {formatJourneyDate(v)}
                    {d === 0 ? " (today)" : d === -1 ? " (yesterday)" : ""}
                  </option>
                );
              })}
            </select>
          </label>
          <label>
            <span className="mb-1 block text-muted">Time I need to change trains</span>
            <select value={mt} onChange={(e) => setMt(Number(e.target.value))} className="w-full rounded-lg border border-border bg-surface px-2 py-2">
              {[10, 15, 20, 30, 45].map((m) => (
                <option key={m} value={m}>
                  At least {m} minutes
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="mb-1 block text-muted">Most changes I&apos;ll make</span>
            <select value={mc} onChange={(e) => setMc(Number(e.target.value))} className="w-full rounded-lg border border-border bg-surface px-2 py-2">
              {[1, 2, 3].map((m) => (
                <option key={m} value={m}>
                  {m} change{m === 1 ? "" : "s"}
                </option>
              ))}
            </select>
          </label>
        </div>
      </details>

      {formError && (
        <p id="planner-error" role="alert" className="rounded-xl bg-bad-bg px-3 py-2 text-sm text-bad">
          {formError}
        </p>
      )}
      <button
        type="submit"
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3.5 text-base font-semibold text-primary-fg shadow-md hover:opacity-95 sm:w-auto sm:px-8"
      >
        <RouteIcon /> Find faster options
      </button>
    </form>
  );
}
