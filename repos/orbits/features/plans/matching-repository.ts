/**
 * 人脉需求匹配的存储层（RW-11，Sprint W0010）：`plan_match_jobs` / `plan_match_candidates`
 * （表见 `matching-migrations.ts`）。所有读写都带 `workspace_id + actor_id`，读不到、也写不到
 * 别人的任务与候选。
 *
 * 任务状态机：pending →（领取，attempt+1，发租约）→ running → completed；
 * 出错释放回 pending，满 `PLAN_MATCH_MAX_ATTEMPTS` 次记 failed；租约过期的 running 可被重新领取。
 * AI 状态（`ai_state`）独立于任务状态：只有 none 能转为 started，started 之后无论任务重试
 * 多少次都不会再发起调用（`markAiStarted` 的 CAS）。
 *
 * `enqueuePlanMatchJob` 在名片批次转为 completed 的**同一事务**里调用（调用方传入事务内的 client）：
 * 同一个批次只产生一条任务；一张名片的批次按 (actor, 东京自然日) 并进同一条。
 * 每个联系人来自哪一批记在 `plan_match_job_contacts`：审阅页只看这一批的联系人，当天的 AI 仍一次覆盖全部。
 * 迁移尚未执行（表不存在）时用 savepoint 吞掉 42P01、返回 schema_missing，绝不让名片确认失败。
 */
import { randomUUID } from "node:crypto";

import { sanitizeIndustryPair } from "../../shared/domain/industries";
import type { NetworkNeedCriteria } from "./contract";
import type { PlanMatchContact, PlanMatchNeed, PlanMatchPair } from "./matching";

interface QueryResultLike {
  rowCount?: number | null;
  rows: Array<Record<string, unknown>>;
}

export interface PlanMatchQueryClient {
  query(text: string, values?: readonly unknown[]): Promise<QueryResultLike>;
}

export const PLAN_MATCH_MAX_ATTEMPTS = 3;
/** running 任务的租约；超过即视为执行者已经消失，可被维护任务重新领取。 */
export const PLAN_MATCH_LEASE_SECONDS = 120;
/** 一个任务最多带多少位联系人（一天内多次单张补录累加时的上限）。 */
export const PLAN_MATCH_MAX_CONTACTS = 200;

export type PlanMatchJobStatus = "pending" | "running" | "completed" | "failed";
export type PlanMatchAiState = "none" | "started" | "succeeded" | "failed" | "skipped";
export type PlanMatchCandidateStatus = "pending" | "accepted" | "dismissed";

