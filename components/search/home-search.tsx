"use client";

import Link from "next/link";
import { useState } from "react";
import { ClockIcon } from "@/components/layout/icons";
import { useApi } from "@/lib/client/api-client";
import { useRecent } from "@/lib/client/recent";
import type { ProviderInfo, StationSummary, TrainSummary } from "@/lib/domain/types";
import { BetweenForm } from "@/components/between/between-view";
import { StationSearch, TrainSearch } from "./quick-search";

type Meta = ProviderInfo & { examples: { trains: TrainSummary[]; stations: StationSummary[] } | null };

function Chip({ href, tone = "train", children }: { href: string; tone?: "train" | "station"; children: React.ReactNode }) {
  const color = tone === "train" ? "bg-surface-2 hover:ring-primary" : "bg-teal-bg hover:ring-teal";
  return (
    <Link href={href} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm ring-1 ring-transparent ${color}`}>
      {children}
    </Link>
  );
}

/** One search box with a Train / Station switch, plus one-tap shortcuts. */
export function HomeSearch() {
  const [mode, setMode] = useState<"train" | "station" | "route">("train");
  const recent = useRecent();
  const { data: meta } = useApi<Meta>("/api/meta");
  const examples = meta?.examples;

  return (
    <div className="space-y-4">
      <div role="radiogroup" aria-label="Search for" className="inline-flex rounded-xl bg-surface-2 p-1">
        {(["train", "station", "route"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={mode === m}
            onClick={() => setMode(m)}
            className={`rounded-lg px-4 py-2 text-sm font-semibold ${mode === m ? "bg-primary text-primary-fg shadow-sm" : "text-muted"}`}
          >
            {m === "train" ? "Train" : m === "station" ? "Station" : "From → To"}
          </button>
        ))}
      </div>

      {mode === "train" ? <TrainSearch /> : mode === "station" ? <StationSearch /> : <BetweenForm />}

      {recent.length > 0 && (
        <div>
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted uppercase">
            <ClockIcon /> Recent
          </p>
          <div className="flex flex-wrap gap-2">
            {recent.map((r) => (
              <Chip key={`${r.kind}-${r.id}`} tone={r.kind} href={r.kind === "train" ? `/train/${r.id}` : `/station/${r.id}`}>
                <span className="font-mono font-semibold">{r.id}</span>
                <span className="max-w-40 truncate text-muted">{r.label}</span>
              </Chip>
            ))}
          </div>
        </div>
      )}

      {examples && (examples.trains.length > 0 || examples.stations.length > 0) && (
        <div>
          <p className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">Try {meta?.isSample ? "the demo — running now" : "these"}</p>
          <div className="flex flex-wrap gap-2">
            {examples.trains.map((t) => (
              <Chip key={t.number} href={`/train/${t.number}`}>
                <span className="font-mono font-semibold">{t.number}</span>
                <span className="max-w-44 truncate text-muted">{t.name}</span>
              </Chip>
            ))}
            {examples.stations.map((s) => (
              <Chip key={s.code} tone="station" href={`/station/${s.code}`}>
                <span className="font-mono font-semibold">{s.code}</span>
                <span className="text-muted">{s.name}</span>
              </Chip>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
