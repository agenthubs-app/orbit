/**
 * W0047：关系强度读模型（可重建缓存）与刷新入口。
 *
 * - `relationship_strengths`（orbit_records 新集合，非同步集合）：每 actor × contact 一行，payload = RelationshipStrength；
 * - `relationship_strength_state`：每 actor 一行（sourceStamp、tokyoDate、rulesVersion、tierCountsAt30d、earliestCaptureAt）。
 * 只写这两个集合；不写 connections（同步集合）。整表删除后重算得到相同结果。
 *
 * 刷新（W47-2 读时按需重算）：`ensureRelationshipStrengths` 先用一条语句读来源戳与 state 行；
 * 来源戳、东京日期、规则版本都没变时 0 次时间线读取。变了才批量读完整时间线、在同一遍算出当前档位与
 * now − 30 天的档位人数，单事务「比较后写」（advisory lock + 事务内重读来源戳与 state）。
 * 只由 Web 服务端加载器与后台维护入口调用；不挂在 /api/mobile/**（R-1）。
 */
import type {
  RelationshipStrength,
  RelationshipStrengthState,
  RelationshipTier,
  RelationshipTierGroup,
} from "../../shared/contract/relationship-strength";
import { createConfiguredTransactionalPostgresRuntime } from "../../shared/storage/transactional-postgres";
import { computeRelationshipStrength, computeRelationshipTierCountsAt, relationshipTierGroup, tokyoDayNumber } from "./compute";
import { RELATIONSHIP_STRENGTH_RULES, type RelationshipStrengthRules } from "./rules";
import {
  readRelationshipTimelinesForActor,
  type ActorRelationshipTimelines,
  type RelationshipStrengthSqlExecutor,
} from "./timelines";

export const RELATIONSHIP_STRENGTH_COLLECTION = "relationship_strengths";
export const RELATIONSHIP_STRENGTH_STATE_COLLECTION = "relationship_strength_state";
/** 管线每列卡片数（W47-5：列头人数统计全部，卡片按最近往来取前 30）。 */
export const RELATIONSHIP_TIER_BOARD_PER_COLUMN = 30;
/** 读缓存的硬上限（与时间线来源上限一致）。 */
export const RELATIONSHIP_STRENGTH_READ_LIMIT = 5000;
const DAY_MS = 86_400_000;

/** 来源戳覆盖的 orbit_records 集合（时间线七种来源 + memo 提取结果）；不含本读模型自己的两个集合。 */
export const RELATIONSHIP_STRENGTH_STAMP_COLLECTIONS = [
  "contacts",
  "contact_detail_states",
  "human_encounters",
  "notes",
  "personal_schedule_items",
  "tasks",
  "memo_extractions",
] as const;

export interface RelationshipTierBoardCard {
  contactId: string;
  tier: RelationshipTier;
  dormant: boolean;
  lastSignalAt: string | null;
}

export interface RelationshipTierLookupEntry {
  contactId: string;
  tier: RelationshipTier;
  dormant: boolean;
}

export interface RelationshipTierBoard {
  /** 列头人数：全部有缓存行的联系人。 */
  counts: Record<RelationshipTierGroup, number>;
  /** 每列按 lastSignalAt 倒序（无记录的排最后）至多 perColumn 张卡。 */
  columns: Record<RelationshipTierGroup, RelationshipTierBoardCard[]>;
}

export interface RelationshipStrengthStore {
  /** 一条语句：来源戳 + state 行。 */
  readStampAndState(actorId: string): Promise<{ sourceStamp: string; state: RelationshipStrengthState | null }>;
  readTimelines(actorId: string, now: Date): Promise<ActorRelationshipTimelines>;
  /**
   * 单事务比较后写：锁住该 actor；事务内重读来源戳与 state——state 已是同一键（别人刚写完）或来源戳已变（本次算的已过时）
   * 时不写返回 false；否则删除该 actor 全部强度行、写入新行与 state，返回 true。
   */
  replaceIfCurrent(actorId: string, input: { sourceStamp: string; strengths: readonly RelationshipStrength[]; state: RelationshipStrengthState }): Promise<boolean>;
  readStrengths(actorId: string, contactIds?: readonly string[]): Promise<RelationshipStrength[]>;
  /** 只投影档位（列表强弱点用；不回传 signals）。 */
  readTiers(actorId: string, contactIds: readonly string[]): Promise<RelationshipTierLookupEntry[]>;
  readTierBoard(actorId: string, perColumn: number): Promise<RelationshipTierBoard>;
}

