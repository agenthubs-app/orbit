import * as Crypto from "expo-crypto";
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

const appSyncCoordinator = createSyncCoordinator({
  lifecycle: syncLifecycle,
  hashPayload: (serialized) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, serialized),
});
const authSessionGenerations = new WeakMap<object, number>();
let nextAuthSessionGeneration = 0;
const DEFAULT_INVALIDATION_TIMEOUT_MS = 8_000;

export interface SyncInvalidationOptions {
  timeoutMs?: number;
}

function authSessionGeneration(user: object | null): number {
  if (user === null) return 0;
  const existing = authSessionGenerations.get(user);
  if (existing !== undefined) return existing;
  nextAuthSessionGeneration += 1;
  authSessionGenerations.set(user, nextAuthSessionGeneration);
  return nextAuthSessionGeneration;
}

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
  const sessionGeneration = useMemo(
    () => authSessionGeneration(auth.user),
    [auth.user],
  );
  const scopeKey = useMemo(
    () =>
      JSON.stringify([
        baseUrl,
        auth.actorId,
        auth.notificationSessionRevision,
        sessionGeneration,
      ]),
    [
      auth.actorId,
      auth.notificationSessionRevision,
      baseUrl,
      sessionGeneration,
    ],
  );
  const apiClient = useOrbitApiClient({ scopeKey });
  const [snapshot, setSnapshot] = useState<
    SyncedCollectionSnapshot<TPayload>
  >(() => emptySnapshot<TPayload>());
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;
  const mounted = useRef(false);
  const sessionRef = useRef<SyncCoordinatorSession | null>(null);
  const viewGeneration = useRef(0);
  const requests = useRef(new Set<SyncRequest<TPayload>>());

  const startSync = useCallback(
    async (
      reason: "mount" | "explicit" | "foreground" | "invalidated",
      backgroundDurationMs?: number,
      timeoutMs?: number,
    ): Promise<SyncedCollectionSnapshot<TPayload> | null> => {
      const session = sessionRef.current;
      if (!session || !session.isCurrent()) return null;
      const requestGeneration = viewGeneration.current;
      const request = session.synchronize<TPayload>(input.kind, {
        ...(backgroundDurationMs === undefined ? {} : { backgroundDurationMs }),
        reason,
      });
      requests.current.add(request);
      const completion = (async () => {
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
          return result;
        } finally {
          requests.current.delete(request);
        }
      })();
      if (timeoutMs === undefined) return completion;
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const timeout = Symbol("sync-timeout");
        const result = await Promise.race([
          completion,
          new Promise<typeof timeout>((resolve) => {
            timer = setTimeout(resolve, Math.max(0, timeoutMs), timeout);
          }),
        ]);
        if (result !== timeout) return result;
        request.cancel({ abandon: true });
        requests.current.delete(request);
        if (
          !mounted.current ||
          viewGeneration.current !== requestGeneration ||
          !session.isCurrent()
        ) {
          return null;
        }
        const current = snapshotRef.current;
        const timedOut: SyncedCollectionSnapshot<TPayload> = {
          ...current,
          error: "同步请求超时，请重试。",
          status: current.records.length > 0 ? "stale" : "failure",
        };
        snapshotRef.current = timedOut;
        setSnapshot(timedOut);
        return timedOut;
      } finally {
        if (timer !== undefined) clearTimeout(timer);
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
  const invalidate = useCallback((options: SyncInvalidationOptions = {}) => {
    sessionRef.current?.invalidate();
    return startSync(
      "invalidated",
      undefined,
      options.timeoutMs ?? DEFAULT_INVALIDATION_TIMEOUT_MS,
    );
  }, [startSync]);

  return {
    ...snapshot,
    invalidate,
    refresh,
  };
}
