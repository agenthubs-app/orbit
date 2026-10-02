/**
 * W0051（W51-2，R-11）：详情弹窗的单人「重新生成」。
 *
 * 1. 标待更新（reason manual；联系人必须属于本人，否则 not_found）；
 * 2. 以 CAS 领取这一行的租约——领不到 = 已有执行器在跑，直接返回 in_progress，0 次调用（两路并发只有一个执行器）；
 * 3. 读目标与输入：没有关系目标 → no_goal（0 次调用、不预留）；版本与目标都没变 → unchanged；
 * 4. 向**用户主动池**预留 1 次操作（`purpose: insight`、`trigger: manual`、`max_calls = 1`、幂等键
 *    `insight-regen:<contactId>:<sourceDataVersion>`，同版本失败后最多再试 1 次）；后台池用满不影响这里，
 *    用户主动池当日 10 次用满 → limited（接口 429 `USER_DAILY_LIMIT`），释放租约、0 次调用；
 * 5. 预留成功后在响应之外（`after`）由本执行器调用并唯一结算。
 */
import { randomUUID } from "node:crypto";

import { markContactInsightsDirty, type InsightSqlExecutor } from "./repository";
import { CONTACT_INSIGHT_LEASE_MS, executeInsightGeneration, prepareInsightGeneration, type ContactInsightWorkerDeps } from "./worker";

export type InsightRegenerationOutcome =
  | { status: "scheduled" }
  | { status: "in_progress" }
  | { status: "unchanged" }
  | { status: "no_goal" }
  | { status: "not_found" }
  | { status: "limited"; retryOn?: string }
  | { status: "retry_exhausted" }
  | { status: "unavailable" };

export interface InsightRegenerationDeps extends ContactInsightWorkerDeps {
  client: InsightSqlExecutor;
  workspaceId: string;
  /** 在响应之外执行（next/server `after`）；不在请求作用域时抛错 → 本函数改为就地执行。 */
  schedule: (task: () => Promise<void>) => void;
}

export async function requestContactInsightRegeneration(
  deps: InsightRegenerationDeps,
  input: { actorId: string; contactId: string },
): Promise<InsightRegenerationOutcome> {
  const now = (deps.now ?? (() => new Date()))();
  const marked = await markContactInsightsDirty(deps.client, { actorId: input.actorId, contactIds: [input.contactId], now, reason: "manual", workspaceId: deps.workspaceId });
  if (!marked.includes(input.contactId)) return { status: "not_found" };
  const owner = `insight-regen:${randomUUID()}`;
  const claimed = await deps.repository.claimSingle({ actorId: input.actorId, contactId: input.contactId, leaseMs: CONTACT_INSIGHT_LEASE_MS, now, owner });
  if (!claimed) return { status: "in_progress" };
  const batch = { actorId: input.actorId, claimedAt: now.toISOString(), owner, rows: [claimed] };
  const release = () => deps.repository.defer({ actorId: input.actorId, contactIds: [input.contactId], notBefore: null, now, owner });
  let prepared;
  try {
    prepared = await prepareInsightGeneration(deps, batch);
  } catch (error) {
    await release();
    throw error;
  }
  if (prepared.kind === "no_goal") return { status: "no_goal" };
  if (prepared.kind === "nothing") return prepared.missing ? { status: "not_found" } : { status: "unchanged" };
  const version = prepared.completions.get(input.contactId)?.sourceDataVersion ?? prepared.fingerprint;
  const baseKey = `insight-regen:${input.contactId}:${version}`.slice(0, 280);
  let reservation = await deps.gate.reserve({ actorId: input.actorId, idempotencyKey: baseKey, now, pool: "user", purpose: "insight", trigger: "manual" });
  if (reservation.ok === true && !reservation.owner && reservation.status === "failed") {
    // 同一版本上一次失败：最多再试 1 次。
    reservation = await deps.gate.reserve({ actorId: input.actorId, idempotencyKey: `${baseKey}:retry`, now, pool: "user", purpose: "insight", trigger: "manual" });
  }
  if (reservation.ok !== true) {
    const denial = reservation as Extract<typeof reservation, { ok: false }>;
    await release();
    return denial.reason === "daily_limit" ? { retryOn: denial.retryOn, status: "limited" } : { status: "unavailable" };
  }
  if (!reservation.owner) {
    await release();
    return reservation.status === "reserved" ? { status: "in_progress" } : { status: "retry_exhausted" };
  }
  const operationId = reservation.operationId;
  const run = async () => {
    try {
      await executeInsightGeneration(deps, batch, prepared, operationId);
    } catch (error) {
      console.error(JSON.stringify({ actorId: input.actorId, error: error instanceof Error ? error.name : "unknown", event: "contact_insight_regenerate_failed" }));
    }
  };
  try {
    deps.schedule(run);
  } catch {
    await run();
  }
  return { status: "scheduled" };
}
