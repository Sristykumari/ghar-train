import { handle } from "@/lib/server/api";

/** Which data source is active and what it can do. Used for the sample-data banner and capability notices. */
export async function GET() {
  return handle("meta", async ({ provider, config }) => ({
    ...provider.info,
    staleAfterMinutes: config.staleAfterMinutes,
    examples: (await provider.getExamples?.().catch(() => null)) ?? null,
  }));
}
