import type { NextRequest } from "next/server";
import { parseTrainNumber } from "@/lib/domain/validation";
import { handle } from "@/lib/server/api";
import { getTrainRoute } from "@/lib/services/train-route";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/trains/[number]">) {
  const { number } = await ctx.params;
  return handle("trains.route", async ({ provider }) => getTrainRoute(provider, parseTrainNumber(number)));
}
