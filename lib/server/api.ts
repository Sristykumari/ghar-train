import "server-only";
import { connection } from "next/server";
import { isRailDataError } from "@/lib/domain/errors";
import { getRailDataProvider } from "@/lib/providers";
import type { RailDataProvider } from "@/lib/providers/types";
import { getServerConfig, type ServerConfig } from "./config";
import { logger } from "./logger";

export interface ApiMeta {
  provider: string;
  providerName: string;
  isSample: boolean;
  generatedAt: number;
}

export type ApiSuccess<T> = { ok: true; data: T; meta: ApiMeta };
export type ApiFailure = { ok: false; error: { code: string; message: string; retryAfterSeconds?: number } };

/**
 * Wraps a route handler body: resolves the provider and config, and turns
 * thrown `RailDataError`s into consistent JSON errors with proper status codes.
 */
export async function handle<T>(
  route: string,
  fn: (ctx: { provider: RailDataProvider; config: ServerConfig; now: number }) => Promise<T>,
): Promise<Response> {
  // Railway data is always request-time; never prerender an API response at build.
  await connection();
  const started = Date.now();
  try {
    const config = getServerConfig();
    const provider = getRailDataProvider();
    const data = await fn({ provider, config, now: Date.now() });
    const body: ApiSuccess<T> = {
      ok: true,
      data,
      meta: { provider: provider.info.id, providerName: provider.info.name, isSample: provider.info.isSample, generatedAt: Date.now() },
    };
    logger.info("api", { route, ms: Date.now() - started });
    return Response.json(body, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (isRailDataError(e)) {
      const level = e.httpStatus >= 500 ? "warn" : "info";
      logger[level]("api_error", { route, code: e.code, message: e.message, ms: Date.now() - started });
      const body: ApiFailure = { ok: false, error: { code: e.code, message: e.message, retryAfterSeconds: e.retryAfterSeconds } };
      const headers: Record<string, string> = { "Cache-Control": "no-store" };
      if (e.retryAfterSeconds) headers["Retry-After"] = String(e.retryAfterSeconds);
      return Response.json(body, { status: e.httpStatus, headers });
    }
    logger.error("api_unhandled", { route, error: e instanceof Error ? e.stack : String(e) });
    const body: ApiFailure = { ok: false, error: { code: "internal", message: "Something went wrong. Please try again." } };
    return Response.json(body, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}

export function clientKey(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
}
