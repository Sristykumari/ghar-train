import type { MetadataRoute } from "next";

/** Lets phones "Add to Home screen" and open Ghar Train like an app. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Ghar Train",
    short_name: "Ghar Train",
    description: "Live train status, station boards, coach position, destination alarm and faster routes home.",
    start_url: "/",
    display: "standalone",
    background_color: "#f3f5ff",
    theme_color: "#3b3fd8",
    icons: [{ src: "/app-icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
