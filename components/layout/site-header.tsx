"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { RouteIcon, StationIcon, TrainIcon } from "./icons";

const NAV = [
  { href: "/", label: "Trains", Icon: TrainIcon, match: (p: string) => p === "/" || p.startsWith("/train") },
  { href: "/station", label: "Stations", Icon: StationIcon, match: (p: string) => p.startsWith("/station") },
  { href: "/planner", label: "Faster route", Icon: RouteIcon, match: (p: string) => p.startsWith("/planner") },
];

/** Top bar on all screens; links move to a bottom tab bar on phones (easier to reach with a thumb). */
export function SiteHeader() {
  return <HeaderView pathname={usePathname()} />;
}

/** Same header without the active-tab highlight; shown instantly while the URL is resolved. */
export function SiteHeaderFallback() {
  return <HeaderView pathname="" />;
}

function HeaderView({ pathname }: { pathname: string }) {
  return (
    <>
      <header className="sticky top-0 z-30 border-b border-border bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-fg">
              <TrainIcon />
            </span>
            <span>Ghar Train</span>
          </Link>
          <nav aria-label="Main" className="hidden sm:block">
            <ul className="flex gap-1 text-sm">
              {NAV.map(({ href, label, match }) => {
                const active = match(pathname);
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      aria-current={active ? "page" : undefined}
                      className={`rounded-lg px-3 py-2 font-medium ${active ? "bg-surface-2 text-foreground" : "text-muted hover:bg-surface-2 hover:text-foreground"}`}
                    >
                      {label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>
      </header>

      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden">
        <ul className="grid grid-cols-3">
          {NAV.map(({ href, label, Icon, match }) => {
            const active = match(pathname);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`flex flex-col items-center gap-0.5 py-2 text-xs font-medium ${active ? "text-primary" : "text-muted"}`}
                >
                  <Icon />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
