/**
 * 计划存储的仓储层（RW-09）。业务规则（状态机、版本继承、进展记录）在 `service.ts`，
 * 这里只提供「按 actor 串行的事务」和行级读写，两种实现语义一致：
 *
 * - Postgres：每个事务 `begin isolation level read committed` 后立即取
 *   `pg_advisory_xact_lock(workspace, actor)`，同一个人的写操作串行；拿锁之后的语句能看到
 *   前一个事务已提交的数据。部分唯一索引 `plans_one_active_per_actor` 是最后一道防线。
 * - 内存（mock）：每个 actor 一条 promise 链串行；事务在副本上执行，成功才替换，失败即回滚。
 *
 * 所有读写都带 `workspace_id + actor_id` 条件：读不到、也写不到别人的计划。
 */
import type {
  Plan,
  PlanContactLink,
  PlanItem,
  PlanLogEntry,
  PlanPhase,
  PlanView,
  PlanViewItem,
  PlanViewLogEntry,
  NetworkNeedCriteria,
} from "./contract";

export interface PlanScope {
  workspaceId: string;
  actorId: string;
}

export interface StoredPlan extends Plan {
  creationKey: string | null;
}

/** 带幂等键请求的命令回执（`plan_commands`）。 */
export interface PlanCommandReceipt {
  idempotencyKey: string;
  kind: "item_change" | "manual_log";
  planId: string;
  itemId: string | null;
  fingerprint: string;
  outcome: "applied" | "noop";
  logId: string | null;
  createdAt: string;
}

export interface PlanReader {
  activePlan(): Promise<Plan | null>;
  plan(planId: string): Promise<Plan | null>;
  planByCreationKey(creationKey: string): Promise<Plan | null>;
  listPlans(): Promise<Plan[]>;
  maxVersion(): Promise<number>;
  items(planId: string): Promise<PlanItem[]>;
  item(itemId: string): Promise<PlanItem | null>;
  log(planId: string, limit: number): Promise<PlanLogEntry[]>;
  /** W0012：本人所有版本在 [fromIso, toIso) 里写下的进展记录（按时间正序，有上限），周一小结用。 */
  logBetween(fromIso: string, toIso: string, limit: number): Promise<PlanLogEntry[]>;
  logByIdempotencyKey(idempotencyKey: string): Promise<PlanLogEntry | null>;
  logById(logId: string): Promise<PlanLogEntry | null>;
  commandReceipt(idempotencyKey: string): Promise<PlanCommandReceipt | null>;
  /** W0021：只判断有没有这条幂等键的记录（不读整行）。 */
  hasLogIdempotencyKey(idempotencyKey: string): Promise<boolean>;
  /** W0021：页面读取用的投影（只选界面用到的列，见 `contract.ts` 的 PlanView*）。 */
  activePlanView(): Promise<PlanView | null>;
  viewItems(planId: string): Promise<PlanViewItem[]>;
  viewLog(planId: string, limit: number): Promise<PlanViewLogEntry[]>;
}

export interface PlanTransaction extends PlanReader {
  archivePlan(planId: string, archivedAt: string): Promise<void>;
  /** W0048b：只改生效计划的 `analysis`（阶段补细后更新该阶段的 detailed／followups／who）。 */
  updatePlanAnalysis(planId: string, analysis: Record<string, unknown>, updatedAt: string): Promise<void>;
  insertPlan(plan: StoredPlan): Promise<void>;
  insertItems(items: readonly PlanItem[]): Promise<void>;
  updateItem(item: PlanItem): Promise<void>;
  insertLog(entry: PlanLogEntry): Promise<void>;
  insertCommandReceipt(receipt: PlanCommandReceipt): Promise<void>;
  /**
   * W0010：在同一个按 actor 串行的事务里锁住并读取本人的一条匹配候选（`plan_match_candidates`，
   * `for update`）。只有 Postgres 仓储实现；mock 模式没有匹配表（匹配接口在 mock 下不可用）。
   */
  matchCandidateForUpdate?(candidateId: string): Promise<PlanMatchCandidateRow | null>;
  /** 只从 pending 转出（CAS）；返回是否成功。 */
  decideMatchCandidate?(candidateId: string, status: "accepted" | "dismissed", decidedAt: string): Promise<boolean>;
}

