import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useOrbitAuthSession } from "../api/AuthSessionProvider";
import { useOrbitApiBaseUrl } from "../api/ApiBaseUrlProvider";
import { createOrbitApiClient } from "../api/client";
import { readSnapshot, writeSnapshot } from "../data/snapshot-store";
import type { RouteState } from "../view-models/route-state";
import { resultToRouteState } from "../view-models/route-state";

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
  isEmpty: (data: TData) => boolean
): ApiResourceState<TData> {
  const { baseUrl } = useOrbitApiBaseUrl();
  const auth = useOrbitAuthSession();
  const client = useMemo(
    () =>
      createOrbitApiClient({
        authCookieHeader: auth.cookieHeader,
        baseUrl
      }),
    [auth.cookieHeader, baseUrl]
  );
  const isEmptyRef = useRef(isEmpty);
  const [refreshIndex, setRefreshIndex] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [state, setState] = useState<RouteState<TData>>({ kind: "loading" });
  const refresh = useCallback(() => {
    setRefreshIndex((value) => value + 1);
  }, []);

  useEffect(() => {
    isEmptyRef.current = isEmpty;
  }, [isEmpty]);

  useEffect(() => {
    let active = true;
    const isRefresh = refreshIndex > 0;

    if (!auth.ready) {
      setState({ kind: "loading" });
      return () => {
        active = false;
      };
    }

    if (isRefresh) {
      setRefreshing(true);
    } else {
      setState({ kind: "loading" });
    }

    // 先出上次同步的内容，再让网络覆盖它。断网时快照就是最终结果——
    // 内容页不显示离线提示，看起来和联网时一样。
    async function load(): Promise<void> {
      let cached: RouteState<TData> | null = null;

      if (!isRefresh) {
        const snapshot = await readSnapshot<TData>(baseUrl, path);

        if (!active) {
          return;
        }

        if (snapshot) {
          cached = resultToRouteState(snapshot.result, isEmptyRef.current);
          setState(cached);
        }
      }

      try {
        const result = await client.get<TData>(path);

        if (!active) {
          return;
        }

        if (result.success) {
          setState(resultToRouteState(result, isEmptyRef.current));
          void writeSnapshot(baseUrl, path, result);
          return;
        }

        if (cached) {
          // 网络没拿到，但本地有上次同步的内容：继续显示它，不退回错误屏。
          setState(cached);
          return;
        }

        if (!isRefresh) {
          setState(resultToRouteState(result, isEmptyRef.current));
        }
        // 下拉刷新失败且没有快照时保留当前内容，不把用户已经在看的东西换成错误屏。
      } catch (error: unknown) {
        if (!active) {
          return;
        }

        if (cached) {
          setState(cached);
        } else if (!isRefresh) {
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
    };
  }, [auth.ready, baseUrl, client, path, refreshIndex]);

  return {
    ...state,
    refresh,
    refreshing
  };
}
