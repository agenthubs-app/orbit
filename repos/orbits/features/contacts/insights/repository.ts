/**
 * W0051：`contact_insights` 读写（每条语句按 workspace + actor 隔离）。
 *
 * - 标记（`markContactInsightsDirty`／`markContactInsightsGoalDirty`）只写本表，不调用模型；联系人必须属于 actor
 *   （与快照同一归属谓词，在同一条语句里校验，他人的联系人 id 不会被标）。表还没迁移时返回 0（不抛错、不中断调用方事务）。
 * - 领取用 CAS：`ai_state <> 'started'`（或租约已过期）才能置为 started 并写租约；只有领到的执行器才能调用模型。
 * - W0057（G-6）：生成失败（供应商错误、超时、输出无效、缺输出、进程中途退出）按「本轮失败次数」`retry_count` 自动重试：
 *   第 1／2 次失败保留待更新、`deferred_until` 排到 5／10 分钟后，由心跳维护任务重试；第 3 次失败清待更新、停下等用户「重新生成」。
 *   新一轮待更新（标记时上一轮已结束，即 `dirty_at is null`）与生成成功时清零。
 * - 完成／失败／顺延都以租约持有者为前提；生成期间又被标记的行保留待更新：每次标记把 `dirty_seq` 加 1，领取时记下
 *   `claimed_seq`，只有两者仍相等才清除（review P2：不用毫秒时间戳判断先后，同一毫秒的标记也不会被误清）。
 */
import { createHash } from "node:crypto";

import type { ContactInsightEvidence, ContactInsightText } from "../../../shared/contract/contact-insight";
import { confirmedContactPredicate } from "../../network-analysis/repository";

export interface InsightSqlExecutor {
  query<TRow = Record<string, unknown>>(text: string, values?: readonly unknown[]): Promise<{ rows: readonly TRow[] }>;
}

export type ContactInsightDirtyReason = "enrichment" | "memo" | "plan_link" | "goal" | "manual";
export type ContactInsightRowStatus = "pending" | "ready" | "failed" | "blocked_no_goal";

export interface ContactInsightRow {
  contactId: string;
  status: ContactInsightRowStatus;
  goalRelation: ContactInsightText | null;
  nextStep: ContactInsightText | null;
  evidence: ContactInsightEvidence[];
  relevance: number | null;
  sourceDataVersion: string | null;
  goalHash: string | null;
  dirtyAt: string | null;
  dirtyReasons: string[];
  deferredUntil: string | null;
  aiState: "none" | "started" | "done";
  leaseExpiresAt: string | null;
  generatedAt: string | null;
  attempts: number;
  /** W0057：本轮待更新已失败的次数（成功或新一轮待更新清零）。 */
  retryCount: number;
  lastErrorCode: string | null;
  model: string | null;
}

export interface ClaimedInsightBatch {
  actorId: string;
  owner: string;
  claimedAt: string;
  rows: ContactInsightRow[];
}

type Row = Record<string, unknown>;

/** 关系目标哈希：空目标也有固定值（blocked_no_goal 行用它，目标设上后与当前哈希不同）。 */
export function contactInsightGoalHash(goal: string | null | undefined): string {
  return createHash("sha256").update(`contact-insight-goal@1\u0000${(goal ?? "").trim()}`).digest("hex").slice(0, 32);
}

function isUndefinedTable(error: unknown): boolean {
  return (error as { code?: unknown })?.code === "42P01";
}