/** 事务内看到的匹配候选（只取决定所需的字段）。 */
export interface PlanMatchCandidateRow {
  id: string;
  needItemId: string;
  contactId: string;
  status: "pending" | "accepted" | "dismissed";
}

export interface PlanRepository {
  /** 按 actor 串行的读写事务；抛错即回滚。 */
  transact<T>(scope: PlanScope, operation: (tx: PlanTransaction) => Promise<T>): Promise<T>;
  /** 一致快照的只读访问（不取锁）。 */
  read<T>(scope: PlanScope, operation: (reader: PlanReader) => Promise<T>): Promise<T>;
}

/* ------------------------------------------------------------------ */
/* Postgres                                                            */
/* ------------------------------------------------------------------ */

interface QueryResultLike {
  rows: unknown[];
}

export interface PlanQueryClient {
  query(text: string, values?: unknown[]): Promise<QueryResultLike>;
}

export interface PlanPoolLike {
  connect(): Promise<PlanQueryClient & { release(destroy?: boolean): void }>;
}

const PLAN_COLUMNS = `
  id, version, status, goal_snapshot, horizon,
  to_char(starts_on, 'YYYY-MM-DD') as starts_on,
  analysis, phases, source_session_id, previous_plan_id,
  created_at, updated_at, archived_at`;

const ITEM_COLUMNS = `
  id, plan_id, kind, phase, title, detail, suggested_week, status,
  linked_contact_ids, contact_links, linked_event_id, answer, criteria,
  sort_key, deferral_count, completed_at, carried_from_item_id, meta,
  created_at, updated_at`;

const LOG_COLUMNS = `
  id, plan_id, item_id, kind, event, author, body, linked_contact_ids,
  linked_event_id, target_item_id, from_status, to_status, payload,
  idempotency_key, created_at`;

// W0021：页面读取的投影列（与 contract.ts 的 PlanView* 一一对应）。
const PLAN_VIEW_COLUMNS = `
  id, version, status, goal_snapshot, horizon,
  to_char(starts_on, 'YYYY-MM-DD') as starts_on,
  analysis, phases, created_at`;

const ITEM_VIEW_COLUMNS = `
  id, kind, phase, title, detail, suggested_week, status,
  linked_contact_ids, contact_links, linked_event_id, answer, criteria,
  sort_key, deferral_count, completed_at, meta`;

const LOG_VIEW_COLUMNS = `
  id, item_id, kind, event, body, linked_contact_ids,
  linked_event_id, to_status, payload, created_at`;

type Row = Record<string, unknown>;

function iso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return new Date(String(value)).toISOString();
}

function isoOrNull(value: unknown): string | null {
  return value === null || value === undefined ? null : iso(value);
}

function textOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function planFromRow(row: Row): Plan {
  return {
    analysis: jsonObject(row.analysis),
    archivedAt: isoOrNull(row.archived_at),
    createdAt: iso(row.created_at),
    goalSnapshot: String(row.goal_snapshot),
    horizon: row.horizon as Plan["horizon"],
    id: String(row.id),
    phases: Array.isArray(row.phases) ? (row.phases as PlanPhase[]) : [],
    previousPlanId: textOrNull(row.previous_plan_id),
    sourceSessionId: textOrNull(row.source_session_id),
    startsOn: String(row.starts_on),
    status: row.status as Plan["status"],
    updatedAt: iso(row.updated_at),
    version: Number(row.version),
  };
}

