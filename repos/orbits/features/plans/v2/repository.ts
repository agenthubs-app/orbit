/**
 * R22 计划 v2.2 的仓储（DESIGN §3）。两种实现语义一致：
 *
 * - Postgres：与 v1 同一个连接池、同一把按人的 advisory lock（`planActorLockKey`），v1 与 v2 的写操作对同一个人串行；
 *   所有读写都带 `workspace_id + actor_id`，并且只看 `model_version = 2` 的计划（v1 的仓储反过来只看 v1）。
 * - 内存（mock / 测试）：每个人一条 promise 链串行；事务在副本上执行，成功才替换。
 */
import type { PlanContactLink } from "../contract";
import { planActorLockKey, type PlanPoolLike, type PlanQueryClient } from "../repository";
import type {
  PlanFlowReceipt,
  PlanV2Analysis,
  PlanV2EventItem,
  PlanV2LogEntry,
  PlanV2LogEvent,
  PlanV2PersonTypeMeta,
  PlanV2Reader,
  PlanV2Repository,
  PlanV2Row,
  PlanV2Scope,
  PlanV2Transaction,
  PlanV2TypeItem,
} from "./types";

type Row = Record<string, unknown>;

function iso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}
function isoOrNull(value: unknown): string | null {
  return value === null || value === undefined ? null : iso(value);
}
function textOrNull(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}
function json<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  return (typeof value === "string" ? JSON.parse(value) : value) as T;
}

const V2_PLAN_COLUMNS = `
  id, version, status, goal_id, goal_snapshot, goal_kind, purpose_text, purpose_level, premise, analysis, phases,
  event_allocation, event_target_count, revision, manual_edit_available, to_char(starts_on, 'YYYY-MM-DD') as starts_on,
  creation_key, achieved_at, last_opened_at, created_at, updated_at, archived_at`;

const ITEM_COLUMNS = `
  id, plan_id, kind, title, detail, status, contact_links, linked_event_id, criteria, sort_key, meta,
  allocation, skipped_at, type_slot, created_at, updated_at`;

const LOG_COLUMNS = `
  id, plan_id, item_id, event, author, body, linked_contact_ids, linked_event_id, payload, idempotency_key, created_at`;

function planFromRow(row: Row): PlanV2Row {
  return {
    achievedAt: isoOrNull(row.achieved_at),
    analysis: json<PlanV2Analysis>(row.analysis, { allocationReasons: [], basis: [], citations: [], conclusion: "", diagnosis: "", schemaVersion: 2 }),
    archivedAt: isoOrNull(row.archived_at),
    createdAt: iso(row.created_at),
    creationKey: textOrNull(row.creation_key),
    eventAllocation: Number(row.event_allocation ?? 0),
    eventTargetCount: Number(row.event_target_count ?? 1),
    goalId: String(row.goal_id),
    goalKind: String(row.goal_kind) as PlanV2Row["goalKind"],
    goalText: String(row.goal_snapshot),
    id: String(row.id),
    lastOpenedAt: isoOrNull(row.last_opened_at),
    manualEditAvailable: Boolean(row.manual_edit_available),
    premise: json(row.premise, []),
    purposeLevel: row.purpose_level === null || row.purpose_level === undefined ? null : Number(row.purpose_level),
    purposeText: textOrNull(row.purpose_text),
    revision: Number(row.revision),
    startsOn: String(row.starts_on),
    status: String(row.status) as PlanV2Row["status"],
    steps: json(row.phases, []),
    updatedAt: iso(row.updated_at),
    version: Number(row.version),
  };
}

function typeItemFromRow(row: Row): PlanV2TypeItem {
  const criteria = json<{ targetCount?: number; description?: string | null; primaryIndustryId?: string | null; secondaryIndustryId?: string | null }>(row.criteria, {});
  const meta = json<{ personType?: PlanV2PersonTypeMeta }>(row.meta, {});
  return {
    allocation: Number(row.allocation ?? 0),
    contactLinks: json<PlanContactLink[]>(row.contact_links, []),
    createdAt: iso(row.created_at),
    id: String(row.id),
    personType: meta.personType ?? { countRule: "", emoji: "", introRoutes: [], key: String(row.id), opener: null, persona: null, questions: [], recognizeHints: [], shortLabelId: String(row.type_slot ?? ""), why: "" },
    planId: String(row.plan_id),
    primaryIndustryId: (criteria.primaryIndustryId ?? null) as PlanV2TypeItem["primaryIndustryId"],
    roleSituation: String(row.detail ?? criteria.description ?? ""),
    secondaryIndustryId: (criteria.secondaryIndustryId ?? null) as PlanV2TypeItem["secondaryIndustryId"],
    shortLabel: String(row.title),
    skippedAt: isoOrNull(row.skipped_at),
    slot: String(row.type_slot ?? ""),
    sortKey: Number(row.sort_key),
    targetCount: Number(criteria.targetCount ?? 1),
    updatedAt: iso(row.updated_at),
  };
}

