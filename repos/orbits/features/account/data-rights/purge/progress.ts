import { createHash } from "node:crypto";

import type { TransactionalPostgresClient } from "../../../../shared/storage/transactional-postgres";
import { assertLocalAccountPurgeDatabase, assertLocalAccountPurgeTarget } from "./local-gate";

const REQUESTS = "account_deletion_requests";
const STEPS = "account_purge_steps";
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const requestId = (actorId: string) => `deletion:${hash(actorId)}`;
const stepId = (actorId: string, step: string) => `purge:${hash(actorId)}:${step}`;

export interface AccountPurgeStep {
  actorId: string;
  step: string;
  version: number;
  status: "done";
  completedAt: string;
  result: Record<string, number>;
}

function payload(value: AccountPurgeStep | string): AccountPurgeStep {
  return typeof value === "string" ? JSON.parse(value) as AccountPurgeStep : value;
}

/** Progress is immutable once done. Retried side effects must be idempotent before recording completion. */
export function createAccountPurgeProgressStore(input: { db: TransactionalPostgresClient; workspaceId: string; now?: () => Date }) {
  const { db, workspaceId } = input;
  const now = input.now ?? (() => new Date());
  return {
    async get(actorId: string, step: string): Promise<AccountPurgeStep | null> {
      assertLocalAccountPurgeTarget();
      await assertLocalAccountPurgeDatabase(db);
      const result = await db.query<{ payload: AccountPurgeStep | string }>(`select payload from orbit_records
        where workspace_id=$1 and collection_name=$2 and record_id=$3 and user_id=$4 and payload->>'status'='done'`,
      [workspaceId, STEPS, stepId(actorId, step), actorId]);
      return result.rows[0] ? payload(result.rows[0].payload) : null;
    },
    async complete(actorId: string, leaseToken: string, step: string, result: Record<string, number>): Promise<AccountPurgeStep> {
      assertLocalAccountPurgeTarget();
      await assertLocalAccountPurgeDatabase(db);
      if (!workspaceId || !actorId || !leaseToken || !/^[a-z][a-z0-9-]*$/.test(step)) throw new Error("ACCOUNT_PURGE_SCOPE_REQUIRED");
      return db.transaction(async sql => {
        const current = await sql.query<{ payload: Record<string, unknown> | string }>(`select payload from orbit_records
          where workspace_id=$1 and collection_name=$2 and record_id=$3 and user_id=$4 for update`,
        [workspaceId, REQUESTS, requestId(actorId), actorId]);
        const raw = current.rows[0]?.payload;
        const request = typeof raw === "string" ? JSON.parse(raw) as Record<string, unknown> : raw;
        const at = now().toISOString();
        if (request?.status !== "purging" || request.leaseToken !== leaseToken ||
          typeof request.leaseUntil !== "string" || request.leaseUntil <= at) throw new Error("PURGE_LEASE_LOST");
        const id = stepId(actorId, step);
        await sql.query(`insert into orbit_records(workspace_id,collection_name,record_id,user_id,source_type,source_id,payload,created_at,updated_at)
          values($1,$2,$3,$4,'account-rights',$3,'{"version":0,"status":"pending"}'::jsonb,$5,$5) on conflict do nothing`,
        [workspaceId, STEPS, id, actorId, at]);
        const existing = await sql.query<{ payload: AccountPurgeStep | string }>(`select payload from orbit_records
          where workspace_id=$1 and collection_name=$2 and record_id=$3 and user_id=$4 for update`,
        [workspaceId, STEPS, id, actorId]);
        const previous = existing.rows[0] ? payload(existing.rows[0].payload) : null;
        if (previous?.status === "done") return previous;
        const next: AccountPurgeStep = { actorId, step, version: 1, status: "done", completedAt: at, result };
        const saved = await sql.query<{ record_id: string }>(`update orbit_records set payload=$5::jsonb,updated_at=$6::timestamptz
          where workspace_id=$1 and collection_name=$2 and record_id=$3 and user_id=$4 and payload->>'status'='pending'
            and (payload->>'version')::int=0 returning record_id`,
        [workspaceId, STEPS, id, actorId, JSON.stringify(next), at]);
        if (!saved.rows.length) throw new Error("PURGE_PROGRESS_CAS_CONFLICT");
        return next;
      }, { isolation: "read committed" });
    },
  };
}
