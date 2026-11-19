/**
 * The due index of scheduled work (agent-design AG15; 设计稿 §5.3, PLANNER 易错边界 2/3).
 *
 * One table across accounts, read by time: which rule periods, one-off timers and pending deliveries are due. A rule's
 * row carries the rule as frozen at its current version, so the dispatcher runs a period from the index alone and never
 * lists an account's records to find what is due. A rule and its row are written in one transaction (service.ts);
 * a claim is one statement with FOR UPDATE SKIP LOCKED, so two dispatchers never take the same row.
 *
 * Kinds:
 * - rule: `itemKey` is the rule id; `nextRunAt` the first period not yet run; `definition` the rule (AgentAutomation).
 * - timer: a one-off (timers.ts); fires once, then the row is removed.
 * - delivery: a run whose result is computed and not yet in the inbox (delivery.ts); retried until sent or called off.
 */
import { createMemoryLiveRecordStore, type LiveRecordStoreLike } from "../../../shared/storage/live-record-store";
import { createPostgresLiveRecordStore } from "../../../shared/storage/postgres-live-record-store";
import type { TransactionalPostgresClient, TransactionalSqlExecutor } from "../../../shared/storage/transactional-postgres";

export const AGENT_AUTOMATION_DUE_SCHEMA_SQL = `
create table if not exists agent_automation_due (
  workspace_id text not null,
  owner_id text not null,
  item_kind text not null check (item_kind in ('rule', 'timer', 'delivery')),
  item_key text not null,
  item_version integer not null default 1,
  item_status text not null check (item_status in ('active', 'paused')),
  next_run_at timestamptz,
  definition jsonb not null default '{}'::jsonb,
  lease_id text,
  lease_until timestamptz,
  updated_at timestamptz not null default now(),
  primary key (workspace_id, owner_id, item_kind, item_key)
);

create index if not exists agent_automation_due_next_idx
  on agent_automation_due (workspace_id, next_run_at)
  where item_status = 'active' and next_run_at is not null;
`;

export type DueItemKind = "rule" | "timer" | "delivery";
export type DueItemStatus = "active" | "paused";

export interface DueItemRef {
  ownerId: string;
  kind: DueItemKind;
  key: string;
}

export interface DueItem extends DueItemRef {
  version: number;
  status: DueItemStatus;
  /** Null: nothing is due (a paused rule, a rule that ran out). */
  nextRunAt: string | null;
  definition: Record<string, unknown>;
  leaseId: string | null;
  leaseUntil: string | null;
  updatedAt: string;
}

export type DueItemWrite = Omit<DueItem, "leaseId" | "leaseUntil">;

/** The index inside one transaction. */
export interface DueIndexWriter {
  get(ref: DueItemRef): Promise<DueItem | null>;
  /** Writes the row and clears its lease. */
  put(item: DueItemWrite): Promise<void>;
  remove(ref: DueItemRef): Promise<void>;
  /** Moves a claimed row on; false when the lease is no longer this claim's (another dispatcher took it over). */
  settle(ref: DueItemRef, leaseId: string, next: { nextRunAt: string | null; updatedAt: string }): Promise<boolean>;
}

export interface AutomationTx {
  store: LiveRecordStoreLike<Record<string, unknown>>;
  due: DueIndexWriter;
}

export interface ClaimDueInput {
  now: string;
  limit: number;
  leaseId: string;
  /** How long a claim holds before another dispatcher may take the row over (a crashed run). */
  leaseMs: number;
  kinds?: readonly DueItemKind[];
}

/** Rules, their history and the due index, as one store with one transaction. */
export interface AutomationStorage {
  workspaceId: string;
  transaction<T>(operation: (tx: AutomationTx) => Promise<T>): Promise<T>;
  /** Outside a transaction (reads and single writes). */
  direct: AutomationTx;
  /** Due rows across accounts, oldest first; each claimed row is leased in the same statement. */
  claimDue(input: ClaimDueInput): Promise<DueItem[]>;
  /** An owner's rows of one kind (the "my scheduled tasks" list reads the next period here). */
  listOwned(ownerId: string, kind: DueItemKind): Promise<DueItem[]>;
}

