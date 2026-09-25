import { useCallback, useEffect, useRef, useState } from "react";
import type { TaskPageContract } from "../api/contract/task-page";
import type { ApiErrorBody, ApiResult } from "../api/types";
import { useOrbitAuthSession } from "../api/AuthSessionProvider";
import { useOrbitApiBaseUrl } from "../api/ApiBaseUrlProvider";
import { useOrbitApiClient } from "./useOrbitApiClient";
import type { ApiResourceState } from "./useApiResource";
import type { RouteState } from "../view-models/route-state";
import {
  TODAY_TASK_PAGE_LIMIT,
  normalizeTaskPageContract,
  parseTodayTaskPageResponse,
  todayTaskNextPagePath,
  todayTaskPagePath,
} from "../view-models/today-task-pages";
import { taskPageSchema } from "../api/schema/task-page";

export interface TodayTaskPagesData {
  today: NonNullable<ReturnType<typeof parseTodayTaskPageResponse>>["envelope"];
  page: TaskPageContract;
  usedCursors: readonly string[];
}

interface Snapshot {
  scope: string;
  attempt: number;
  state: RouteState<TodayTaskPagesData>;
  loadingMore: boolean;
  moreError: string | null;
}

interface CurrentScope {
  scope: string;
  attempt: number;
  enabled: boolean;
}

const contractError: ApiErrorBody = {
  code: "ORBIT_APP_CONTRACT_MISMATCH",
  message: "服务返回的数据版本暂时无法识别，请更新 App 后重试。",
};

function contractFailure<T>(meta: ApiResult<unknown>["meta"], status: number): RouteState<T> {
  return { kind: "failure", error: contractError, meta, status };
}

function failureState<T>(result: Extract<ApiResult<unknown>, { success: false }>): RouteState<T> {
  return {
    kind: result.status === 0 || result.error.code === "ORBIT_APP_NETWORK_ERROR" ? "offline" : "failure",
    error: result.error,
    meta: result.meta,
    status: result.status,
  };
}

function pageMatchesScope(page: TaskPageContract, first: TaskPageContract, actorId: string): boolean {
  const firstWindow = first.dueWindow;
  const nextWindow = page.dueWindow;
  return page.actorId === actorId && page.status === "open" && page.scope === "all" && page.query === "" &&
    Boolean(firstWindow && nextWindow && firstWindow.plannedThrough === nextWindow.plannedThrough && firstWindow.dueBefore === nextWindow.dueBefore);
}

