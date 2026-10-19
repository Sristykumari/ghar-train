"use client";

import { useEffect, useRef, useState } from "react";
import { formatCountdown, formatTime } from "@/lib/client/format";
import type { StopView } from "@/lib/services/views";

interface AlarmSetting {
  station: string;
  minutesBefore: number;
  fired: boolean;
}

const LEADS = [5, 10, 15, 20, 30, 45];

function storageKey(train: string, date: string) {
  return `ghar-train:alarm:${train}:${date}`;
}

function load(key: string): AlarmSetting | null {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? "null");
    return v && typeof v.station === "string" ? v : null;
  } catch {
    return null;
  }
}

function persist(key: string, v: AlarmSetting | null) {
  try {
    if (v) localStorage.setItem(key, JSON.stringify(v));
    else localStorage.removeItem(key);
  } catch {
    // storage blocked — alarm still works while the page stays open
  }
}

/** A short, loud-ish chime with the Web Audio API (no sound files needed). */
function chime() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    [0, 0.35, 0.7, 1.4, 1.75, 2.1].forEach((t, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = i % 3 === 2 ? 988 : 784;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.4, ctx.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.3);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + t);
      o.stop(ctx.currentTime + t + 0.32);
    });
  } catch {
    // audio not available
  }
}

/**
 * "Wake me before my station". Uses the expected arrival time from the live
 * status (or the timetable when there is none), re-checked as data refreshes.
 * Works while this page is open in the browser; it is not a push alarm.
 */
export function DestinationAlarm({ trainNumber, journeyDate, halts, timesAreLive }: { trainNumber: string; journeyDate: string; halts: StopView[]; timesAreLive: boolean }) {
  const key = storageKey(trainNumber, journeyDate);
  const [now, setNow] = useState(() => Date.now());
  // With live data use its progress; without it (progress "unknown") fall back to timetable times.
  const upcoming = halts.filter(
    (s) => s.progress === "next" || s.progress === "upcoming" || (s.progress === "unknown" && s.expectedArrival != null && s.expectedArrival > now),
  );
  const [alarm, setAlarm] = useState<AlarmSetting | null>(() => load(key));
  const [station, setStation] = useState(alarm?.station ?? upcoming[upcoming.length - 1]?.stationCode ?? "");
  const [lead, setLead] = useState(alarm?.minutesBefore ?? 15);
  const [ringing, setRinging] = useState(false);
  const wakeLock = useRef<{ release: () => Promise<void> } | null>(null);

  const target = alarm ? halts.find((s) => s.stationCode === alarm.station) : null;
  const arriveAt = target?.expectedArrival ?? null;
  const ringAt = arriveAt != null && alarm ? arriveAt - alarm.minutesBefore * 60_000 : null;

  useEffect(() => {
    if (!alarm || alarm.fired) return;
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, [alarm]);

  useEffect(() => {
    if (!alarm || alarm.fired || ringAt == null || now < ringAt) return;
    const fired = { ...alarm, fired: true };
    persist(key, fired);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the alarm time was reached; reflect it
    setAlarm(fired);
    setRinging(true);
    chime();
    navigator.vibrate?.([600, 250, 600, 250, 600]);
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification(`Get ready: ${target?.stationName ?? alarm.station}`, {
        body: `Your train is due at ${formatTime(arriveAt)} (${formatCountdown(arriveAt)}).`,
        tag: key,
      });
    }
  }, [alarm, ringAt, now, key, target, arriveAt]);

  async function setUp() {
    if (!station) return;
    if ("Notification" in window && Notification.permission === "default") {
      try {
        await Notification.requestPermission();
      } catch {
        // permission prompt not available — sound and on-screen alert still work
      }
    }
    try {
      wakeLock.current = await (navigator as unknown as { wakeLock?: { request: (t: string) => Promise<{ release: () => Promise<void> }> } }).wakeLock?.request("screen") ?? null;
    } catch {
      // wake lock refused — fine
    }
    const v = { station, minutesBefore: lead, fired: false };
    persist(key, v);
    setAlarm(v);
    setNow(Date.now());
  }

  function cancel() {
    persist(key, null);
    setAlarm(null);
    setRinging(false);
    wakeLock.current?.release().catch(() => {});
  }

  if (upcoming.length === 0 && !alarm) {
    return <p className="text-sm text-muted">No upcoming stops on this run.</p>;
  }

  return (
    <div className="space-y-3">
      {ringing && (
        <div role="alert" className="animate-pulse rounded-2xl bg-accent-solid p-4 text-white">
          <p className="text-lg font-bold">⏰ {target?.stationName} is coming up!</p>
          <p>
            Expected at {formatTime(arriveAt)} ({formatCountdown(arriveAt)}). Get your bags ready.
          </p>
          <button type="button" onClick={() => setRinging(false)} className="mt-2 rounded-lg bg-white px-3 py-1.5 font-semibold text-accent">
            Stop
          </button>
        </div>
      )}

      {alarm && !alarm.fired ? (
        <div className="rounded-xl bg-info-bg p-3 text-sm text-info">
          <p className="font-semibold">
            ⏰ Alarm set: {alarm.minutesBefore} min before {target?.stationName ?? alarm.station}
          </p>
          <p>
            {ringAt != null ? `Will ring at about ${formatTime(ringAt)} (${formatCountdown(ringAt, now)}).` : "Waiting for an expected arrival time."}{" "}
            {timesAreLive ? "Adjusts automatically if the train runs late." : "Based on the timetable — no live data for this train."}
          </p>
          <button type="button" onClick={cancel} className="mt-2 rounded-lg bg-surface px-3 py-1.5 font-medium text-foreground ring-1 ring-border">
            Cancel alarm
          </button>
        </div>
      ) : (
        <>
          {alarm?.fired && (
            <p className="text-sm text-muted">
              The alarm for {target?.stationName ?? alarm.station} has rung.{" "}
              <button type="button" onClick={cancel} className="font-medium text-primary underline">
                Clear
              </button>
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
            <label className="text-sm">
              <span className="mb-1 block text-muted">Wake me before</span>
              <select id="alarm-station" value={station} onChange={(e) => setStation(e.target.value)} className="w-full rounded-xl border border-border bg-surface px-3 py-2">
                {upcoming.map((s) => (
                  <option key={s.sequence} value={s.stationCode}>
                    {s.stationName} · {formatTime(s.expectedArrival)}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-muted">How early</span>
              <select id="alarm-lead" value={lead} onChange={(e) => setLead(Number(e.target.value))} className="w-full rounded-xl border border-border bg-surface px-3 py-2">
                {LEADS.map((m) => (
                  <option key={m} value={m}>
                    {m} min before
                  </option>
                ))}
              </select>
            </label>
            <button type="button" onClick={setUp} className="rounded-xl bg-accent-solid px-4 py-2.5 font-semibold text-white hover:opacity-90">
              ⏰ Set alarm
            </button>
          </div>
        </>
      )}
      <p className="text-xs text-muted">
        Keep this page open (the screen can lock on most phones, but don&apos;t close the browser). You&apos;ll get a sound, vibration and a notification if you allow it.
      </p>
    </div>
  );
}
