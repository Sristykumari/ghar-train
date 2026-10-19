import type { NextRequest } from "next/server";
import { parseSearchQuery } from "@/lib/domain/validation";
import { handle } from "@/lib/server/api";

export async function GET(req: NextRequest) {
  return handle("trains.search", async ({ provider }) => {
    const q = parseSearchQuery(req.nextUrl.searchParams.get("q"));
    return provider.searchTrains(q, 10);
  });
}
