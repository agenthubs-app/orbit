// R11b 人脈分析（App）: the reads and the one write of the analysis pages.
// - GET /api/network/analysis: the deterministic view. The last good answer is kept in the page snapshot store (same store
//   as useApiResource) and shown offline with the offline bar; a failed count without a copy is an error, never a 0 lock.
// - GET /api/network/analysis/people: the drill-down list (first page kept like the view; further pages need the network).
// - GET /api/network/snapshot?lang=: iOrbit の見立て in the UI language (B-7); only read when the page is open (B-1), not kept.
// - POST /api/network/snapshot/recompute?lang=: 見直す, one idempotency key per press.
import * as Crypto from "expo-crypto";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useOrbitApiBaseUrl } from "../../api/ApiBaseUrlProvider";
import { useOrbitAuthSession } from "../../api/AuthSessionProvider";
import type { OrbitApiClient } from "../../api/client";
import type { OrbitLanguage } from "../../api/contract/language";
import type { NetworkAnalysisDimension, NetworkAnalysisPeopleDTO, NetworkAnalysisPeopleSort, NetworkAnalysisViewDTO } from "../../api/contract/network-analysis-view";
import { networkAnalysisPeopleSchema, networkAnalysisViewSchema, networkSnapshotViewSchema } from "../../api/schema/network-analysis-view";
import { ORBIT_API_ENDPOINTS } from "../../api/endpoints";
import type { ApiErrorBody, ApiResult } from "../../api/types";
import { readSnapshot, retireSnapshot, writeSnapshot } from "../../data/snapshot-store";
import { pageCopyFreshness } from "../../data/sync/page-copy-freshness";
import { buildNetworkAnalysisPeople, buildNetworkAnalysisView, type NetworkAnalysisNeeds, type NetworkAnalysisRow } from "../../api/compute/network-analysis-model";
import { useLocalContacts } from "../../hooks/useLocalContacts";
import { localNetworkAnalysisRows } from "../../view-models/network-analysis-local";
import { useNetworkMerge } from "../network/useNetworkMerge";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import type { z } from "zod";

export type NetworkSnapshotView = z.infer<typeof networkSnapshotViewSchema>;
export type NetworkSnapshotBlock = NetworkSnapshotView["blocks"][number];

export const NETWORK_ANALYSIS_PATH = ORBIT_API_ENDPOINTS.networkAnalysis;
export const PEOPLE_PAGE_LIMIT = 30;

export function networkAnalysisPeoplePath(dimension: NetworkAnalysisDimension, bucketId: string, sort: NetworkAnalysisPeopleSort | null, cursor: string | null): string {
  const params = new URLSearchParams({ dimension, bucket: bucketId, limit: String(PEOPLE_PAGE_LIMIT) });
  if (sort) params.set("sort", sort);
  if (cursor) params.set("cursor", cursor);
  return `${ORBIT_API_ENDPOINTS.networkAnalysisPeople}?${params.toString()}`;
}

export function networkSnapshotPath(language: OrbitLanguage): string {
  return `${ORBIT_API_ENDPOINTS.networkSnapshot}?lang=${language}`;
}

type Schema<T> = { safeParse: (input: unknown) => { success: true; data: T } | { success: false } };

export type CachedReadState<T> =
  | { status: "loading" }
  /** `offline`: the network could not be reached and this is the last kept copy. */
  | { status: "ready"; data: T; offline: boolean; verified?: boolean }
  | { status: "failed"; error: ApiErrorBody; httpStatus: number; offline: boolean };

const CONTRACT_MISMATCH: ApiErrorBody = { code: "ORBIT_APP_CONTRACT_MISMATCH", message: "contract mismatch" };
const UNREACHABLE: ApiErrorBody = { code: "ORBIT_APP_NETWORK_ERROR", message: "network error" };

function isOffline(result: ApiResult<unknown> | null): boolean {
  return !result || result.status === 0 || (!result.success && result.error.code === "ORBIT_APP_NETWORK_ERROR");
}

/**
 * One GET with the page snapshot store in front of it (`keep`): the kept copy shows at once, the network answer replaces it,
 * and an unavailable request keeps the copy (offline = unreachable). A server LOCKED answer retires the copy.
 * `read` is null while the page must not ask (locked / not yet).
 */