export type EnsureRelationshipStrengthsResult =
  | { status: "fresh"; state: RelationshipStrengthState }
  | { status: "recomputed"; state: RelationshipStrengthState }
  /** 别人已写好同一键，或计算期间来源又变了（下次再算）。 */
  | { status: "skipped"; state: RelationshipStrengthState }
  | { status: "unconfigured"; state: null };

export function relationshipStrengthTokyoDate(now: Date): string {
  return new Date(tokyoDayNumber(now.getTime()) * DAY_MS).toISOString().slice(0, 10);
}

function stateIsCurrent(state: RelationshipStrengthState | null, key: { sourceStamp: string; tokyoDate: string; rulesVersion: string }): state is RelationshipStrengthState {
  return Boolean(state && state.sourceStamp === key.sourceStamp && state.tokyoDate === key.tokyoDate && state.rulesVersion === key.rulesVersion);
}

/** 纯计算：完整时间线 → 全部强度行与 state（同一遍算出 now − 30 天的档位人数）。 */
export function computeActorRelationshipStrengths(
  actorId: string,
  timelines: ActorRelationshipTimelines,
  input: { now: Date; sourceStamp: string },
  rules: RelationshipStrengthRules = RELATIONSHIP_STRENGTH_RULES,
): { strengths: RelationshipStrength[]; state: RelationshipStrengthState } {
  const strengths: RelationshipStrength[] = [];
  for (const [contactId, items] of timelines.timelines) {
    strengths.push({ ...computeRelationshipStrength(items, input.now, rules), contactId });
  }
  strengths.sort((left, right) => (left.contactId < right.contactId ? -1 : left.contactId > right.contactId ? 1 : 0));
  const at30d = new Date(input.now.getTime() - 30 * DAY_MS);
  return {
    strengths,
    state: {
      actorId,
      sourceStamp: input.sourceStamp,
      tokyoDate: relationshipStrengthTokyoDate(input.now),
      rulesVersion: rules.version,
      computedAt: input.now.toISOString(),
      tierCountsAt30d: computeRelationshipTierCountsAt(timelines.timelines, at30d, rules),
      earliestCaptureAt: timelines.earliestCaptureAt,
      contactCount: strengths.length,
    },
  };
}

export interface RelationshipStrengthDeps {
  /** 缺省用配置的 Postgres；null = 未配置。 */
  store?: RelationshipStrengthStore | null;
  rules?: RelationshipStrengthRules;
}

function resolveStore(deps: RelationshipStrengthDeps): RelationshipStrengthStore | null {
  if (deps.store !== undefined) return deps.store;
  return createConfiguredRelationshipStrengthStore();
}

export async function ensureRelationshipStrengths(
  actorId: string,
  now: Date,
  deps: RelationshipStrengthDeps = {},
): Promise<EnsureRelationshipStrengthsResult> {
  const actor = actorId.trim();
  if (!actor) throw new Error("ensureRelationshipStrengths requires an actor.");
  const store = resolveStore(deps);
  if (!store) return { status: "unconfigured", state: null };
  const rules = deps.rules ?? RELATIONSHIP_STRENGTH_RULES;
  const { sourceStamp, state } = await store.readStampAndState(actor);
  const key = { sourceStamp, tokyoDate: relationshipStrengthTokyoDate(now), rulesVersion: rules.version };
  if (stateIsCurrent(state, key)) return { status: "fresh", state };
  const timelines = await store.readTimelines(actor, now);
  const computed = computeActorRelationshipStrengths(actor, timelines, { now, sourceStamp }, rules);
  if (timelines.truncatedSources.length > 0) {
    console.warn(JSON.stringify({ event: "relationship_strength_sources_truncated", actorId: actor, sources: timelines.truncatedSources }));
  }
  const written = await store.replaceIfCurrent(actor, { sourceStamp, strengths: computed.strengths, state: computed.state });
  return written ? { status: "recomputed", state: computed.state } : { status: "skipped", state: computed.state };
}

