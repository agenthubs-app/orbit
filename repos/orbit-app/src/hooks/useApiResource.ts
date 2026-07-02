import { useEffect, useMemo, useRef, useState } from "react";
import { createOrbitApiClient } from "../api/client";
import type { RouteState } from "../view-models/route-state";
import { resultToRouteState } from "../view-models/route-state";

export function useApiResource<TData>(
  path: string,
  isEmpty: (data: TData) => boolean
): RouteState<TData> {
  const client = useMemo(() => createOrbitApiClient(), []);
  const isEmptyRef = useRef(isEmpty);
  const [state, setState] = useState<RouteState<TData>>({ kind: "loading" });

  useEffect(() => {
    isEmptyRef.current = isEmpty;
  }, [isEmpty]);

  useEffect(() => {
    let active = true;

    setState({ kind: "loading" });
    void client.get<TData>(path).then((result) => {
      if (active) {
        setState(resultToRouteState(result, isEmptyRef.current));
      }
    });

    return () => {
      active = false;
    };
  }, [client, path]);

  return state;
}