export interface PlanMatchJob {
  id: string;
  actorId: string;
  sourceKind: "batch" | "day";
  sourceKey: string;
  batchIds: string[];
  contactIds: string[];
  status: PlanMatchJobStatus;
  attemptCount: number;
  leaseToken: string | null;
  notBefore: string;
  aiState: PlanMatchAiState;
  aiModel: string | null;
  aiUsage: Record<string, unknown> | null;
  ruleHits: number;
  aiHits: number;
  lastError: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface PlanMatchCandidate {
  id: string;
  jobId: string;
  planId: string;
  needItemId: string;
  contactId: string;
  tier: "rule" | "ai";
  strength: "strong" | "candidate";
  reason: string | null;
  status: PlanMatchCandidateStatus;
  createdAt: string;
  decidedAt: string | null;
}

function iso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function isoOrNull(value: unknown): string | null {
  return value === null || value === undefined ? null : iso(value);
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function mapJob(row: Record<string, unknown>): PlanMatchJob {
  return {
    actorId: String(row.actor_id),
    aiHits: Number(row.ai_hits),
    aiModel: (row.ai_model as string | null) ?? null,
    aiState: row.ai_state as PlanMatchAiState,
    aiUsage: (row.ai_usage as Record<string, unknown> | null) ?? null,
    attemptCount: Number(row.attempt_count),
    batchIds: strings(row.batch_ids),
    completedAt: isoOrNull(row.completed_at),
    contactIds: strings(row.contact_ids),
    createdAt: iso(row.created_at),
    id: String(row.id),
    lastError: (row.last_error as string | null) ?? null,
    leaseToken: (row.lease_token as string | null) ?? null,
    notBefore: iso(row.not_before),
    ruleHits: Number(row.rule_hits),
    sourceKey: String(row.source_key),
    sourceKind: row.source_kind as PlanMatchJob["sourceKind"],
    status: row.status as PlanMatchJobStatus,
  };
}

function mapCandidate(row: Record<string, unknown>): PlanMatchCandidate {
  return {
    contactId: String(row.contact_id),
    createdAt: iso(row.created_at),
    decidedAt: isoOrNull(row.decided_at),
    id: String(row.id),
    jobId: String(row.job_id),
    needItemId: String(row.need_item_id),
    planId: String(row.plan_id),
    reason: (row.reason as string | null) ?? null,
    status: row.status as PlanMatchCandidateStatus,
    strength: row.strength as PlanMatchCandidate["strength"],
    tier: row.tier as PlanMatchCandidate["tier"],
  };
}

function isUndefinedTable(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "42P01";
}

/* ------------------------------------------------------------------ */
/* 入队：由名片批次完成事务调用                                         */
/* ------------------------------------------------------------------ */

export interface EnqueuePlanMatchJobInput {
  workspaceId: string;
  actorId: string;
  batchId: string;
  /** 本批确认进人脉的联系人（新建或并入）；为空时不建任务。 */
  contactIds: readonly string[];
  /** 本批只有一张名片 → 按东京自然日聚合（单张补录攒到当天统一跑）。 */
  singleCard: boolean;
  /** 覆盖点，仅测试使用：完成时刻（默认数据库 now()）。 */
  at?: Date;
}

export type EnqueuePlanMatchJobResult =
  | { state: "enqueued"; jobId: string; sourceKind: "batch" | "day"; sourceKey: string }
  | { state: "skipped"; reason: "no_contacts" | "schema_missing" };

export async function enqueuePlanMatchJob(
  client: PlanMatchQueryClient,
  input: EnqueuePlanMatchJobInput,
): Promise<EnqueuePlanMatchJobResult> {
  const contactIds = [...new Set(input.contactIds.filter((id) => typeof id === "string" && id.trim()))].slice(
    0,
    PLAN_MATCH_MAX_CONTACTS,
  );
  if (contactIds.length === 0) return { reason: "no_contacts", state: "skipped" };
  const at = input.at ? input.at.toISOString() : null;
  const kind = input.singleCard ? "day" : "batch";
  // 东京自然日与「当天结束」都在数据库里按同一个时刻计算，避免应用时钟与库时钟不一致。
  const sql =
    kind === "batch"
      ? `insert into plan_match_jobs
           (workspace_id, id, actor_id, source_kind, source_key, batch_ids, contact_ids, not_before)
         values ($1, $2, $3, 'batch', $4, array[$4]::text[], $5::text[], coalesce($6::timestamptz, now()))
         on conflict (workspace_id, actor_id, source_kind, source_key) do nothing
         returning id, source_key`
      : `with clock as (
           select coalesce($6::timestamptz, now()) as at
         ), day as (
           select to_char(at at time zone 'Asia/Tokyo', 'YYYY-MM-DD') as key,
                  (((at at time zone 'Asia/Tokyo')::date + 1)::timestamp at time zone 'Asia/Tokyo') as ends
           from clock
         )
         insert into plan_match_jobs
           (workspace_id, id, actor_id, source_kind, source_key, batch_ids, contact_ids, not_before)
         select $1, $2, $3, 'day', day.key, array[$4]::text[], $5::text[], day.ends from day
         on conflict (workspace_id, actor_id, source_kind, source_key) do update set
           batch_ids = (select array_agg(distinct b order by b) from unnest(plan_match_jobs.batch_ids || excluded.batch_ids) b),
           contact_ids = (select array_agg(distinct c order by c) from unnest(plan_match_jobs.contact_ids || excluded.contact_ids) c),
           -- 当天的任务已经跑过（边界上的补录）：重新排队只跑规则层，ai_state 保持原样，不会再计费。
           status = case when plan_match_jobs.status in ('completed', 'failed') then 'pending' else plan_match_jobs.status end,
           completed_at = case when plan_match_jobs.status in ('completed', 'failed') then null else plan_match_jobs.completed_at end,
           attempt_count = case when plan_match_jobs.status in ('completed', 'failed') then 0 else plan_match_jobs.attempt_count end,
           updated_at = now()
         returning id, source_key`;
  await client.query("savepoint plan_match_enqueue");
  try {
    const result = await client.query(sql, [input.workspaceId, randomUUID(), input.actorId, input.batchId, contactIds, at]);
    let row = result.rows[0];
    if (!row) {
      // 同一批次已经有任务（重放）：返回已有的那一条。
      const existing = await client.query(
        `select id, source_key from plan_match_jobs
         where workspace_id = $1 and actor_id = $2 and source_kind = 'batch' and source_key = $3`,
        [input.workspaceId, input.actorId, input.batchId],
      );
      row = existing.rows[0];
      if (!row) throw new Error("plan match job conflict without an existing row");
    }
    // 来源：这一批带来了哪些联系人（审阅页只看这一批；当天任务的 AI 仍一次覆盖全部）。
    await client.query(
      `insert into plan_match_job_contacts (workspace_id, actor_id, job_id, contact_id, batch_id)
       select $1, $2, $3, contact_id, $4 from unnest($5::text[]) as contact_id
       on conflict do nothing`,
      [input.workspaceId, input.actorId, String(row.id), input.batchId, contactIds],
    );
    await client.query("release savepoint plan_match_enqueue");
    return { jobId: String(row.id), sourceKey: String(row.source_key), sourceKind: kind, state: "enqueued" };
  } catch (error) {
    await client.query("rollback to savepoint plan_match_enqueue");
    await client.query("release savepoint plan_match_enqueue");
    if (isUndefinedTable(error)) return { reason: "schema_missing", state: "skipped" };
    throw error;
  }
}

/* ------------------------------------------------------------------ */
/* worker 与接口使用的仓储                                              */
/* ------------------------------------------------------------------ */

export type ClaimForBatchResult =
  | { state: "claimed"; job: PlanMatchJob }
  | { state: "completed" | "running" | "failed" | "not_due"; job: PlanMatchJob }
  | { state: "missing" };

export interface PlanMatchRepository {
  readonly workspaceId: string;
  /** 维护任务：领取到期的 pending（或租约过期的 running）任务，跨用户，带上限。 */
  claimDueJobs(input: { limit: number }): Promise<PlanMatchJob[]>;
  /** 审阅页：按 (actor, batch) 领取这一批的任务；只有本人的批次能找到。 */
  claimJobForBatch(input: { actorId: string; batchId: string }): Promise<ClaimForBatchResult>;
  /** CAS：ai_state none → started，并已提交。false = 已经发起过（或租约已失效），不得再调用。 */
  markAiStarted(input: { jobId: string; leaseToken: string }): Promise<boolean>;
  finishAi(input: {
    jobId: string;
    leaseToken: string;
    state: "succeeded" | "failed" | "skipped";
    model: string | null;
    usage: Record<string, unknown> | null;
  }): Promise<void>;
  completeJob(input: { jobId: string; leaseToken: string; ruleHits: number; aiHits: number }): Promise<boolean>;
  failJob(input: { jobId: string; leaseToken: string; error: string }): Promise<void>;
  /** 插入候选（同一对已存在则保留原行），返回新插入的条数。 */
  insertCandidates(input: { actorId: string; jobId: string; pairs: readonly PlanMatchPair[] }): Promise<number>;
  readActiveNeeds(actorId: string): Promise<PlanMatchNeed[]>;
  /** 这一批确认进来的联系人（来源表），审阅页的规则预览与候选列表只看它们。 */
  contactIdsForBatch(input: { actorId: string; batchId: string }): Promise<string[]>;
  readContacts(actorId: string, contactIds: readonly string[]): Promise<PlanMatchContact[]>;
  listPendingCandidates(input: { actorId: string; batchId?: string | null; limit?: number }): Promise<PlanMatchCandidate[]>;
  getCandidate(input: { actorId: string; candidateId: string }): Promise<PlanMatchCandidate | null>;
  decideCandidate(input: {
    actorId: string;
    candidateId: string;
    status: "accepted" | "dismissed";
  }): Promise<PlanMatchCandidate | null>;
  /** 手动关联时，把同一对还在待确认的候选一并标为已接受（不再提示）。 */
  acceptPendingPair(input: { actorId: string; needItemId: string; contactId: string }): Promise<void>;
  getJob(input: { actorId: string; jobId: string }): Promise<PlanMatchJob | null>;
  /**
   * W0015 对账：生效计划里还没「已参加」、但本人已有联系人记着「在这场活动认识」的 (actor, 活动)。
   * 联系人与计划条目按同一 actor 连接（与引用校验同一归属谓词），有上限。
   */
  listUnattendedAttributedEvents(input: { limit: number }): Promise<Array<{ actorId: string; eventId: string }>>;
}

const CLAIM_SET = `status = 'running', lease_token = $LEASE, attempt_count = attempt_count + 1,
       lease_expires_at = now() + make_interval(secs => ${PLAN_MATCH_LEASE_SECONDS}), updated_at = now()`;

/** 与 `reference-validator.ts` 相同的联系人归属谓词（本人、未删除、accountId 为空或本人）。 */
const CONTACTS_SQL = `select c.record_id,
       c.payload->>'displayName' as display_name,
       c.payload->>'organization' as organization,
       c.payload->>'role' as role,
       c.payload->>'primaryIndustryId' as primary_industry_id,
       c.payload->>'secondaryIndustryId' as secondary_industry_id,
       c.payload->>'metEventId' as met_event_id
  from orbit_records c
 where c.workspace_id = $1
   and c.collection_name = 'contacts'
   and c.lifecycle_state <> 'deleted'
   and c.record_id = any($3::text[])
   and c.user_id = $2
   and (c.payload->'accountId' is null or c.payload->'accountId' = 'null'::jsonb
        or c.payload->'accountId' = to_jsonb($2::text))`;

function textOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function createPostgresPlanMatchRepository(options: {
  pool: PlanMatchQueryClient;
  workspaceId: string;
}): PlanMatchRepository {
  const { pool, workspaceId } = options;

  return {
    workspaceId,

    async claimDueJobs({ limit }) {
      const lease = randomUUID();
      const result = await pool.query(
        `update plan_match_jobs set ${CLAIM_SET.replace("$LEASE", "$3")}
         where (workspace_id, id) in (
           select workspace_id, id from plan_match_jobs
           where workspace_id = $1 and not_before <= now()
             and attempt_count < ${PLAN_MATCH_MAX_ATTEMPTS}
             and (status = 'pending' or (status = 'running' and lease_expires_at < now()))
           order by not_before, created_at
           limit $2
           for update skip locked
         )
         returning *`,
        [workspaceId, Math.max(1, Math.min(50, limit)), lease],
      );
      return result.rows.map(mapJob);
    },

    async claimJobForBatch({ actorId, batchId }) {
      const lease = randomUUID();
      const claimed = await pool.query(
        `update plan_match_jobs set ${CLAIM_SET.replace("$LEASE", "$4")}
         where workspace_id = $1 and actor_id = $2 and $3 = any(batch_ids)
           and not_before <= now()
           and attempt_count < ${PLAN_MATCH_MAX_ATTEMPTS}
           and (status = 'pending' or (status = 'running' and lease_expires_at < now()))
         returning *`,
        [workspaceId, actorId, batchId, lease],
      );
      if (claimed.rows[0]) return { job: mapJob(claimed.rows[0]), state: "claimed" };
      const existing = await pool.query(
        `select *, (not_before > now()) as not_due from plan_match_jobs
         where workspace_id = $1 and actor_id = $2 and $3 = any(batch_ids)
         order by created_at desc limit 1`,
        [workspaceId, actorId, batchId],
      );
      const row = existing.rows[0];
      if (!row) return { state: "missing" };
      const job = mapJob(row);
      if (job.status === "completed") return { job, state: "completed" };
      if (job.status === "failed" || job.attemptCount >= PLAN_MATCH_MAX_ATTEMPTS) return { job, state: "failed" };
      if (row.not_due === true) return { job, state: "not_due" };
      return { job, state: "running" };
    },

    async markAiStarted({ jobId, leaseToken }) {
      const result = await pool.query(
        `update plan_match_jobs set ai_state = 'started', updated_at = now()
         where workspace_id = $1 and id = $2 and lease_token = $3 and ai_state = 'none'
         returning id`,
        [workspaceId, jobId, leaseToken],
      );
      return result.rows.length === 1;
    },

    async finishAi({ jobId, leaseToken, model, state, usage }) {
      // skipped 只能从 none 进入；succeeded/failed 只能从 started 进入。
      await pool.query(
        `update plan_match_jobs
         set ai_state = $4, ai_model = coalesce($5, ai_model), ai_usage = coalesce($6::jsonb, ai_usage), updated_at = now()
         where workspace_id = $1 and id = $2 and lease_token = $3
           and ai_state = case when $4 = 'skipped' then 'none' else 'started' end`,
        [workspaceId, jobId, leaseToken, state, model, usage ? JSON.stringify(usage) : null],
      );
    },

    async completeJob({ aiHits, jobId, leaseToken, ruleHits }) {
      const result = await pool.query(
        `update plan_match_jobs
         set status = 'completed', lease_token = null, lease_expires_at = null, completed_at = now(),
             rule_hits = rule_hits + $4, ai_hits = ai_hits + $5, last_error = null, updated_at = now()
         where workspace_id = $1 and id = $2 and lease_token = $3
         returning id`,
        [workspaceId, jobId, leaseToken, ruleHits, aiHits],
      );
      return result.rows.length === 1;
    },

    async failJob({ error, jobId, leaseToken }) {
      await pool.query(
        `update plan_match_jobs
         set status = case when attempt_count >= ${PLAN_MATCH_MAX_ATTEMPTS} then 'failed' else 'pending' end,
             lease_token = null, lease_expires_at = null, last_error = left($4, 500), updated_at = now()
         where workspace_id = $1 and id = $2 and lease_token = $3`,
        [workspaceId, jobId, leaseToken, error],
      );
    },

    async insertCandidates({ actorId, jobId, pairs }) {
      let inserted = 0;
      for (const pair of pairs) {
        const result = await pool.query(
          `insert into plan_match_candidates
             (workspace_id, id, actor_id, job_id, plan_id, need_item_id, contact_id, tier, strength, reason)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           on conflict (workspace_id, actor_id, need_item_id, contact_id) do nothing
           returning id`,
          [workspaceId, randomUUID(), actorId, jobId, pair.planId, pair.needId, pair.contactId, pair.tier, pair.strength, pair.reason],
        );
        inserted += result.rows.length;
      }
      return inserted;
    },

    async contactIdsForBatch({ actorId, batchId }) {
      const result = await pool.query(
        `select distinct contact_id from plan_match_job_contacts
         where workspace_id = $1 and actor_id = $2 and batch_id = $3
         order by contact_id`,
        [workspaceId, actorId, batchId],
      );
      return result.rows.map((row) => String(row.contact_id));
    },

    async readActiveNeeds(actorId) {
      const result = await pool.query(
        `select i.id, i.plan_id, i.title, i.criteria, i.linked_contact_ids,
                coalesce((select array_agg(distinct e.linked_event_id) from plan_items e
                          where e.workspace_id = i.workspace_id and e.actor_id = i.actor_id and e.plan_id = i.plan_id
                            and e.kind = 'event' and e.linked_event_id is not null
                            and i.phase is not null and e.phase = i.phase), '{}') as event_ids
         from plan_items i
         join plans p on p.workspace_id = i.workspace_id and p.actor_id = i.actor_id and p.id = i.plan_id
         where i.workspace_id = $1 and i.actor_id = $2 and p.status = 'active' and i.kind = 'network_need'
         order by i.created_at desc, i.sort_key desc`,
        [workspaceId, actorId],
      );
      return result.rows.map((row) => ({
        criteria: (row.criteria as NetworkNeedCriteria | null) ?? null,
        eventIds: strings(row.event_ids),
        id: String(row.id),
        linkedContactIds: strings(row.linked_contact_ids),
        planId: String(row.plan_id),
        title: String(row.title),
      }));
    },

    async readContacts(actorId, contactIds) {
      const ids = [...new Set(contactIds)].slice(0, PLAN_MATCH_MAX_CONTACTS);
      if (ids.length === 0) return [];
      const result = await pool.query(CONTACTS_SQL, [workspaceId, actorId, ids]);
      const byId = new Map(
        result.rows.map((row) => {
          const industry = sanitizeIndustryPair(row.primary_industry_id, row.secondary_industry_id);
          const contact: PlanMatchContact = {
            displayName: textOrNull(row.display_name) ?? "",
            id: String(row.record_id),
            organization: textOrNull(row.organization),
            primaryIndustryId: industry.primaryIndustryId,
            metEventId: textOrNull(row.met_event_id),
            role: textOrNull(row.role),
            secondaryIndustryId: industry.secondaryIndustryId,
          };
          return [contact.id, contact] as const;
        }),
      );
      // 保持任务里的顺序（确认顺序）。
      return ids.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
    },

    async listPendingCandidates({ actorId, batchId = null, limit = 100 }) {
      const result = await pool.query(
        // W0015：联系人在与需求关联的活动（同一阶段的活动条目）上认识的候选排最前——在 LIMIT 之前排序，
        // 较旧的这类候选不会被截掉。子查询只看同一 workspace、同一 actor 的联系人与计划条目。
        `select c.*, exists (
             select 1
             from plan_items n
             join plan_items e on e.workspace_id = n.workspace_id and e.actor_id = n.actor_id and e.plan_id = n.plan_id
               and e.kind = 'event' and n.phase is not null and e.phase = n.phase
             join orbit_records r on r.workspace_id = c.workspace_id and r.collection_name = 'contacts'
               and r.record_id = c.contact_id and r.user_id = c.actor_id and r.lifecycle_state <> 'deleted'
             where n.workspace_id = c.workspace_id and n.actor_id = c.actor_id and n.id = c.need_item_id
               and e.linked_event_id = r.payload->>'metEventId'
           ) as event_linked
         from plan_match_candidates c
         where c.workspace_id = $1 and c.actor_id = $2 and c.status = 'pending'
           and ($3::text is null or exists (
             select 1 from plan_match_job_contacts jc
             where jc.workspace_id = c.workspace_id and jc.actor_id = c.actor_id
               and jc.batch_id = $3 and jc.contact_id = c.contact_id
           ))
         order by event_linked desc, c.created_at desc, case c.strength when 'strong' then 0 else 1 end, c.id
         limit $4`,
        [workspaceId, actorId, batchId, Math.max(1, Math.min(200, limit))],
      );
      return result.rows.map(mapCandidate);
    },

    async getCandidate({ actorId, candidateId }) {
      const result = await pool.query(
        `select * from plan_match_candidates where workspace_id = $1 and actor_id = $2 and id = $3`,
        [workspaceId, actorId, candidateId],
      );
      return result.rows[0] ? mapCandidate(result.rows[0]) : null;
    },

    async decideCandidate({ actorId, candidateId, status }) {
      const result = await pool.query(
        `update plan_match_candidates set status = $4, decided_at = now()
         where workspace_id = $1 and actor_id = $2 and id = $3 and status = 'pending'
         returning *`,
        [workspaceId, actorId, candidateId, status],
      );
      if (result.rows[0]) return mapCandidate(result.rows[0]);
      // 已经处理过（重放）或不存在：返回现状，由调用方判断。
      const current = await pool.query(
        `select * from plan_match_candidates where workspace_id = $1 and actor_id = $2 and id = $3`,
        [workspaceId, actorId, candidateId],
      );
      return current.rows[0] ? mapCandidate(current.rows[0]) : null;
    },

    async acceptPendingPair({ actorId, contactId, needItemId }) {
      await pool.query(
        `update plan_match_candidates set status = 'accepted', decided_at = now()
         where workspace_id = $1 and actor_id = $2 and need_item_id = $3 and contact_id = $4 and status = 'pending'`,
        [workspaceId, actorId, needItemId, contactId],
      );
    },

    async getJob({ actorId, jobId }) {
      const result = await pool.query(
        `select * from plan_match_jobs where workspace_id = $1 and actor_id = $2 and id = $3`,
        [workspaceId, actorId, jobId],
      );
      return result.rows[0] ? mapJob(result.rows[0]) : null;
    },

    async listUnattendedAttributedEvents({ limit }) {
      const result = await pool.query(
        `select distinct i.actor_id, i.linked_event_id
         from plan_items i
         join plans p on p.workspace_id = i.workspace_id and p.actor_id = i.actor_id and p.id = i.plan_id
         where i.workspace_id = $1 and p.status = 'active' and i.kind = 'event' and i.status <> 'attended'
           and exists (
             select 1 from orbit_records c
             where c.workspace_id = i.workspace_id and c.collection_name = 'contacts'
               and c.lifecycle_state <> 'deleted' and c.user_id = i.actor_id
               and (c.payload->'accountId' is null or c.payload->'accountId' = 'null'::jsonb
                    or c.payload->'accountId' = to_jsonb(i.actor_id))
               and c.payload->>'metEventId' = i.linked_event_id
           )
         order by i.actor_id, i.linked_event_id
         limit $2`,
        [workspaceId, Math.max(1, Math.min(500, limit))],
      );
      return result.rows.map((row) => ({ actorId: String(row.actor_id), eventId: String(row.linked_event_id) }));
    },
  };
}
