import AsyncStorage from "@react-native-async-storage/async-storage";

import { normalizeOrbitApiBaseUrl } from "../../api/base-url";
import { analysisBucketKey, type NetworkAnalysisRow } from "../../api/compute/network-analysis-model";

/**
 * Sprint 0148: the home 人脉 card's breakdown. People are grouped with the analysis page's own rule
 * (shared/compute analysisBucketKey); the card shows the three biggest groups, 其他 for the rest and the
 * people with nothing filled in apart (未填写 — for 认识场合 the unknown place is the analysis page's 其他).
 */
export type HomeNetworkDimension = "industry" | "region" | "met";
export const HOME_NETWORK_DIMENSIONS: readonly HomeNetworkDimension[] = ["industry", "region", "met"];
/** Below this many people the card shows a hint instead of a bar. */
export const HOME_NETWORK_MIN_PEOPLE = 3;
const TOP = 3;

export interface HomeNetworkSlice { id: string; count: number; kind: "named" | "rest" | "unset" }
export interface HomeNetworkDistribution { dimension: HomeNetworkDimension; total: number; filled: number; slices: HomeNetworkSlice[] }

/** The analysis bucket that means "nothing filled in" for each dimension. */
const UNSET: Record<HomeNetworkDimension, string> = { industry: "none", region: "none", met: "other" };

export function homeNetworkCounts(rows: readonly NetworkAnalysisRow[], dimension: HomeNetworkDimension): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = analysisBucketKey(row, dimension);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/** `counts`: per analysis bucket (device rows), or a server summary's facets; people missing from them count as unset. */
export function homeNetworkDistribution(counts: ReadonlyMap<string, number> | Readonly<Record<string, number>>, dimension: HomeNetworkDimension, total: number): HomeNetworkDistribution {
  const entries = counts instanceof Map ? [...counts.entries()] : Object.entries(counts);
  const unsetKey = UNSET[dimension];
  const named = entries.filter(([key, count]) => key !== unsetKey && count > 0).sort(([a, x], [b, y]) => y - x || (a < b ? -1 : a > b ? 1 : 0));
  const filled = named.reduce((sum, [, count]) => sum + count, 0);
  const rest = named.slice(TOP).reduce((sum, [, count]) => sum + count, 0);
  const unset = Math.max(0, total - filled);
  return {
    dimension, total, filled,
    slices: [
      ...named.slice(0, TOP).map(([id, count]) => ({ id, count, kind: "named" as const })),
      ...(rest ? [{ id: "rest", count: rest, kind: "rest" as const }] : []),
      ...(unset ? [{ id: unsetKey, count: unset, kind: "unset" as const }] : []),
    ],
  };
}

/** The dimension filled in for the most people; ties keep the order industry, region, where we met. */
export function defaultHomeNetworkDimension(views: Readonly<Record<HomeNetworkDimension, HomeNetworkDistribution>>): HomeNetworkDimension {
  return HOME_NETWORK_DIMENSIONS.reduce((best, dimension) => (views[dimension].filled > views[best].filled ? dimension : best), HOME_NETWORK_DIMENSIONS[0]!);
}

/** The saved choice lives on this device, per server and account (sign-out removes it: data/account-local-caches.ts). */
export function homeNetworkDimensionKey(actorId: string, baseUrl: string): string | null {
  if (!actorId.trim() || !baseUrl.trim()) return null;
  return `orbit:home-network-dimension:v1:${encodeURIComponent(normalizeOrbitApiBaseUrl(baseUrl))}:${encodeURIComponent(actorId)}`;
}

export function parseHomeNetworkDimension(value: string | null | undefined): HomeNetworkDimension | null {
  return (HOME_NETWORK_DIMENSIONS as readonly (string | null | undefined)[]).includes(value) ? value as HomeNetworkDimension : null;
}

export async function readHomeNetworkDimension(key: string): Promise<HomeNetworkDimension | null> {
  try { return parseHomeNetworkDimension(await AsyncStorage.getItem(key)); } catch { return null; }
}

export async function writeHomeNetworkDimension(key: string, dimension: HomeNetworkDimension): Promise<void> {
  try { await AsyncStorage.setItem(key, dimension); } catch { /* the choice still applies until the card closes */ }
}
