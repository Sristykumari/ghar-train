import type { ApiClientError } from "@/lib/client/api-client";

export function LoadingState({ label = "Loading…", rows = 4 }: { label?: string; rows?: number }) {
  return (
    <div role="status" aria-live="polite" className="space-y-3">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-14 animate-pulse rounded-xl bg-surface-2" />
      ))}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-surface p-6 text-center">
      <p className="font-medium">{title}</p>
      {children && <div className="mt-1 text-sm text-muted">{children}</div>}
    </div>
  );
}

const ERROR_HINT: Record<string, string> = {
  not_configured: "The railway data source is not configured on the server. See the README for setup.",
  rate_limited: "The data provider's request limit was reached.",
  upstream_unavailable: "The railway data service is not responding right now.",
  unauthorized: "The server's API key for the railway data service was rejected.",
  network: "Check your internet connection.",
};

export function ErrorState({ error, onRetry }: { error: ApiClientError; onRetry?: () => void }) {
  const hint = ERROR_HINT[error.code];
  return (
    <div role="alert" className="rounded-xl border border-bad/40 bg-bad-bg p-4 text-bad">
      <p className="font-semibold">{error.message}</p>
      {hint && <p className="mt-1 text-sm">{hint}</p>}
      {error.retryAfterSeconds ? <p className="mt-1 text-sm">Try again in about {error.retryAfterSeconds}s.</p> : null}
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 rounded-lg bg-bad px-3 py-1.5 text-sm font-semibold text-surface hover:opacity-90"
        >
          Try again
        </button>
      )}
    </div>
  );
}

export function Notice({
  tone = "info",
  title,
  children,
}: {
  tone?: "info" | "warn" | "sim";
  title?: string;
  children: React.ReactNode;
}) {
  const style = tone === "warn" ? "border-warn/40 bg-warn-bg text-warn" : tone === "sim" ? "border-sim/40 bg-sim-bg text-sim" : "border-info/40 bg-info-bg text-info";
  return (
    <div className={`rounded-xl border px-4 py-3 text-sm ${style}`} role={tone === "warn" ? "alert" : "note"}>
      {title && <p className="font-semibold">{title}</p>}
      <div>{children}</div>
    </div>
  );
}

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-border bg-surface p-4 sm:p-5 ${className}`}>{children}</section>;
}
