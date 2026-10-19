import { QualityBadge } from "@/components/ui/badges";
import type { TrainStatusView } from "@/lib/services/views";

/**
 * Schematic route map drawn from station coordinates (no map tiles). Only
 * rendered when the data source provides coordinates; the train marker only
 * appears when the source reports a position, and is labelled as reported or
 * interpolated.
 */
export function RouteMap({ view }: { view: TrainStatusView }) {
  const pts = view.stops.filter((s) => s.coordinates);
  if (pts.length < 2) return null;

  const lats = pts.map((p) => p.coordinates!.lat);
  const lngs = pts.map((p) => p.coordinates!.lng);
  const pad = 0.15;
  const minLat = Math.min(...lats) - pad;
  const maxLat = Math.max(...lats) + pad;
  const minLng = Math.min(...lngs) - pad;
  const maxLng = Math.max(...lngs) + pad;
  // Equirectangular projection corrected for latitude; fine at this scale.
  const k = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
  const w = (maxLng - minLng) * k;
  const h = maxLat - minLat;
  const W = 600;
  const H = Math.max(160, Math.min(520, (W * h) / w));
  const x = (lng: number) => ((lng - minLng) * k * W) / w;
  const y = (lat: number) => ((maxLat - lat) * H) / h;

  const path = pts.map((p, i) => `${i ? "L" : "M"}${x(p.coordinates!.lng).toFixed(1)},${y(p.coordinates!.lat).toFixed(1)}`).join(" ");
  const halts = pts.filter((p) => p.isHalt);
  const pos = view.position;

  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`Route map of train ${view.train.number}`}>
        <path d={path} fill="none" stroke="var(--border)" strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" />
        <path d={path} fill="none" stroke="var(--muted)" strokeWidth={2} strokeDasharray="6 6" />
        {halts.map((s) => (
          <g key={s.stationCode}>
            <circle cx={x(s.coordinates!.lng)} cy={y(s.coordinates!.lat)} r={5} fill="var(--surface)" stroke="var(--foreground)" strokeWidth={2} />
            <text x={x(s.coordinates!.lng) + 9} y={y(s.coordinates!.lat) + 4} fontSize={13} fill="var(--muted)">
              {s.stationCode}
            </text>
          </g>
        ))}
        {pos && (
          <g>
            <circle cx={x(pos.lng)} cy={y(pos.lat)} r={13} fill="var(--info-bg)" />
            <circle cx={x(pos.lng)} cy={y(pos.lat)} r={7} fill="var(--info)" stroke="var(--surface)" strokeWidth={2} />
          </g>
        )}
      </svg>
      <figcaption className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
        {pos ? (
          <>
            Train marker: {pos.isActual ? "position reported by the data source" : "interpolated between stations from running status"}
            <QualityBadge quality={pos.quality} />
          </>
        ) : (
          "No position reported — train marker not shown."
        )}
        <span>· Schematic, not to scale for track curvature.</span>
      </figcaption>
    </figure>
  );
}
