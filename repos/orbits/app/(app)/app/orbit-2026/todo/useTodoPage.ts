"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { TODO_SECTION_SOURCES, todoPageSchema } from "../../../../../shared/api-schema/todo-page";
import type { TodoPageContract, TodoSection, TodoSectionKey, TodoSourceKey } from "../../../../../shared/contract/todo-page";
import { FRESH, answerFresh, lastAnswer, rememberAnswer } from "../../orbit-last-answer";
import { useSharedReadAccount } from "../../orbit-shared-read-account";

type ReadState = "idle" | "loading" | "ready" | "failed" | "not_implemented";
type PagingState = Partial<Record<TodoSourceKey, "loading" | "failed">>;
type ReadResult = { kind: "ok"; page: TodoPageContract } | { kind: "failed" | "not_implemented" | "denied" };
interface Snapshot { scope: string; state: ReadState; page: TodoPageContract | null; paging: PagingState; denied?: boolean }

async function read(url: string, date: string, timeZone: string, signal: AbortSignal): Promise<ReadResult> {
  const response = await fetch(url, { signal, cache: "no-store", headers: { accept: "application/json" } });
  const body = await response.json().catch(() => null) as { success?: boolean; data?: unknown; error?: { code?: string } } | null;
  if (response.status === 401 || response.status === 403) return { kind: "denied" };
  if (body?.success === false && body.error?.code === "NOT_IMPLEMENTED") return { kind: "not_implemented" };
  const parsed = response.ok && body?.success === true ? todoPageSchema.safeParse(body.data) : null;
  return parsed?.success && parsed.data.date === date && parsed.data.timeZone === timeZone
    ? { kind: "ok", page: parsed.data } : { kind: "failed" };
}

function append<T extends { key: string }>(current: TodoSection<T>, incoming: TodoSection<T>, source: TodoSourceKey): TodoSection<T> {
  const items = new Map(current.items.map(item => [item.key, item]));
  for (const item of incoming.items) items.set(item.key, item);
  const next = { ...current.next };
  delete next[source];
  if (incoming.next[source]) next[source] = incoming.next[source];
  return { items: [...items.values()], next };
}

function merge(current: TodoPageContract, incoming: TodoPageContract, section: TodoSectionKey, source: TodoSourceKey): TodoPageContract {
  const result = { ...current, counts: incoming.counts, countsCapped: incoming.countsCapped, sources: incoming.sources, asOf: incoming.asOf };
  if (section === "decisions") result.decisions = append(current.decisions, incoming.decisions, source);
  if (section === "nextMoves") result.nextMoves = append(current.nextMoves, incoming.nextMoves, source);
  if (section === "followups") result.followups = append(current.followups, incoming.followups, source);
  return result;
}

const answerKey = (date: string, timeZone: string) => `todo:page:${date}:${timeZone}`;

/**
 * R20a read boundary, also reusable by R10/R19. Nothing is kept in browser storage; back on the page
 * (same account, same day) the last first page shows at once while it is read again (orbit-last-answer,
 * memory only — as Home's useHomeResource keeps the same page).
 */