export function useTodayTaskPages(timeZone: string, date: string) {
  const auth = useOrbitAuthSession();
  const server = useOrbitApiBaseUrl();
  const actorId = auth.actorId ?? "";
  const enabled = auth.ready && auth.signedIn && server.ready && Boolean(actorId);
  const scope = JSON.stringify([server.baseUrl, actorId, auth.cookieHeader, auth.signedIn, timeZone, date]);
  const client = useOrbitApiClient({ scopeKey: scope });
  const [attempt, setAttempt] = useState(0);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const generation = useRef(0);
  const requestControllers = useRef(new Set<AbortController>());
  const moreRequest = useRef<symbol | null>(null);
  const current = useRef<CurrentScope>({ scope, attempt, enabled });
  current.current = { scope, attempt, enabled };

  const cancelRequests = useCallback(() => {
    generation.current += 1;
    for (const controller of requestControllers.current) controller.abort();
    requestControllers.current.clear();
    moreRequest.current = null;
  }, []);
  const refresh = useCallback(() => {
    cancelRequests();
    setAttempt(value => value + 1);
  }, [cancelRequests]);

  useEffect(() => () => cancelRequests(), [cancelRequests, scope, attempt]);

  useEffect(() => {
    if (!enabled) return;
    const requestGeneration = generation.current;
    const controller = new AbortController();
    requestControllers.current.add(controller);
    let active = true;
    const valid = () => active && !controller.signal.aborted && generation.current === requestGeneration &&
      current.current.enabled && current.current.scope === scope && current.current.attempt === attempt;
    const setResult = (state: RouteState<TodayTaskPagesData>) => {
      if (valid()) setSnapshot({ scope, attempt, state, loadingMore: false, moreError: null });
    };

    setSnapshot({ scope, attempt, state: { kind: "loading" }, loadingMore: false, moreError: null });
    void (async () => {
      try {
        const result = await client.get<unknown>(todayTaskPagePath(timeZone), { signal: controller.signal });
        if (!valid()) return;
        if (!result.success) {
          setResult(failureState(result));
          return;
        }
        if (result.status < 200 || result.status >= 300) {
          setResult({ kind: "failure", error: { code: "ORBIT_APP_UNEXPECTED_STATUS", message: "请求暂时无法完成，请稍后重试。" }, meta: result.meta, status: result.status });
          return;
        }
        const parsed = parseTodayTaskPageResponse(result.data, actorId, date, timeZone);
        if (!parsed) {
          setResult(contractFailure(result.meta, result.status));
          return;
        }
        const data: TodayTaskPagesData = { today: parsed.envelope, page: parsed.page, usedCursors: [] };
        setResult({ kind: parsed.page.total === 0 ? "empty" : "success", data, meta: result.meta, status: result.status });
      } catch {
        if (valid()) setSnapshot({
          scope,
          attempt,
          state: { kind: "offline", error: { code: "ORBIT_APP_NETWORK_ERROR", message: "暂时无法连接 Orbit 服务，请检查网络后再试。" }, meta: { featureMode: null, privacy: null, runtimeBoundary: null }, status: 0 },
          loadingMore: false,
          moreError: null,
        });
      }
    })();

    return () => {
      active = false;
      controller.abort();
      requestControllers.current.delete(controller);
    };
  }, [actorId, attempt, client, date, enabled, scope, timeZone]);

  const visible = snapshot?.scope === scope && snapshot.attempt === attempt ? snapshot : null;
  const visibleState: RouteState<TodayTaskPagesData> = visible?.state ?? { kind: "loading" };
  const loadMore = useCallback(() => {
    const activeSnapshot = snapshot;
    if (!enabled || !activeSnapshot || activeSnapshot.scope !== scope || activeSnapshot.attempt !== attempt ||
      (activeSnapshot.state.kind !== "success" && activeSnapshot.state.kind !== "empty") ||
      activeSnapshot.loadingMore || moreRequest.current) return;
    const data = activeSnapshot.state.data;
    const first = data.today.taskPage;
    const cursor = data.page.nextCursor;
    if (!data.page.hasMore || !cursor || !first.dueWindow || data.usedCursors.includes(cursor)) return;

    const token = Symbol("today-next-page");
    moreRequest.current = token;
    const requestGeneration = generation.current;
    const controller = new AbortController();
    requestControllers.current.add(controller);
    setSnapshot(previous => previous?.scope === scope && previous.attempt === attempt
      ? { ...previous, loadingMore: true, moreError: null }
      : previous);
    const valid = () => moreRequest.current === token && !controller.signal.aborted && generation.current === requestGeneration &&
      current.current.enabled && current.current.scope === scope && current.current.attempt === attempt;
    void (async () => {
      try {
        const result = await client.get<unknown>(todayTaskNextPagePath(first.dueWindow!, cursor), { signal: controller.signal });
        if (!valid()) return;
        const fail = (message: string) => setSnapshot(previous => previous?.scope === scope && previous.attempt === attempt &&
          current.current.enabled && current.current.scope === scope && current.current.attempt === attempt
          ? { ...previous, loadingMore: false, moreError: message }
          : previous);
        if (!result.success) { fail(result.error.message); return; }
        if (result.status < 200 || result.status >= 300) { fail("请求暂时无法完成，请稍后重试。"); return; }
        const parsed = taskPageSchema.safeParse(result.data);
        if (!parsed.success) {
          fail(contractError.message);
          return;
        }
        const nextPage = normalizeTaskPageContract(parsed.data);
        if (!pageMatchesScope(nextPage, first, actorId)) {
          fail(contractError.message);
          return;
        }
        if (nextPage.items.length > TODAY_TASK_PAGE_LIMIT) {
          fail(contractError.message);
          return;
        }
        if (nextPage.nextCursor !== null && [...data.usedCursors, cursor].includes(nextPage.nextCursor)) {
          fail(contractError.message);
          return;
        }
        const mergedItems = new Map(data.page.items.map(item => [item.id, item] as const));
        for (const item of nextPage.items) mergedItems.set(item.id, item);
        const combined: TaskPageContract = {
          ...nextPage,
          items: [...mergedItems.values()],
        };
        setSnapshot(previous => previous?.scope === scope && previous.attempt === attempt && current.current.enabled &&
          current.current.scope === scope && current.current.attempt === attempt
          ? { ...previous, state: { ...activeSnapshot.state, data: { ...data, page: combined, usedCursors: [...data.usedCursors, cursor] } }, loadingMore: false, moreError: null }
          : previous);
      } catch {
        if (valid()) setSnapshot(previous => previous?.scope === scope && previous.attempt === attempt && current.current.enabled &&
          current.current.scope === scope && current.current.attempt === attempt
          ? { ...previous, loadingMore: false, moreError: "暂时无法连接 Orbit 服务，请检查网络后再试。" }
          : previous);
      } finally {
        if (moreRequest.current === token) moreRequest.current = null;
        requestControllers.current.delete(controller);
      }
    })();
  }, [actorId, attempt, client, enabled, scope, snapshot]);

  const resourceState: ApiResourceState<TodayTaskPagesData> = {
    ...visibleState,
    refresh,
    refreshing: visibleState.kind === "loading" && attempt > 0,
  };
  return {
    state: resourceState,
    data: visibleState.kind === "success" || visibleState.kind === "empty" ? visibleState.data : null,
    loadingMore: visible?.loadingMore ?? false,
    moreError: visible?.moreError ?? null,
    loadMore,
  };
}
