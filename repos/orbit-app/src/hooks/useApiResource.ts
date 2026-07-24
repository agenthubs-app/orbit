import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useOrbitAuthSession } from "../api/AuthSessionProvider";
import { useOrbitApiBaseUrl } from "../api/ApiBaseUrlProvider";
import { createOrbitApiClient } from "../api/client";
import type { RouteState } from "../view-models/route-state";
import { resultToRouteState } from "../view-models/route-state";

export type ApiResourceState<TData> = RouteState<TData> & {
  refresh: () => void;
  refreshing: boolean;
};

function unexpectedErrorState<TData>(error: unknown): RouteState<TData> {
  return {
    kind: "failure",
    error: {
      code: "ORBIT_APP_UNEXPECTED_ERROR",
      message: error instanceof Error ? error.message : "Unexpected request error"
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

    void client
      .get<TData>(path)
      .then((result) => {
        if (active) {
          setState(resultToRouteState(result, isEmptyRef.current));
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setState(unexpectedErrorState(error));
        }
      })
      .finally(() => {
        if (active) {
          setRefreshing(false);
        }
      });

    return () => {
      active = false;
    };
  }, [auth.ready, client, path, refreshIndex]);

  return {
    ...state,
    refresh,
    refreshing
  };
}
