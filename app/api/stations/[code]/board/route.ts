import type { NextRequest } from "next/server";
import { parseIntInRange, parseStationCode } from "@/lib/domain/validation";
import { handle } from "@/lib/server/api";
import { getStationBoard } from "@/lib/services/station-board";

export async function GET(req: NextRequest, ctx: RouteContext<"/api/stations/[code]/board">) {
  const { code } = await ctx.params;
  return handle("stations.board", async ({ provider, config, now }) =>
    getStationBoard(provider, {
      stationCode: parseStationCode(code),
      hours: parseIntInRange(req.nextUrl.searchParams.get("hours"), 4, 1, 8, "hours"),
      now,
      staleAfterMinutes: config.staleAfterMinutes,
    }),
  );
}