function eventItemFromRow(row: Row): PlanV2EventItem {
  return {
    createdAt: iso(row.created_at),
    eventId: String(row.linked_event_id),
    id: String(row.id),
    planId: String(row.plan_id),
    sortKey: Number(row.sort_key),
    status: String(row.status) as PlanV2EventItem["status"],
    title: String(row.title),
    updatedAt: iso(row.updated_at),
  };
}

function logFromRow(row: Row): PlanV2LogEntry {
  return {
    author: String(row.author) as PlanV2LogEntry["author"],
    body: String(row.body),
    createdAt: iso(row.created_at),
    event: String(row.event) as PlanV2LogEvent,
    id: String(row.id),
    idempotencyKey: String(row.idempotency_key),
    itemId: textOrNull(row.item_id),
    linkedContactIds: (row.linked_contact_ids as string[] | null) ?? [],
    linkedEventId: textOrNull(row.linked_event_id),
    payload: json(row.payload, {}),
    planId: String(row.plan_id),
  };
}

/** network_need 的状态由联系人关联推导（与 v1 同口径）。 */
export function needStatus(links: readonly PlanContactLink[]): "open" | "linked" | "established" {
  if (links.some((link) => link.state === "established")) return "established";
  return links.length > 0 ? "linked" : "open";
}

function typeCriteria(item: PlanV2TypeItem) {
  return { description: item.roleSituation, primaryIndustryId: item.primaryIndustryId, secondaryIndustryId: item.secondaryIndustryId, targetCount: item.targetCount, titleKeywords: [] };
}

/* ------------------------------------------------------------------ */
/* Postgres                                                            */
/* ------------------------------------------------------------------ */

function postgresReader(client: PlanQueryClient, scope: PlanV2Scope): PlanV2Reader {
  const ws = scope.workspaceId;
  const actor = scope.actorId;
  const rows = async (text: string, values: unknown[]) => (await client.query(text, values)).rows as Row[];
  return {
    async activePlans() {
      return (await rows(
        `/* plans-v2:active */ select ${V2_PLAN_COLUMNS} from plans
         where workspace_id = $1 and actor_id = $2 and model_version = 2 and status = 'active'
         order by last_opened_at desc nulls last, created_at desc, id`,
        [ws, actor],
      )).map(planFromRow);
    },
    async activeV1PlanId() {
      const [row] = await rows(`select id from plans where workspace_id = $1 and actor_id = $2 and model_version = 1 and status = 'active'`, [ws, actor]);
      return row ? String(row.id) : null;
    },
    async eventItems(planId) {
      return (await rows(
        `select ${ITEM_COLUMNS} from plan_items where workspace_id = $1 and actor_id = $2 and plan_id = $3 and kind = 'event' order by sort_key, id`,
        [ws, actor, planId],
      )).map(eventItemFromRow);
    },
    async flowReceipt(idempotencyKey) {
      const [row] = await rows(
        `select idempotency_key, kind, plan_id, fingerprint, outcome, response, created_at from plan_flow_commands
         where workspace_id = $1 and actor_id = $2 and idempotency_key = $3`,
        [ws, actor, idempotencyKey],
      );
      return row
        ? { createdAt: iso(row.created_at), fingerprint: String(row.fingerprint), idempotencyKey: String(row.idempotency_key), kind: String(row.kind), outcome: row.outcome as PlanFlowReceipt["outcome"], planId: textOrNull(row.plan_id), response: json(row.response, {}) }
        : null;
    },
    async goalPlans() {
      return (await rows(
        `/* plans-v2:goals */ select ${V2_PLAN_COLUMNS} from plans
         where workspace_id = $1 and actor_id = $2 and model_version = 2 and (status = 'active' or achieved_at is not null)
         order by (status = 'active') desc, last_opened_at desc nulls last, created_at desc, id`,
        [ws, actor],
      )).map(planFromRow);
    },
    async hasLogKey(idempotencyKey) {
      return (await rows(`select 1 from plan_log where workspace_id = $1 and actor_id = $2 and idempotency_key = $3 limit 1`, [ws, actor, idempotencyKey])).length > 0;
    },
    async log(planId) {
      return (await rows(
        `select ${LOG_COLUMNS} from plan_log where workspace_id = $1 and actor_id = $2 and plan_id = $3 order by seq`,
        [ws, actor, planId],
      )).map(logFromRow);
    },
    async maxVersion() {
      const [row] = await rows(`select coalesce(max(version), 0)::int as version from plans where workspace_id = $1 and actor_id = $2`, [ws, actor]);
      return Number(row?.version ?? 0);
    },
    async plan(planId) {
      const [row] = await rows(`select ${V2_PLAN_COLUMNS} from plans where workspace_id = $1 and actor_id = $2 and id = $3 and model_version = 2`, [ws, actor, planId]);
      return row ? planFromRow(row) : null;
    },
    async planByCreationKey(creationKey) {
      const [row] = await rows(`select ${V2_PLAN_COLUMNS} from plans where workspace_id = $1 and actor_id = $2 and creation_key = $3 and model_version = 2`, [ws, actor, creationKey]);
      return row ? planFromRow(row) : null;
    },
    async typeItems(planId) {
      return (await rows(
        `select ${ITEM_COLUMNS} from plan_items where workspace_id = $1 and actor_id = $2 and plan_id = $3 and kind = 'network_need' order by sort_key, id`,
        [ws, actor, planId],
      )).map(typeItemFromRow);
    },
  };
}

