import { createHash, randomBytes, randomUUID } from "node:crypto";

import type { TransactionalPostgresClient, TransactionalSqlExecutor } from "../../../shared/storage/transactional-postgres";

const REQUESTS = "account_deletion_requests";
const LOCKS = "account_deletion_locks";
const RECEIPTS = "account_reauth_receipts";
const OUTBOX = "account_rights_outbox";
const THIRTY_DAYS = 30 * 86_400_000;
const TEN_MINUTES = 10 * 60_000;
const PURGE_LEASE = 5 * 60_000;

export interface AccountDeletionRecord {
  id: string;
  actorId: string;
  userId: string;
  status: "pending" | "purging" | "deleted" | "cancelled";
  requestedAt: string;
  purgeAfter: string;
  reauthAt: string;
  version: number;
  cancelledAt?: string;
  startedAt?: string;
  completedAt?: string;
  leaseToken?: string;
  leaseUntil?: string;
}

type Row = { payload: AccountDeletionRecord | string };
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const requestId = (actorId: string) => `deletion:${hash(actorId)}`;
const receiptId = (receipt: string) => `reauth:${hash(receipt)}`;
const fromRow = (row: Row) => typeof row.payload === "string" ? JSON.parse(row.payload) as AccountDeletionRecord : row.payload;

async function read(sql: TransactionalSqlExecutor, workspaceId: string, actorId: string, lock = false): Promise<AccountDeletionRecord | null> {
  const found = await sql.query<Row>(`select payload from orbit_records where workspace_id=$1 and collection_name=$2 and record_id=$3 and user_id=$4${lock ? " for update" : ""}`,
    [workspaceId, REQUESTS, requestId(actorId), actorId]);
  return found.rows[0] ? fromRow(found.rows[0]) : null;
}

async function hasActiveHostRegistrations(sql: TransactionalSqlExecutor, workspaceId: string, actorId: string): Promise<boolean> {
  const legacy = await sql.query(`select 1 from orbit_records e join orbit_records r
    on r.workspace_id=e.workspace_id and r.collection_name='event_registrations' and r.lifecycle_state<>'deleted'
    and r.payload->'registration'->>'eventId'=e.record_id and r.payload->'registration'->>'status'='rsvped'
    and r.user_id<>$2
    where e.workspace_id=$1 and e.collection_name='events' and e.lifecycle_state<>'deleted'
    and (e.user_id=$2 or e.payload->'accountId'=to_jsonb($2::text)) limit 1`, [workspaceId, actorId]);
  if (legacy.rows.length) return true;
  const available = await sql.query<{ present: string | null }>(`select to_regclass('event_ops_events')::text as present`);
  if (!available.rows[0]?.present) return false;
  const canonical = await sql.query(`select 1 from event_ops_events e join event_ops_membership_heads h
    on h.workspace_id=e.workspace_id and h.event_id=e.event_id and h.status='rsvped' and h.actor_id<>$2
    where e.workspace_id=$1 and e.organizer_actor_id=$2 and e.lifecycle_state='active' limit 1`, [workspaceId, actorId]);
  return canonical.rows.length > 0;
}

