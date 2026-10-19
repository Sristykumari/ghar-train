import Link from "next/link";

export default function NotFound() {
  return (
    <div className="py-16 text-center">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="mt-2 text-muted">That train or station page doesn&apos;t exist.</p>
      <Link href="/" className="mt-4 inline-block rounded-xl bg-primary px-4 py-2 font-semibold text-primary-fg">
        Back to search
      </Link>
    </div>
  );
}