function iso(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== "string" || !value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function json(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function textPair(value: unknown): ContactInsightText | null {
  const parsed = json(value) as Record<string, unknown> | null;
  if (!parsed || typeof parsed !== "object") return null;
  return typeof parsed.zh === "string" && typeof parsed.en === "string" ? { en: parsed.en, zh: parsed.zh } : null;
}

function evidenceList(value: unknown): ContactInsightEvidence[] {
  const parsed = json(value);
  if (!Array.isArray(parsed)) return [];
  return parsed.flatMap((entry) => {
    const item = entry as Record<string, unknown> | null;
    return item && typeof item.source === "string" && typeof item.id === "string" ? [{ id: item.id, source: item.source as ContactInsightEvidence["source"] }] : [];
  });
}

export function toContactInsightRow(row: Row): ContactInsightRow {
  return {
    aiState: (row.ai_state as ContactInsightRow["aiState"]) ?? "none",
    attempts: Number(row.attempts ?? 0) || 0,
    retryCount: Number(row.retry_count ?? 0) || 0,
    contactId: String(row.contact_id),
    deferredUntil: iso(row.deferred_until),
    dirtyAt: iso(row.dirty_at),
    dirtyReasons: Array.isArray(row.dirty_reasons) ? row.dirty_reasons.map(String) : [],
    evidence: evidenceList(row.evidence),
    generatedAt: iso(row.generated_at),
    goalHash: typeof row.goal_hash === "string" ? row.goal_hash : null,
    goalRelation: textPair(row.goal_relation),
    lastErrorCode: typeof row.last_error_code === "string" ? row.last_error_code : null,
    leaseExpiresAt: iso(row.lease_expires_at),
    model: typeof row.model === "string" ? row.model : null,
    nextStep: textPair(row.next_step),
    relevance: row.relevance === null || row.relevance === undefined ? null : Number(row.relevance),
    sourceDataVersion: typeof row.source_data_version === "string" ? row.source_data_version : null,
    status: row.status as ContactInsightRowStatus,
  };
}

const ROW_COLUMNS = `contact_id, status, goal_relation, next_step, evidence, relevance, source_data_version, goal_hash, dirty_at,
  dirty_reasons, deferred_until, ai_state, lease_expires_at, generated_at, attempts, retry_count, last_error_code, model`;
/** 读取路径（详情、洞察标签）只取视图需要的列（D39 窄读）：不回传版本指纹、模型、待更新原因、尝试次数与错误码。 */
export const CONTACT_INSIGHT_VIEW_COLUMNS = `contact_id, status, goal_relation, next_step, evidence, relevance, goal_hash, dirty_at,
  deferred_until, ai_state, lease_expires_at, generated_at, retry_count`;

/** W0057（G-6，W57-3）：本轮第 3 次生成失败后停下等用户；第 1／2 次失败分别在 5／10 分钟后自动重试。 */
export const CONTACT_INSIGHT_MAX_FAILURES = 3;
export const CONTACT_INSIGHT_RETRY_DELAY_MINUTES: readonly number[] = [5, 10];
/** 可自动重试的失败码（供应商错误、超时、输出无效、缺输出、进程中途退出）；其余（联系人不可用等）直接停下。 */
export const CONTACT_INSIGHT_RETRYABLE_CODES: ReadonlySet<string> = new Set([
  "PROVIDER_TIMEOUT", "PROVIDER_REQUEST_FAILED", "INVALID_OUTPUT", "MISSING_OUTPUT", "INTERRUPTED",
]);
/** 新一轮待更新（上一轮已结束）时清零本轮失败次数。 */
const RESET_RETRY_ON_NEW_ROUND = `retry_count = case when contact_insights.dirty_at is null then 0 else contact_insights.retry_count end`;

/** $1 workspace，$2 actor，$3 联系人 id 数组，$4 reason，$5 now。联系人归属在同一语句里校验。 */
const MARK_DIRTY_SQL = `/* contact-insights:mark-dirty */
  insert into contact_insights (workspace_id, actor_id, contact_id, status, dirty_at, dirty_seq, dirty_reasons, created_at, updated_at)
  select $1, $2, c.record_id, 'pending', $5::timestamptz, 1, array[$4::text], $5::timestamptz, $5::timestamptz
  from orbit_records c
  where ${confirmedContactPredicate("c")} and c.record_id = any($3::text[])
  on conflict (workspace_id, actor_id, contact_id) do update set
    dirty_at = excluded.dirty_at,
    dirty_seq = contact_insights.dirty_seq + 1,
    dirty_reasons = (select coalesce(array_agg(distinct reason order by reason), '{}') from unnest(contact_insights.dirty_reasons || excluded.dirty_reasons) as reason),
    status = case when contact_insights.status = 'ready' or contact_insights.ai_state = 'started' then contact_insights.status else 'pending' end,
    ${RESET_RETRY_ON_NEW_ROUND},
    updated_at = excluded.updated_at
  returning contact_id`;

/**
 * 补全、memo、计划关联、目标、手动：把这些联系人标为待更新（幂等 upsert，只写本表）。
 * 表不存在（未迁移的库）返回 0；在调用方事务里执行时先用 `to_regclass` 判断，避免让事务进入失败状态。
 */
export async function markContactInsightsDirty(
  executor: InsightSqlExecutor,
  input: { workspaceId: string; actorId: string; contactIds: readonly string[]; reason: ContactInsightDirtyReason; now?: Date },
): Promise<string[]> {
  const actorId = input.actorId.trim();
  const ids = [...new Set(input.contactIds.map((id) => id.trim()).filter((id) => id.length > 0 && id.length <= 512))].slice(0, 500);
  if (!actorId || !ids.length) return [];
  const exists = await executor.query<Row>("select to_regclass('contact_insights') is not null as present");
  if (exists.rows[0]?.present !== true) return [];
  const result = await executor.query<Row>(MARK_DIRTY_SQL, [input.workspaceId, actorId, ids, input.reason, (input.now ?? new Date()).toISOString()]);
  return result.rows.map((row) => String(row.contact_id));
}

/**
 * W51-1：手动重新分析成功或每月重新分析保存后，把目标哈希不同的行统一标待更新（reason goal）。改目标本身不调用这里。
 */
export async function markContactInsightsGoalDirty(
  executor: InsightSqlExecutor,
  input: { workspaceId: string; actorId: string; goal: string | null; now?: Date },
): Promise<number> {
  const exists = await executor.query<Row>("select to_regclass('contact_insights') is not null as present");
  if (exists.rows[0]?.present !== true) return 0;
  const result = await executor.query<Row>(
    `/* contact-insights:mark-goal-dirty */
    update contact_insights set
      dirty_at = $4::timestamptz,
      dirty_seq = dirty_seq + 1,
      dirty_reasons = (select coalesce(array_agg(distinct reason order by reason), '{}') from unnest(dirty_reasons || array['goal']) as reason),
      status = case when status = 'ready' or ai_state = 'started' then status else 'pending' end,
      ${RESET_RETRY_ON_NEW_ROUND},
      updated_at = $4::timestamptz
    where workspace_id = $1 and actor_id = $2 and goal_hash is distinct from $3
    returning contact_id`,
    [input.workspaceId, input.actorId, contactInsightGoalHash(input.goal), (input.now ?? new Date()).toISOString()],
  );
  return result.rows.length;
}

/**
 * W0057（D59，G-7）：重新分析保存后，为本人**已确认、还没有洞察行**的联系人补 pending 行（`confirmedContactPredicate`
 * 过滤，他人的联系人不会被插入）。按 `record_id` 游标分页（每页 500），直到补完；`on conflict do nothing` 幂等。
 */
export async function insertMissingContactInsightRows(
  executor: InsightSqlExecutor,
  input: { workspaceId: string; actorId: string; reason: ContactInsightDirtyReason; now?: Date; pageSize?: number; maxPages?: number },
): Promise<string[]> {
  const actorId = input.actorId.trim();
  if (!actorId) return [];
  const exists = await executor.query<Row>("select to_regclass('contact_insights') is not null as present");
  if (exists.rows[0]?.present !== true) return [];
  const pageSize = Math.max(1, Math.min(500, input.pageSize ?? 500));
  const maxPages = input.maxPages ?? 200;
  const now = (input.now ?? new Date()).toISOString();
  const inserted: string[] = [];
  let cursor = "";
  for (let page = 0; page < maxPages; page += 1) {
    const result = await executor.query<Row>(
      `/* contact-insights:insert-missing */
      with page as (
        select c.record_id from orbit_records c
        where ${confirmedContactPredicate("c")} and c.record_id > $5
          and not exists (select 1 from contact_insights i where i.workspace_id = $1 and i.actor_id = $2 and i.contact_id = c.record_id)
        order by c.record_id
        limit $6
      ), added as (
        insert into contact_insights (workspace_id, actor_id, contact_id, status, dirty_at, dirty_seq, dirty_reasons, created_at, updated_at)
        select $1, $2, page.record_id, 'pending', $4::timestamptz, 1, array[$3::text], $4::timestamptz, $4::timestamptz from page
        on conflict (workspace_id, actor_id, contact_id) do nothing
        returning contact_id
      )
      select (select max(record_id) from page) as last_id, (select count(*) from page)::int as scanned,
        coalesce((select array_agg(contact_id) from added), '{}') as added`,
      [input.workspaceId, actorId, input.reason, now, cursor, pageSize],
    );
    const row = result.rows[0];
    const added = Array.isArray(row?.added) ? row!.added.map(String) : [];
    inserted.push(...added);
    if (!row || Number(row.scanned ?? 0) < pageSize || typeof row.last_id !== "string") break;
    cursor = row.last_id;
  }
  return inserted;
}

/**
 * W0057（W57-2）：关系目标从空变为非空保存后，把本人 `blocked_no_goal` 行转为待更新（reason goal）。
 * 已 ready 的行不动（改目标仍只显示「目标已更新」角标，W51-1）。
 */
export async function unblockNoGoalContactInsights(executor: InsightSqlExecutor, input: { workspaceId: string; actorId: string; now?: Date }): Promise<string[]> {
  const exists = await executor.query<Row>("select to_regclass('contact_insights') is not null as present");
  if (exists.rows[0]?.present !== true) return [];
  const result = await executor.query<Row>(
    `/* contact-insights:unblock-no-goal */
    update contact_insights set status = 'pending', dirty_at = $3::timestamptz, dirty_seq = dirty_seq + 1,
      dirty_reasons = (select coalesce(array_agg(distinct reason order by reason), '{}') from unnest(dirty_reasons || array['goal']) as reason),
      retry_count = 0, deferred_until = null, updated_at = $3::timestamptz
    where workspace_id = $1 and actor_id = $2 and status = 'blocked_no_goal' and ai_state <> 'started'
    returning contact_id`,
    [input.workspaceId, input.actorId, (input.now ?? new Date()).toISOString()],
  );
  return result.rows.map((row) => String(row.contact_id));
}

/**
 * W0057（G-2）「缺行对账」：确认后标记两次都失败时没有洞察行，维护任务捞不到。每轮查近 `since` 以来创建／更新、
 * 已确认、还没有洞察行的联系人（走 `orbit_records_updated_at_idx`，每轮 ≤limit 行）：有目标的 actor 插 pending 行
 * 交给同一轮领取；没有目标的 actor 直接插 `blocked_no_goal`（0 次调用，设目标后由 W57-2 解封）。
 */
export async function reconcileMissingContactInsightRows(
  executor: InsightSqlExecutor,
  input: { workspaceId: string; since: Date; now: Date; readGoal: (actorId: string) => Promise<string | null>; limit?: number; maxActors?: number },
): Promise<{ pending: number; blocked: number }> {
  const limit = Math.max(1, input.limit ?? 200);
  const actors = await executor.query<Row>(
    `/* contact-insights:reconcile-actors */
    select distinct c.user_id as actor_id from orbit_records c
    where c.workspace_id = $1 and c.updated_at >= $2::timestamptz and c.collection_name = 'contacts' and c.lifecycle_state <> 'deleted'
      and c.user_id is not null
      and not exists (select 1 from contact_insights i where i.workspace_id = c.workspace_id and i.actor_id = c.user_id and i.contact_id = c.record_id)
    order by c.user_id
    limit $3`,
    [input.workspaceId, input.since.toISOString(), input.maxActors ?? 20],
  );
  const summary = { blocked: 0, pending: 0 };
  let remaining = limit;
  for (const row of actors.rows) {
    if (remaining <= 0) break;
    const actorId = String(row.actor_id);
    const goal = ((await input.readGoal(actorId).catch(() => null)) ?? "").trim();
    const result = await executor.query<Row>(
      `/* contact-insights:reconcile-insert */
      insert into contact_insights (workspace_id, actor_id, contact_id, status, dirty_at, dirty_seq, dirty_reasons, goal_hash, created_at, updated_at)
      select $1, $2, c.record_id, $5::text, case when $5::text = 'pending' then $4::timestamptz else null end, 1,
        case when $5::text = 'pending' then array['enrichment'] else '{}'::text[] end, case when $5::text = 'pending' then null else $7::text end,
        $4::timestamptz, $4::timestamptz
      from orbit_records c
      where ${confirmedContactPredicate("c")} and c.updated_at >= $3::timestamptz
        and not exists (select 1 from contact_insights i where i.workspace_id = $1 and i.actor_id = $2 and i.contact_id = c.record_id)
      order by c.record_id
      limit $6
      on conflict (workspace_id, actor_id, contact_id) do nothing
      returning contact_id`,
      [input.workspaceId, actorId, input.since.toISOString(), input.now.toISOString(), goal ? "pending" : "blocked_no_goal", remaining, contactInsightGoalHash(null)],
    );
    remaining -= result.rows.length;
    if (goal) summary.pending += result.rows.length;
    else summary.blocked += result.rows.length;
  }
  return summary;
}

export interface ContactInsightCompletion {
  contactId: string;
  goalRelation: ContactInsightText;
  nextStep: ContactInsightText;
  evidence: ContactInsightEvidence[];
  relevance: number;
  sourceDataVersion: string;
}

export interface ContactInsightRepository {
  /** 只读：本人这些联系人的洞察行（他人的 id 读不到）。 */
  readRows(actorId: string, contactIds: readonly string[]): Promise<Map<string, ContactInsightRow>>;
  /** 只读（列表用，D39 窄读）：「和你目标的关系」中英各取前 61 字（调用方截到 60 + 省略号）。 */
  readPreviews(actorId: string, contactIds: readonly string[]): Promise<Map<string, ContactInsightText>>;
  /** 只读（待唤醒用，D39 窄读）：状态与下一步。 */
  readNextSteps(actorId: string, contactIds: readonly string[]): Promise<Map<string, { status: ContactInsightRowStatus; nextStep: ContactInsightText | null }>>;
  /** 进程中途退出（租约过期）的 started 行标 failed（W0057：纳入同一重试排期）。 */
  sweepInterrupted(now: Date): Promise<number>;
  /** 领取一个 actor 的 ≤limit 行待更新（到期、未被领取）：CAS 置 started + 写租约。 */
  claimDirtyBatch(input: { owner: string; now: Date; leaseMs: number; limit: number }): Promise<ClaimedInsightBatch | null>;
  /**
   * W0057（G-7）即时生成的定向领取：只领本 actor 的待更新行，优先 `contactIds`，其余同 actor 待更新行补满 ≤limit。
   * 本次 contactIds 的行即使因后台额度被顺延（`retry_count = 0`）也领；自动重试排期中的行按排期。
   */
  claimForActor(input: { actorId: string; contactIds?: readonly string[]; owner: string; now: Date; leaseMs: number; limit: number }): Promise<ClaimedInsightBatch | null>;
  /** W0057：状态接口用——这个联系人是否是本人的已确认联系人（没有洞察行时区分 404）。 */
  ownsContact(actorId: string, contactId: string): Promise<boolean>;
  /** 单人重新生成：CAS 领取这一行的租约；已有执行器在跑返回 null。 */
  claimSingle(input: { actorId: string; contactId: string; owner: string; now: Date; leaseMs: number }): Promise<ContactInsightRow | null>;
  complete(input: { actorId: string; owner: string; claimedAt: string; goalHash: string; results: readonly ContactInsightCompletion[]; usage: Record<string, unknown> | null; model: string; now: Date }): Promise<number>;
  /** 数据没变（版本与目标都相同）：清掉待更新，不改文字。 */
  markUnchanged(input: { actorId: string; owner: string; claimedAt: string; contactIds: readonly string[]; now: Date }): Promise<number>;
  /** 生成失败。`retry`（W0057）：按本轮失败次数排期自动重试（见文件头）；否则清待更新、停下。 */
  fail(input: { actorId: string; owner: string; claimedAt: string; contactIds: readonly string[]; code: string; now: Date; retry?: boolean }): Promise<number>;
  /** 额度用尽：释放租约、顺延到 notBefore（不清待更新）。 */
  defer(input: { actorId: string; owner: string; contactIds: readonly string[]; notBefore: string | null; now: Date }): Promise<number>;
  /** 没有关系目标：置 blocked_no_goal，不调用模型。 */
  blockNoGoal(input: { actorId: string; owner: string; claimedAt: string; contactIds: readonly string[]; now: Date }): Promise<number>;
}

const CLAIM_BATCH_SQL = `/* contact-insights:claim-batch */
  with candidate_actor as (
    select actor_id from contact_insights
    where workspace_id = $1 and dirty_at is not null and (deferred_until is null or deferred_until <= $2::timestamptz)
      and ai_state <> 'started'
    order by dirty_at, actor_id
    limit 1
  ), picked as (
    select i.actor_id, i.contact_id from contact_insights i
    where i.workspace_id = $1 and i.actor_id = (select actor_id from candidate_actor)
      and i.dirty_at is not null and (i.deferred_until is null or i.deferred_until <= $2::timestamptz)
      and i.ai_state <> 'started'
    order by i.dirty_at, i.contact_id
    limit $5
    for update skip locked
  )
  update contact_insights i set
    ai_state = 'started', lease_owner = $3, lease_expires_at = $2::timestamptz + make_interval(secs => $4::double precision / 1000),
    claimed_at = $2::timestamptz, claimed_seq = i.dirty_seq, attempts = i.attempts + 1, updated_at = $2::timestamptz
  from picked
  where i.workspace_id = $1 and i.actor_id = picked.actor_id and i.contact_id = picked.contact_id and i.ai_state <> 'started'
  returning i.actor_id, ${ROW_COLUMNS.split(",").map((column) => `i.${column.trim()}`).join(", ")}`;

/** $1 workspace，$2 actor，$3 now，$4 优先的联系人 id，$5 owner，$6 leaseMs，$7 limit。 */
const CLAIM_FOR_ACTOR_SQL = `/* contact-insights:claim-for-actor */
  with picked as (
    select i.contact_id from contact_insights i
    where i.workspace_id = $1 and i.actor_id = $2 and i.dirty_at is not null and i.ai_state <> 'started'
      and (i.deferred_until is null or i.deferred_until <= $3::timestamptz or (i.contact_id = any($4::text[]) and i.retry_count = 0))
    order by (i.contact_id = any($4::text[])) desc, i.dirty_at, i.contact_id
    limit $7
    for update skip locked
  )
  update contact_insights i set
    ai_state = 'started', lease_owner = $5, lease_expires_at = $3::timestamptz + make_interval(secs => $6::double precision / 1000),
    claimed_at = $3::timestamptz, claimed_seq = i.dirty_seq, attempts = i.attempts + 1, updated_at = $3::timestamptz
  from picked
  where i.workspace_id = $1 and i.actor_id = $2 and i.contact_id = picked.contact_id and i.ai_state <> 'started'
  returning ${ROW_COLUMNS.split(",").map((column) => `i.${column.trim()}`).join(", ")}`;

/** 完成／失败时：领取后又被标记（dirty_seq 已前进）的保留待更新。 */
const CLEAR_DIRTY = `dirty_at = case when dirty_seq is distinct from claimed_seq then dirty_at else null end,
    dirty_reasons = case when dirty_seq is distinct from claimed_seq then dirty_reasons else '{}' end`;
const RELEASE = `ai_state = 'done', lease_owner = null, lease_expires_at = null`;
/**
 * W0057（G-6）可重试失败：领取后又被标记（新数据）→ 新一轮（清零、保留待更新）；否则本轮失败 +1，
 * 未到上限保留待更新并排期（$NOW + 5／10 分钟），到上限清待更新停下。`nowParam` 是 now 的占位符。
 */
function retryFailSet(nowParam: string): string {
  const fresh = "dirty_seq is distinct from claimed_seq";
  const again = `retry_count + 1 < ${CONTACT_INSIGHT_MAX_FAILURES}`;
  const delay = `case when retry_count = 0 then ${CONTACT_INSIGHT_RETRY_DELAY_MINUTES[0]} else ${CONTACT_INSIGHT_RETRY_DELAY_MINUTES[1]} end`;
  return `retry_count = case when ${fresh} then 0 else retry_count + 1 end,
    dirty_at = case when ${fresh} or ${again} then dirty_at else null end,
    dirty_reasons = case when ${fresh} or ${again} then dirty_reasons else '{}' end,
    deferred_until = case when ${fresh} then deferred_until when ${again} then ${nowParam}::timestamptz + make_interval(mins => ${delay}) else deferred_until end`;
}

export function createPostgresContactInsightRepository(input: { client: InsightSqlExecutor; workspaceId: string }): ContactInsightRepository {
  const { client, workspaceId } = input;
  return {
    async readRows(actorId, contactIds) {
      const ids = [...new Set(contactIds.filter((id) => typeof id === "string" && id.length > 0 && id.length <= 512))].slice(0, 200);
      const result = new Map<string, ContactInsightRow>();
      if (!actorId.trim() || !ids.length) return result;
      try {
        const rows = await client.query<Row>(
          `/* contact-insights:read-rows */ select ${CONTACT_INSIGHT_VIEW_COLUMNS} from contact_insights where workspace_id = $1 and actor_id = $2 and contact_id = any($3::text[])`,
          [workspaceId, actorId, ids],
        );
        for (const row of rows.rows) result.set(String(row.contact_id), toContactInsightRow(row));
      } catch (error) {
        if (!isUndefinedTable(error)) throw error;
      }
      return result;
    },
    async readPreviews(actorId, contactIds) {
      const ids = [...new Set(contactIds.filter((id) => typeof id === "string" && id.length > 0 && id.length <= 512))].slice(0, 200);
      const result = new Map<string, ContactInsightText>();
      if (!actorId.trim() || !ids.length) return result;
      try {
        const rows = await client.query<Row>(
          `/* contact-insights:read-previews */ select contact_id, left(goal_relation->>'zh', 61) as zh, left(goal_relation->>'en', 61) as en
           from contact_insights where workspace_id = $1 and actor_id = $2 and contact_id = any($3::text[]) and goal_relation is not null`,
          [workspaceId, actorId, ids],
        );
        for (const row of rows.rows) {
          if (typeof row.zh === "string" && typeof row.en === "string" && row.zh && row.en) result.set(String(row.contact_id), { en: row.en, zh: row.zh });
        }
      } catch (error) {
        if (!isUndefinedTable(error)) throw error;
      }
      return result;
    },
    async readNextSteps(actorId, contactIds) {
      const ids = [...new Set(contactIds.filter((id) => typeof id === "string" && id.length > 0 && id.length <= 512))].slice(0, 50);
      const result = new Map<string, { status: ContactInsightRowStatus; nextStep: ContactInsightText | null }>();
      if (!actorId.trim() || !ids.length) return result;
      try {
        const rows = await client.query<Row>(
          `/* contact-insights:read-next-steps */ select contact_id, status, next_step from contact_insights
           where workspace_id = $1 and actor_id = $2 and contact_id = any($3::text[])`,
          [workspaceId, actorId, ids],
        );
        for (const row of rows.rows) result.set(String(row.contact_id), { nextStep: textPair(row.next_step), status: row.status as ContactInsightRowStatus });
      } catch (error) {
        if (!isUndefinedTable(error)) throw error;
      }
      return result;
    },
    async sweepInterrupted(now) {
      const result = await client.query<Row>(
        `/* contact-insights:sweep-interrupted */
        update contact_insights set status = 'failed', last_error_code = 'INTERRUPTED', ${RELEASE}, ${retryFailSet("$2")}, updated_at = $2::timestamptz
        where workspace_id = $1 and ai_state = 'started' and lease_expires_at < $2::timestamptz
        returning contact_id`,
        [workspaceId, now.toISOString()],
      );
      return result.rows.length;
    },
    async claimDirtyBatch({ owner, now, leaseMs, limit }) {
      const result = await client.query<Row>(CLAIM_BATCH_SQL, [workspaceId, now.toISOString(), owner, leaseMs, limit]);
      if (!result.rows.length) return null;
      return { actorId: String(result.rows[0]!.actor_id), claimedAt: now.toISOString(), owner, rows: result.rows.map(toContactInsightRow) };
    },
    async claimForActor({ actorId, contactIds = [], owner, now, leaseMs, limit }) {
      const ids = [...new Set(contactIds.filter((id) => typeof id === "string" && id.length > 0 && id.length <= 512))].slice(0, 500);
      const result = await client.query<Row>(CLAIM_FOR_ACTOR_SQL, [workspaceId, actorId, now.toISOString(), ids, owner, leaseMs, limit]);
      if (!result.rows.length) return null;
      return { actorId, claimedAt: now.toISOString(), owner, rows: result.rows.map(toContactInsightRow) };
    },
    async ownsContact(actorId, contactId) {
      if (!actorId.trim() || !contactId || contactId.length > 512) return false;
      const result = await client.query<Row>(
        `/* contact-insights:owns-contact */ select 1 as present from orbit_records c where ${confirmedContactPredicate("c")} and c.record_id = $3 limit 1`,
        [workspaceId, actorId, contactId],
      );
      return result.rows.length > 0;
    },
    async claimSingle({ actorId, contactId, owner, now, leaseMs }) {
      const result = await client.query<Row>(
        `/* contact-insights:claim-single */
        update contact_insights set ai_state = 'started', lease_owner = $4,
          lease_expires_at = $5::timestamptz + make_interval(secs => $6::double precision / 1000), claimed_at = $5::timestamptz,
          claimed_seq = dirty_seq, attempts = attempts + 1, updated_at = $5::timestamptz
        where workspace_id = $1 and actor_id = $2 and contact_id = $3 and (ai_state <> 'started' or lease_expires_at < $5::timestamptz)
        returning ${ROW_COLUMNS}`,
        [workspaceId, actorId, contactId, owner, now.toISOString(), leaseMs],
      );
      return result.rows[0] ? toContactInsightRow(result.rows[0]) : null;
    },
    async complete({ actorId, owner, claimedAt, goalHash, results, usage, model, now }) {
      let written = 0;
      for (const entry of results) {
        const updated = await client.query<Row>(
          `/* contact-insights:complete */
          update contact_insights set status = 'ready', goal_relation = $5::jsonb, next_step = $6::jsonb, evidence = $7::jsonb,
            relevance = $8, source_data_version = $9, goal_hash = $10, usage = $11::jsonb, model = $12, generated_at = $13::timestamptz,
            last_error_code = null, deferred_until = null, retry_count = 0, ${RELEASE}, ${CLEAR_DIRTY}, updated_at = $13::timestamptz
          where workspace_id = $1 and actor_id = $2 and contact_id = $3 and lease_owner = $4 and claimed_at = $14::timestamptz
          returning contact_id`,
          [
            workspaceId, actorId, entry.contactId, owner, JSON.stringify(entry.goalRelation), JSON.stringify(entry.nextStep),
            JSON.stringify(entry.evidence), Math.max(0, Math.min(100, Math.round(entry.relevance))), entry.sourceDataVersion, goalHash,
            usage === null ? null : JSON.stringify(usage), model.slice(0, 200), now.toISOString(), claimedAt,
          ],
        );
        written += updated.rows.length;
      }
      return written;
    },
    async markUnchanged({ actorId, owner, claimedAt, contactIds, now }) {
      if (!contactIds.length) return 0;
      const result = await client.query<Row>(
        `/* contact-insights:unchanged */
        update contact_insights set deferred_until = null, retry_count = 0, ${RELEASE}, ${CLEAR_DIRTY}, updated_at = $6::timestamptz
        where workspace_id = $1 and actor_id = $2 and contact_id = any($3::text[]) and lease_owner = $4 and claimed_at = $5::timestamptz
        returning contact_id`,
        [workspaceId, actorId, [...contactIds], owner, claimedAt, now.toISOString()],
      );
      return result.rows.length;
    },
    async fail({ actorId, owner, claimedAt, contactIds, code, now, retry }) {
      if (!contactIds.length) return 0;
      const result = await client.query<Row>(
        `/* contact-insights:fail */
        update contact_insights set status = 'failed', last_error_code = $6, ${RELEASE}, ${retry ? retryFailSet("$7") : CLEAR_DIRTY}, updated_at = $7::timestamptz
        where workspace_id = $1 and actor_id = $2 and contact_id = any($3::text[]) and lease_owner = $4 and claimed_at = $5::timestamptz
        returning contact_id`,
        [workspaceId, actorId, [...contactIds], owner, claimedAt, code.slice(0, 64), now.toISOString()],
      );
      return result.rows.length;
    },
    async defer({ actorId, owner, contactIds, notBefore, now }) {
      if (!contactIds.length) return 0;
      const result = await client.query<Row>(
        `/* contact-insights:defer */
        update contact_insights set deferred_until = $5::timestamptz, ai_state = case when generated_at is null then 'none' else 'done' end,
          lease_owner = null, lease_expires_at = null, updated_at = $6::timestamptz
        where workspace_id = $1 and actor_id = $2 and contact_id = any($3::text[]) and lease_owner = $4
        returning contact_id`,
        [workspaceId, actorId, [...contactIds], owner, notBefore, now.toISOString()],
      );
      return result.rows.length;
    },
    async blockNoGoal({ actorId, owner, claimedAt, contactIds, now }) {
      if (!contactIds.length) return 0;
      const result = await client.query<Row>(
        `/* contact-insights:block-no-goal */
        update contact_insights set status = 'blocked_no_goal', goal_hash = $6, deferred_until = null, last_error_code = null, retry_count = 0,
          ai_state = case when generated_at is null then 'none' else 'done' end, lease_owner = null, lease_expires_at = null,
          ${CLEAR_DIRTY}, updated_at = $7::timestamptz
        where workspace_id = $1 and actor_id = $2 and contact_id = any($3::text[]) and lease_owner = $4 and claimed_at = $5::timestamptz
        returning contact_id`,
        [workspaceId, actorId, [...contactIds], owner, claimedAt, contactInsightGoalHash(null), now.toISOString()],
      );
      return result.rows.length;
    },
  };
}