export function useTodoPage(timeZone: string, date: string, enabled = true) {
  const { account, ready } = useSharedReadAccount();
  const scope = JSON.stringify([account, ready, timeZone, date, enabled]);
  const activeScope = useRef(scope);
  activeScope.current = scope;
  const seeded = useRef(false);
  const [snapshot, setSnapshot] = useState<Snapshot>(() => {
    const remembered = enabled && ready && account ? lastAnswer<TodoPageContract>(answerKey(date, timeZone)) : undefined;
    seeded.current = remembered !== undefined;
    return remembered ? { scope, state: "ready", page: remembered, paging: {} } : { scope, state: enabled ? "loading" : "idle", page: null, paging: {} };
  });
  const value = useRef(snapshot);
  const generation = useRef(0);
  const requests = useRef(new Map<string, AbortController>());
  const publish = useCallback((next: Snapshot) => { value.current = next; setSnapshot(next); }, []);
  const cancel = useCallback(() => {
    generation.current++;
    for (const controller of requests.current.values()) controller.abort();
    requests.current.clear();
  }, []);
  const url = useCallback(() => `/api/todo/page?${new URLSearchParams({ date, timeZone })}`, [date, timeZone]);

  const refresh = useCallback(async () => {
    if (activeScope.current !== scope) return;
    cancel();
    if (!enabled || !ready) { publish({ scope, state: enabled ? "loading" : "idle", page: null, paging: {} }); return; }
    const epoch = generation.current;
    const controller = new AbortController();
    requests.current.set("first", controller);
    // A page already on screen for this account and day stays while it is read again (after a write, a retry
    // of a load-more, the remembered page on return): the new answer replaces it in place, no skeleton between.
    const shown = value.current.scope === scope && value.current.page && (seeded.current || value.current.state === "ready");
    if (!shown) publish({ scope, state: "loading", page: null, paging: {} });
    const answer = await read(url(), date, timeZone, controller.signal).catch((): ReadResult => ({ kind: "failed" }));
    if (controller.signal.aborted || generation.current !== epoch || activeScope.current !== scope) return;
    requests.current.delete("first");
    seeded.current = false;
    if (answer.kind === "ok") rememberAnswer(answerKey(date, timeZone), answer.page);
    publish({ scope, state: answer.kind === "ok" ? "ready" : answer.kind === "not_implemented" ? "not_implemented" : "failed", page: answer.kind === "ok" ? answer.page : null, paging: {}, denied: answer.kind === "denied" });
  }, [cancel, date, enabled, publish, ready, scope, timeZone, url]);

  // A remembered page younger than FRESH.list (and no write since) is not read again on mount (orbit-last-answer).
  useEffect(() => {
    if (seeded.current && answerFresh(answerKey(date, timeZone), FRESH.list)) { seeded.current = false; return cancel; }
    void refresh();
    return cancel;
  }, [cancel, refresh]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadMore = useCallback(async (section: TodoSectionKey, source: TodoSourceKey) => {
    const current = value.current;
    const cursor = current.scope === scope && current.page?.[section].next[source];
    if (!enabled || !ready || activeScope.current !== scope || !cursor || requests.current.has(source)
      || !(TODO_SECTION_SOURCES[section] as readonly string[]).includes(source)) return;
    const epoch = generation.current;
    const controller = new AbortController();
    requests.current.set(source, controller);
    publish({ ...current, paging: { ...current.paging, [source]: "loading" } });
    const query = new URLSearchParams({ date, timeZone, section, source, cursor, limit: "50" });
    const answer = await read(`/api/todo/page?${query}`, date, timeZone, controller.signal).catch((): ReadResult => ({ kind: "failed" }));
    if (controller.signal.aborted || generation.current !== epoch || activeScope.current !== scope) return;
    requests.current.delete(source);
    const latest = value.current;
    if (answer.kind === "denied" || answer.kind === "not_implemented") {
      cancel();
      publish({ scope, state: answer.kind === "denied" ? "failed" : "not_implemented", page: null, paging: {}, denied: answer.kind === "denied" });
      return;
    }
    if (answer.kind !== "ok" || answer.page.sources[source] !== "ok" || !latest.page) {
      publish({ ...latest, paging: { ...latest.paging, [source]: "failed" } });
      return;
    }
    const paging = { ...latest.paging };
    delete paging[source];
    publish({ ...latest, page: merge(latest.page, answer.page, section, source), paging });
  }, [cancel, date, enabled, publish, ready, scope, timeZone]);

  // Hide the prior account/day synchronously, before its effect cleanup runs.
  return {
    state: snapshot.scope === scope ? snapshot.state : enabled ? "loading" as const : "idle" as const,
    page: snapshot.scope === scope ? snapshot.page : null,
    paging: snapshot.scope === scope ? snapshot.paging : {},
    denied: snapshot.scope === scope && snapshot.denied === true,
    refresh, loadMore,
  };
}
