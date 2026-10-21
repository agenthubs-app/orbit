import AsyncStorage from "@react-native-async-storage/async-storage";

import { CONTACT_DELETE_QUEUE_PREFIX } from "../screens/network/contact-delete-queue";
import { NETWORK_MERGE_CACHE_PREFIX } from "../screens/network/network-merge-cache-key";
import { homeLayoutStorageKey } from "../screens/home/home-layout-storage";
import { todoHandoffStorageKey } from "../screens/todo/todo-handoff-state";

/** LF5: recent-search lists are per account; the keys before LF5 were shared by every account on the device. */
export const RECENT_SEARCH_KEYS = { global: "orbit.search.recent", events: "orbit.events.recentSearches" } as const;
export function recentSearchKey(kind: keyof typeof RECENT_SEARCH_KEYS, actorId: string | null | undefined): string | null {
  return actorId ? `${RECENT_SEARCH_KEYS[kind]}:${encodeURIComponent(actorId)}` : null;
}

/**
 * LF5: the account's small AsyncStorage caches outside the sync database, which sign-out and account deletion used
 * to leave behind: recent searches (and the pre-LF5 device-wide lists), the Home layout cache, the To-do handoff,
 * the 人脈 merge cache — and, when the user discards unsent writes or deletes the account, the queued contact deletes.
 */
export async function clearAccountLocalCaches(scope: { actorId: string; baseUrl: string }, options: { discardPendingWrites: boolean }): Promise<void> {
  const keys = [
    RECENT_SEARCH_KEYS.global, RECENT_SEARCH_KEYS.events,
    recentSearchKey("global", scope.actorId), recentSearchKey("events", scope.actorId),
    homeLayoutStorageKey(scope.actorId, scope.baseUrl), todoHandoffStorageKey(scope.actorId, scope.baseUrl),
    `${NETWORK_MERGE_CACHE_PREFIX}${scope.actorId}`,
    ...(options.discardPendingWrites ? [`${CONTACT_DELETE_QUEUE_PREFIX}${scope.actorId}`] : []),
  ].filter((key): key is string => Boolean(key));
  await Promise.all(keys.map((key) => AsyncStorage.removeItem(key).catch(() => undefined)));
}