function itemFromRow(row: Row): PlanItem {
  return {
    answer: textOrNull(row.answer),
    carriedFromItemId: textOrNull(row.carried_from_item_id),
    completedAt: isoOrNull(row.completed_at),
    contactLinks: Array.isArray(row.contact_links) ? (row.contact_links as PlanContactLink[]) : [],
    createdAt: iso(row.created_at),
    criteria: (row.criteria as NetworkNeedCriteria | null) ?? null,
    deferralCount: Number(row.deferral_count),
    detail: textOrNull(row.detail),
    id: String(row.id),
    kind: row.kind as PlanItem["kind"],
    linkedContactIds: Array.isArray(row.linked_contact_ids) ? (row.linked_contact_ids as string[]) : [],
    linkedEventId: textOrNull(row.linked_event_id),
    meta: jsonObject(row.meta),
    phaseKey: textOrNull(row.phase),
    planId: String(row.plan_id),
    sortKey: Number(row.sort_key),
    status: row.status as PlanItem["status"],
    suggestedWeek: row.suggested_week === null ? null : Number(row.suggested_week),
    title: String(row.title),
    updatedAt: iso(row.updated_at),
  };
}

function logFromRow(row: Row): PlanLogEntry {
  return {
    author: row.author as PlanLogEntry["author"],
    body: String(row.body),
    createdAt: iso(row.created_at),
    event: row.event as PlanLogEntry["event"],
    fromStatus: textOrNull(row.from_status),
    id: String(row.id),
    idempotencyKey: String(row.idempotency_key),
    itemId: textOrNull(row.item_id),
    kind: row.kind as PlanLogEntry["kind"],
    linkedContactIds: Array.isArray(row.linked_contact_ids) ? (row.linked_contact_ids as string[]) : [],
    linkedEventId: textOrNull(row.linked_event_id),
    payload: jsonObject(row.payload),
    planId: String(row.plan_id),
    targetItemId: textOrNull(row.target_item_id),
    toStatus: textOrNull(row.to_status),
  };
}

function planViewFromRow(row: Row): PlanView {
  return {
    analysis: jsonObject(row.analysis),
    createdAt: iso(row.created_at),
    goalSnapshot: String(row.goal_snapshot),
    horizon: row.horizon as Plan["horizon"],
    id: String(row.id),
    phases: Array.isArray(row.phases) ? (row.phases as PlanPhase[]) : [],
    startsOn: String(row.starts_on),
    status: row.status as Plan["status"],
    version: Number(row.version),
  };
}

function itemViewFromRow(row: Row): PlanViewItem {
  return {
    answer: textOrNull(row.answer),
    completedAt: isoOrNull(row.completed_at),
    contactLinks: Array.isArray(row.contact_links) ? (row.contact_links as PlanContactLink[]) : [],
    criteria: (row.criteria as NetworkNeedCriteria | null) ?? null,
    deferralCount: Number(row.deferral_count),
    detail: textOrNull(row.detail),
    id: String(row.id),
    kind: row.kind as PlanItem["kind"],
    linkedContactIds: Array.isArray(row.linked_contact_ids) ? (row.linked_contact_ids as string[]) : [],
    linkedEventId: textOrNull(row.linked_event_id),
    meta: jsonObject(row.meta),
    phaseKey: textOrNull(row.phase),
    sortKey: Number(row.sort_key),
    status: row.status as PlanItem["status"],
    suggestedWeek: row.suggested_week === null ? null : Number(row.suggested_week),
    title: String(row.title),
  };
}

function logViewFromRow(row: Row): PlanViewLogEntry {
  return {
    body: String(row.body),
    createdAt: iso(row.created_at),
    event: row.event as PlanLogEntry["event"],
    id: String(row.id),
    itemId: textOrNull(row.item_id),
    kind: row.kind as PlanLogEntry["kind"],
    linkedContactIds: Array.isArray(row.linked_contact_ids) ? (row.linked_contact_ids as string[]) : [],
    linkedEventId: textOrNull(row.linked_event_id),
    payload: jsonObject(row.payload),
    toStatus: textOrNull(row.to_status),
  };
}

/** 完整行 → 投影（内存实现与测试用；字段与 *_VIEW_COLUMNS 的映射一致）。 */
export function toPlanView(plan: Plan): PlanView {
  return {
    analysis: plan.analysis,
    createdAt: plan.createdAt,
    goalSnapshot: plan.goalSnapshot,
    horizon: plan.horizon,
    id: plan.id,
    phases: plan.phases,
    startsOn: plan.startsOn,
    status: plan.status,
    version: plan.version,
  };
}

