/**
 * W0057（D59／D62）：洞察即时生成执行器——名片确认、计划重新分析、目标首次设置之后，在请求之外（`after()`）当场生成。
 *
 * 形状照 `regenerate.ts`（CAS 领租约 → prepare → 预留 → execute），换成：
 *  - 定向领取（G-7）：`claimForActor` 只领**本 actor** 的待更新行，优先本次 contactIds，其余同 actor 待更新行补满 ≤20；
 *    不用全局 `claimDirtyBatch`（那会让确认请求去处理别人的积压）。同一行同一时刻只有一个执行器（CAS）。
 *  - 合批：领取前先等 `coalesceMs`（默认 3 s），逐张连续确认的多张名片合进同一批。
 *  - 池判定（D62）：用户池 `purpose: insight`、`trigger: auto`，不占 10 次总熔断，自有每日 20 次上限；
 *    额度不够或账本不可用时**不报错**：释放租约、保留待更新，交给后台池维护任务（心跳）处理。
 *  - 幂等键 `insight:instant:<actor>:<fingerprint>:a<领取序号>`（fingerprint = 本批联系人 + 版本摘要，领取序号 = 批内各行
 *    `attempts` 的最大值，每次 CAS 领取 +1）：同一次领取重复预留只得 1 笔操作；ready 后同版本再踢 prepare 判定未变、0 次预留；
 *    每次自动重试与每个新一轮待更新都是新操作（不会撞上上一轮已结束的同版本操作）。
 *  - 每次最多 `maxBatches` 批（默认 5 批 = 100 人），余下交心跳；结尾调用一次心跳 bootstrap（失败吞掉只记日志），
 *    让心跳链在新部署上线后的第一次即时生成时转到新部署（SC-05）。
 * 无关系目标：prepare 置 blocked_no_goal，0 次调用、不预留。
 */
import { randomUUID } from "node:crypto";

import { CONTACT_INSIGHT_BATCH_LIMIT } from "./generator";
import { CONTACT_INSIGHT_LEASE_MS, executeInsightGeneration, prepareInsightGeneration, type ContactInsightWorkerDeps } from "./worker";

export const INSTANT_INSIGHT_MAX_BATCHES = 5;
export const INSTANT_INSIGHT_COALESCE_MS = 3_000;
/** G-8：即时路径的供应商上限（后台仍是 60 s）。合批 3 s + 45 s + 写回 ≤2 s + 轮询 ≤5 s ≤ 55 s。 */
export const INSTANT_INSIGHT_TIMEOUT_MS = 45_000;
/** 超过这个时长不再领新批（`after()` 受函数 maxDuration 约束），余下交心跳。 */
export const INSTANT_INSIGHT_BUDGET_MS = 60_000;

export function instantInsightKey(actorId: string, fingerprint: string, claimSeq: number): string {
  return `insight:instant:${actorId}:${fingerprint}:a${claimSeq}`.slice(0, 300);
}

export interface InstantInsightDeps extends ContactInsightWorkerDeps {
  /** 结尾 bootstrap 心跳（失败吞掉）。 */
  bootstrapHeartbeat?: () => Promise<void>;
  sleep?: (ms: number) => Promise<void>;
  /** 真实时钟（预算判断用），测试可注入。 */
  clock?: () => number;
}

export interface InstantInsightSummary {
  batches: number;
  contacts: number;
  callsResponded: number;
  /** 退回后台池的批数（额度用尽／账本不可用／同键操作已在别处）。 */
  fallback: number;
  noGoal: number;
  failed: number;
  limited: boolean;
}

