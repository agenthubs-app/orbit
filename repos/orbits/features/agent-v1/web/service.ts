/**
 * search() and fetch() of one request (设计稿 §3.4 预算与停止条件, §3.9 "预算由代码守"; agent-design AG09-5), written
 * like features/plans/search/service.ts: reserve → HTTP → finish, never throwing.
 *
 * - The call is reserved in the request's web record before the HTTP goes out (先扣后发), under the call key
 *   `agent-web:<requestId>#search-<n>` / `#fetch-<n>`; the record is the budget (2 searches, 2 fetches per request),
 *   shared by every part, a resume and a re-run node.
 * - The same query or URL already called in this request is answered from that call (owner: false) and not sent again.
 * - A failure (timeout, provider error) is final for that call: no retry.
 * The caller (graph/nodes/probe.ts) has passed both gates before calling search(), and rule 5 before fetch().
 */
import { emitTrace } from "../observability/trace";
import { fetchPage, searchWeb, WebToolError, type SearchResultItem } from "./deepseek-tools";
import { budgetLeft, callKeyOf, emptyLedger, EXCERPT_LIMIT, type ReadStatus, type WebCall, type WebEvidenceStore, type WebLedger } from "./evidence";
import type { WebSettingsStore } from "./settings";

/** What the graph needs for the web (absent, or `enabled: false`: not one web request is made). */
export interface AgentWebAccess {
  /** The deployment's switch ORBIT_AGENT_WEB. */
  enabled: boolean;
  /** The DeepSeek key (the same Bearer key as the model). */
  apiKey: string | null;
  fetchImplementation?: typeof fetch;
  store: WebEvidenceStore;
  settings: WebSettingsStore;
  /** 10 s by default (tests shorten it). */
  timeoutMs?: number;
}

export interface CallOutcome {
  call: WebCall;
  /** False when the call was answered from one made before in this request (nothing was sent). */
  owner: boolean;
}

export interface RequestWeb {
  ledger(): WebLedger;
  left(): { search: number; fetch: number };
  search(partId: string, query: string): Promise<CallOutcome | null>;
  fetch(partId: string, url: string): Promise<CallOutcome | null>;
  /** Rule numbers of a blocked query, never its words. */
  block(partId: string, rules: (number | "judgment")[], now: string): Promise<void>;
  pend(partId: string, entry: WebLedger["pending"][number]): Promise<void>;
}

export async function openRequestWeb(access: AgentWebAccess, actorId: string, requestId: string, now: () => string): Promise<RequestWeb> {
  let ledger: WebLedger;
  try {
    ledger = (await access.store.get(actorId, requestId)) ?? emptyLedger(requestId);
  } catch (error) {
    emitTrace({ error: error instanceof Error ? error.message : String(error), type: "error", where: "web.ledger_read" });
    ledger = emptyLedger(requestId);
  }
  const save = async () => {
    try {
      await access.store.put(actorId, ledger);
    } catch (error) {
      emitTrace({ error: error instanceof Error ? error.message : String(error), type: "error", where: "web.ledger_write" });
    }
  };
  const call = async (kind: "search" | "fetch", partId: string, target: string): Promise<CallOutcome | null> => {
    const done = ledger.calls.find((item) => item.kind === kind && (kind === "search" ? item.query === target : item.url === target) && item.status !== "reserved");
    if (done) {
      emitTrace({ key: done.key, kind, owner: false, partId, status: done.status, type: "web.reused" });
      return { call: done, owner: false };
    }
    if (budgetLeft(ledger)[kind] <= 0) return null;
    const n = ledger.calls.filter((item) => item.kind === kind).length + 1;
    const entry: WebCall = { gates: { code: "passed", judgment: kind === "search" ? "passed" : "not_asked" }, key: callKeyOf(requestId, kind, n), kind, partId, provider: "deepseek", reservedAt: now(), status: "reserved", ...(kind === "search" ? { query: target } : { url: target }) };
    ledger.calls.push(entry);
    await save();
    emitTrace({ budget: budgetLeft(ledger), key: entry.key, kind, partId, type: "budget" });
    const options = { apiKey: access.apiKey ?? "", ...(access.fetchImplementation ? { fetchImplementation: access.fetchImplementation } : {}), ...(access.timeoutMs ? { timeoutMs: access.timeoutMs } : {}) };
    let status: ReadStatus;
    try {
      if (kind === "search") {
        const results: SearchResultItem[] = await searchWeb(target, options);
        entry.results = results;
        status = results.length ? "ok" : "empty";
      } else {
        const page = await fetchPage(target, options);
        entry.page = { excerpt: page.content.slice(0, EXCERPT_LIMIT), sourceDate: page.updated, title: page.title };
        status = page.content.trim() ? "ok" : "empty";
      }
    } catch (error) {
      const failure = error instanceof WebToolError ? error : null;
      status = failure?.reason === "timeout" ? "timeout" : "provider_error";
      entry.failure = failure?.reason ?? "network";
      entry.httpStatus = failure?.status ?? null;
    }
    entry.status = status;
    entry.finishedAt = now();
    await save();
    emitTrace({ key: entry.key, kind, partId, status, type: "web.call_finished", ...(kind === "search" ? { query: target, results: entry.results?.length ?? 0 } : { url: target }) });
    return { call: entry, owner: true };
  };
  return {
    async block(partId, rules, at) {
      ledger.blocked.push({ at, partId, rules });
      await save();
    },
    fetch: (partId, url) => call("fetch", partId, url),
    ledger: () => ledger,
    left: () => budgetLeft(ledger),
    async pend(partId, entry) {
      ledger.pending = [...ledger.pending.filter((item) => item.partId !== partId), entry];
      await save();
    },
    search: (partId, query) => call("search", partId, query),
  };
}
