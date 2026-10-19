"use client";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert" className="py-16 text-center">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="mt-2 text-muted">{error.digest ? `Reference: ${error.digest}` : "Please try again."}</p>
      <button type="button" onClick={reset} className="mt-4 rounded-xl bg-primary px-4 py-2 font-semibold text-primary-fg">
        Try again
      </button>
    </div>
  );
}
