/** Small inline icons (no icon library needed). Decorative: always paired with a text label. */
const base = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };

export const TrainIcon = () => (
  <svg {...base}>
    <rect x="5" y="3" width="14" height="13" rx="3" />
    <path d="M5 10h14M9 20l-2 2M15 20l2 2M8.5 13h.01M15.5 13h.01" />
  </svg>
);

export const StationIcon = () => (
  <svg {...base}>
    <path d="M3 21h18M5 21V10l7-5 7 5v11M9 21v-5h6v5" />
  </svg>
);

export const RouteIcon = () => (
  <svg {...base}>
    <circle cx="6" cy="19" r="2" />
    <circle cx="18" cy="5" r="2" />
    <path d="M8 19h8a3 3 0 0 0 0-6H8a3 3 0 0 1 0-6h8" />
  </svg>
);

export const ClockIcon = () => (
  <svg {...base}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);

export const PinIcon = () => (
  <svg {...base}>
    <path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z" />
    <circle cx="12" cy="10" r="2.5" />
  </svg>
);
