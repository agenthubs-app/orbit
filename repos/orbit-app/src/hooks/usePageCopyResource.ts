import { useCallback, useEffect, useRef, useState } from "react";

import { useOrbitAuthSession } from "../api/AuthSessionProvider";
import { useOrbitApiBaseUrl } from "../api/ApiBaseUrlProvider";
import { serverReachability } from "../api/server-reachability";
import type { ApiResult } from "../api/types";
import type { PageCopyId, PageCopyStatus } from "../data/sync/page-copies";
import { resultToRouteState, type RouteState } from "../view-models/route-state";
import type { ApiResourceState } from "./useApiResource";
import { useOrbitApiClient } from "./useOrbitApiClient";
import { usePageCopySession } from "./usePageCopySession";

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
    /** A copy that fails this check is not shown, and a server answer that fails it is shown (the page judges it) but not saved. */
    accept?: (data: unknown) => boolean;
  },
): PageCopyResourceState<TData> {
  const auth = useOrbitAuthSession();
  const { baseUrl } = useOrbitApiBaseUrl();
  const enabled = options.enabled ?? true;
  const signedIn = auth.ready && auth.signedIn && Boolean(auth.actorId);
  const { session, whenReady } = usePageCopySession(enabled && signedIn);
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
  // The attempt in flight: whether the server answered, and the copy shown meanwhile. The copy is read
  // as soon as the coordinator session exists (it may open after the request started).
  const attempt = useRef<{ key: string; answered: boolean; shown: { syncedAt: string; state: RouteState<TData> } | null; copyRead: Promise<void> | null } | null>(null);
  const readCopy = useCallback((current: NonNullable<typeof attempt.current>, wait = false): Promise<void> => {
    const activeSession = sessionRef.current;
    if (current.copyRead) return current.copyRead;
    if (!activeSession) {
      // Offline answers can come before the session opens; wait for it (briefly) rather than miss the copy.
      return wait ? whenReady().then((ready) => (ready && attempt.current === current ? readCopy(current) : undefined)) : Promise.resolve();
    }
    current.copyRead = activeSession.readPageCopy(copyId, variant).then((copy) => {
      if (attempt.current !== current || current.answered || !copy || !(accept.current ? accept.current(copy.data) : true)) return;
      const state = resultToRouteState({ success: true, data: copy.data as TData, meta: META, status: 200 }, isEmptyRef.current);
      current.shown = { syncedAt: copy.syncedAt, state };
      setView({ key: current.key, state, copy: { lastSyncedAt: copy.syncedAt, offline: false, reason: null } });
    }).catch(() => undefined);
    return current.copyRead;
  }, [copyId, variant, whenReady]);

  useEffect(() => {
    if (!enabled || !auth.ready) {
      attempt.current = null;
      setView({ key: viewKey, state: { kind: "loading" }, copy: null });
      return;
    }
    let active = true;
    const controller = new AbortController();
    const isRefresh = refreshIndex > 0;
    if (isRefresh) setRefreshing(true);
    else setView((current) => current.key === viewKey ? current : { key: viewKey, state: { kind: "loading" }, copy: null });
    const accepts = (data: unknown) => accept.current ? accept.current(data) : true;
    const current: NonNullable<typeof attempt.current> = { key: viewKey, answered: false, shown: null, copyRead: null };
    attempt.current = current;
    void readCopy(current);

    void (async () => {
      try {
        const result = await client.get<unknown>(path, { signal: controller.signal });
        if (!active) return;
        // Any 2xx answer is shown (the page validates it itself); only an accepted one becomes the copy.
        const ok = result.success && result.status >= 200 && result.status < 300;
        if (ok) {
          current.answered = true;
          offlineRef.current = false;
          setView({ key: viewKey, state: resultToRouteState({ success: true, data: result.data as TData, meta: META, status: 200 }, isEmptyRef.current), copy: null });
          if (accepts(result.data)) void whenReady().then((ready) => ready?.savePageCopy(copyId, variant, result.data)).catch(() => undefined);
          return;
        }
        // Offline the copy is what the page shows: let a pending (or late-starting) copy read land first.
        await readCopy(current, true);
        if (!active) return;
        current.answered = true;
        const reason = keepsPageCopy(result);
        const copy = current.shown;
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
  }, [auth.ready, client, copyId, enabled, path, readCopy, refreshIndex, variant, viewKey, whenReady]);

  // The session opened after the request started: show the copy while the server has not answered.
  useEffect(() => {
    if (session && attempt.current && !attempt.current.answered) void readCopy(attempt.current);
  }, [readCopy, session]);

  // Back online: read again at once instead of leaving the 「截至」 copy up.
  useEffect(() => serverReachability.subscribe((url, state, previous) => {
    if (state === "reachable" && previous === "unreachable" && offlineRef.current && url === baseUrl.trim().replace(/\/+$/u, "")) refresh();
  }), [baseUrl, refresh]);

  const current = view.key === viewKey ? view : { state: { kind: "loading" } as RouteState<TData>, copy: null };
  return { ...current.state, refresh, refreshing, copy: current.copy };
}
