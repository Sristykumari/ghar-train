import type { NextRequest } from "next/server";
import { RailDataError } from "@/lib/domain/errors";
import { isValidDateString } from "@/lib/domain/time";
import { parseIntInRange, parseStationCode, parseTrainNumber } from "@/lib/domain/validation";
import { planAlternatives } from "@/lib/planner/planner";
import { clientKey, handle } from "@/lib/server/api";
import { createRateLimiter } from "@/lib/server/rate-limit";

const limiter = createRateLimiter(10, 60_000);

export async function POST(req: NextRequest) {
  return handle("journeys.alternatives", async ({ provider, config, now }) => {
    limiter(clientKey(req));
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      throw new RailDataError("invalid_request", "Request body must be JSON.");
    }
    const journeyDate = body.journeyDate ? String(body.journeyDate) : undefined;
    if (journeyDate && !isValidDateString(journeyDate)) throw new RailDataError("invalid_request", "journeyDate must be YYYY-MM-DD.");

    return planAlternatives(
      {
        provider,
        now,
        staleAfterMinutes: config.staleAfterMinutes,
        // The sample provider is local and free; real providers get a strict lookup budget.
        maxStationLookups: provider.info.isSample ? 500 : config.plannerMaxStationLookups,
      },
      {
        trainNumber: parseTrainNumber(body.trainNumber),
        journeyDate,
        currentStation: parseStationCode(body.currentStation, "Current station"),
        destination: parseStationCode(body.destination, "Destination"),
        minTransferMinutes: parseIntInRange(body.minTransferMinutes, 15, 5, 120, "minTransferMinutes"),
        maxChanges: parseIntInRange(body.maxChanges, 2, 1, 3, "maxChanges"),
      },
    );
  });
}
