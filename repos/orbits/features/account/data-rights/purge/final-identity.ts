import { createHash, randomUUID } from "node:crypto";

import type { TransactionalPostgresClient, TransactionalSqlExecutor } from "../../../../shared/storage/transactional-postgres";
import { assertLocalAccountPurgeDatabase, assertLocalAccountPurgeTarget } from "./local-gate";

const REQUIRED_STEPS = ["connections", "exports", "contacts", "notes", "plans", "agent", "events", "inbox"] as const;
const IDENTITY_COLLECTIONS = ["accounts", "profiles", "account_deletion_requests", "account_deletion_locks",
  "account_reauth_receipts", "account_rights_outbox", "account_purge_steps"];
const ALLOWED_RECORD_COLLECTIONS = [...IDENTITY_COLLECTIONS, "auth_users"];
const COMPLETION_MAIL_COLLECTION = "account_deletion_completion_mail";
const COMPLETION_MAIL_OWNER = "system:completion-mail";
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

async function assertLease(sql: TransactionalSqlExecutor, workspaceId: string, actorId: string, userId: string,
  leaseToken: string, at: string, lock = false): Promise<void> {
  const result = await sql.query<{ payload: Record<string, unknown> | string }>(`select payload from orbit_records
    where workspace_id=$1 and collection_name='account_deletion_requests' and record_id=$2 and user_id=$3
    ${lock ? "for update" : ""}`, [workspaceId, `deletion:${hash(actorId)}`, actorId]);
  const raw = result.rows[0]?.payload;
  const request = typeof raw === "string" ? JSON.parse(raw) as Record<string, unknown> : raw;
  if (request?.status !== "purging" || request.actorId !== actorId || request.userId !== userId ||
    request.leaseToken !== leaseToken || typeof request.leaseUntil !== "string" || request.leaseUntil <= at) {
    throw new Error("PURGE_LEASE_LOST");
  }
}

async function assertSteps(sql: TransactionalSqlExecutor, workspaceId: string, actorId: string): Promise<void> {
  const done = await sql.query<{ step: string }>(`select payload->>'step' as step from orbit_records where
    workspace_id=$1 and collection_name='account_purge_steps' and user_id=$2
    and payload->>'actorId'=$2 and payload->>'status'='done' and payload->>'step'=any($3::text[])`,
  [workspaceId, actorId, REQUIRED_STEPS]);
  if (new Set(done.rows.map(row => row.step)).size !== REQUIRED_STEPS.length) throw new Error("PURGE_STEPS_INCOMPLETE");
}

async function assertNoResidual(sql: TransactionalSqlExecutor, workspaceId: string, actorId: string, userId: string): Promise<void> {
  const rows = await sql.query<{ collection_name: string }>(`select distinct collection_name from orbit_records where workspace_id=$1 and
    ((user_id=$2 and collection_name<>all($4::text[])) or
     (user_id=$3 and user_id<>$2 and collection_name<>'auth_users'))
    order by collection_name limit 10`, [workspaceId, actorId, userId, ALLOWED_RECORD_COLLECTIONS]);
  if (rows.rows.length) throw new Error(`PURGE_RESIDUAL_RECORDS:${rows.rows.map(row => row.collection_name).join(",")}`);
}

interface CompletionMailPayload {
  email: string;
  template: "account-deletion-complete";
  idempotencyKey: string;
  status: "pending" | "sending" | "retry";
  attempts: number;
  leaseToken?: string;
  leaseUntil?: string;
}

/** 主会话代定 §R18c-5: an anonymous outbox row survives a mail failure,
 * while the completed identity never survives the final transaction. */
