"use client";

import { useRouter } from "next/navigation";
import { SearchCombobox, type ComboItem } from "@/components/ui/search-combobox";
import type { StationSummary, TrainSummary } from "@/lib/domain/types";

const trainItem = (t: TrainSummary): ComboItem => ({
  id: t.number,
  primary: t.number,
  secondary: [t.name, t.sourceCode && t.destinationCode ? `${t.sourceCode} → ${t.destinationCode}` : null]
    .filter(Boolean)
    .join(" · "),
});

export const stationItem = (s: StationSummary): ComboItem => ({ id: s.code, primary: s.code, secondary: s.name });

export function TrainSearch() {
  const router = useRouter();
  return (
    <SearchCombobox<TrainSummary>
      label="Train number or name"
      placeholder="e.g. 12951 or Rajdhani"
      endpoint="/api/trains/search"
      toItem={trainItem}
      acceptRaw={(t) => (/^\d{4,5}$/.test(t) ? { id: t, primary: t } : null)}
      onSelect={(item) => router.push(`/train/${item.id}`)}
    />
  );
}

export function StationSearch({ target = "board" }: { target?: "board" | "approaching" }) {
  const router = useRouter();
  return (
    <SearchCombobox<StationSummary>
      label="Station name or code"
      placeholder="e.g. NDLS or New Delhi"
      endpoint="/api/stations/search"
      toItem={stationItem}
      acceptRaw={(t) => (/^[A-Za-z]{2,6}$/.test(t) ? { id: t.toUpperCase(), primary: t.toUpperCase() } : null)}
      onSelect={(item) => router.push(target === "board" ? `/station/${item.id}` : `/station/${item.id}/approaching`)}
    />
  );
}
