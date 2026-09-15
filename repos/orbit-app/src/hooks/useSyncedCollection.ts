import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppState } from "react-native";

import type { SyncChangeKind } from "../api/contract/sync";
import { useOrbitAuthSession } from "../api/AuthSessionProvider";
import { useOrbitApiBaseUrl } from "../api/ApiBaseUrlProvider";
import { createSyncClient } from "../data/sync/sync-client";
import {
  createSyncCoordinator,
  type SyncCoordinatorSession,
  type SyncedCollectionSnapshot,
  type SyncRequest,
} from "../data/sync/sync-coordinator";
import { subscribeToSyncAppState } from "../data/sync/sync-freshness";
import { syncLifecycle } from "../data/sync/sync-lifecycle";
import { useOrbitApiClient } from "./useOrbitApiClient";

const appSyncCoordinator = createSyncCoordinator({ lifecycle: syncLifecycle });

function emptySnapshot<TPayload>(): SyncedCollectionSnapshot<TPayload> {
  return {
    error: null,
    lastSyncedAt: null,
    records: [],
    status: "local-ready",
    workspaceId: null,
  };
}

export function useSyncedCollection<TPayload = unknown>(input: {
  kind: SyncChangeKind;
}) {
  const auth = useOrbitAuthSession();
  const { baseUrl, ready: baseUrlReady } = useOrbitApiBaseUrl();
  const scopeKey = useMemo(
    () =>
      JSON.stringify([
        baseUrl,
        auth.actorId,
        auth.notificationSessionRevision,
      ]),
    [auth.actorId, auth.notificationSessionRevision, baseUrl],
  );
  const apiClient = useOrbitApiClient({ scopeKey });
  const [snapshot, setSnapshot] = useState<
    SyncedCollectionSnapshot<TPayload>
  >(() => emptySnapshot<TPayload>());
  const mounted = useRef(false);
  const sessionRef = useRef<SyncCoordinatorSession | null>(null);
  const viewGeneration = useRef(0);
  const requests = useRef(new Set<SyncRequest<TPayload>>());

  const startSync = useCallback(
    async (
      reason: "mount" | "explicit" | "foreground" | "invalidated",
      backgroundDurationMs?: number,
    ): Promise<void> => {
      const session = sessionRef.current;
      if (!session || !session.isCurrent()) return;
      const requestGeneration = viewGeneration.current;
      const request = session.synchronize<TPayload>(input.kind, {
        ...(backgroundDurationMs === undefined ? {} : { backgroundDurationMs }),
        reason,
      });
      requests.current.add(request);
      const started = await request.started;
      if (
        started &&
        mounted.current &&
        viewGeneration.current === requestGeneration &&
        session.isCurrent()
      ) {
        setSnapshot((current) => ({
          ...current,
          error: null,
          status: "syncing",
        }));
      }
      try {
        const result = await request.promise;
        if (
          mounted.current &&
          viewGeneration.current === requestGeneration &&
          result &&
          session.isCurrent()
        ) {
          setSnapshot(result);
        }
      } finally {
        requests.current.delete(request);
      }
    },
    [input.kind],
  );

  useEffect(() => {
    const effectGeneration = ++viewGeneration.current;
    mounted.current = true;
    setSnapshot(emptySnapshot<TPayload>());
    if (
      !auth.ready ||
      !baseUrlReady ||
      !auth.signedIn ||
      !auth.actorId
    ) {
      sessionRef.current = null;
      return () => {
        mounted.current = false;
      };
    }
    const session = appSyncCoordinator.openScope({
      actorId: auth.actorId,
      baseUrl,
      client: createSyncClient(apiClient),
      scopeKey,
    });
    sessionRef.current = session;
    let active = true;
    void session.readCollection<TPayload>(input.kind).then((mirror) => {
      if (
        !active ||
        !mounted.current ||
        viewGeneration.current !== effectGeneration ||
        !mirror ||
        !session.isCurrent()
      ) {
        return;
      }
      setSnapshot(mirror);
      void startSync("mount");
    });
    const unsubscribeAppState = subscribeToSyncAppState({
      appState: AppState,
      now: Date.now,
      onForeground: (backgroundDurationMs) => {
        void startSync("foreground", backgroundDurationMs);
      },
    });
    return () => {
      active = false;
      mounted.current = false;
      if (viewGeneration.current === effectGeneration) {
        viewGeneration.current += 1;
      }
      if (sessionRef.current === session) sessionRef.current = null;
      session.deactivate();
      unsubscribeAppState();
      for (const request of requests.current) request.cancel();
      requests.current.clear();
    };
  }, [
    auth.ready,
    auth.signedIn,
    auth.actorId,
    apiClient,
    baseUrl,
    baseUrlReady,
    input.kind,
    scopeKey,
    startSync,
  ]);

  const refresh = useCallback(
    () => startSync("explicit"),
    [startSync],
  );
  const invalidate = useCallback(() => {
    sessionRef.current?.invalidate();
    return startSync("invalidated");
  }, [startSync]);

  return {
    ...snapshot,
    invalidate,
    refresh,
  };
}
