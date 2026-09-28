import { useCallback, useEffect, useRef, useState } from "react";

import { useOrbitAuthSession } from "../api/AuthSessionProvider";
import { useOrbitApiBaseUrl } from "../api/ApiBaseUrlProvider";
import { serverReachability } from "../api/server-reachability";
import type { PageCopy, PageCopyId, PageCopyStatus } from "../data/sync/page-copies";
import { resultToRouteState, type RouteState } from "../view-models/route-state";
import { useApiResource, type ApiResourceState } from "./useApiResource";
import { usePageCopySession } from "./usePageCopySession";

export type PageCopyResourceState<TData> = ApiResourceState<TData> & {
  /** Non-null while the content on screen is the device's page copy rather than this visit's server answer. */
  copy: PageCopyStatus | null;
};

const META = { featureMode: null, privacy: null, runtimeBoundary: null } as const;

export { keepsPageCopy } from "../data/sync/page-copies";

function keepsCopyState(state: RouteState<unknown>): "unreachable" | "unavailable" | null {
  if (state.kind === "offline") return "unreachable";
  return state.kind === "failure" && state.status >= 500 ? "unavailable" : null;
}

/**
 * Sprint 0131: a server-computed page that is readable offline. The page's
 * network read is the ordinary network-only useApiResource; around it, the
 * device's page copy (the last successful online read, bound to the lease) is
 * shown while the server has not answered, and stays on screen with
 * `copy.offline` when the server cannot be reached (or answers 5xx), so the page
 * can show the 「截至」 notice and turn writes off. Every 2xx answer is shown (the
 * page validates it) and an accepted one becomes the new copy; a 4xx answer is
 * the server's word and replaces the copy. Without a device mirror (signed out,
 * a browser without OPFS or on a non-secure origin) there is no copy and the page
 * is a plain network read. When the server answers again after being
 * unreachable, the page reads again at once.
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
  const network = useApiResource<TData>(path, isEmpty, {
    cachePolicy: "network-only",
    enabled,
    ...(options.scopeKey === undefined ? {} : { scopeKey: options.scopeKey }),
  });
  const { session, whenReady } = usePageCopySession(enabled && signedIn);
  const copyId = options.copy.id;
  const variant = options.copy.variant ?? "main";
  const accept = useRef(options.accept);
  accept.current = options.accept;
  const accepts = useCallback((data: unknown) => (accept.current ? accept.current(data) : true), []);
  const copyKey = JSON.stringify([baseUrl, auth.actorId, copyId, variant]);
  // The copy read for this key: `settled` once a read finished (or there is no session to read from).
  const [stored, setStored] = useState<{ key: string; copy: PageCopy | null; settled: boolean }>({ key: "", copy: null, settled: false });
  const current = stored.key === copyKey ? stored : { key: copyKey, copy: null, settled: false };

  useEffect(() => {
    if (!enabled) return;
    let live = true;
    // The session opens in an effect; wait for it (briefly) so an early offline answer does not miss the copy.
    void whenReady().then((ready) => ready ? ready.readPageCopy(copyId, variant) : null).then((copy) => {
      if (live) setStored({ key: copyKey, copy: copy && accepts(copy.data) ? copy : null, settled: true });
    }).catch(() => { if (live) setStored({ key: copyKey, copy: null, settled: true }); });
    return () => { live = false; };
  }, [accepts, copyId, copyKey, enabled, session, variant, whenReady]);

  // A 2xx answer becomes the copy (once per answer).
  const saved = useRef<unknown>(null);
  const answer = network.kind === "success" || network.kind === "empty" ? network.data : undefined;
  useEffect(() => {
    if (answer === undefined || saved.current === answer || !accepts(answer)) return;
    saved.current = answer;
    void whenReady().then((ready) => ready?.savePageCopy(copyId, variant, answer)).catch(() => undefined);
  }, [accepts, answer, copyId, variant, whenReady]);

  const reason = keepsCopyState(network);
  const refresh = network.refresh;
  // Back online: read again at once instead of leaving the 「截至」 copy up.
  const offlineRef = useRef(false);
  offlineRef.current = reason !== null;
  useEffect(() => serverReachability.subscribe((url, state, previous) => {
    if (state === "reachable" && previous === "unreachable" && offlineRef.current && url === baseUrl.trim().replace(/\/+$/u, "")) refresh();
  }), [baseUrl, refresh]);

  if (network.kind === "success" || network.kind === "empty") return { ...network, copy: null };
  const fromCopy = current.copy
    ? resultToRouteState({ success: true, data: current.copy.data as TData, meta: META, status: 200 }, isEmpty)
    : null;
  if (network.kind === "loading") {
    return fromCopy ? { ...fromCopy, refresh, refreshing: network.refreshing, copy: { lastSyncedAt: current.copy!.syncedAt, offline: false, reason: null } }
      : { ...network, copy: null };
  }
  if (reason && fromCopy) {
    return { ...fromCopy, refresh, refreshing: network.refreshing, copy: { lastSyncedAt: current.copy!.syncedAt, offline: true, reason } };
  }
  // Offline before the copy read finished: keep reading rather than flash "not on this device".
  if (reason && enabled && signedIn && !current.settled) return { kind: "loading", refresh, refreshing: network.refreshing, copy: null };
  return { ...network, copy: null };
}
