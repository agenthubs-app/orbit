// R11a 人脈（App）: the two id sets the list merges on read (PLANNER 契约 5, 代定 1 / 13).
// - 目標に関係: GET /api/contacts/goal-related-ids (plans are not in the sync domains), cached per account in
//   AsyncStorage; offline (or 「尚未実装」) the last cached value is used, else nobody.
// - 要フォロー: the task mirror (isOpenFollowUpTask, the same rule as the server and R20a To-do) united with the
//   cached server ids (the mirror has no relationship lifecycle tasks).
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useOrbitAuthSession } from "../../api/AuthSessionProvider";
import { isOpenFollowUpTask } from "../../api/compute/follow-up-task";
import { whenNotImplemented } from "../../api/compute/not-implemented";
import type { ContactGoalRelatedIdsDTO, ContactGoalRelatedLinkDTO } from "../../api/contract/contact-goal-related";
import { ORBIT_API_ENDPOINTS } from "../../api/endpoints";
import { contactGoalRelatedIdsSchema } from "../../api/schema/contact-goal-related";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import { useSyncedCollection } from "../../hooks/useSyncedCollection";

export const NETWORK_MERGE_CACHE_PREFIX = "orbit.network.merge.v1:";
/** Re-read the plan link at most this often while the screen is open. */
export const NETWORK_MERGE_MAX_AGE_MS = 5 * 60_000;

export interface NetworkMergeCache { savedAt: string; data: ContactGoalRelatedIdsDTO }

export function parseNetworkMergeCache(raw: string | null): NetworkMergeCache | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as { savedAt?: unknown; data?: unknown };
    const data = contactGoalRelatedIdsSchema.safeParse(value.data);
    return typeof value.savedAt === "string" && data.success ? { savedAt: value.savedAt, data: data.data as ContactGoalRelatedIdsDTO } : null;
  } catch {
    return null;
  }
}

/** Contact ids with an open follow-up in the task mirror rows (payload = the server's task fields). */
export function mirrorFollowUpIds(records: readonly { payload: unknown }[]): string[] {
  const ids = new Set<string>();
  for (const record of records) {
    const task = record.payload as Record<string, unknown> | null;
    if (!task || typeof task !== "object") continue;
    const status = typeof task.status === "string" ? task.status : "";
    const relatedContactId = typeof task.relatedContactId === "string" ? task.relatedContactId : null;
    const category = typeof task.category === "string" ? task.category : null;
    if (relatedContactId && isOpenFollowUpTask({ status, category, relatedContactId })) ids.add(relatedContactId);
  }
  return [...ids];
}

export interface NetworkMergeState {
  goalIds: string[];
  links: ReadonlyMap<string, ContactGoalRelatedLinkDTO>;
  followUpIds: string[];
  /** Plan ids came from the cache because the server could not be reached. */
  stale: boolean;
  refresh(): void;
}

export function useNetworkMerge(): NetworkMergeState {
  const auth = useOrbitAuthSession();
  const client = useOrbitApiClient();
  const tasks = useSyncedCollection<Record<string, unknown>>({ kind: "task" });
  const key = auth.actorId ? `${NETWORK_MERGE_CACHE_PREFIX}${auth.actorId}` : null;
  const [cache, setCache] = useState<NetworkMergeCache | null>(null);
  const [stale, setStale] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!key) return;
    let live = true;
    void (async () => {
      let cached: NetworkMergeCache | null = null;
      try { cached = parseNetworkMergeCache(await AsyncStorage.getItem(key)); } catch { cached = null; }
      if (!live) return;
      if (cached) setCache(cached);
      if (cached && tick === 0 && Date.now() - Date.parse(cached.savedAt) < NETWORK_MERGE_MAX_AGE_MS) return;
      const result = await client.get<unknown>(ORBIT_API_ENDPOINTS.contactGoalRelatedIds);
      if (!live) return;
      if (whenNotImplemented(result, { use: "hide" })) { setStale(false); return; }
      const parsed = result.success ? contactGoalRelatedIdsSchema.safeParse(result.data) : null;
      if (!parsed?.success) { setStale(true); return; }
      const next = { savedAt: new Date().toISOString(), data: parsed.data as ContactGoalRelatedIdsDTO };
      setCache(next);
      setStale(false);
      try { await AsyncStorage.setItem(key, JSON.stringify(next)); } catch { /* cache is a convenience */ }
    })();
    return () => { live = false; };
  }, [client, key, tick]);

  const mirror = useMemo(() => mirrorFollowUpIds(tasks.records), [tasks.records]);
  const refresh = useCallback(() => setTick((value) => value + 1), []);
  return useMemo(() => {
    const data = cache?.data;
    return {
      goalIds: data?.ids ?? [],
      links: new Map((data?.links ?? []).map((link) => [link.contactId, link])),
      followUpIds: [...new Set([...mirror, ...(data?.followUpContactIds ?? [])])],
      stale,
      refresh,
    };
  }, [cache, mirror, stale, refresh]);
}