/**
 * Web 服务端加载器用：刷新失败不影响页面（继续读已有缓存），只写结构化日志。
 */
export async function ensureRelationshipStrengthsForPage(actorId: string, now: Date = new Date(), deps: RelationshipStrengthDeps = {}): Promise<void> {
  try {
    await ensureRelationshipStrengths(actorId, now, deps);
  } catch (error) {
    console.error(JSON.stringify({
      event: "relationship_strength_refresh_failed",
      actorId,
      error: error instanceof Error ? `${error.name}: ${error.message}`.slice(0, 200) : "unknown",
    }));
  }
}

export async function readRelationshipStrengths(
  input: { actorId: string; contactIds?: readonly string[] },
  deps: RelationshipStrengthDeps = {},
): Promise<Map<string, RelationshipStrength>> {
  const store = resolveStore(deps);
  if (!store || !input.actorId.trim()) return new Map();
  if (input.contactIds && input.contactIds.length === 0) return new Map();
  const rows = await store.readStrengths(input.actorId.trim(), input.contactIds);
  return new Map(rows.map((row) => [row.contactId, row]));
}

/** 列表强弱点：这些联系人的档位（无缓存行的不在结果里 → 列表显示「未评估」）。读失败返回空表。 */
export async function readRelationshipTierLookup(
  input: { actorId: string; contactIds: readonly string[] },
  deps: RelationshipStrengthDeps = {},
): Promise<Map<string, RelationshipTierLookupEntry>> {
  const store = resolveStore(deps);
  const ids = [...new Set(input.contactIds.filter(Boolean))].slice(0, RELATIONSHIP_STRENGTH_READ_LIMIT);
  if (!store || !input.actorId.trim() || ids.length === 0) return new Map();
  try {
    const rows = await store.readTiers(input.actorId.trim(), ids);
    return new Map(rows.map((row) => [row.contactId, row]));
  } catch (error) {
    console.error(JSON.stringify({ event: "relationship_tier_lookup_failed", actorId: input.actorId, error: error instanceof Error ? error.name : "unknown" }));
    return new Map();
  }
}

export function emptyRelationshipTierBoard(): RelationshipTierBoard {
  return {
    counts: { new: 0, active: 0, core: 0, dormant: 0 },
    columns: { new: [], active: [], core: [], dormant: [] },
  };
}

export async function readRelationshipTierBoard(
  input: { actorId: string; perColumn?: number },
  deps: RelationshipStrengthDeps = {},
): Promise<RelationshipTierBoard> {
  const store = resolveStore(deps);
  if (!store || !input.actorId.trim()) return emptyRelationshipTierBoard();
  const perColumn = Math.max(1, Math.min(RELATIONSHIP_TIER_BOARD_PER_COLUMN, Math.floor(input.perColumn ?? RELATIONSHIP_TIER_BOARD_PER_COLUMN)));
  return store.readTierBoard(input.actorId.trim(), perColumn);
}

// ---------------------------------------------------------------------------
// Postgres 实现
// ---------------------------------------------------------------------------

export interface RelationshipStrengthPostgresClient extends RelationshipStrengthSqlExecutor {
  transaction<T>(operation: (client: RelationshipStrengthSqlExecutor) => Promise<T>, options?: { isolation?: "read committed" | "serializable" }): Promise<T>;
}

type Row = Record<string, unknown>;

const STAMP_COLLECTIONS_SQL = RELATIONSHIP_STRENGTH_STAMP_COLLECTIONS.map((name) => `'${name}'`).join(", ");

/**
 * 来源戳：七个 orbit_records 集合的行数、最大与总和 updated_at（任何插入、更新、删除都会移动其一），
 * 加上 plan_log 的行数与最大 seq（只追加）。不依赖 sync_revision 列（本机库与部分环境没有）。
 */
