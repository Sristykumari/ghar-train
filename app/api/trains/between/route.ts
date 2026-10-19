import type { NextRequest } from "next/server";
import { istDateOf } from "@/lib/domain/time";
import { parseDate, parseStationCode } from "@/lib/domain/validation";
import { handle } from "@/lib/server/api";
import { getTrainsBetween } from "@/lib/services/trains-between";

export async function GET(req: NextRequest) {
  return handle("trains.between", async ({ provider, now }) => {
    const sp = req.nextUrl.searchParams;
    return getTrainsBetween(provider, {
      from: parseStationCode(sp.get("from"), "From station"),
      to: parseStationCode(sp.get("to"), "To station"),
      date: parseDate(sp.get("date"), istDateOf(now)),
      now,
    });
  });
}