function postgresTransaction(client: PlanQueryClient, scope: PlanV2Scope): PlanV2Transaction {
  const ws = scope.workspaceId;
  const actor = scope.actorId;
  const reader = postgresReader(client, scope);
  const writeTypeItem = async (item: PlanV2TypeItem, insert: boolean) => {
    const values = [
      ws, item.id, actor, item.planId, item.shortLabel, item.roleSituation, needStatus(item.contactLinks),
      item.contactLinks.map((link) => link.contactId), JSON.stringify(item.contactLinks), JSON.stringify(typeCriteria(item)),
      item.sortKey, JSON.stringify({ personType: item.personType }), item.allocation, item.skippedAt, item.slot, item.createdAt, item.updatedAt,
    ];
    if (insert) {
      await client.query(
        `insert into plan_items (workspace_id, id, actor_id, plan_id, kind, title, detail, status, linked_contact_ids, contact_links, criteria,
           sort_key, meta, allocation, skipped_at, type_slot, created_at, updated_at)
         values ($1,$2,$3,$4,'network_need',$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,$12::jsonb,$13,$14,$15,$16,$17)`,
        values,
      );
    } else {
      await client.query(
        `update plan_items set title = $5, detail = $6, status = $7, linked_contact_ids = $8, contact_links = $9::jsonb, criteria = $10::jsonb,
           sort_key = $11, meta = $12::jsonb, allocation = $13, skipped_at = $14, type_slot = $15, updated_at = $16
         where workspace_id = $1 and id = $2 and actor_id = $3 and plan_id = $4 and kind = 'network_need'`,
        [...values.slice(0, 15), item.updatedAt],
      );
    }
  };
  return {
    ...reader,
    async archiveActiveV1(at) {
      const result = await client.query(
        `update plans set status = 'archived', archived_at = $3, updated_at = $3
         where workspace_id = $1 and actor_id = $2 and model_version = 1 and status = 'active' returning id`,
        [ws, actor, at],
      );
      const row = (result.rows as Row[])[0];
      return row ? String(row.id) : null;
    },
    async insertEventItem(item) {
      await client.query(
        `insert into plan_items (workspace_id, id, actor_id, plan_id, kind, title, status, linked_event_id, sort_key, created_at, updated_at)
         values ($1,$2,$3,$4,'event',$5,$6,$7,$8,$9,$10)`,
        [ws, item.id, actor, item.planId, item.title, item.status, item.eventId, item.sortKey, item.createdAt, item.updatedAt],
      );
    },
    async insertFlowReceipt(receipt) {
      await client.query(
        `insert into plan_flow_commands (workspace_id, actor_id, idempotency_key, kind, plan_id, fingerprint, outcome, response, created_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)`,
        [ws, actor, receipt.idempotencyKey, receipt.kind, receipt.planId, receipt.fingerprint, receipt.outcome, JSON.stringify(receipt.response), receipt.createdAt],
      );
    },
    async insertLog(entry) {
      await client.query(
        `insert into plan_log (workspace_id, id, actor_id, plan_id, item_id, kind, event, author, body, linked_contact_ids, linked_event_id, payload, idempotency_key, created_at)
         values ($1,$2,$3,$4,$5,'auto',$6,$7,$8,$9,$10,$11::jsonb,$12,$13)`,
        [ws, entry.id, actor, entry.planId, entry.itemId, entry.event, entry.author, entry.body, entry.linkedContactIds, entry.linkedEventId, JSON.stringify(entry.payload), entry.idempotencyKey, entry.createdAt],
      );
    },
    async insertPlan(plan) {
      await client.query(
        `insert into plans (workspace_id, id, actor_id, version, status, goal_snapshot, horizon, starts_on, analysis, phases, creation_key,
           created_at, updated_at, archived_at, model_version, goal_id, goal_kind, purpose_text, purpose_level, premise,
           event_allocation, event_target_count, revision, manual_edit_available, achieved_at, last_opened_at)
         values ($1,$2,$3,$4,$5,$6,null,$7::date,$8::jsonb,$9::jsonb,$10,$11,$12,$13,2,$14,$15,$16,$17,$18::jsonb,$19,$20,$21,$22,$23,$24)`,
        [
          ws, plan.id, actor, plan.version, plan.status, plan.goalText, plan.startsOn, JSON.stringify(plan.analysis), JSON.stringify(plan.steps),
          plan.creationKey, plan.createdAt, plan.updatedAt, plan.archivedAt, plan.goalId, plan.goalKind, plan.purposeText, plan.purposeLevel,
          JSON.stringify(plan.premise), plan.eventAllocation, plan.eventTargetCount, plan.revision, plan.manualEditAvailable, plan.achievedAt, plan.lastOpenedAt,
        ],
      );
    },
    async insertTypeItems(items) {
      for (const item of items) await writeTypeItem(item, true);
    },
    async updateEventItem(item) {
      await client.query(
        `update plan_items set status = $5, title = $6, updated_at = $7 where workspace_id = $1 and id = $2 and actor_id = $3 and plan_id = $4 and kind = 'event'`,
        [ws, item.id, actor, item.planId, item.status, item.title, item.updatedAt],
      );
    },
    async updatePlan(plan) {
      await client.query(
        `update plans set status = $4, goal_snapshot = $5, goal_kind = $6, purpose_text = $7, purpose_level = $8, premise = $9::jsonb,
           analysis = $10::jsonb, phases = $11::jsonb, event_allocation = $12, event_target_count = $13, revision = $14,
           manual_edit_available = $15, achieved_at = $16, last_opened_at = $17, updated_at = $18, archived_at = $19
         where workspace_id = $1 and actor_id = $2 and id = $3 and model_version = 2`,
        [
          ws, actor, plan.id, plan.status, plan.goalText, plan.goalKind, plan.purposeText, plan.purposeLevel, JSON.stringify(plan.premise),
          JSON.stringify(plan.analysis), JSON.stringify(plan.steps), plan.eventAllocation, plan.eventTargetCount, plan.revision,
          plan.manualEditAvailable, plan.achievedAt, plan.lastOpenedAt, plan.updatedAt, plan.archivedAt,
        ],
      );
    },
    async updateTypeItem(item) {
      await writeTypeItem(item, false);
    },
  };
}