export function createAccountDeletionRecordStore(input: { db: TransactionalPostgresClient; workspaceId: string; now?: () => Date }) {
  const { db, workspaceId } = input;
  const now = input.now ?? (() => new Date());
  return {
    async issueReceipt(actorId: string, userId: string, purpose: "deletion-request", evidenceAt: Date): Promise<string> {
      const age = now().getTime() - evidenceAt.getTime();
      if (!actorId || !userId || purpose !== "deletion-request" || age < -30_000 || age > TEN_MINUTES) throw new Error("Fresh reauthentication required");
      const receipt = randomBytes(32).toString("base64url");
      const issuedAt = now().toISOString();
      await db.query(`insert into orbit_records (workspace_id,collection_name,record_id,user_id,source_type,source_id,payload,created_at,updated_at)
        values ($1,$2,$3,$4,'account-rights',$3,$5::jsonb,$6,$6)`, [workspaceId, RECEIPTS, receiptId(receipt), actorId,
        JSON.stringify({ actorId, userId, purpose, issuedAt, expiresAt: new Date(now().getTime() + TEN_MINUTES).toISOString(), consumedAt: null }), issuedAt]);
      return receipt;
    },
    get(actorId: string): Promise<AccountDeletionRecord | null> { return read(db, workspaceId, actorId); },
    async request(actorId: string, userId: string, receipt: string): Promise<{ kind: "accepted" | "existing" | "bad-receipt" | "host-blocked"; request?: AccountDeletionRecord }> {
      if (!actorId || !userId || !/^[A-Za-z0-9_-]{43}$/.test(receipt)) return { kind: "bad-receipt" };
      return db.transaction(async sql => {
        const id = requestId(actorId);
        const at = now().toISOString();
        await sql.query(`insert into orbit_records (workspace_id,collection_name,record_id,user_id,source_type,source_id,payload,created_at,updated_at)
          values ($1,$2,$3,$4,'account-rights',$3,'{"version":0}'::jsonb,$5,$5) on conflict do nothing`, [workspaceId, LOCKS, id, actorId, at]);
        await sql.query(`select record_id from orbit_records where workspace_id=$1 and collection_name=$2 and record_id=$3 and user_id=$4 for update`,
          [workspaceId, LOCKS, id, actorId]);
        const existing = await read(sql, workspaceId, actorId, true);
        if (existing?.status === "pending" || existing?.status === "purging" || existing?.status === "deleted") return { kind: "existing", request: existing };
        if (await hasActiveHostRegistrations(sql, workspaceId, actorId)) return { kind: "host-blocked" };
        const receiptRow = await sql.query<{ payload: Record<string, unknown> | string }>(`select payload from orbit_records
          where workspace_id=$1 and collection_name=$2 and record_id=$3 and user_id=$4 for update`,
        [workspaceId, RECEIPTS, receiptId(receipt), actorId]);
        const proof = receiptRow.rows[0]?.payload;
        const data = typeof proof === "string" ? JSON.parse(proof) as Record<string, unknown> : proof;
        if (!data || data.actorId !== actorId || data.userId !== userId || data.purpose !== "deletion-request" ||
          data.consumedAt || typeof data.expiresAt !== "string" || data.expiresAt <= at || typeof data.issuedAt !== "string") return { kind: "bad-receipt" };
        await sql.query(`update orbit_records set payload=jsonb_set(payload,'{consumedAt}',to_jsonb($5::text)),updated_at=$5::timestamptz
          where workspace_id=$1 and collection_name=$2 and record_id=$3 and user_id=$4`, [workspaceId, RECEIPTS, receiptId(receipt), actorId, at]);
        const record: AccountDeletionRecord = { id, actorId, userId, status: "pending", requestedAt: at,
          purgeAfter: new Date(now().getTime() + THIRTY_DAYS).toISOString(), reauthAt: data.issuedAt, version: (existing?.version ?? 0) + 1 };
        if (existing) {
          const saved = await sql.query<{ record_id: string }>(`update orbit_records set payload=$5::jsonb,updated_at=$6::timestamptz
            where workspace_id=$1 and collection_name=$2 and record_id=$3 and user_id=$4 and (payload->>'version')::int=$7 returning record_id`,
          [workspaceId, REQUESTS, id, actorId, JSON.stringify(record), at, existing.version]);
          if (!saved.rows.length) throw new Error("DELETION_CAS_CONFLICT");
        } else {
          await sql.query(`insert into orbit_records (workspace_id,collection_name,record_id,user_id,source_type,source_id,payload,created_at,updated_at)
            values ($1,$2,$3,$4,'account-rights',$3,$5::jsonb,$6,$6)`, [workspaceId, REQUESTS, id, actorId, JSON.stringify(record), at]);
        }
        const revoked = await sql.query<{ record_id: string }>(`update orbit_records
          set payload=jsonb_set(payload,'{deletionRequestedAt}',to_jsonb($3::text)),updated_at=$3::timestamptz
          where workspace_id=$1 and collection_name='auth_users' and payload->>'id'=$2 and lifecycle_state='active'
          returning record_id`, [workspaceId, userId, at]);
        if (revoked.rows.length !== 1) throw new Error("DELETION_AUTH_IDENTITY_UNAVAILABLE");
        const notificationId = `deletion-request:${id}:${record.version}`;
        await sql.query(`insert into orbit_records (workspace_id,collection_name,record_id,user_id,source_type,source_id,payload,created_at,updated_at)
          values ($1,$2,$3,$4,'account-rights',$3,$5::jsonb,$6,$6) on conflict do nothing`, [workspaceId, OUTBOX, notificationId, actorId,
          JSON.stringify({ kind: "deletion-request", status: "pending", version: 0, requestedAt: at, purgeAfter: record.purgeAfter }), at]);
        return { kind: "accepted", request: record };
      }, { isolation: "read committed" });
    },
    async cancel(actorId: string): Promise<{ kind: "cancelled" | "existing" | "none" | "too-late"; request?: AccountDeletionRecord }> {
      return db.transaction(async sql => {
        const record = await read(sql, workspaceId, actorId, true);
        if (!record) return { kind: "none" };
        if (record.status === "cancelled") return { kind: "existing", request: record };
        if (record.status !== "pending" || record.purgeAfter <= now().toISOString()) return { kind: "too-late", request: record };
        const next: AccountDeletionRecord = { ...record, status: "cancelled", cancelledAt: now().toISOString(), version: record.version + 1 };
        const saved = await sql.query<{ record_id: string }>(`update orbit_records set payload=$5::jsonb,updated_at=$6::timestamptz
          where workspace_id=$1 and collection_name=$2 and record_id=$3 and user_id=$4 and (payload->>'version')::int=$7 returning record_id`,
        [workspaceId, REQUESTS, record.id, actorId, JSON.stringify(next), next.cancelledAt, record.version]);
        if (!saved.rows.length) throw new Error("DELETION_CAS_CONFLICT");
        return { kind: "cancelled", request: next };
      }, { isolation: "read committed" });
    },
    async claimNextPurge(): Promise<{ request: AccountDeletionRecord; leaseToken: string } | null> {
      return db.transaction(async sql => {
        const at = now().toISOString();
        const found = await sql.query<{ user_id: string; payload: AccountDeletionRecord | string }>(`select user_id,payload from orbit_records
          where workspace_id=$1 and collection_name=$2 and ((payload->>'status'='pending' and payload->>'purgeAfter'<=$3) or
          (payload->>'status'='purging' and payload->>'leaseUntil'<=$3))
          order by created_at,record_id for update skip locked limit 1`, [workspaceId, REQUESTS, at]);
        const row = found.rows[0];
        if (!row) return null;
        const record = fromRow(row);
        const leaseToken = randomUUID();
        const next: AccountDeletionRecord = { ...record, status: "purging", startedAt: record.startedAt ?? at,
          leaseToken, leaseUntil: new Date(now().getTime() + PURGE_LEASE).toISOString(), version: record.version + 1 };
        const saved = await sql.query<{ record_id: string }>(`update orbit_records set payload=$5::jsonb,updated_at=$6::timestamptz
          where workspace_id=$1 and collection_name=$2 and record_id=$3 and user_id=$4 and (payload->>'version')::int=$7 returning record_id`,
        [workspaceId, REQUESTS, record.id, row.user_id, JSON.stringify(next), at, record.version]);
        if (!saved.rows.length) throw new Error("DELETION_CLAIM_CONFLICT");
        return { request: next, leaseToken };
      }, { isolation: "read committed" });
    },
  };
}
