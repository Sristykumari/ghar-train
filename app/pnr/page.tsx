import type { Metadata } from "next";
import { Card } from "@/components/ui/states";

export const metadata: Metadata = { title: "PNR, seats and fare" };

const OFFICIAL = [
  {
    title: "PNR status",
    text: "Check whether your ticket is confirmed, RAC or waitlisted, and your coach and berth.",
    href: "https://www.indianrail.gov.in/",
    site: "indianrail.gov.in",
    tint: "bg-info-bg text-info",
  },
  {
    title: "Seat availability",
    text: "See free seats and waiting list for a train, class and date.",
    href: "https://www.irctc.co.in/",
    site: "irctc.co.in",
    tint: "bg-teal-bg text-teal",
  },
  {
    title: "Fare",
    text: "Ticket price for each class between two stations.",
    href: "https://www.irctc.co.in/",
    site: "irctc.co.in",
    tint: "bg-accent-bg text-accent",
  },
];

/**
 * PNR, seat and fare data are only available from Indian Railways / IRCTC.
 * The railway data source used by this app does not provide them, so we link
 * to the official sites instead of showing unverified numbers.
 */
export default function PnrPage() {
  return (
    <div className="space-y-5">
      <header>
        <p className="text-sm font-semibold tracking-wide text-accent uppercase">Tickets</p>
        <h1 className="text-2xl font-bold sm:text-3xl">PNR, seats and fare</h1>
        <p className="mt-1 max-w-2xl text-muted">
          These come only from Indian Railways and IRCTC. Our railway data source doesn&apos;t provide them, so instead of guessing we send you to the official
          sites.
        </p>
      </header>
      <ul className="grid gap-3 sm:grid-cols-3">
        {OFFICIAL.map((o) => (
          <li key={o.title}>
            <a href={o.href} target="_blank" rel="noopener noreferrer" className="flex h-full flex-col rounded-2xl border border-border bg-surface p-4 hover:border-primary">
              <span className={`mb-2 w-fit rounded-full px-2.5 py-0.5 text-xs font-bold ${o.tint}`}>{o.title}</span>
              <span className="flex-1 text-sm">{o.text}</span>
              <span className="mt-3 text-sm font-semibold text-primary">Open {o.site} ↗</span>
            </a>
          </li>
        ))}
      </ul>
      <Card>
        <h2 className="font-semibold">After you have your PNR</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
          <li>Search your train number here to see where it is now and how late it is.</li>
          <li>Use <strong className="text-foreground">Coach position</strong> on the train page with the coach from your ticket (e.g. B3) to know where to stand.</li>
          <li>Set a <strong className="text-foreground">Destination alarm</strong> so you don&apos;t miss your stop.</li>
        </ul>
      </Card>
    </div>
  );
}
