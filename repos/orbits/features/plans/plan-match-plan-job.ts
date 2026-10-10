/**
 * W0050（W50-2）：现有联系人在生成计划后也进「待确认」。
 *
 * 一份生效计划一条 `source_kind = 'plan'` 的匹配任务（`source_key = 计划 id`，(workspace, actor, kind, key) 唯一，
 * `on conflict do nothing`：同一版本重复保存、并发保存、维护任务重复扫描都只留一行）。任务带本人最近添加的
 * ≤200 位联系人，入队即 `ai_state = 'skipped'`——worker 只跑规则层、永不发起 AI 调用（0 次计费）；规则层结果
 * 每条需求最多 3 个（强匹配优先，再按添加时间新到旧），已有的 pending／dismissed 候选与已关联的不动。
 *
 * 入队时机：
 * 1. 计划版本保存成功后（bootstrap／reanalyze 路由，提交之后、失败只记日志），随后用 `after()` 领取执行；
 * 2. 兜底（D46③）：`plan-match` 维护任务每轮先扫描「生效计划有人脉需求、却还没有 'plan' 任务」的计划，
 *    幂等入队（每轮最多 `PLAN_MATCH_PLAN_BACKFILL_LIMIT` 份），再照常领取到期任务。
 * 机会标签的读取路径不入队（打开页面对任何表 0 写入）。
 */
import { randomUUID } from "node:crypto";

import type { PlanMatchPair } from "./matching";
import type { PlanMatchQueryClient } from "./matching-repository";

/** 'plan' 任务带的联系人上限（与 PLAN_MATCH_MAX_CONTACTS 同值，按添加时间新到旧取）。 */
export const PLAN_MATCH_PLAN_JOB_CONTACT_LIMIT = 200;
/** 'plan' 任务每条需求最多落几个候选（W50-6）。 */
export const PLAN_MATCH_PLAN_CANDIDATES_PER_NEED = 3;
/** 维护任务每轮最多补入队几份计划。 */
export const PLAN_MATCH_PLAN_BACKFILL_LIMIT = 20;

/** 与 matching-repository 相同的联系人归属谓词（本人、未删除、accountId 为空或本人），按添加时间新到旧取前 N 位。 */
const RECENT_CONTACT_IDS_SQL = (actorExpression: string) => `(
  select coalesce(array_agg(recent.record_id order by recent.created_at desc, recent.record_id), '{}'::text[])
  from (
    select c.record_id, c.created_at from orbit_records c
    where c.workspace_id = $1 and c.collection_name = 'contacts' and c.lifecycle_state <> 'deleted'
      and c.user_id = ${actorExpression}
      and (c.payload->'accountId' is null or c.payload->'accountId' = 'null'::jsonb or c.payload->'accountId' = to_jsonb(${actorExpression}::text))
    order by c.created_at desc, c.record_id
    limit ${PLAN_MATCH_PLAN_JOB_CONTACT_LIMIT}
  ) recent
)`;

const HAS_NEEDS_SQL = `exists (
  select 1 from plan_items i
  where i.workspace_id = p.workspace_id and i.actor_id = p.actor_id and i.plan_id = p.id and i.kind = 'network_need' and i.skipped_at is null
)`;

// R24：v1 与 v2 计划都入队（v2 的接受候补走 PlanV2Service，只关联不生成行动）；已跳过的类型不算需求。
export const ENQUEUE_PLAN_JOB_SQL = `/* plan-match:enqueue-plan */
  insert into plan_match_jobs (workspace_id, id, actor_id, source_kind, source_key, contact_ids, ai_state)
  select p.workspace_id, $4, p.actor_id, 'plan', p.id, ${RECENT_CONTACT_IDS_SQL("$2")}, 'skipped'
  from plans p
  where p.workspace_id = $1 and p.actor_id = $2 and p.id = $3 and p.status = 'active' and ${HAS_NEEDS_SQL}
  on conflict (workspace_id, actor_id, source_kind, source_key) do nothing
  returning id`;

