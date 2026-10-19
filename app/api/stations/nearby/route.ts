import type { NextRequest } from "next/server";
import { RailDataError } from "@/lib/domain/errors";
import { parseIntInRange } from "@/lib/domain/validation";
import { handle } from "@/lib/server/api";

/** Only called after the user grants location permission in the browser. Coordinates are not logged or stored. */
export async function GET(req: NextRequest) {
  return handle("stations.nearby", async ({ provider }) => {
    const sp = req.nextUrl.searchParams;
    const lat = Number(sp.get("lat"));
    const lng = Number(sp.get("lng"));
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      throw new RailDataError("invalid_request", "lat and lng must be valid coordinates.");
    }
    const radius = parseIntInRange(sp.get("radiusKm"), 50, 1, 200, "radiusKm");
    return provider.getNearbyStations(lat, lng, radius, 8);
  });
}
