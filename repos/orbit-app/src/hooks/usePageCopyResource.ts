import { useCallback, useEffect, useRef, useState } from "react";

import { useOrbitAuthSession } from "../api/AuthSessionProvider";
import { useOrbitApiBaseUrl } from "../api/ApiBaseUrlProvider";
import { serverReachability } from "../api/server-reachability";
import type { ApiResult } from "../api/types";
import type { PageCopyId, PageCopyStatus } from "../data/sync/page-copies";
import { resultToRouteState, type RouteState } from "../view-models/route-state";
import type { ApiResourceState } from "./useApiResource";
import { useOrbitApiClient } from "./useOrbitApiClient";
import { useSyncCoordinatorSession } from "./useSyncedCollection";

export type PageCopyResourceState<TData> = ApiResourceState<TData> & {
  /** Non-null while the content on screen is the device's page copy rather than this visit's server answer. */
  copy: PageCopyStatus | null;
};

const META = { featureMode: null, privacy: null, runtimeBoundary: null } as const;

/** 0 (no connection) and 5xx keep the copy on screen; any other answer is the server's word. */
export function keepsPageCopy(result: ApiResult<unknown>): "unreachable" | "unavailable" | null {
  if (result.success) return null;
  if (result.status === 0 || result.error.code === "ORBIT_APP_NETWORK_ERROR") return "unreachable";
  return result.status >= 500 ? "unavailable" : null;
}

/**
 * Sprint 0131: a server-computed page that is readable offline. The device's
 * page copy (the last successful online read, bound to the lease) is shown at
 * once; this visit's server answer replaces it and becomes the new copy. When
 * the server cannot be reached (or answers 5xx) the copy stays on screen and
 * `copy.offline` turns on, so the page can show the 「截至」 notice and disable
 * writes. A 4xx answer is authoritative and replaces the copy on screen.
 * Without a device mirror (a browser without OPFS, a non-secure origin) there is
 * no copy and the page behaves as a plain network read. When the server
 * answers again after being unreachable, the page reads again at once.
 */
export function usePageCopyResource<TData>(
  path: string,
  isEmpty: (data: TData) => boolean,
  options: {
    copy: { id: PageCopyId; variant?: string };
    scopeKey?: string | null;
    enabled?: boolean;
    /** A copy or response that fails this check is neither shown from the copy nor saved. */
    accept?: (data: unknown) => boolean;
  },
): PageCopyResourceState<TData> {
  const auth = useOrbitAuthSession();
  const { baseUrl } = useOrbitApiBaseUrl();
  const enabled = options.enabled ?? true;
  const signedIn = auth.ready && auth.signedIn && Boolean(auth.actorId);
  const session = useSyncCoordinatorSession(enabled && signedIn);
  // A new session object (the same scope reopened) must not re-read the page.
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const client = useOrbitApiClient({ scopeKey: JSON.stringify([options.scopeKey ?? null, path]) });
  const copyId = options.copy.id;
  const variant = options.copy.variant ?? "main";
  const accept = useRef(options.accept);
  accept.current = options.accept;
  const isEmptyRef = useRef(isEmpty);
  isEmptyRef.current = isEmpty;
  const [refreshIndex, setRefreshIndex] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [view, setView] = useState<{ key: string; state: RouteState<TData>; copy: PageCopyStatus | null }>({ key: "", state: { kind: "loading" }, copy: null });
  const viewKey = JSON.stringify([options.scopeKey ?? null, path, copyId, variant, auth.actorId, baseUrl]);
  const offlineRef = useRef(false);
  const refresh = useCallback(() => setRefreshIndex((value) => value + 1), []);
  // The copy is read through the session, so wait for it when there is a signed-in scope.
  const sessionReady = !signedIn || session !== null;

  useEffect(() => {
    if (!enabled || !auth.ready || !sessionReady) {
      if (!enabled || !auth.ready) setView({ key: viewKey, state: { kind: "loading" }, copy: null });
      return;
    }
    let active = true;
    const controller = new AbortController();
    const isRefresh = refreshIndex > 0;
    if (isRefresh) setRefreshing(true);
    else setView((current) => current.key === viewKey ? current : { key: viewKey, state: { kind: "loading" }, copy: null });
    const accepts = (data: unknown) => accept.current ? accept.current(data) : true;
    const fromData = (data: unknown): RouteState<TData> => resultToRouteState({ success: true, data: data as TData, meta: META, status: 200 }, isEmptyRef.current);

    const session = sessionRef.current;
    void (async () => {
      let shown: { syncedAt: string; state: RouteState<TData> } | null = null;
      let answered = false;
      const copyRead = session
        ? session.readPageCopy(copyId, variant).then((copy) => {
          if (!active || answered || !copy || !accepts(copy.data)) return;
          shown = { syncedAt: copy.syncedAt, state: fromData(copy.data) };
          setView({ key: viewKey, state: shown.state, copy: { lastSyncedAt: copy.syncedAt, offline: false, reason: null } });
        }).catch(() => undefined)
        : Promise.resolve();
      try {
        const result = await client.get<unknown>(path, { signal: controller.signal });
        if (!active) return;
        const ok = result.success && result.status >= 200 && result.status < 300 && accepts(result.data);
        if (ok) {
          answered = true;
          offlineRef.current = false;
          setView({ key: viewKey, state: fromData(result.data), copy: null });
          if (session) void session.savePageCopy(copyId, variant, result.data).catch(() => undefined);
          return;
        }
        // Let a pending copy read land first: offline, the copy is what the page shows.
        await copyRead;
        if (!active) return;
        answered = true;
        const reason = keepsPageCopy(result);
        const copy = shown as { syncedAt: string; state: RouteState<TData> } | null;
        if (copy && reason) {
          offlineRef.current = true;
          setView({ key: viewKey, state: copy.state, copy: { lastSyncedAt: copy.syncedAt, offline: true, reason } });
          return;
        }
        offlineRef.current = reason === "unreachable";
        const failed: ApiResult<TData> = result.success
          ? { success: false, error: { code: "ORBIT_APP_UNEXPECTED_STATUS", message: "请求暂时无法完成，请稍后重试。" }, meta: result.meta, status: result.status }
          : result as ApiResult<TData>;
        if (!isRefresh || !copy) setView({ key: viewKey, state: resultToRouteState(failed, isEmptyRef.current), copy: null });
      } finally {
        if (active) setRefreshing(false);
      }
    })();
    return () => {
      active = false;
      controller.abort();
    };
  }, [auth.ready, client, copyId, enabled, path, refreshIndex, sessionReady, variant, viewKey]);

  // Back online: read again at once instead of leaving the 「截至」 copy up.
  useEffect(() => serverReachability.subscribe((url, state, previous) => {
    if (state === "reachable" && previous === "unreachable" && offlineRef.current && url === baseUrl.trim().replace(/\/+$/u, "")) refresh();
  }), [baseUrl, refresh]);

  const current = view.key === viewKey ? view : { state: { kind: "loading" } as RouteState<TData>, copy: null };
  return { ...current.state, refresh, refreshing, copy: current.copy };
}
