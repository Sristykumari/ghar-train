import type { NextRequest } from "next/server";
import { parseStationCode, parseTrainNumber } from "@/lib/domain/validation";
import { handle } from "@/lib/server/api";

/** Coach order for a train at a station. `data` is null when the source has none. */
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/trains/[number]/coaches/[station]">) {
  const { number, station } = await ctx.params;
  return handle("trains.coaches", async ({ provider }) => {
    if (!provider.info.capabilities.coachPositions) return null;
    return provider.getCoachPosition(parseTrainNumber(number), parseStationCode(station));
  });
}