export async function deliverAccountCompletionMailOnce(input: {
  db: TransactionalPostgresClient;
  workspaceId: string;
  sendCompletion: (input: { email: string; idempotencyKey: string }) => Promise<void>;
  now?: () => Date;
  recordId?: string;
}): Promise<{ kind: "idle" | "delivered" | "retry" }> {
  assertLocalAccountPurgeTarget();
  await assertLocalAccountPurgeDatabase(input.db);
  const now = input.now ?? (() => new Date());
  const claim = await input.db.transaction(async sql => {
    const rows = await sql.query<{ record_id: string; payload: CompletionMailPayload | string }>(`select record_id,payload
      from orbit_records where workspace_id=$1 and collection_name=$2 and user_id=$3
      and ($4::text is null or record_id=$4)
      and (payload->>'status' in ('pending','retry') or
        (payload->>'status'='sending' and payload->>'leaseUntil'<=$5))
      order by created_at,record_id for update skip locked limit 1`,
    [input.workspaceId, COMPLETION_MAIL_COLLECTION, COMPLETION_MAIL_OWNER, input.recordId ?? null, now().toISOString()]);
    const row = rows.rows[0];
    if (!row) return null;
    const payload = typeof row.payload === "string" ? JSON.parse(row.payload) as CompletionMailPayload : row.payload;
    if (payload.template !== "account-deletion-complete" || !payload.email || payload.idempotencyKey !== row.record_id) {
      throw new Error("COMPLETION_MAIL_INVALID");
    }
    const leaseToken = randomUUID();
    await sql.query(`update orbit_records set payload=$5::jsonb,updated_at=$6::timestamptz
      where workspace_id=$1 and collection_name=$2 and record_id=$3 and user_id=$4`,
    [input.workspaceId, COMPLETION_MAIL_COLLECTION, row.record_id, COMPLETION_MAIL_OWNER,
      JSON.stringify({ ...payload, status: "sending", attempts: payload.attempts + 1,
        leaseToken, leaseUntil: new Date(now().getTime() + 5 * 60_000).toISOString() }), now().toISOString()]);
    return { recordId: row.record_id, email: payload.email, idempotencyKey: payload.idempotencyKey, leaseToken };
  }, { isolation: "read committed" });
  if (!claim) return { kind: "idle" };
  let delivered = false;
  try {
    await input.sendCompletion({ email: claim.email, idempotencyKey: claim.idempotencyKey });
    delivered = true;
  } catch {
    // The stable key makes a retry safe when the provider's outcome is unknown.
  }
  await input.db.transaction(async sql => {
    const rows = await sql.query<{ payload: CompletionMailPayload | string }>(`select payload from orbit_records
      where workspace_id=$1 and collection_name=$2 and record_id=$3 and user_id=$4 for update`,
    [input.workspaceId, COMPLETION_MAIL_COLLECTION, claim.recordId, COMPLETION_MAIL_OWNER]);
    const raw = rows.rows[0]?.payload;
    if (!raw) return;
    const payload = typeof raw === "string" ? JSON.parse(raw) as CompletionMailPayload : raw;
    if (payload.status !== "sending" || payload.leaseToken !== claim.leaseToken) return;
    if (delivered) {
      await sql.query(`delete from orbit_records where workspace_id=$1 and collection_name=$2 and record_id=$3 and user_id=$4`,
      [input.workspaceId, COMPLETION_MAIL_COLLECTION, claim.recordId, COMPLETION_MAIL_OWNER]);
    } else {
      await sql.query(`update orbit_records set payload=$5::jsonb,updated_at=$6::timestamptz
        where workspace_id=$1 and collection_name=$2 and record_id=$3 and user_id=$4`,
      [input.workspaceId, COMPLETION_MAIL_COLLECTION, claim.recordId, COMPLETION_MAIL_OWNER,
        JSON.stringify({ ...payload, status: "retry", leaseToken: undefined, leaseUntil: undefined }), now().toISOString()]);
    }
  }, { isolation: "read committed" });
  return { kind: delivered ? "delivered" : "retry" };
}

/** Local-only final step. Identity removal and mail queue commit atomically. */
export async function purgeAccountFinalIdentity(input: {
  db: TransactionalPostgresClient;
  workspaceId: string;
  actorId: string;
  userId: string;
  leaseToken: string;
  sendCompletion: (input: { email: string; idempotencyKey: string }) => Promise<void>;
  now?: () => Date;
}): Promise<{ deleted: number }> {
  assertLocalAccountPurgeTarget();
  const { db, workspaceId, actorId, userId, leaseToken, sendCompletion } = input;
  await assertLocalAccountPurgeDatabase(db);
  if (!workspaceId || !actorId || !userId || !leaseToken) throw new Error("ACCOUNT_PURGE_SCOPE_REQUIRED");
  const now = input.now ?? (() => new Date());
  const result = await db.transaction(async sql => {
    await assertLease(sql, workspaceId, actorId, userId, leaseToken, now().toISOString(), true);
    await assertSteps(sql, workspaceId, actorId);
    await assertNoResidual(sql, workspaceId, actorId, userId);
    const auth = await sql.query<{ email: string | null }>(`select payload->>'email' as email from orbit_records where workspace_id=$1
      and collection_name='auth_users' and user_id=$2 and payload->>'id'=$2 and lifecycle_state='active' for update`, [workspaceId, userId]);
    if (auth.rows.length !== 1 || !auth.rows[0]?.email) throw new Error("PURGE_IDENTITY_UNAVAILABLE");
    const completionMailId = `completion-mail:${randomUUID()}`;
    await sql.query(`insert into orbit_records(workspace_id,collection_name,record_id,user_id,source_type,source_id,
      payload,created_at,updated_at) values($1,$2,$3,$4,'account-deletion',$3,$5::jsonb,$6::timestamptz,$6::timestamptz)`,
    [workspaceId, COMPLETION_MAIL_COLLECTION, completionMailId, COMPLETION_MAIL_OWNER,
      JSON.stringify({ email: auth.rows[0].email, template: "account-deletion-complete", idempotencyKey: completionMailId,
        status: "pending", attempts: 0 }), now().toISOString()]);
    const removed = await sql.query<{ count: string }>(`with removed as (delete from orbit_records where workspace_id=$1 and
      ((collection_name='auth_users' and user_id=$3 and payload->>'id'=$3 and payload->>'email'=$4)
        or (user_id=$2 and collection_name=any($5::text[]))) returning collection_name)
      select count(*) filter (where collection_name='auth_users')::text as count from removed`,
    [workspaceId, actorId, userId, auth.rows[0].email, IDENTITY_COLLECTIONS]);
    const deleted = Number(removed.rows[0]?.count ?? 0);
    if (deleted !== 1) throw new Error("PURGE_IDENTITY_CONFLICT");
    return { deleted, completionMailId };
  }, { isolation: "read committed" });
  await deliverAccountCompletionMailOnce({ db, workspaceId, sendCompletion, now, recordId: result.completionMailId });
  return { deleted: result.deleted };
}
