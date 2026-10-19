/**
 * ─────────────────────────────────────────────────────────────────────────
 *  DEMO DATA — NOT REAL TRAINS.
 * ─────────────────────────────────────────────────────────────────────────
 * The demo network lives in data/demo-network.json so it can be edited
 * without touching code. Station names, codes and approximate coordinates are
 * real places; every train is invented (9xxxx numbers, names starting "Demo"),
 * and live running is simulated. The UI shows a banner whenever it is active.
 */
import demo from "@/data/demo-network.json";
import { buildJsonNetwork, type JsonNetwork } from "./json-network";
import type { InMemoryDataset } from "./provider";

export function createSampleDataset(): InMemoryDataset {
  return buildJsonNetwork(demo as JsonNetwork);
}
