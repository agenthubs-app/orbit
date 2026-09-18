import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useOrbitAuthSession } from "../api/AuthSessionProvider";
import { useOrbitApiBaseUrl } from "../api/ApiBaseUrlProvider";
import { createOrbitApiClient, type FetchLike } from "../api/client";
import { readSnapshot, writeSnapshot } from "../data/snapshot-store";
import type { RouteState } from "../view-models/route-state";
import { resultToRouteState } from "../view-models/route-state";
import {
  appPerformanceInput,
  appPerformanceScenarioForPath,
  isAppPerformanceEnabled,
  measureAppPerformance,
  setAppPerformanceScope,
} from "../performance/app-performance";

export type ApiResourceState<TData> = RouteState<TData> & {
  refresh: () => void;
  refreshing: boolean;
};

function unexpectedErrorState<TData>(_error: unknown): RouteState<TData> {
  return {
    kind: "failure",
    error: {
      code: "ORBIT_APP_UNEXPECTED_ERROR",
      message: "请求暂时无法完成，请稍后重试。"
    },
    meta: { featureMode: null, privacy: null, runtimeBoundary: null },
    status: 0
  };
}

export function useApiResource<TData>(
  path: string,
  isEmpty: (data: TData) => boolean,
  { scopeKey, cachePolicy = "default", enabled = true }: { scopeKey?: string | null; cachePolicy?: "default" | "network-only"; /** false keeps the resource inert (no snapshot read, no request) while another source is authoritative. */ enabled?: boolean } = {}
): ApiResourceState<TData> {
  const { baseUrl } = useOrbitApiBaseUrl();
  const auth = useOrbitAuthSession();
  const actorId = auth.actorId;
  const performanceScenario = isAppPerformanceEnabled()
    ? appPerformanceScenarioForPath(path)
    : null;
  // Opt-in account isolation: do not coalesce this account's GET with an old
  // browser session's request when both sessions have an empty cookieHeader.
  const fetchImpl = useMemo<FetchLike>(
    () => scopeKey === undefined ? fetch : async (input, init) => {
      const response = await fetch(input, init);
      // Account-scoped consumers must suppress stale session-expiry events,
      // not merely ignore the resulting component state after parsing.
      if (init?.signal?.aborted) throw new Error("Inactive scoped resource");
      return response;
    },
    [scopeKey]
  );
  const client = useMemo(
    () =>
      createOrbitApiClient({
        authCookieHeader: auth.cookieHeader,
        baseUrl,
        fetchImpl
      }),
    [auth.cookieHeader, baseUrl, fetchImpl]
  );
  const isEmptyRef = useRef(isEmpty);
  const [refreshIndex, setRefreshIndex] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [snapshot, setSnapshot] = useState<{ scopeKey: string | null | undefined; state: RouteState<TData> }>({ scopeKey, state: { kind: "loading" } });
  const state: RouteState<TData> = scopeKey === undefined || snapshot.scopeKey === scopeKey ? snapshot.state : { kind: "loading" };
  const previousScope = useRef(scopeKey);
  const refresh = useCallback(() => {
    if (cachePolicy === "network-only") {
      setSnapshot({ scopeKey, state: { kind: "loading" } });
    }
    setRefreshIndex((value) => value + 1);
  }, [cachePolicy, scopeKey]);

  useEffect(() => {
    isEmptyRef.current = isEmpty;
  }, [isEmpty]);

  useEffect(() => {
    if (isAppPerformanceEnabled()) {
      setAppPerformanceScope({ actorId, baseUrl });
    }
  }, [actorId, baseUrl]);

  useEffect(() => {
    let active = true;
    const controller = scopeKey === undefined ? null : new AbortController();
    const scopeChanged = previousScope.current !== scopeKey;
    previousScope.current = scopeKey;
    const isRefresh = refreshIndex > 0 && !scopeChanged;
    const setState = (state: RouteState<TData>) => setSnapshot({ scopeKey, state });

    if (!auth.ready || !enabled) {
      setState({ kind: "loading" });
      return () => {
        active = false;
        controller?.abort();
      };
    }

    if (isRefresh) {
      setRefreshing(true);
    } else {
      setState({ kind: "loading" });
    }

    // 内容页默认先展示快照；需要确认当前状态的消费者可选择只走网络。
    async function load(): Promise<void> {
      let cached: RouteState<TData> | null = null;

      if (!isRefresh && actorId && cachePolicy !== "network-only") {
        const snapshot = await readSnapshot<TData>(baseUrl, actorId, path);

        if (!active) {
          return;
        }

        if (snapshot) {
          cached = resultToRouteState(snapshot.result, isEmptyRef.current);
          setState(cached);
        }
      }

      try {
        const received = performanceScenario
          ? await measureAppPerformance(
              appPerformanceInput("app.resource", performanceScenario),
              () => client.get<TData>(path, controller ? { signal: controller.signal } : undefined),
            )
          : await client.get<TData>(path, controller ? { signal: controller.signal } : undefined);
        const result = controller && received.success && (received.status < 200 || received.status >= 300)
          ? { ...received, success: false as const, error: { code: "ORBIT_APP_UNEXPECTED_STATUS", message: "请求暂时无法完成，请稍后重试。" } }
          : received;

        if (!active) {
          return;
        }

        if (result.success) {
          setState(resultToRouteState(result, isEmptyRef.current));
          if (actorId && cachePolicy !== "network-only") {
            void writeSnapshot(baseUrl, actorId, path, result);
          }
          return;
        }

        if (cached) {
          // 网络没拿到，但本地有上次同步的内容：继续显示它，不退回错误屏。
          setState(cached);
          return;
        }

        if (!isRefresh || cachePolicy === "network-only") {
          setState(resultToRouteState(result, isEmptyRef.current));
        }
        // 默认内容页刷新失败仍保留内容；network-only 必须暴露本次读取失败。
      } catch (error: unknown) {
        if (!active) {
          return;
        }

        if (cached) {
          setState(cached);
        } else if (!isRefresh || cachePolicy === "network-only") {
          setState(unexpectedErrorState(error));
        }
      } finally {
        if (active) {
          setRefreshing(false);
        }
      }
    }

    void load();

    return () => {
      active = false;
      controller?.abort();
    };
  }, [actorId, auth.ready, baseUrl, cachePolicy, client, enabled, path, performanceScenario, refreshIndex, scopeKey]);

  return {
    ...state,
    refresh,
    refreshing
  };
}