function useKeptRead<T>(path: string | null, read: (client: OrbitApiClient) => Promise<ApiResult<unknown>>, schema: Schema<T>, keep: boolean, freshForMs?: number): CachedReadState<T> & { refresh: () => void } {
  const auth = useOrbitAuthSession();
  const { baseUrl } = useOrbitApiBaseUrl();
  const client = useOrbitApiClient();
  const [state, setState] = useState<{ path: string | null; value: CachedReadState<T> }>({ path, value: { status: "loading" } });
  const [tick, setTick] = useState(0);
  const actorId = auth.actorId;

  useEffect(() => {
    if (!path || !auth.ready) return;
    let live = true;
    const set = (value: CachedReadState<T>) => { if (live) setState({ path, value }); };
    void (async () => {
      let kept: T | null = null;
      if (keep && actorId) {
        const record = await readSnapshot<unknown>(baseUrl, actorId, path).catch(() => null);
        const parsed = record?.result.success ? schema.safeParse(record.result.data) : null;
        if (parsed?.success) {
          kept = parsed.data;
          // LF3: a copy kept within its fresh window (and before any write) is this visit's answer — no server read.
          if (freshForMs !== undefined && tick === 0 && record && pageCopyFreshness.isFresh(record.syncedAt, freshForMs)) {
            set({ status: "ready", data: kept, offline: false, verified: true });
            return;
          }
          set({ status: "ready", data: kept, offline: false, verified: false });
        }
      }
      const result = await read(client).catch(() => null);
      if (!live) return;
      if (result?.success && result.status >= 200 && result.status < 300) {
        const parsed = schema.safeParse(result.data);
        if (parsed.success) {
          set({ status: "ready", data: parsed.data, offline: false, verified: true });
          if (keep && actorId) void writeSnapshot(baseUrl, actorId, path, result).catch(() => undefined);
        } else set({ status: "failed", error: CONTRACT_MISMATCH, httpStatus: result.status, offline: false });
        return;
      }
      if (result && !result.success && result.status === 409 && result.error.context?.reason === "LOCKED") {
        set({ status: "failed", error: result.error, httpStatus: result.status, offline: false });
        if (keep && actorId) {
          try { await retireSnapshot(baseUrl, actorId, path); }
          catch { console.error("NETWORK_ANALYSIS_CACHE_RETIRE_FAILED"); }
        }
        return;
      }
      const offline = isOffline(result);
      if (kept !== null) set({ status: "ready", data: kept, offline, verified: false });
      else set({ status: "failed", error: result && !result.success ? result.error : UNREACHABLE, httpStatus: result?.status ?? 0, offline });
    })();
    return () => { live = false; };
  }, [path, auth.ready, actorId, baseUrl, client, keep, tick]); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = useCallback(() => {
    setState((current) => (current.value.status === "failed" ? { path: current.path, value: { status: "loading" } } : current));
    setTick((value) => value + 1);
  }, []);
  const value: CachedReadState<T> = path && state.path === path ? state.value : { status: "loading" };
  return useMemo(() => ({ ...value, refresh }), [value, refresh]);
}

export function useNetworkAnalysisView(enabled = true, freshForMs?: number) {
  return useKeptRead<NetworkAnalysisViewDTO>(enabled ? NETWORK_ANALYSIS_PATH : null, (client) => client.get<unknown>(ORBIT_API_ENDPOINTS.networkAnalysis),
    networkAnalysisViewSchema as unknown as Schema<NetworkAnalysisViewDTO>, true, freshForMs);
}

/** LF3: how long the kept server view (read for its plan needs) is reused without asking again. */
export const NETWORK_ANALYSIS_NEEDS_FRESH_MS = 10 * 60_000;

/** The plan needs a server view carries; undefined when the answer predates LF3 (then the device keeps the server view). */
function needsOf(state: CachedReadState<NetworkAnalysisViewDTO>): NetworkAnalysisNeeds | undefined {
  // No server answer yet (and none kept): keep the server path — a count the page cannot read is a retry, never a guess.
  if (state.status !== "ready") return undefined;
  // A locked view or a pre-LF3 server sends no needs: keep the server view as it is.
  return state.data.needs === undefined ? undefined : state.data.needs;
}

/** LF3: the device's analysis rows (contacts domain + plan-related / follow-up merge); null without a readable mirror. */
function useLocalAnalysisRows(enabled: boolean): { rows: NetworkAnalysisRow[] | null; offline: boolean } {
  const local = useLocalContacts(false);
  const merge = useNetworkMerge(enabled && local.available);
  const rows = useMemo(() => (enabled && local.available && local.freshness.readable ? localNetworkAnalysisRows(local.rows, merge) : null),
    [enabled, local.available, local.freshness.readable, local.rows, merge.goalIds, merge.followUpIds]); // eslint-disable-line react-hooks/exhaustive-deps
  return { rows, offline: local.freshness.offline };
}

/**
 * LF3 (0117 restored): the analysis is computed on the device from its own contacts with the shared rules
 * (shared/compute/network-analysis-model.ts); the server view is read only for the plan needs (kept, 10-minute
 * fresh window). Without a device mirror, or against a server that does not send needs, the server view is used.
 */
export function useNetworkAnalysisViewLocalFirst(): CachedReadState<NetworkAnalysisViewDTO> & { refresh: () => void } {
  const server = useNetworkAnalysisView(true, NETWORK_ANALYSIS_NEEDS_FRESH_MS);
  const needs = needsOf(server);
  const local = useLocalAnalysisRows(needs !== undefined);
  return useMemo(() => {
    if (!local.rows || needs === undefined) return server;
    const data = buildNetworkAnalysisView({ total: local.rows.length, rows: local.rows, needs, now: new Date() });
    const verified = server.status === "ready" && server.verified === true;
    return { status: "ready" as const, data, offline: local.offline || (server.status !== "loading" && server.offline), verified, refresh: server.refresh };
  }, [local.rows, local.offline, needs, server]);
}