interface DueRow {
  owner_id: string;
  item_kind: DueItemKind;
  item_key: string;
  item_version: number;
  item_status: DueItemStatus;
  next_run_at: Date | string | null;
  definition: Record<string, unknown>;
  lease_id: string | null;
  lease_until: Date | string | null;
  updated_at: Date | string;
}

const iso = (value: Date | string | null): string | null => (value === null ? null : new Date(value).toISOString());

function itemOf(row: DueRow): DueItem {
  return {
    definition: row.definition ?? {},
    key: row.item_key,
    kind: row.item_kind,
    leaseId: row.lease_id,
    leaseUntil: iso(row.lease_until),
    nextRunAt: iso(row.next_run_at),
    ownerId: row.owner_id,
    status: row.item_status,
    updatedAt: iso(row.updated_at)!,
    version: Number(row.item_version),
  };
}

const COLUMNS = "owner_id, item_kind, item_key, item_version, item_status, next_run_at, definition, lease_id, lease_until, updated_at";

export function createPostgresDueIndexWriter(executor: TransactionalSqlExecutor, workspaceId: string): DueIndexWriter {
  return {
    async get(ref) {
      const found = await executor.query<DueRow>(`select ${COLUMNS} from agent_automation_due where workspace_id = $1 and owner_id = $2 and item_kind = $3 and item_key = $4`, [workspaceId, ref.ownerId, ref.kind, ref.key]);
      return found.rows[0] ? itemOf(found.rows[0]) : null;
    },
    async put(item) {
      await executor.query(
        `insert into agent_automation_due (workspace_id, owner_id, item_kind, item_key, item_version, item_status, next_run_at, definition, lease_id, lease_until, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7::timestamptz, $8::jsonb, null, null, $9::timestamptz)
         on conflict (workspace_id, owner_id, item_kind, item_key) do update set
           item_version = excluded.item_version, item_status = excluded.item_status, next_run_at = excluded.next_run_at,
           definition = excluded.definition, lease_id = null, lease_until = null, updated_at = excluded.updated_at`,
        [workspaceId, item.ownerId, item.kind, item.key, item.version, item.status, item.nextRunAt, JSON.stringify(item.definition), item.updatedAt],
      );
    },
    async remove(ref) {
      await executor.query("delete from agent_automation_due where workspace_id = $1 and owner_id = $2 and item_kind = $3 and item_key = $4", [workspaceId, ref.ownerId, ref.kind, ref.key]);
    },
    async settle(ref, leaseId, next) {
      const settled = await executor.query<{ item_key: string }>(
        `update agent_automation_due set next_run_at = $6::timestamptz, lease_id = null, lease_until = null, updated_at = $7::timestamptz
         where workspace_id = $1 and owner_id = $2 and item_kind = $3 and item_key = $4 and lease_id = $5
         returning item_key`,
        [workspaceId, ref.ownerId, ref.kind, ref.key, leaseId, next.nextRunAt, next.updatedAt],
      );
      return settled.rows.length > 0;
    },
  };
}

export function createPostgresAutomationStorage(input: { client: TransactionalPostgresClient; workspaceId: string }): AutomationStorage {
  const { client, workspaceId } = input;
  const txOf = (executor: TransactionalSqlExecutor): AutomationTx => ({
    due: createPostgresDueIndexWriter(executor, workspaceId),
    store: createPostgresLiveRecordStore<Record<string, unknown>>({ client: executor as never }),
  });
  return {
    async claimDue(claim) {
      const kinds = claim.kinds?.length ? [...claim.kinds] : ["rule", "timer", "delivery"];
      const claimed = await client.query<DueRow>(
        `with due as (
           select workspace_id, owner_id, item_kind, item_key from agent_automation_due
           where workspace_id = $1 and item_status = 'active' and next_run_at is not null and next_run_at <= $2::timestamptz
             and (lease_until is null or lease_until <= $2::timestamptz) and item_kind = any($6::text[])
           order by next_run_at, owner_id, item_kind, item_key
           limit $3
           for update skip locked
         )
         update agent_automation_due as held set lease_id = $4, lease_until = $5::timestamptz
         from due
         where held.workspace_id = due.workspace_id and held.owner_id = due.owner_id and held.item_kind = due.item_kind and held.item_key = due.item_key
         returning held.owner_id, held.item_kind, held.item_key, held.item_version, held.item_status, held.next_run_at, held.definition, held.lease_id, held.lease_until, held.updated_at`,
        [workspaceId, claim.now, Math.max(0, claim.limit), claim.leaseId, new Date(Date.parse(claim.now) + claim.leaseMs).toISOString(), kinds],
      );
      return claimed.rows.map(itemOf).sort((left, right) => (left.nextRunAt ?? "").localeCompare(right.nextRunAt ?? "") || left.ownerId.localeCompare(right.ownerId) || left.key.localeCompare(right.key));
    },
    direct: txOf(client),
    async listOwned(ownerId, kind) {
      const rows = await client.query<DueRow>(`select ${COLUMNS} from agent_automation_due where workspace_id = $1 and owner_id = $2 and item_kind = $3 order by item_key`, [workspaceId, ownerId, kind]);
      return rows.rows.map(itemOf);
    },
    // Writers here serialize on the claimed row's lease or on the rule's own row; each statement sees what committed before it.
    transaction: (operation) => client.transaction((executor) => operation(txOf(executor)), { isolation: "read committed" }),
    workspaceId,
  };
}