export async function runInstantInsightGeneration(
  deps: InstantInsightDeps,
  input: { actorId: string; contactIds?: readonly string[]; maxBatches?: number; coalesceMs?: number; budgetMs?: number },
): Promise<InstantInsightSummary> {
  const summary: InstantInsightSummary = { batches: 0, callsResponded: 0, contacts: 0, failed: 0, fallback: 0, limited: false, noGoal: 0 };
  const log = deps.log ?? ((line: Record<string, unknown>) => console.info(JSON.stringify(line)));
  const clock = deps.clock ?? Date.now;
  const started = clock();
  try {
    const coalesceMs = input.coalesceMs ?? INSTANT_INSIGHT_COALESCE_MS;
    if (coalesceMs > 0) await (deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))))(coalesceMs);
    const owner = `insight-instant:${randomUUID()}`;
    const maxBatches = input.maxBatches ?? INSTANT_INSIGHT_MAX_BATCHES;
    const budgetMs = input.budgetMs ?? INSTANT_INSIGHT_BUDGET_MS;
    for (let index = 0; index < maxBatches && clock() - started < budgetMs; index += 1) {
      const now = (deps.now ?? (() => new Date()))();
      const batch = await deps.repository.claimForActor({
        actorId: input.actorId, contactIds: input.contactIds ?? [], leaseMs: CONTACT_INSIGHT_LEASE_MS, limit: CONTACT_INSIGHT_BATCH_LIMIT, now, owner,
      });
      if (!batch) break;
      summary.batches += 1;
      const ids = batch.rows.map((row) => row.contactId);
      const release = () => deps.repository.defer({ actorId: input.actorId, contactIds: ids, notBefore: null, now, owner });
      let prepared;
      try {
        prepared = await prepareInsightGeneration(deps, batch);
      } catch (error) {
        await release().catch(() => undefined);
        throw error;
      }
      if (prepared.kind === "no_goal") {
        summary.noGoal += 1;
        continue;
      }
      if (prepared.kind === "nothing") continue;
      const generateIds = [...prepared.completions.keys()];
      const claimSeq = Math.max(0, ...batch.rows.filter((row) => prepared.completions.has(row.contactId)).map((row) => row.attempts));
      const reservation = await deps.gate.reserve({
        actorId: input.actorId,
        idempotencyKey: instantInsightKey(input.actorId, prepared.fingerprint, claimSeq),
        now,
        pool: "user",
        purpose: "insight",
        trigger: "auto",
      });
      if (reservation.ok !== true || !reservation.owner) {
        // 静默退回后台池：释放租约、保留待更新（不顺延），心跳维护任务按后台池处理。
        await deps.repository.defer({ actorId: input.actorId, contactIds: generateIds, notBefore: null, now, owner });
        summary.fallback += 1;
        summary.limited = reservation.ok !== true && (reservation as { reason?: string }).reason === "daily_limit";
        log({ actorId: input.actorId, event: "contact_insight_instant_fallback", reason: reservation.ok === true ? "not_owner" : (reservation as { reason: string }).reason });
        break;
      }
      const result = await executeInsightGeneration(deps, batch, prepared, reservation.operationId);
      summary.callsResponded += result.callsResponded;
      summary.contacts += generateIds.length;
      if (result.status === "failed") summary.failed += 1;
    }
    return summary;
  } finally {
    if (deps.bootstrapHeartbeat) await deps.bootstrapHeartbeat().catch(() => undefined);
  }
}

/**
 * 进程级入口（在 `after()` 里调用）：live 模式且有数据库才执行；生成器用 45 s 上限。结尾 bootstrap 心跳。
 * 任何错误只记日志——行保持待更新，由心跳维护任务兜底。
 */
export async function runConfiguredInstantInsightGeneration(input: { actorId: string; contactIds?: readonly string[] }): Promise<InstantInsightSummary | null> {
  const { getConfiguredContactInsightsRuntime } = await import("./runtime");
  const runtime = getConfiguredContactInsightsRuntime({ generatorTimeoutMs: INSTANT_INSIGHT_TIMEOUT_MS });
  const bootstrapHeartbeat = async () => {
    const { bootstrapMaintenanceHeartbeat } = await import("../../operations/maintenance/configured");
    await bootstrapMaintenanceHeartbeat();
  };
  if (!runtime) {
    await bootstrapHeartbeat().catch(() => undefined);
    return null;
  }
  try {
    const summary = await runInstantInsightGeneration({ ...runtime, bootstrapHeartbeat }, input);
    console.info(JSON.stringify({ actorId: input.actorId, event: "contact_insight_instant", ...summary }));
    return summary;
  } catch (error) {
    console.error(JSON.stringify({ actorId: input.actorId, error: error instanceof Error ? error.name : "unknown", event: "contact_insight_instant_failed" }));
    return null;
  }
}
