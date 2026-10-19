import Link from "next/link";
import { RouteIcon, StationIcon, TrainIcon } from "@/components/layout/icons";
import { HomeSearch } from "@/components/search/home-search";

const TILES = [
  { href: "/station", Icon: StationIcon, title: "Station board", text: "Arrivals, departures and platforms", tint: "bg-teal-bg text-teal" },
  { href: "/station", Icon: TrainIcon, title: "Approaching trains", text: "What's about to arrive at your platform", tint: "bg-pink-bg text-pink" },
  { href: "/planner", Icon: RouteIcon, title: "Faster route", text: "Change trains to get home sooner", tint: "bg-accent-bg text-accent" },
  { href: "/between", Icon: RouteIcon, title: "Trains between stations", text: "All trains from A to B on a date", tint: "bg-info-bg text-info" },
  { href: "/pnr", Icon: TrainIcon, title: "PNR, seats & fare", text: "Official Indian Railways / IRCTC links", tint: "bg-teal-bg text-teal" },
  { href: "/api-docs", Icon: StationIcon, title: "Ghar Train API", text: "Our own API — try every endpoint live", tint: "bg-sim-bg text-sim" },
];

export default function Home() {
  return (
    <div className="space-y-6">
      <section className="hero-gradient relative overflow-hidden rounded-3xl p-6 pb-16 text-white shadow-lg sm:p-8 sm:pb-20">
        <svg aria-hidden viewBox="0 0 400 120" className="absolute -right-6 -bottom-4 h-32 w-auto opacity-25" fill="none" stroke="white" strokeWidth="3">
          <path d="M0 100h400M0 112h400" />
          {Array.from({ length: 14 }, (_, i) => (
            <path key={i} d={`M${i * 30 + 6} 96v20`} />
          ))}
          <rect x="150" y="30" width="160" height="58" rx="14" />
          <path d="M150 58h160M180 30v58M230 30v58M280 30v58" />
          <circle cx="185" cy="94" r="7" />
          <circle cx="275" cy="94" r="7" />
        </svg>
        <p className="relative text-sm font-semibold tracking-wide text-white/85 uppercase">Ghar Train</p>
        <h1 className="relative mt-1 text-3xl font-bold sm:text-4xl">Where&apos;s my train?</h1>
        <p className="relative mt-2 max-w-xl text-white/90">
          Live status, platforms and faster connections — and we always tell you what&apos;s live and what&apos;s only estimated.
        </p>
      </section>

      <section aria-label="Search" className="-mt-10 relative mx-2 rounded-2xl border border-border bg-surface p-4 shadow-xl sm:mx-6 sm:p-6">
        <HomeSearch />
      </section>

      <Link
        href="/planner"
        className="group flex items-center gap-4 rounded-2xl border border-accent-solid/40 bg-accent-bg p-5 text-foreground shadow-sm hover:border-accent-solid"
      >
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-accent-solid text-white">
          <RouteIcon />
        </span>
        <span className="flex-1">
          <span className="block text-lg font-semibold">Need to get home sooner?</span>
          <span className="block text-sm text-muted">We check where you can change trains and only suggest connections you can make.</span>
        </span>
        <span aria-hidden className="text-2xl text-accent transition-transform group-hover:translate-x-1">
          →
        </span>
      </Link>

      <ul className="grid gap-3 sm:grid-cols-3">
        {TILES.map(({ href, Icon, title, text, tint }) => (
          <li key={title}>
            <Link href={href} className="flex h-full items-start gap-3 rounded-2xl border border-border bg-surface p-4 hover:border-primary">
              <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${tint}`}>
                <Icon />
              </span>
              <span>
                <span className="block font-semibold">{title}</span>
                <span className="block text-sm text-muted">{text}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