const STAMP_SQL = `/* relationship-strength:stamp */
  select records.row_count, records.max_updated, records.sum_updated, plan.plan_count, plan.plan_max_seq
  from (
    select count(*)::text as row_count,
      coalesce(max(updated_at), 'epoch'::timestamptz)::text as max_updated,
      coalesce(sum(extract(epoch from updated_at)), 0)::text as sum_updated
    from orbit_records
    where workspace_id = $1 and user_id = $2 and collection_name in (${STAMP_COLLECTIONS_SQL}) and lifecycle_state <> 'deleted'
  ) records,
  (
    select count(*)::text as plan_count, coalesce(max(seq), 0)::text as plan_max_seq
    from plan_log
    where workspace_id = $1 and actor_id = $2 and cardinality(linked_contact_ids) > 0
  ) plan`;

const STAMP_AND_STATE_SQL = `/* relationship-strength:stamp-and-state */
  select stamp.*, state.payload as state_payload
  from (${STAMP_SQL}) stamp
  left join lateral (
    select payload from orbit_records
    where workspace_id = $1 and collection_name = '${RELATIONSHIP_STRENGTH_STATE_COLLECTION}' and record_id = $3 and user_id = $2
      and lifecycle_state <> 'deleted'
  ) state on true`;

function stateRecordId(actorId: string): string {
  return `relationship-strength-state:${actorId}`;
}

function strengthRecordPrefix(actorId: string): string {
  return `relationship-strength:${actorId}:`;
}

function stampFrom(row: Row | undefined): string {
  return ["v1", row?.row_count ?? "0", row?.max_updated ?? "", row?.sum_updated ?? "0", row?.plan_count ?? "0", row?.plan_max_seq ?? "0"].map(String).join("|");
}

function parsePayload<T>(value: unknown): T | null {
  const parsed = typeof value === "string" ? (JSON.parse(value) as unknown) : value;
  return parsed && typeof parsed === "object" ? (parsed as T) : null;
}

function isTier(value: unknown): value is RelationshipTier {
  return value === "new" || value === "active" || value === "core";
}

const WRITE_STRENGTHS_SQL = `/* relationship-strength:write-rows */
  insert into orbit_records (
    workspace_id, collection_name, record_id, user_id, source_type, source_id, source_label,
    evidence_ids, target_type, target_id, occurred_at, lifecycle_state, payload, created_at, updated_at
  )
  select $1, '${RELATIONSHIP_STRENGTH_COLLECTION}', $3 || (strength.value->>'contactId'), $2, 'system', strength.value->>'contactId',
    'Relationship strength', '{}', 'contact', strength.value->>'contactId', $5::timestamptz, 'active', strength.value, $5::timestamptz, $5::timestamptz
  from jsonb_array_elements($4::jsonb) as strength(value)`;

const WRITE_STATE_SQL = `/* relationship-strength:write-state */
  insert into orbit_records (
    workspace_id, collection_name, record_id, user_id, source_type, source_id, source_label,
    evidence_ids, lifecycle_state, payload, created_at, updated_at
  )
  values ($1, '${RELATIONSHIP_STRENGTH_STATE_COLLECTION}', $3, $2, 'system', $3, 'Relationship strength state', '{}', 'active', $4::jsonb, $5::timestamptz, $5::timestamptz)
  on conflict (workspace_id, collection_name, record_id)
  do update set payload = excluded.payload, updated_at = excluded.updated_at, lifecycle_state = 'active', deleted_at = null
  where orbit_records.user_id = excluded.user_id`;

const READ_STRENGTHS_SQL = `/* relationship-strength:read-rows */
  select payload from orbit_records
  where workspace_id = $1 and collection_name = '${RELATIONSHIP_STRENGTH_COLLECTION}' and user_id = $2 and lifecycle_state <> 'deleted'
    and ($3::text[] is null or record_id = any($3::text[]))
  order by record_id collate "C"
  limit ${RELATIONSHIP_STRENGTH_READ_LIMIT}`;

const READ_TIERS_SQL = `/* relationship-strength:read-tiers */
  select payload->>'contactId' as contact_id, payload->>'tier' as tier, (payload->>'dormant')::boolean as dormant
  from orbit_records
  where workspace_id = $1 and collection_name = '${RELATIONSHIP_STRENGTH_COLLECTION}' and user_id = $2 and lifecycle_state <> 'deleted'
    and record_id = any($3::text[])
  order by record_id collate "C"
  limit ${RELATIONSHIP_STRENGTH_READ_LIMIT}`;