export function toPlanViewItem(item: PlanItem): PlanViewItem {
  return {
    answer: item.answer,
    completedAt: item.completedAt,
    contactLinks: item.contactLinks,
    criteria: item.criteria,
    deferralCount: item.deferralCount,
    detail: item.detail,
    id: item.id,
    kind: item.kind,
    linkedContactIds: item.linkedContactIds,
    linkedEventId: item.linkedEventId,
    meta: item.meta,
    phaseKey: item.phaseKey,
    sortKey: item.sortKey,
    status: item.status,
    suggestedWeek: item.suggestedWeek,
    title: item.title,
  };
}

export function toPlanViewLogEntry(entry: PlanLogEntry): PlanViewLogEntry {
  return {
    body: entry.body,
    createdAt: entry.createdAt,
    event: entry.event,
    id: entry.id,
    itemId: entry.itemId,
    kind: entry.kind,
    linkedContactIds: entry.linkedContactIds,
    linkedEventId: entry.linkedEventId,
    payload: entry.payload,
    toStatus: entry.toStatus,
  };
}

function postgresReader(client: PlanQueryClient, scope: PlanScope): PlanReader {
  const ws = scope.workspaceId;
  const actor = scope.actorId;
  async function rows(text: string, values: unknown[]): Promise<Row[]> {
    return (await client.query(text, values)).rows as Row[];
  }
  return {
    async activePlan() {
      const [row] = await rows(
        `select ${PLAN_COLUMNS} from plans where workspace_id = $1 and actor_id = $2 and status = 'active'`,
        [ws, actor],
      );
      return row ? planFromRow(row) : null;
    },
    async activePlanView() {
      const [row] = await rows(
        `select ${PLAN_VIEW_COLUMNS} from plans where workspace_id = $1 and actor_id = $2 and status = 'active'`,
        [ws, actor],
      );
      return row ? planViewFromRow(row) : null;
    },
    async viewItems(planId) {
      return (await rows(
        `select ${ITEM_VIEW_COLUMNS} from plan_items
         where workspace_id = $1 and actor_id = $2 and plan_id = $3
         order by sort_key, id`,
        [ws, actor, planId],
      )).map(itemViewFromRow);
    },
    async viewLog(planId, limit) {
      return (await rows(
        `select ${LOG_VIEW_COLUMNS} from plan_log
         where workspace_id = $1 and actor_id = $2 and plan_id = $3
         order by seq desc limit $4`,
        [ws, actor, planId, limit],
      )).map(logViewFromRow);
    },
    async hasLogIdempotencyKey(idempotencyKey) {
      const found = await rows(
        `select 1 as found from plan_log
         where workspace_id = $1 and actor_id = $2 and idempotency_key = $3 limit 1`,
        [ws, actor, idempotencyKey],
      );
      return found.length > 0;
    },
    async item(itemId) {
      const [row] = await rows(
        `select ${ITEM_COLUMNS} from plan_items where workspace_id = $1 and actor_id = $2 and id = $3`,
        [ws, actor, itemId],
      );
      return row ? itemFromRow(row) : null;
    },
    async items(planId) {
      return (await rows(
        `select ${ITEM_COLUMNS} from plan_items
         where workspace_id = $1 and actor_id = $2 and plan_id = $3
         order by sort_key, id`,
        [ws, actor, planId],
      )).map(itemFromRow);
    },
    async listPlans() {
      return (await rows(
        `select ${PLAN_COLUMNS} from plans where workspace_id = $1 and actor_id = $2 order by version desc`,
        [ws, actor],
      )).map(planFromRow);
    },
    async log(planId, limit) {
      return (await rows(
        `select ${LOG_COLUMNS} from plan_log
         where workspace_id = $1 and actor_id = $2 and plan_id = $3
         order by seq desc limit $4`,
        [ws, actor, planId, limit],
      )).map(logFromRow);
    },
    async logBetween(fromIso, toIso, limit) {
      return (await rows(
        `select ${LOG_COLUMNS} from plan_log
         where workspace_id = $1 and actor_id = $2 and created_at >= $3 and created_at < $4
         order by created_at, seq limit $5`,
        [ws, actor, fromIso, toIso, limit],
      )).map(logFromRow);
    },
    async logByIdempotencyKey(idempotencyKey) {
      const [row] = await rows(
        `select ${LOG_COLUMNS} from plan_log
         where workspace_id = $1 and actor_id = $2 and idempotency_key = $3`,
        [ws, actor, idempotencyKey],
      );
      return row ? logFromRow(row) : null;
    },
    async logById(logId) {
      const [row] = await rows(
        `select ${LOG_COLUMNS} from plan_log where workspace_id = $1 and actor_id = $2 and id = $3`,
        [ws, actor, logId],
      );
      return row ? logFromRow(row) : null;
    },
    async commandReceipt(idempotencyKey) {
      const [row] = await rows(
        `select idempotency_key, kind, plan_id, item_id, fingerprint, outcome, log_id, created_at
         from plan_commands where workspace_id = $1 and actor_id = $2 and idempotency_key = $3`,
        [ws, actor, idempotencyKey],
      );
      return row
        ? {
          createdAt: iso(row.created_at),
          fingerprint: String(row.fingerprint),
          idempotencyKey: String(row.idempotency_key),
          itemId: textOrNull(row.item_id),
          kind: row.kind as PlanCommandReceipt["kind"],
          logId: textOrNull(row.log_id),
          outcome: row.outcome as PlanCommandReceipt["outcome"],
          planId: String(row.plan_id),
        }
        : null;
    },
    async maxVersion() {
      const [row] = await rows(
        `select coalesce(max(version), 0)::int as version from plans where workspace_id = $1 and actor_id = $2`,
        [ws, actor],
      );
      return Number(row?.version ?? 0);
    },
    async plan(planId) {
      const [row] = await rows(
        `select ${PLAN_COLUMNS} from plans where workspace_id = $1 and actor_id = $2 and id = $3`,
        [ws, actor, planId],
      );
      return row ? planFromRow(row) : null;
    },
    async planByCreationKey(creationKey) {
      const [row] = await rows(
        `select ${PLAN_COLUMNS} from plans where workspace_id = $1 and actor_id = $2 and creation_key = $3`,
        [ws, actor, creationKey],
      );
      return row ? planFromRow(row) : null;
    },
  };
}