/** The same contract in memory (mock mode and unit tests): one writer at a time, a failed transaction changes nothing. */
export function createMemoryAutomationStorage(workspaceId = "mock-agent-automations", shared?: { store?: LiveRecordStoreLike<Record<string, unknown>> }): AutomationStorage {
  const store = shared?.store ?? createMemoryLiveRecordStore<Record<string, unknown>>();
  let rows = new Map<string, DueItem>();
  const keyOf = (ref: DueItemRef) => JSON.stringify([ref.ownerId, ref.kind, ref.key]);
  const writerOver = (target: () => Map<string, DueItem>): DueIndexWriter => ({
    async get(ref) {
      const found = target().get(keyOf(ref));
      return found ? structuredClone(found) : null;
    },
    async put(item) {
      target().set(keyOf(item), structuredClone({ ...item, leaseId: null, leaseUntil: null }));
    },
    async remove(ref) {
      target().delete(keyOf(ref));
    },
    async settle(ref, leaseId, next) {
      const found = target().get(keyOf(ref));
      if (!found || found.leaseId !== leaseId) return false;
      target().set(keyOf(ref), { ...found, leaseId: null, leaseUntil: null, nextRunAt: next.nextRunAt, updatedAt: next.updatedAt });
      return true;
    },
  });
  let queue: Promise<unknown> = Promise.resolve();
  const serial = <T>(operation: () => Promise<T>): Promise<T> => {
    const run = queue.then(operation, operation);
    queue = run.catch(() => undefined);
    return run;
  };
  return {
    claimDue: (claim) => serial(async () => {
      const kinds = claim.kinds?.length ? claim.kinds : (["rule", "timer", "delivery"] as const);
      const due = [...rows.values()]
        .filter((item) => item.status === "active" && item.nextRunAt !== null && item.nextRunAt <= claim.now && (!item.leaseUntil || item.leaseUntil <= claim.now) && kinds.includes(item.kind))
        .sort((left, right) => left.nextRunAt!.localeCompare(right.nextRunAt!) || left.ownerId.localeCompare(right.ownerId) || left.key.localeCompare(right.key))
        .slice(0, Math.max(0, claim.limit));
      for (const item of due) rows.set(keyOf(item), { ...item, leaseId: claim.leaseId, leaseUntil: new Date(Date.parse(claim.now) + claim.leaseMs).toISOString() });
      return due.map((item) => structuredClone(rows.get(keyOf(item))!));
    }),
    direct: { due: writerOver(() => rows), store },
    async listOwned(ownerId, kind) {
      return [...rows.values()].filter((item) => item.ownerId === ownerId && item.kind === kind).sort((left, right) => left.key.localeCompare(right.key)).map((item) => structuredClone(item));
    },
    transaction: (operation) => serial(async () => {
      // The index is copied and swapped in on success. Record writes made before a failure stay (the memory record
      // store has no rollback); the callers here write records last, or only records.
      const draft = new Map([...rows.entries()].map(([key, item]) => [key, structuredClone(item)]));
      const result = await operation({ due: writerOver(() => draft), store });
      rows = draft;
      return result;
    }),
    workspaceId,
  };
}