/** 列头人数 + 每列按 lastSignalAt 倒序前 N（只投影四个字段，不回传 signals）。 */
const READ_TIER_BOARD_SQL = `/* relationship-strength:read-board */
  with tiers as (
    select payload->>'contactId' as contact_id, payload->>'tier' as tier, (payload->>'dormant')::boolean as dormant,
      payload->>'lastSignalAt' as last_signal_at,
      case when (payload->>'dormant')::boolean then 'dormant' else payload->>'tier' end as tier_group
    from orbit_records
    where workspace_id = $1 and collection_name = '${RELATIONSHIP_STRENGTH_COLLECTION}' and user_id = $2 and lifecycle_state <> 'deleted'
  ),
  ranked as (
    select *, row_number() over (partition by tier_group order by last_signal_at collate "C" desc nulls last, contact_id collate "C") as position,
      count(*) over (partition by tier_group) as group_count
    from tiers
  )
  select tier_group, group_count::int as group_count, contact_id, tier, dormant, last_signal_at
  from ranked where position <= $3
  order by tier_group, position`;

export function createPostgresRelationshipStrengthStore(input: { client: RelationshipStrengthPostgresClient; workspaceId: string }): RelationshipStrengthStore {
  const { client, workspaceId } = input;
  return {
    async readStampAndState(actorId) {
      const result = await client.query<Row>(STAMP_AND_STATE_SQL, [workspaceId, actorId, stateRecordId(actorId)]);
      const row = result.rows[0];
      const state = parsePayload<RelationshipStrengthState>(row?.state_payload);
      return { sourceStamp: stampFrom(row), state: state && state.actorId === actorId ? state : null };
    },
    readTimelines(actorId, now) {
      return readRelationshipTimelinesForActor(client, workspaceId, { actorId, now });
    },
    async replaceIfCurrent(actorId, { sourceStamp, strengths, state }) {
      return client.transaction(async (tx) => {
        // 同一 actor 的刷新串行化；锁随事务释放。
        await tx.query(`/* relationship-strength:lock */ select pg_advisory_xact_lock(hashtextextended($1, 47))`, [`relationship-strength:${workspaceId}:${actorId}`]);
        const current = await tx.query<Row>(STAMP_AND_STATE_SQL, [workspaceId, actorId, stateRecordId(actorId)]);
        const currentStamp = stampFrom(current.rows[0]);
        const stored = parsePayload<RelationshipStrengthState>(current.rows[0]?.state_payload);
        if (currentStamp !== sourceStamp) return false;
        if (stateIsCurrent(stored, state)) return false;
        await tx.query(`/* relationship-strength:clear-rows */ delete from orbit_records
          where workspace_id = $1 and collection_name = '${RELATIONSHIP_STRENGTH_COLLECTION}' and user_id = $2`, [workspaceId, actorId]);
        if (strengths.length > 0) {
          await tx.query(WRITE_STRENGTHS_SQL, [workspaceId, actorId, strengthRecordPrefix(actorId), JSON.stringify(strengths), state.computedAt]);
        }
        await tx.query(WRITE_STATE_SQL, [workspaceId, actorId, stateRecordId(actorId), JSON.stringify(state), state.computedAt]);
        return true;
      }, { isolation: "read committed" });
    },
    async readStrengths(actorId, contactIds) {
      const recordIds = contactIds ? contactIds.map((contactId) => `${strengthRecordPrefix(actorId)}${contactId}`) : null;
      const result = await client.query<Row>(READ_STRENGTHS_SQL, [workspaceId, actorId, recordIds]);
      return result.rows.flatMap((row) => {
        const strength = parsePayload<RelationshipStrength>(row.payload);
        return strength && isTier(strength.tier) ? [strength] : [];
      });
    },
    async readTiers(actorId, contactIds) {
      const result = await client.query<Row>(READ_TIERS_SQL, [workspaceId, actorId, contactIds.map((contactId) => `${strengthRecordPrefix(actorId)}${contactId}`)]);
      return result.rows.flatMap((row) => (isTier(row.tier) ? [{ contactId: String(row.contact_id), tier: row.tier, dormant: row.dormant === true }] : []));
    },
    async readTierBoard(actorId, perColumn) {
      const result = await client.query<Row>(READ_TIER_BOARD_SQL, [workspaceId, actorId, perColumn]);
      const board = emptyRelationshipTierBoard();
      for (const row of result.rows) {
        const group = row.tier_group;
        if (group !== "new" && group !== "active" && group !== "core" && group !== "dormant") continue;
        if (!isTier(row.tier)) continue;
        board.counts[group] = Number(row.group_count ?? 0);
        board.columns[group].push({
          contactId: String(row.contact_id),
          tier: row.tier,
          dormant: row.dormant === true,
          lastSignalAt: typeof row.last_signal_at === "string" ? row.last_signal_at : null,
        });
      }
      return board;
    },
  };
}

