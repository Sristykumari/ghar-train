import type { NextRequest } from "next/server";
import { parseTrainNumber } from "@/lib/domain/validation";
import { isValidDateString } from "@/lib/domain/time";
import { RailDataError } from "@/lib/domain/errors";
import { handle } from "@/lib/server/api";
import { getTrainStatus } from "@/lib/services/train-status";

export async function GET(req: NextRequest, ctx: RouteContext<"/api/trains/[number]/live">) {
  const { number } = await ctx.params;
  return handle("trains.live", async ({ provider, config, now }) => {
    const date = req.nextUrl.searchParams.get("date") || undefined;
    if (date && !isValidDateString(date)) throw new RailDataError("invalid_request", "Date must be YYYY-MM-DD.");
    return getTrainStatus(provider, {
      trainNumber: parseTrainNumber(number),
      journeyDate: date,
      now,
      staleAfterMinutes: config.staleAfterMinutes,
    });
  });
}
