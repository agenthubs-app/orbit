/**
 * R34 SC-03 / SC-04：一份计划的联网搜索服务。
 *
 * 每条查询独立记账、独立失败（DESIGN §3.2「失败不重试」）：
 *   reserve（purpose `plan_search`、pool `user`、trigger `plan`、幂等键 `${ledgerKeyPrefix}#search-${n}`）
 *   → beginCall（provider = 供应商名，model `search:basic`）→ 供应商 HTTP → endCall（有响应记 0 token，无响应记 null）→ finish。
 * `plan_search` 是只记账用途（不占用户池 10 次、不占计划流程 15 次，`ledger.ts` RECORD_ONLY_SQL）；每份计划 ≤8 条由这里的 `limit` 守。
 *
 * 退化：查询抛错 / 超时 → 该条 `failed + 1`，其余继续 → `partial`；全部失败或账本拒绝 → `unavailable`、`sources: []`。
 * 同一 prefix 重跑：已结清（succeeded / failed）的操作按幂等键回放 `owner: false`，本服务不再发请求、该条计失败；
 * 只有无响应而 released 的查询（超时 / 连接失败）按账本语义重开同一行再搜一次（不新增行）。全部回放 → `unavailable`
 * （不能发一条账本里没有子账的 HTTP；起草方拿到的是「本次未能联网核实」）。本方法永不抛错。查询之间并发执行。
 */
import { PLAN_SEARCH_PER_PLAN_LIMIT } from "../../ai-quota/constants";
import type { AiQuotaGate } from "../../ai-quota/gate";
import { filterSearchResults, type PlanSearchQueryResults } from "./filter";
import { planSearchQueries } from "./queries";
import { TavilySearchError } from "./tavily";
import type { PlanSearch, PlanSearchContext, PlanSearchInput, PlanSearchProvider, PlanSearchResult } from "./types";

export const PLAN_SEARCH_LEDGER_MODEL = "search:basic";

export type PlanSearchLog = (entry: Record<string, unknown>) => void;

export interface PlanSearchServiceDeps {
  provider: PlanSearchProvider;
  ledger: AiQuotaGate;
  /** 每份计划的查询上限；默认 `PLAN_SEARCH_PER_PLAN_LIMIT`（8）。 */
  limit?: number;
  log?: PlanSearchLog;
}

export function planSearchIdempotencyKey(prefix: string, n: number): string {
  return `${prefix}#search-${n}`;
}

const defaultLog: PlanSearchLog = (entry) => console.info(JSON.stringify(entry));

export function createPlanSearchService(deps: PlanSearchServiceDeps): PlanSearch {
  const log = deps.log ?? defaultLog;
  const limit = Math.max(0, Math.min(deps.limit ?? PLAN_SEARCH_PER_PLAN_LIMIT, PLAN_SEARCH_PER_PLAN_LIMIT));

  /** 一条查询：从 reserve 到 finish，任何异常都收敛成 null（失败），绝不向外抛。 */
  async function runQuery(query: string, n: number, context: PlanSearchContext): Promise<PlanSearchQueryResults | null> {
    const idempotencyKey = planSearchIdempotencyKey(context.ledgerKeyPrefix, n);
    let operationId: string | null = null;
    try {
      const reservation = await deps.ledger.reserve({ actorId: context.actorId, idempotencyKey, now: context.now, pool: "user", purpose: "plan_search", trigger: "plan" });
      if (reservation.ok !== true) {
        log({ event: "plan_search_denied", idempotencyKey, reason: reservation.reason });
        return null;
      }
      if (!reservation.owner) {
        log({ event: "plan_search_replayed", idempotencyKey, status: reservation.status });
        return null;
      }
      operationId = reservation.operationId;
      const callId = (await deps.ledger.beginCall(operationId, { model: PLAN_SEARCH_LEDGER_MODEL, provider: deps.provider.name })).callId;
      let results: PlanSearchQueryResults | null = null;
      try {
        const raw = await deps.provider.search(query, {});
        await deps.ledger.endCall(callId, { inputTokens: 0, outputTokens: 0 });
        results = { query, results: raw };
      } catch (error) {
        const responded = error instanceof TavilySearchError ? error.responded : false;
        await deps.ledger.endCall(callId, responded ? { inputTokens: 0, outputTokens: 0 } : null).catch(() => undefined);
        log({ error: error instanceof TavilySearchError ? error.code : "unknown", event: "plan_search_query_failed", idempotencyKey, operationId });
      }
      await deps.ledger.finish(operationId, results ? "succeeded" : "failed");
      return results;
    } catch (error) {
      log({ error: error instanceof Error ? error.message : "unknown", event: "plan_search_ledger_failed", idempotencyKey });
      if (operationId) await deps.ledger.finish(operationId, "failed").catch(() => undefined);
      return null;
    }
  }

  return {
    id: "tavily",
    async search(input: PlanSearchInput, context: PlanSearchContext): Promise<PlanSearchResult> {
      const queries = planSearchQueries(input).slice(0, limit);
      if (queries.length === 0) return { failed: 0, queries: 0, sources: [], status: "unavailable" };
      const outcomes = await Promise.all(queries.map((entry, index) => runQuery(entry.query, index + 1, context)));
      const succeeded = outcomes.filter((outcome): outcome is PlanSearchQueryResults => outcome !== null);
      const failed = queries.length - succeeded.length;
      if (succeeded.length === 0) return { failed, queries: queries.length, sources: [], status: "unavailable" };
      return { failed, queries: queries.length, sources: filterSearchResults(succeeded, { now: context.now }), status: failed > 0 ? "partial" : "ok" };
    },
  };
}