export function createConfiguredRelationshipStrengthStore(): RelationshipStrengthStore | null {
  const runtime = createConfiguredTransactionalPostgresRuntime();
  if (!runtime) return null;
  return createPostgresRelationshipStrengthStore({ client: runtime.client, workspaceId: runtime.workspaceId });
}

// ---------------------------------------------------------------------------
// 内存实现（单元测试与无库环境的对照；行为与 Postgres 版一致）
// ---------------------------------------------------------------------------

export interface MemoryRelationshipStrengthStore extends RelationshipStrengthStore {
  rows: Map<string, Map<string, RelationshipStrength>>;
  states: Map<string, RelationshipStrengthState>;
}

export function createMemoryRelationshipStrengthStore(input: {
  stamp: (actorId: string) => string;
  timelines: (actorId: string, now: Date) => ActorRelationshipTimelines | Promise<ActorRelationshipTimelines>;
}): MemoryRelationshipStrengthStore {
  const rows = new Map<string, Map<string, RelationshipStrength>>();
  const states = new Map<string, RelationshipStrengthState>();
  let lock: Promise<unknown> = Promise.resolve();
  return {
    rows,
    states,
    async readStampAndState(actorId) {
      return { sourceStamp: input.stamp(actorId), state: states.get(actorId) ?? null };
    },
    async readTimelines(actorId, now) {
      return input.timelines(actorId, now);
    },
    async replaceIfCurrent(actorId, { sourceStamp, strengths, state }) {
      const run = lock.then(() => {
        if (input.stamp(actorId) !== sourceStamp) return false;
        if (stateIsCurrent(states.get(actorId) ?? null, state)) return false;
        rows.set(actorId, new Map(strengths.map((strength) => [strength.contactId, structuredClone(strength)])));
        states.set(actorId, structuredClone(state));
        return true;
      });
      lock = run.catch(() => undefined);
      return run;
    },
    async readStrengths(actorId, contactIds) {
      const own = rows.get(actorId) ?? new Map<string, RelationshipStrength>();
      const list = contactIds ? contactIds.flatMap((id) => (own.has(id) ? [own.get(id)!] : [])) : [...own.values()];
      return list.map((strength) => structuredClone(strength)).sort((left, right) => (left.contactId < right.contactId ? -1 : 1));
    },
    async readTiers(actorId, contactIds) {
      const own = rows.get(actorId) ?? new Map<string, RelationshipStrength>();
      return contactIds.flatMap((id) => {
        const strength = own.get(id);
        return strength ? [{ contactId: id, tier: strength.tier, dormant: strength.dormant }] : [];
      });
    },
    async readTierBoard(actorId, perColumn) {
      const board = emptyRelationshipTierBoard();
      const all = [...(rows.get(actorId)?.values() ?? [])];
      for (const strength of all) board.counts[relationshipTierGroup(strength)] += 1;
      for (const group of ["new", "active", "core", "dormant"] as const) {
        board.columns[group] = all
          .filter((strength) => relationshipTierGroup(strength) === group)
          .sort((left, right) =>
            (left.lastSignalAt === right.lastSignalAt ? 0 : left.lastSignalAt === null ? 1 : right.lastSignalAt === null ? -1 : left.lastSignalAt < right.lastSignalAt ? 1 : -1) ||
            (left.contactId < right.contactId ? -1 : 1))
          .slice(0, perColumn)
          .map((strength) => ({ contactId: strength.contactId, tier: strength.tier, dormant: strength.dormant, lastSignalAt: strength.lastSignalAt }));
      }
      return board;
    },
  };
}
