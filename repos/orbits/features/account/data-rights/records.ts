import { createHash } from "node:crypto";

import type { AccountContactsFormat, AccountExportCreateInput, AccountExportMode, AccountExportScope } from "../../../shared/contract/account";
import type { TransactionalPostgresClient, TransactionalSqlExecutor } from "../../../shared/storage/transactional-postgres";

const EXPORTS = "account_exports";
const LOCKS = "account_export_locks";
const SEVEN_DAYS = 7 * 86_400_000;

export interface AccountExportRecord {
  id: string;
  actorId: string;
  scope: AccountExportScope[];
  mode: AccountExportMode;
  contactsFormat: AccountContactsFormat;
  status: "queued" | "running" | "ready" | "failed" | "expired";
  requestedAt: string;
  requestedDay: string;
  quotaCharged: boolean;
  version: number;
  completedItems: number;
  totalItems: number;
  readyAt?: string;
  expiresAt?: string;
  fileKey?: string;
  checksum?: string;
  fileName?: string;
  fileSizeBytes?: number;
  failureKind?: "system" | "content";
}

type Created = { kind: "accepted" | "existing"; export: AccountExportRecord } | { kind: "active" | "quota" };
type Row = { payload: AccountExportRecord | string };

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function exportId(actorId: string, idempotencyKey: string): string {
  return `export:${digest(actorId).slice(0, 24)}:${digest(idempotencyKey)}`;
}