function postgresTransaction(client: PlanQueryClient, scope: PlanScope): PlanTransaction {
  const ws = scope.workspaceId;
  const actor = scope.actorId;
  const reader = postgresReader(client, scope);

  async function writeItem(item: PlanItem, insert: boolean): Promise<void> {
    const fields = [
      item.phaseKey, item.title, item.detail, item.suggestedWeek, item.status,
      item.linkedContactIds, JSON.stringify(item.contactLinks), item.linkedEventId, item.answer,
      item.criteria === null ? null : JSON.stringify(item.criteria), item.sortKey,
      item.deferralCount, item.completedAt, item.carriedFromItemId, JSON.stringify(item.meta),
      item.updatedAt,
    ];
    if (insert) {
      await client.query(
        `insert into plan_items (
           workspace_id, id, actor_id, plan_id, kind,
           phase, title, detail, suggested_week, status, linked_contact_ids, contact_links,
           linked_event_id, answer, criteria, sort_key, deferral_count, completed_at,
           carried_from_item_id, meta, updated_at, created_at
         ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14,$15::jsonb,$16,$17,$18,$19,$20::jsonb,$21,$22)`,
        [ws, item.id, actor, item.planId, item.kind, ...fields, item.createdAt],
      );
      return;
    }
    const result = await client.query(
      `update plan_items set
         phase = $6, title = $7, detail = $8, suggested_week = $9, status = $10,
         linked_contact_ids = $11, contact_links = $12::jsonb, linked_event_id = $13,
         answer = $14, criteria = $15::jsonb, sort_key = $16, deferral_count = $17,
         completed_at = $18, carried_from_item_id = $19, meta = $20::jsonb, updated_at = $21
       where workspace_id = $1 and id = $2 and actor_id = $3 and plan_id = $4 and kind = $5
       returning id`,
      [ws, item.id, actor, item.planId, item.kind, ...fields],
    );
    if (result.rows.length !== 1) throw new Error("Plan item update matched no row.");
  }

  return {
    ...reader,
    async matchCandidateForUpdate(candidateId) {
      const result = await client.query(
        `select id, need_item_id, contact_id, status from plan_match_candidates
         where workspace_id = $1 and actor_id = $2 and id = $3
         for update`,
        [ws, actor, candidateId],
      );
      const row = result.rows[0] as Row | undefined;
      return row
        ? {
            contactId: String(row.contact_id),
            id: String(row.id),
            needItemId: String(row.need_item_id),
            status: row.status as PlanMatchCandidateRow["status"],
          }
        : null;
    },
    async decideMatchCandidate(candidateId, status, decidedAt) {
      const result = await client.query(
        `update plan_match_candidates set status = $4, decided_at = $5
         where workspace_id = $1 and actor_id = $2 and id = $3 and status = 'pending'
         returning id`,
        [ws, actor, candidateId, status, decidedAt],
      );
      return result.rows.length === 1;
    },
    async updatePlanAnalysis(planId, analysis, updatedAt) {
      await client.query(
        `update plans set analysis = $4::jsonb, updated_at = $5
         where workspace_id = $1 and actor_id = $2 and id = $3 and status = 'active'`,
        [ws, actor, planId, JSON.stringify(analysis), updatedAt],
      );
    },
    async archivePlan(planId, archivedAt) {
      await client.query(
        `update plans set status = 'archived', archived_at = $4, updated_at = $4
         where workspace_id = $1 and actor_id = $2 and id = $3 and status = 'active'`,
        [ws, actor, planId, archivedAt],
      );
    },
    async insertItems(items) {
      for (const item of items) await writeItem(item, true);
    },
    async insertLog(entry) {
      await client.query(
        `insert into plan_log (
           workspace_id, id, actor_id, plan_id, item_id, kind, event, author, body,
           linked_contact_ids, linked_event_id, target_item_id, from_status, to_status,
           payload, idempotency_key, created_at
         ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,$16,$17)`,
        [
          ws, entry.id, actor, entry.planId, entry.itemId, entry.kind, entry.event, entry.author,
          entry.body, entry.linkedContactIds, entry.linkedEventId, entry.targetItemId,
          entry.fromStatus, entry.toStatus, JSON.stringify(entry.payload), entry.idempotencyKey,
          entry.createdAt,
        ],
      );
    },
    async insertCommandReceipt(receipt) {
      await client.query(
        `insert into plan_commands (
           workspace_id, actor_id, idempotency_key, kind, plan_id, item_id,
           fingerprint, outcome, log_id, created_at
         ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          ws, actor, receipt.idempotencyKey, receipt.kind, receipt.planId, receipt.itemId,
          receipt.fingerprint, receipt.outcome, receipt.logId, receipt.createdAt,
        ],
      );
    },
    async insertPlan(plan) {
      await client.query(
        `insert into plans (
           workspace_id, id, actor_id, version, status, goal_snapshot, horizon, starts_on,
           analysis, phases, source_session_id, previous_plan_id, creation_key,
           created_at, updated_at, archived_at
         ) values ($1,$2,$3,$4,$5,$6,$7,$8::date,$9::jsonb,$10::jsonb,$11,$12,$13,$14,$15,$16)`,
        [
          ws, plan.id, actor, plan.version, plan.status, plan.goalSnapshot, plan.horizon,
          plan.startsOn, JSON.stringify(plan.analysis), JSON.stringify(plan.phases),
          plan.sourceSessionId, plan.previousPlanId, plan.creationKey, plan.createdAt,
          plan.updatedAt, plan.archivedAt,
        ],
      );
    },
    async updateItem(item) {
      await writeItem(item, false);
    },
  };
}

function actorLockKey(scope: PlanScope): string {
  return `orbit:plans:${scope.workspaceId}:${scope.actorId}`;
}

export function createPostgresPlanRepository(options: { pool: PlanPoolLike }): PlanRepository {
  const { pool } = options;
  return {
    async read<T>(scope: PlanScope, operation: (reader: PlanReader) => Promise<T>): Promise<T> {
      const client = await pool.connect();
      try {
        await client.query("begin isolation level repeatable read read only");
        const result = await operation(postgresReader(client, scope));
        await client.query("commit");
        return result;
      } catch (error) {
        await client.query("rollback").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    },
    async transact<T>(scope: PlanScope, operation: (tx: PlanTransaction) => Promise<T>): Promise<T> {
      const client = await pool.connect();
      let destroy = false;
      try {
        await client.query("begin isolation level read committed");
        await client.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [
          actorLockKey(scope),
        ]);
        const result = await operation(postgresTransaction(client, scope));
        await client.query("commit");
        return result;
      } catch (error) {
        await client.query("rollback").catch(() => {
          destroy = true;
        });
        throw error;
      } finally {
        client.release(destroy);
      }
    },
  };
}

/* ------------------------------------------------------------------ */
/* Memory (mock)                                                       */
/* ------------------------------------------------------------------ */

interface MemoryScopeState {
  plans: StoredPlan[];
  items: PlanItem[];
  log: PlanLogEntry[];
  commands: PlanCommandReceipt[];
}

export interface MemoryPlanRepository extends PlanRepository {
  /** 测试用：某个人的全部行（副本）。 */
  dump(scope: PlanScope): MemoryScopeState;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function memoryReader(state: MemoryScopeState): PlanReader {
  return {
    async activePlan() {
      const found = state.plans.find((plan) => plan.status === "active");
      return found ? publicPlan(found) : null;
    },
    async activePlanView() {
      const found = state.plans.find((plan) => plan.status === "active");
      return found ? toPlanView(publicPlan(found)) : null;
    },
    async viewItems(planId) {
      return state.items
        .filter((item) => item.planId === planId)
        .sort((a, b) => a.sortKey - b.sortKey || a.id.localeCompare(b.id))
        .map((item) => toPlanViewItem(clone(item)));
    },
    async viewLog(planId, limit) {
      return state.log
        .filter((entry) => entry.planId === planId)
        .reverse()
        .slice(0, limit)
        .map((entry) => toPlanViewLogEntry(clone(entry)));
    },
    async hasLogIdempotencyKey(idempotencyKey) {
      return state.log.some((entry) => entry.idempotencyKey === idempotencyKey);
    },
    async item(itemId) {
      const found = state.items.find((item) => item.id === itemId);
      return found ? clone(found) : null;
    },
    async items(planId) {
      return state.items
        .filter((item) => item.planId === planId)
        .sort((a, b) => a.sortKey - b.sortKey || a.id.localeCompare(b.id))
        .map(clone);
    },
    async listPlans() {
      return [...state.plans].sort((a, b) => b.version - a.version).map(publicPlan);
    },
    async log(planId, limit) {
      return state.log
        .filter((entry) => entry.planId === planId)
        .reverse()
        .slice(0, limit)
        .map(clone);
    },
    async logBetween(fromIso, toIso, limit) {
      const from = Date.parse(fromIso);
      const to = Date.parse(toIso);
      return state.log
        .filter((entry) => {
          const at = Date.parse(entry.createdAt);
          return at >= from && at < to;
        })
        .slice(0, limit)
        .map(clone);
    },
    async logByIdempotencyKey(idempotencyKey) {
      const found = state.log.find((entry) => entry.idempotencyKey === idempotencyKey);
      return found ? clone(found) : null;
    },
    async logById(logId) {
      const found = state.log.find((entry) => entry.id === logId);
      return found ? clone(found) : null;
    },
    async commandReceipt(idempotencyKey) {
      const found = state.commands.find((entry) => entry.idempotencyKey === idempotencyKey);
      return found ? clone(found) : null;
    },
    async maxVersion() {
      return state.plans.reduce((max, plan) => Math.max(max, plan.version), 0);
    },
    async plan(planId) {
      const found = state.plans.find((plan) => plan.id === planId);
      return found ? publicPlan(found) : null;
    },
    async planByCreationKey(creationKey) {
      const found = state.plans.find((plan) => plan.creationKey === creationKey);
      return found ? publicPlan(found) : null;
    },
  };
}

function publicPlan(plan: StoredPlan): Plan {
  const { creationKey: _creationKey, ...rest } = clone(plan);
  return rest;
}

export function createMemoryPlanRepository(): MemoryPlanRepository {
  const states = new Map<string, MemoryScopeState>();
  const queues = new Map<string, Promise<unknown>>();
  const keyOf = (scope: PlanScope) => JSON.stringify([scope.workspaceId, scope.actorId]);
  const stateOf = (key: string): MemoryScopeState =>
    states.get(key) ?? { commands: [], items: [], log: [], plans: [] };

  return {
    dump(scope) {
      return clone(stateOf(keyOf(scope)));
    },
    async read<T>(scope: PlanScope, operation: (reader: PlanReader) => Promise<T>): Promise<T> {
      return operation(memoryReader(clone(stateOf(keyOf(scope)))));
    },
    async transact<T>(scope: PlanScope, operation: (tx: PlanTransaction) => Promise<T>): Promise<T> {
      const key = keyOf(scope);
      const previous = queues.get(key) ?? Promise.resolve();
      const run = previous.catch(() => undefined).then(async () => {
        const draft = clone(stateOf(key));
        const reader = memoryReader(draft);
        const tx: PlanTransaction = {
          ...reader,
          async updatePlanAnalysis(planId, analysis, updatedAt) {
            const plan = draft.plans.find((entry) => entry.id === planId && entry.status === "active");
            if (plan) Object.assign(plan, { analysis: clone(analysis), updatedAt });
          },
          async archivePlan(planId, archivedAt) {
            const plan = draft.plans.find((entry) => entry.id === planId && entry.status === "active");
            if (plan) Object.assign(plan, { archivedAt, status: "archived", updatedAt: archivedAt });
          },
          async insertItems(items) {
            for (const item of items) {
              if (draft.items.some((entry) => entry.id === item.id)) throw new Error("duplicate plan item id");
              if (!draft.plans.some((plan) => plan.id === item.planId)) throw new Error("plan item without plan");
              draft.items.push(clone(item));
            }
          },
          async insertLog(entry) {
            for (const referenced of [entry.itemId, entry.targetItemId]) {
              if (referenced && !draft.items.some((item) => item.id === referenced && item.planId === entry.planId)) {
                throw new Error("plan log references an item outside its plan");
              }
            }
            if (draft.log.some((existing) => existing.idempotencyKey === entry.idempotencyKey)) {
              throw new Error("duplicate plan log idempotency key");
            }
            draft.log.push(clone(entry));
          },
          async insertCommandReceipt(receipt) {
            if (draft.commands.some((entry) => entry.idempotencyKey === receipt.idempotencyKey)) {
              throw new Error("duplicate plan command idempotency key");
            }
            if (receipt.itemId && !draft.items.some((item) => item.id === receipt.itemId && item.planId === receipt.planId)) {
              throw new Error("plan command references an item outside its plan");
            }
            draft.commands.push(clone(receipt));
          },
          async insertPlan(plan) {
            if (plan.status === "active" && draft.plans.some((entry) => entry.status === "active")) {
              throw new Error("only one active plan per actor");
            }
            if (draft.plans.some((entry) => entry.version === plan.version)) {
              throw new Error("duplicate plan version");
            }
            draft.plans.push(clone(plan));
          },
          async updateItem(item) {
            const index = draft.items.findIndex((entry) => entry.id === item.id && entry.planId === item.planId);
            if (index < 0) throw new Error("Plan item update matched no row.");
            draft.items[index] = clone(item);
          },
        };
        const result = await operation(tx);
        states.set(key, draft);
        return result;
      });
      queues.set(key, run);
      return run;
    },
  };
}