/** LF3: one drill-down list computed on the device (every page local); null rows → the server list. */
export function useNetworkAnalysisPeopleLocal(dimension: NetworkAnalysisDimension | null, bucketId: string, sort: NetworkAnalysisPeopleSort | null): {
  available: boolean; page: (cursor: string | null) => NetworkAnalysisPeopleDTO | null; locked: { total: number; required: number; missing: number } | null; offline: boolean;
} {
  const server = useNetworkAnalysisView(true, NETWORK_ANALYSIS_NEEDS_FRESH_MS);
  const needs = needsOf(server);
  const local = useLocalAnalysisRows(needs !== undefined);
  const available = Boolean(local.rows && dimension && needs !== undefined);
  const view = useMemo(() => (local.rows && needs !== undefined ? buildNetworkAnalysisView({ total: local.rows.length, rows: local.rows, needs, now: new Date() }) : null), [local.rows, needs]);
  const locked = view && view.lock.state === "locked" ? view.lock : null;
  const page = useCallback((cursor: string | null) => (local.rows && dimension && needs !== undefined && !locked
    ? buildNetworkAnalysisPeople({ rows: local.rows, needs, dimension, bucketId, ...(sort ? { sort } : {}), ...(cursor ? { cursor } : {}), limit: PEOPLE_PAGE_LIMIT, now: new Date() })
    : null), [bucketId, dimension, local.rows, locked, needs, sort]);
  return { available, page, locked, offline: local.offline };
}

/** Only called by an open page (B-1: never below 10 people). Not kept: an old sentence is never shown as current (B-8). */
export function useNetworkSnapshot(language: OrbitLanguage, enabled: boolean) {
  const path = enabled ? networkSnapshotPath(language) : null;
  return useKeptRead<NetworkSnapshotView>(path, (client) => client.get<unknown>(`${ORBIT_API_ENDPOINTS.networkSnapshot}?lang=${language}`),
    networkSnapshotViewSchema as unknown as Schema<NetworkSnapshotView>, false);
}

export function useNetworkAnalysisFirstPage(dimension: NetworkAnalysisDimension | null, bucketId: string, sort: NetworkAnalysisPeopleSort | null) {
  const path = dimension ? networkAnalysisPeoplePath(dimension, bucketId, sort, null) : null;
  return useKeptRead<NetworkAnalysisPeopleDTO>(path, (client) => client.get<unknown>(`${ORBIT_API_ENDPOINTS.networkAnalysisPeople}?${path?.split("?")[1] ?? ""}`),
    networkAnalysisPeopleSchema as unknown as Schema<NetworkAnalysisPeopleDTO>, true);
}

export async function readNetworkAnalysisPage(client: OrbitApiClient, dimension: NetworkAnalysisDimension, bucketId: string, sort: NetworkAnalysisPeopleSort, cursor: string): Promise<NetworkAnalysisPeopleDTO | null> {
  const query = networkAnalysisPeoplePath(dimension, bucketId, sort, cursor).split("?")[1] ?? "";
  const result = await client.get<unknown>(`${ORBIT_API_ENDPOINTS.networkAnalysisPeople}?${query}`).catch(() => null);
  if (!result?.success) return null;
  const parsed = networkAnalysisPeopleSchema.safeParse(result.data);
  return parsed.success ? parsed.data as NetworkAnalysisPeopleDTO : null;
}

export type RecomputeOutcome = { kind: "ok"; snapshot: NetworkSnapshotView } | { kind: "limited" } | { kind: "needsContacts" } | { kind: "failed" };

export async function recomputeNetworkSnapshot(client: OrbitApiClient, language: OrbitLanguage): Promise<RecomputeOutcome> {
  const result = await client.post<unknown>(`${ORBIT_API_ENDPOINTS.networkSnapshotRecompute}?lang=${language}`, { body: { idempotencyKey: `app-${Crypto.randomUUID()}` } }).catch(() => null);
  if (result?.success) {
    const parsed = networkSnapshotViewSchema.safeParse(result.data);
    return parsed.success ? { kind: "ok", snapshot: parsed.data } : { kind: "failed" };
  }
  if (result?.status === 429) return { kind: "limited" };
  if (result && !result.success && result.error.context?.reason === "INSUFFICIENT_CONTACTS") return { kind: "needsContacts" };
  return { kind: "failed" };
}

/** The list says LOCKED (409) for a direct link below 10 people: the page shows the lock instead. */
export function isLockedListFailure(state: CachedReadState<unknown>): boolean {
  return state.status === "failed" && state.httpStatus === 409 && state.error.context?.reason === "LOCKED";
}
