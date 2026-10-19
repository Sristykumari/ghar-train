export type RailErrorCode =
  | "invalid_request"
  | "not_found"
  | "unauthorized"
  | "rate_limited"
  | "upstream_unavailable"
  | "bad_upstream_response"
  | "not_configured"
  | "unsupported"
  | "internal";

const HTTP_STATUS: Record<RailErrorCode, number> = {
  invalid_request: 400,
  not_found: 404,
  unauthorized: 502, // our credentials were rejected upstream — not the caller's fault
  rate_limited: 429,
  upstream_unavailable: 503,
  bad_upstream_response: 502,
  not_configured: 503,
  unsupported: 501,
  internal: 500,
};

export class RailDataError extends Error {
  readonly code: RailErrorCode;
  readonly retryAfterSeconds?: number;

  constructor(code: RailErrorCode, message: string, opts: { retryAfterSeconds?: number; cause?: unknown } = {}) {
    super(message, { cause: opts.cause });
    this.name = "RailDataError";
    this.code = code;
    this.retryAfterSeconds = opts.retryAfterSeconds;
  }

  get httpStatus(): number {
    return HTTP_STATUS[this.code];
  }
}

export function isRailDataError(e: unknown): e is RailDataError {
  return e instanceof RailDataError;
}
