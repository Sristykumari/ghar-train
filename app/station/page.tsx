import type { Metadata } from "next";
import { NearbyStations } from "@/components/search/nearby-stations";
import { StationSearch } from "@/components/search/quick-search";
import { Card } from "@/components/ui/states";

export const metadata: Metadata = { title: "Stations" };

export default function StationSearchPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Stations</h1>
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-semibold">Platform board</h2>
          <StationSearch target="board" />
          <p className="mt-2 text-xs text-muted">Arrivals, departures, delays and platforms.</p>
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold">Approaching trains</h2>
          <StationSearch target="approaching" />
          <p className="mt-2 text-xs text-muted">Trains about to arrive, at the platform, or just leaving.</p>
        </Card>
      </div>
      <Card>
        <h2 className="mb-2 font-semibold">Near you</h2>
        <p className="mb-3 text-sm text-muted">Uses your location only when you press the button. Nothing is stored.</p>
        <NearbyStations />
      </Card>
    </div>
  );
}
