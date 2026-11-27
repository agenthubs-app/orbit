import { normalizeAuthEmail } from "../../auth/contract";
import { authUserRecordId } from "../../auth/storage/auth-user-live-record-provider";
import type { TransactionalSqlExecutor } from "../../../shared/storage/transactional-postgres";

/**
 * Shared by the controlled one-account operations (account purge, sign-in email change). They run only from the
 * build-time operator script (scripts/account-ops.ts); nothing under app/ may import this folder (pinned by a test).
 */

/** `a***@domain`: what the operator log shows instead of an address. */
export function maskEmail(email: string | null | undefined): string {
  const value = (email ?? "").trim();
  const at = value.lastIndexOf("@");
  if (at <= 0) return "(none)";
  return `${value[0]}***@${value.slice(at + 1)}`;
}

export interface ControlledAccountTarget {
  userId: string;
  actorId: string;
  email: string;
  authRecordId: string;
}

type AuthRow = { record_id: string; user_id: string | null; lifecycle_state: string; id: string | null; email: string | null };

/**
 * Resolves one sign-in identity from its email. With `userId` the two must name the same account; the actor follows
 * the same profile rule as the session resolver (profile.id = userId, else profile.accountId = userId).
 */
export async function resolveControlledAccountTarget(sql: TransactionalSqlExecutor, workspaceId: string, input: {
  email: string; userId?: string;
}): Promise<ControlledAccountTarget> {
  const email = normalizeAuthEmail(input.email);
  if (!email || !email.includes("@")) throw new Error("TARGET_EMAIL_REQUIRED");
  const authRecordId = authUserRecordId(email);
  const auth = await sql.query<AuthRow>(`select record_id,user_id,lifecycle_state,payload->>'id' as id,payload->>'email' as email
    from orbit_records where workspace_id=$1 and collection_name='auth_users' and record_id=$2`, [workspaceId, authRecordId]);
  if (auth.rows.length !== 1) throw new Error("TARGET_NOT_FOUND");
  const row = auth.rows[0]!;
  if (row.lifecycle_state !== "active" || !row.id || normalizeAuthEmail(row.email ?? "") !== email) throw new Error("TARGET_IDENTITY_INVALID");
  if (input.userId !== undefined && input.userId !== row.id) throw new Error("TARGET_EMAIL_ID_MISMATCH");
  const sameId = await sql.query<{ n: number }>(`select count(*)::int as n from orbit_records where workspace_id=$1
    and collection_name='auth_users' and payload->>'id'=$2`, [workspaceId, row.id]);
  if (sameId.rows[0]?.n !== 1) throw new Error("TARGET_ID_NOT_UNIQUE");
  const profiles = await sql.query<{ actor: string | null; direct: boolean }>(`select coalesce(payload->>'accountId',$2) as actor,
    (payload->>'id')=$2 as direct from orbit_records where workspace_id=$1 and collection_name='profiles'
    and lifecycle_state<>'deleted' and ((payload->>'id')=$2 or (payload->>'accountId')=$2)`, [workspaceId, row.id]);
  const preferred = profiles.rows.some((profile) => profile.direct) ? profiles.rows.filter((profile) => profile.direct) : profiles.rows;
  const actors = [...new Set(preferred.map((profile) => profile.actor).filter((actor): actor is string => Boolean(actor)))];
  if (actors.length !== 1) throw new Error(actors.length ? "TARGET_ACTOR_AMBIGUOUS" : "TARGET_PROFILE_NOT_FOUND");
  return { userId: row.id, actorId: actors[0]!, email, authRecordId };
}

export interface HostRoleCounts {
  canonicalOrganizer: number;
  legacyOrganizer: number;
  activeCohostRoles: number;
}

/** Owner of any event (canonical or legacy record) or an active co-operator role on one. */
export async function countHostRoles(sql: TransactionalSqlExecutor, workspaceId: string, ids: readonly string[]): Promise<HostRoleCounts> {
  const owners = [...new Set(ids)];
  const tableExists = async (table: string) =>
    Boolean((await sql.query<{ found: string | null }>("select to_regclass($1)::text as found", [table])).rows[0]?.found);
  const count = async (statement: string, values: unknown[]) => Number((await sql.query<{ n: number }>(statement, values)).rows[0]?.n ?? 0);
  return {
    canonicalOrganizer: await tableExists("event_ops_events")
      ? await count("select count(*)::int as n from event_ops_events where workspace_id=$1 and organizer_actor_id=any($2::text[])", [workspaceId, owners]) : 0,
    legacyOrganizer: await count(`select count(*)::int as n from orbit_records where workspace_id=$1 and collection_name='events'
      and (user_id=any($2::text[]) or payload->>'accountId'=any($2::text[]))`, [workspaceId, owners]),
    activeCohostRoles: await tableExists("event_ops_event_role_assignment_heads")
      ? await count(`select count(*)::int as n from event_ops_event_role_assignment_heads where workspace_id=$1
        and subject_actor_id=any($2::text[]) and state='active'`, [workspaceId, owners]) : 0,
  };
}

export const isHost = (roles: HostRoleCounts) => roles.canonicalOrganizer + roles.legacyOrganizer + roles.activeCohostRoles > 0;
