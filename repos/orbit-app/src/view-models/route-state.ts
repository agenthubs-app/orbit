import type { ApiErrorBody, ApiResult, OrbitApiMeta } from "../api/types";

export type RouteState<TData> =
  | { kind: "loading" }
  | {
      kind: "success";
      data: TData;
      meta: OrbitApiMeta;
      status: number;
    }
  | {
      kind: "empty";
      data: TData;
      meta: OrbitApiMeta;
      status: number;
    }
  | {
      kind: "failure";
      error: ApiErrorBody;
      meta: OrbitApiMeta;
      status: number;
    }
  | {
      kind: "offline";
      error: ApiErrorBody;
      meta: OrbitApiMeta;
      status: number;
    };

export function resultToRouteState<TData>(
  result: ApiResult<TData>,
  isEmpty: (data: TData) => boolean
): RouteState<TData> {
  if (result.success) {
    return {
      kind: isEmpty(result.data) ? "empty" : "success",
      data: result.data,
      meta: result.meta,
      status: result.status
    };
  }

  return {
    kind:
      result.status === 0 || result.error.code === "ORBIT_APP_NETWORK_ERROR"
        ? "offline"
        : "failure",
    error: result.error,
    meta: result.meta,
    status: result.status
  };
}