export function createPostgresPlanV2Repository(options: { pool: PlanPoolLike }): PlanV2Repository {
  const { pool } = options;
  return {
    async read(scope, operation) {
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
    async transact(scope, operation) {
      const client = await pool.connect();
      let destroy = false;
      try {
        await client.query("begin isolation level read committed");
        await client.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [planActorLockKey(scope)]);
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
/* Memory (mock / tests)                                               */
/* ------------------------------------------------------------------ */

export interface MemoryPlanV2State {
  plans: PlanV2Row[];
  typeItems: PlanV2TypeItem[];
  eventItems: PlanV2EventItem[];
  log: PlanV2LogEntry[];
  receipts: PlanFlowReceipt[];
  /** 生效中的 v1 计划 id（测试用；内存实现不保存 v1 的行）。 */
  activeV1PlanId: string | null;
  /** 本人用过的最大版本号（含 v1）。 */
  maxVersion: number;
}

export interface MemoryPlanV2Repository extends PlanV2Repository {
  dump(scope: PlanV2Scope): MemoryPlanV2State;
  seed(scope: PlanV2Scope, state: Partial<MemoryPlanV2State>): void;
}

function emptyState(): MemoryPlanV2State {
  return { activeV1PlanId: null, eventItems: [], log: [], maxVersion: 0, plans: [], receipts: [], typeItems: [] };
}

function memoryReader(state: MemoryPlanV2State): PlanV2Reader {
  const sortPlans = (plans: PlanV2Row[]) => [...plans].sort((left, right) =>
    (right.lastOpenedAt ?? "").localeCompare(left.lastOpenedAt ?? "") || right.createdAt.localeCompare(left.createdAt) || left.id.localeCompare(right.id));
  return {
    async activePlans() { return structuredClone(sortPlans(state.plans.filter((plan) => plan.status === "active"))); },
    async activeV1PlanId() { return state.activeV1PlanId; },
    async eventItems(planId) { return structuredClone(state.eventItems.filter((item) => item.planId === planId).sort((a, b) => a.sortKey - b.sortKey)); },
    async flowReceipt(key) { return structuredClone(state.receipts.find((receipt) => receipt.idempotencyKey === key) ?? null); },
    async goalPlans() {
      const active = sortPlans(state.plans.filter((plan) => plan.status === "active"));
      const achieved = sortPlans(state.plans.filter((plan) => plan.status === "archived" && plan.achievedAt));
      return structuredClone([...active, ...achieved]);
    },
    async hasLogKey(key) { return state.log.some((entry) => entry.idempotencyKey === key); },
    async log(planId) { return structuredClone(state.log.filter((entry) => entry.planId === planId)); },
    async maxVersion() { return Math.max(state.maxVersion, ...state.plans.map((plan) => plan.version), 0); },
    async plan(planId) { return structuredClone(state.plans.find((plan) => plan.id === planId) ?? null); },
    async planByCreationKey(key) { return structuredClone(state.plans.find((plan) => plan.creationKey === key) ?? null); },
    async typeItems(planId) { return structuredClone(state.typeItems.filter((item) => item.planId === planId).sort((a, b) => a.sortKey - b.sortKey)); },
  };
}

function memoryTransaction(state: MemoryPlanV2State): PlanV2Transaction {
  const unique = (exists: boolean, what: string) => {
    if (exists) throw Object.assign(new Error(`duplicate ${what}`), { code: "23505" });
  };
  return {
    ...memoryReader(state),
    async archiveActiveV1() {
      const id = state.activeV1PlanId;
      state.activeV1PlanId = null;
      return id;
    },
    async insertEventItem(item) { state.eventItems.push(structuredClone(item)); },
    async insertFlowReceipt(receipt) {
      unique(state.receipts.some((item) => item.idempotencyKey === receipt.idempotencyKey), "receipt");
      state.receipts.push(structuredClone(receipt));
    },
    async insertLog(entry) {
      unique(state.log.some((item) => item.idempotencyKey === entry.idempotencyKey), "log key");
      state.log.push(structuredClone(entry));
    },
    async insertPlan(plan) {
      unique(state.plans.some((item) => item.status === "active" && plan.status === "active" && item.goalId === plan.goalId), "active goal");
      unique(state.plans.some((item) => item.version === plan.version), "version");
      state.plans.push(structuredClone(plan));
    },
    async insertTypeItems(items) { state.typeItems.push(...structuredClone([...items])); },
    async updateEventItem(item) { state.eventItems = state.eventItems.map((current) => (current.id === item.id ? structuredClone(item) : current)); },
    async updatePlan(plan) { state.plans = state.plans.map((current) => (current.id === plan.id ? structuredClone(plan) : current)); },
    async updateTypeItem(item) { state.typeItems = state.typeItems.map((current) => (current.id === item.id ? structuredClone(item) : current)); },
  };
}

export function createMemoryPlanV2Repository(): MemoryPlanV2Repository {
  const states = new Map<string, MemoryPlanV2State>();
  const chains = new Map<string, Promise<unknown>>();
  const keyOf = (scope: PlanV2Scope) => `${scope.workspaceId}\u0000${scope.actorId}`;
  const stateOf = (scope: PlanV2Scope) => {
    const key = keyOf(scope);
    let state = states.get(key);
    if (!state) {
      state = emptyState();
      states.set(key, state);
    }
    return state;
  };
  return {
    dump: (scope) => structuredClone(stateOf(scope)),
    async read(scope, operation) {
      return operation(memoryReader(structuredClone(stateOf(scope))));
    },
    seed(scope, partial) {
      states.set(keyOf(scope), { ...emptyState(), ...structuredClone(partial) });
    },
    transact(scope, operation) {
      const key = keyOf(scope);
      const run = async () => {
        const draft = structuredClone(stateOf(scope));
        const result = await operation(memoryTransaction(draft));
        states.set(key, draft);
        return result;
      };
      const next = (chains.get(key) ?? Promise.resolve()).then(run, run);
      chains.set(key, next.catch(() => undefined));
      return next;
    },
  };
}
