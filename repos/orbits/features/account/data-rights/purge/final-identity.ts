import { createHash } from "node:crypto";

import type { TransactionalPostgresClient, TransactionalSqlExecutor } from "../../../../shared/storage/transactional-postgres";
import { assertLocalAccountPurgeDatabase, assertLocalAccountPurgeTarget } from "./local-gate";
import type { AccountPurgeStep } from "./progress";

const REQUIRED_STEPS = ["connections", "exports", "contacts", "notes", "plans", "agent", "events", "inbox"] as const;
const IDENTITY_COLLECTIONS = ["accounts", "profiles", "account_deletion_requests", "account_deletion_locks",
  "account_reauth_receipts", "account_rights_outbox", "account_purge_steps"];
const ALLOWED_RECORD_COLLECTIONS = [...IDENTITY_COLLECTIONS, "auth_users"];
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

async function assertSteps(sql: TransactionalSqlExecutor, workspaceId: string, actorId: string, requireMail: boolean): Promise<void> {
  const names: readonly string[] = requireMail ? [...REQUIRED_STEPS, "completion-mail"] : REQUIRED_STEPS;
  const done = await sql.query<{ step: string }>(`select payload->>'step' as step from orbit_records where
    workspace_id=$1 and collection_name='account_purge_steps' and user_id=$2
    and payload->>'actorId'=$2 and payload->>'status'='done' and payload->>'step'=any($3::text[])`,
  [workspaceId, actorId, names]);
  if (new Set(done.rows.map(row => row.step)).size !== names.length) throw new Error("PURGE_STEPS_INCOMPLETE");
}

async function assertNoResidual(sql: TransactionalSqlExecutor, workspaceId: string, actorId: string, userId: string): Promise<void> {
  const rows = await sql.query<{ collection_name: string }>(`select distinct collection_name from orbit_records where workspace_id=$1 and
    ((user_id=$2 and collection_name<>all($4::text[])) or
     (user_id=$3 and user_id<>$2 and collection_name<>'auth_users'))
    order by collection_name limit 10`, [workspaceId, actorId, userId, ALLOWED_RECORD_COLLECTIONS]);
  if (rows.rows.length) throw new Error(`PURGE_RESIDUAL_RECORDS:${rows.rows.map(row => row.collection_name).join(",")}`);
}

/** Local-only final step. The completion sender must honor the stable key on a crash retry. */
export async function purgeAccountFinalIdentity(input: {
  db: TransactionalPostgresClient;
  workspaceId: string;
  actorId: string;
  userId: string;
  leaseToken: string;
  progress: { get(actorId: string, step: string): Promise<AccountPurgeStep | null>; complete(actorId: string, leaseToken: string, step: string, result: Record<string, number>): Promise<AccountPurgeStep> };
  sendCompletion: (input: { email: string; idempotencyKey: string }) => Promise<void>;
  now?: () => Date;
}): Promise<{ deleted: number }> {
  assertLocalAccountPurgeTarget();
  const { db, workspaceId, actorId, userId, leaseToken, progress, sendCompletion } = input;
  await assertLocalAccountPurgeDatabase(db);
  if (!workspaceId || !actorId || !userId || !leaseToken) throw new Error("ACCOUNT_PURGE_SCOPE_REQUIRED");
  const now = input.now ?? (() => new Date());
  await assertLease(db, workspaceId, actorId, userId, leaseToken, now().toISOString());
  await assertSteps(db, workspaceId, actorId, false);
  await assertNoResidual(db, workspaceId, actorId, userId);
  const auth = await db.query<{ email: string | null }>(`select payload->>'email' as email from orbit_records where workspace_id=$1
    and collection_name='auth_users' and user_id=$2 and payload->>'id'=$2 and lifecycle_state='active'`, [workspaceId, userId]);
  if (auth.rows.length !== 1 || !auth.rows[0]?.email) throw new Error("PURGE_IDENTITY_UNAVAILABLE");
  if (!await progress.get(actorId, "completion-mail")) {
    await sendCompletion({ email: auth.rows[0].email, idempotencyKey: `account-rights:deletion-complete:${hash(actorId)}` });
    await progress.complete(actorId, leaseToken, "completion-mail", { delivered: 1 });
  }
  return db.transaction(async sql => {
    await assertLease(sql, workspaceId, actorId, userId, leaseToken, now().toISOString(), true);
    await assertSteps(sql, workspaceId, actorId, true);
    await assertNoResidual(sql, workspaceId, actorId, userId);
    const removed = await sql.query<{ count: string }>(`with removed as (delete from orbit_records where workspace_id=$1 and
      ((collection_name='auth_users' and user_id=$3 and payload->>'id'=$3 and payload->>'email'=$4)
        or (user_id=$2 and collection_name=any($5::text[]))) returning collection_name)
      select count(*) filter (where collection_name='auth_users')::text as count from removed`,
    [workspaceId, actorId, userId, auth.rows[0].email, IDENTITY_COLLECTIONS]);
    const deleted = Number(removed.rows[0]?.count ?? 0);
    if (deleted !== 1) throw new Error("PURGE_IDENTITY_CONFLICT");
    return { deleted };
  }, { isolation: "read committed" });
}