function dayInTokyo(at: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(at);
  const part = (kind: string) => parts.find(item => item.type === kind)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function fromRow(row: Row): AccountExportRecord {
  return typeof row.payload === "string" ? JSON.parse(row.payload) as AccountExportRecord : row.payload;
}

async function readOne(sql: TransactionalSqlExecutor, workspaceId: string, actorId: string, id: string, lock = false): Promise<AccountExportRecord | null> {
  const found = await sql.query<Row>(`select payload from orbit_records where workspace_id=$1 and collection_name=$2 and record_id=$3 and user_id=$4${lock ? " for update" : ""}`, [workspaceId, EXPORTS, id, actorId]);
  return found.rows[0] ? fromRow(found.rows[0]) : null;
}

async function replaceCurrent(sql: TransactionalSqlExecutor, workspaceId: string, actorId: string, record: AccountExportRecord, previousVersion: number): Promise<boolean> {
  const reply = await sql.query<{ record_id: string }>(`update orbit_records set payload=$5::jsonb, updated_at=$6::timestamptz
    where workspace_id=$1 and collection_name=$2 and record_id=$3 and user_id=$4 and (payload->>'version')::int=$7
    returning record_id`, [workspaceId, EXPORTS, record.id, actorId, JSON.stringify(record), new Date().toISOString(), previousVersion]);
  return reply.rows.length === 1;
}

export function createAccountExportRecordStore(input: { db: TransactionalPostgresClient; workspaceId: string; now?: () => Date }) {
  const { db, workspaceId } = input;
  const now = input.now ?? (() => new Date());
  return {
    async create(actorId: string, request: AccountExportCreateInput): Promise<Created> {
      const at = now();
      const requestedAt = at.toISOString();
      const requestedDay = dayInTokyo(at);
      const id = exportId(actorId, request.idempotencyKey);
      const lockId = `export-lock:${digest(actorId)}`;
      return db.transaction(async sql => {
        await sql.query(`insert into orbit_records (workspace_id,collection_name,record_id,user_id,source_type,source_id,payload,created_at,updated_at)
          values ($1,$2,$3,$4,'account-rights',$3,'{"version":0}'::jsonb,$5,$5) on conflict do nothing`, [workspaceId, LOCKS, lockId, actorId, requestedAt]);
        const lock = await sql.query<{ payload: { version: number } }>(`select payload from orbit_records where workspace_id=$1 and collection_name=$2 and record_id=$3 and user_id=$4 for update`, [workspaceId, LOCKS, lockId, actorId]);
        if (!lock.rows[0]) throw new Error("EXPORT_LOCK_UNAVAILABLE");
        const existing = await readOne(sql, workspaceId, actorId, id);
        if (existing) return { kind: "existing", export: existing };
        const state = await sql.query<{ active: boolean; charged: string }>(`select
          exists(select 1 from orbit_records where workspace_id=$1 and collection_name=$2 and user_id=$3 and payload->>'status' in ('queued','running')) as active,
          (select count(*)::text from orbit_records where workspace_id=$1 and collection_name=$2 and user_id=$3 and payload->>'requestedDay'=$4 and payload->>'quotaCharged'='true') as charged`, [workspaceId, EXPORTS, actorId, requestedDay]);
        if (state.rows[0]?.active) return { kind: "active" };
        if (Number(state.rows[0]?.charged ?? 0) >= 3) return { kind: "quota" };
        const record: AccountExportRecord = {
          id, actorId, scope: [...request.scope], mode: request.mode ?? "selected", contactsFormat: request.contactsFormat ?? "csv",
          status: "queued", requestedAt, requestedDay, quotaCharged: true, version: 0, completedItems: 0, totalItems: request.mode === "all-json" ? 5 : request.scope.length,
        };
        await sql.query(`insert into orbit_records (workspace_id,collection_name,record_id,user_id,source_type,source_id,payload,created_at,updated_at)
          values ($1,$2,$3,$4,'account-rights',$3,$5::jsonb,$6,$6)`, [workspaceId, EXPORTS, id, actorId, JSON.stringify(record), requestedAt]);
        const version = lock.rows[0].payload.version;
        const changed = await sql.query<{ record_id: string }>(`update orbit_records set payload=jsonb_set(payload,'{version}',to_jsonb($5::int)),updated_at=$6::timestamptz
          where workspace_id=$1 and collection_name=$2 and record_id=$3 and user_id=$4 and (payload->>'version')::int=$7 returning record_id`, [workspaceId, LOCKS, lockId, actorId, version + 1, requestedAt, version]);
        if (changed.rows.length !== 1) throw new Error("EXPORT_LOCK_CONFLICT");
        return { kind: "accepted", export: record };
      }, { isolation: "read committed" });
    },
    async list(actorId: string): Promise<AccountExportRecord[]> {
      const result = await db.query<Row>(`select payload from orbit_records where workspace_id=$1 and collection_name=$2 and user_id=$3 order by created_at desc,record_id desc limit 100`, [workspaceId, EXPORTS, actorId]);
      return result.rows.map(fromRow);
    },
    async get(actorId: string, id: string): Promise<AccountExportRecord | null> {
      return readOne(db, workspaceId, actorId, id);
    },
    async markReady(actorId: string, id: string, file: { fileKey: string; checksum: string; fileName: string; fileSizeBytes: number }): Promise<boolean> {
      return db.transaction(async sql => {
        const record = await readOne(sql, workspaceId, actorId, id, true);
        if (!record || !["queued", "running"].includes(record.status)) return false;
        const readyAt = now().toISOString();
        return replaceCurrent(sql, workspaceId, actorId, {
          ...record, ...file, status: "ready", completedItems: record.totalItems, readyAt,
          expiresAt: new Date(Date.parse(readyAt) + SEVEN_DAYS).toISOString(), version: record.version + 1,
        }, record.version);
      }, { isolation: "read committed" });
    },
    async markFailed(actorId: string, id: string, failureKind: "system" | "content"): Promise<boolean> {
      return db.transaction(async sql => {
        const record = await readOne(sql, workspaceId, actorId, id, true);
        if (!record || !["queued", "running"].includes(record.status)) return false;
        return replaceCurrent(sql, workspaceId, actorId, {
          ...record, status: "failed", failureKind, quotaCharged: failureKind !== "system", version: record.version + 1,
        }, record.version);
      }, { isolation: "read committed" });
    },
  };
}