export const ENQUEUE_MISSING_PLAN_JOBS_SQL = `/* plan-match:enqueue-missing-plan */
  insert into plan_match_jobs (workspace_id, id, actor_id, source_kind, source_key, contact_ids, ai_state)
  select m.workspace_id, gen_random_uuid()::text, m.actor_id, 'plan', m.id, ${RECENT_CONTACT_IDS_SQL("m.actor_id")}, 'skipped'
  from (
    select p.workspace_id, p.actor_id, p.id from plans p
    where p.workspace_id = $1 and p.status = 'active' and ${HAS_NEEDS_SQL}
      and not exists (
        select 1 from plan_match_jobs j
        where j.workspace_id = p.workspace_id and j.actor_id = p.actor_id and j.source_kind = 'plan' and j.source_key = p.id
      )
    order by p.created_at, p.id
    limit $2
  ) m
  on conflict (workspace_id, actor_id, source_kind, source_key) do nothing
  returning actor_id, id`;

function isUndefinedTable(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "42P01";
}

export type EnqueuePlanSourceJobResult =
  | { state: "enqueued"; jobId: string }
  /** 同一计划已有任务（重复保存、并发、维护任务已补）。 */
  | { state: "exists" }
  /** 不是本人的生效计划，或计划里没有人脉需求。 */
  | { state: "skipped"; reason: "not_active_or_no_needs" | "schema_missing" };

/** 为本人的一份生效计划入队 'plan' 任务（幂等）。 */
export async function enqueuePlanSourceMatchJob(
  client: PlanMatchQueryClient,
  input: { workspaceId: string; actorId: string; planId: string },
): Promise<EnqueuePlanSourceJobResult> {
  try {
    const result = await client.query(ENQUEUE_PLAN_JOB_SQL, [input.workspaceId, input.actorId, input.planId, randomUUID()]);
    if (result.rows[0]) return { jobId: String(result.rows[0].id), state: "enqueued" };
    const existing = await client.query(
      `select id from plan_match_jobs where workspace_id = $1 and actor_id = $2 and source_kind = 'plan' and source_key = $3`,
      [input.workspaceId, input.actorId, input.planId],
    );
    return existing.rows[0] ? { state: "exists" } : { reason: "not_active_or_no_needs", state: "skipped" };
  } catch (error) {
    if (isUndefinedTable(error)) return { reason: "schema_missing", state: "skipped" };
    throw error;
  }
}

/** 维护任务兜底：跨用户补入队还没有 'plan' 任务的生效计划（每轮有上限），返回新入队的份数。 */
export async function enqueueMissingPlanSourceMatchJobs(
  client: PlanMatchQueryClient,
  input: { workspaceId: string; limit?: number },
): Promise<number> {
  const limit = Math.max(0, Math.min(PLAN_MATCH_PLAN_BACKFILL_LIMIT, Math.floor(input.limit ?? PLAN_MATCH_PLAN_BACKFILL_LIMIT)));
  if (limit === 0) return 0;
  const result = await client.query(ENQUEUE_MISSING_PLAN_JOBS_SQL, [input.workspaceId, limit]);
  return result.rows.length;
}

/**
 * 'plan' 任务的规则层结果裁剪：每条需求最多 `perNeed` 个，强匹配优先，再按联系人添加时间新到旧
 * （`contactOrder` = 任务里的 contact_ids，入队时已按添加时间倒序）。
 */
export function capPlanJobPairs(
  pairs: readonly PlanMatchPair[],
  contactOrder: readonly string[],
  perNeed: number = PLAN_MATCH_PLAN_CANDIDATES_PER_NEED,
): PlanMatchPair[] {
  const rank = new Map(contactOrder.map((id, index) => [id, index]));
  const sorted = [...pairs].sort(
    (left, right) =>
      Number(right.strength === "strong") - Number(left.strength === "strong") ||
      (rank.get(left.contactId) ?? Number.MAX_SAFE_INTEGER) - (rank.get(right.contactId) ?? Number.MAX_SAFE_INTEGER),
  );
  const perNeedCount = new Map<string, number>();
  return sorted.filter((pair) => {
    const count = perNeedCount.get(pair.needId) ?? 0;
    if (count >= perNeed) return false;
    perNeedCount.set(pair.needId, count + 1);
    return true;
  });
}
