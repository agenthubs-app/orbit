import { createHash } from "node:crypto";

import { compare } from "bcryptjs";

import { authUserRecordId } from "../../auth/storage/auth-user-live-record-provider";
import type { TransactionalPostgresClient } from "../../../shared/storage/transactional-postgres";

const LIMITS = "account_reauth_limits";
const WINDOW_MILLIS = 15 * 60_000;
const MAX_FAILURES = 5;

export function createPasswordDeletionReauth({ db, workspaceId, now = () => new Date() }: {
  db: TransactionalPostgresClient;
  workspaceId: string;
  now?: () => Date;
}) {
  return async (actorId: string, userId: string, email: string, password: string): Promise<"verified" | "invalid" | "limited"> => {
    if (!actorId || !userId || !email || !password || Buffer.byteLength(password, "utf8") > 72) return "invalid";
    return db.transaction(async sql => {
      const at = now().toISOString();
      const id = `reauth-limit:${createHash("sha256").update(actorId).digest("hex")}`;
      await sql.query(`insert into orbit_records (workspace_id,collection_name,record_id,user_id,source_type,source_id,payload,created_at,updated_at)
        values ($1,$2,$3,$4,'account-rights',$3,$5::jsonb,$6,$6) on conflict do nothing`, [workspaceId, LIMITS, id, actorId,
        JSON.stringify({ windowStartedAt: at, failures: 0, version: 0 }), at]);
      const state = await sql.query<{ payload: { windowStartedAt: string; failures: number; version: number } | string }>(`select payload from orbit_records
        where workspace_id=$1 and collection_name=$2 and record_id=$3 and user_id=$4 for update`, [workspaceId, LIMITS, id, actorId]);
      const raw = state.rows[0]?.payload;
      if (!raw) throw new Error("REAUTH_LIMIT_UNAVAILABLE");
      const prior = typeof raw === "string" ? JSON.parse(raw) as { windowStartedAt: string; failures: number; version: number } : raw;
      const freshWindow = now().getTime() - Date.parse(prior.windowStartedAt) >= WINDOW_MILLIS;
      const failures = freshWindow ? 0 : prior.failures;
      if (failures >= MAX_FAILURES) return "limited";
      const authUser = await sql.query<{ payload: Record<string, unknown> | string }>(`select payload from orbit_records
        where workspace_id=$1 and collection_name='auth_users' and record_id=$2 and lifecycle_state='active' limit 1`,
      [workspaceId, authUserRecordId(email)]);
      const userPayload = authUser.rows[0]?.payload;
      const user = typeof userPayload === "string" ? JSON.parse(userPayload) as Record<string, unknown> : userPayload;
      const verified = user?.id === userId && user.provider === "credentials" && typeof user.passwordHash === "string" &&
        await compare(password, user.passwordHash);
      const next = { windowStartedAt: freshWindow ? at : prior.windowStartedAt, failures: verified ? 0 : failures + 1, version: prior.version + 1 };
      const saved = await sql.query<{ record_id: string }>(`update orbit_records set payload=$5::jsonb,updated_at=$6::timestamptz
        where workspace_id=$1 and collection_name=$2 and record_id=$3 and user_id=$4 and (payload->>'version')::int=$7 returning record_id`,
      [workspaceId, LIMITS, id, actorId, JSON.stringify(next), at, prior.version]);
      if (!saved.rows.length) throw new Error("REAUTH_LIMIT_CONFLICT");
      return verified ? "verified" : "invalid";
    }, { isolation: "read committed" });
  };
}
