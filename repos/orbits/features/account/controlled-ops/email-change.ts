import { createHash } from "node:crypto";

import { normalizeAuthEmail } from "../../auth/contract";
import { authUserRecordId } from "../../auth/storage/auth-user-live-record-provider";
import { acquireSyncCommitOrderLock } from "../../sync/commit-order-lock";
import { runInControlledAccountOpsScope } from "../data-rights/purge/local-gate";
import type { TransactionalPostgresClient, TransactionalSqlExecutor } from "../../../shared/storage/transactional-postgres";
import { countHostRoles, maskEmail, resolveControlledAccountTarget, type HostRoleCounts } from "./target";

/**
 * Moves one account's sign-in identity to a new email. There is no product flow for this; the sign-in row is keyed by
 * its email (auth_user:<email>), so the row is re-keyed in one transaction:
 * - same account id, password hash, provider, consents and migration marker;
 * - email verification starts over (the new address is unproven), the pending reset link and verification mail die;
 * - sessions issued for the old email stop (every session check reads auth_user:<email of the session>).
 * Mentions of the address elsewhere (other people's contact cards, the account's own contact methods) are reported,
 * not rewritten: they are content the people wrote, not the sign-in identity.
 */

export interface EmailCandidate {
  userId: string;
  actorId: string | null;
  maskedEmail: string;
  displayName: string | null;
  provider: string | null;
  migrated: boolean;
  hasPassword: boolean;
  mustChangePassword: boolean;
  emailVerified: boolean;
  createdAt: string | null;
  passwordChangedAt: string | null;
  deletionRequested: boolean;
  hostRoles: HostRoleCounts;
}

export interface EmailChangePreview {
  candidates: EmailCandidate[];
  /** Any sign-in row already using the new address (any state), or another row whose payload email is it. */
  newEmailTaken: boolean;
  /** For the single candidate: rows that mention the old address, by collection and whether the account owns them. */
  oldEmailMentions: Record<string, number>;
  /** Unused co-host invitations addressed to the old email (bound to it by hash). */
  openCohostInvitesForOldEmail: number;
}

async function readOnly<T>(db: TransactionalPostgresClient, work: (sql: TransactionalSqlExecutor) => Promise<T>): Promise<T> {
  return db.transaction(async (sql) => {
    await sql.query("set transaction read only");
    return work(sql);
  }, { isolation: "serializable" });
}

const sha = (value: string) => createHash("sha256").update(value).digest("hex");

async function isTaken(sql: TransactionalSqlExecutor, workspaceId: string, email: string): Promise<boolean> {
  const result = await sql.query(`select 1 from orbit_records where workspace_id=$1 and collection_name='auth_users'
    and (record_id=$2 or lower(trim(payload->>'email'))=$3) limit 1`, [workspaceId, authUserRecordId(email), email]);
  return result.rows.length > 0;
}

async function mentions(sql: TransactionalSqlExecutor, workspaceId: string, email: string, owners: readonly string[]): Promise<Record<string, number>> {
  const rows = await sql.query<{ collection_name: string; own: boolean; n: number }>(`select collection_name, user_id=any($3::text[]) as own,
    count(*)::int as n from orbit_records where workspace_id=$1 and collection_name<>'auth_users' and lifecycle_state<>'deleted'
    and position($2 in lower(payload::text))>0 group by 1,2 order by 1,2`, [workspaceId, email, owners]);
  return Object.fromEntries(rows.rows.map((row) => [`${row.collection_name} (${row.own ? "own" : "others"})`, row.n]));
}

async function openInvites(sql: TransactionalSqlExecutor, workspaceId: string, email: string): Promise<number> {
  const exists = (await sql.query<{ found: string | null }>("select to_regclass('event_cohost_invites')::text as found")).rows[0]?.found;
  if (!exists) return 0;
  const result = await sql.query<{ n: number }>(`select count(*)::int as n from event_cohost_invites where workspace_id=$1
    and invited_email_hash=$2 and used_at is null and revoked_at is null and expires_at>now()`, [workspaceId, sha(email)]);
  return result.rows[0]?.n ?? 0;
}

/** Read-only. Finds accounts whose sign-in or profile name contains `name` and checks the new address is free. */
export function previewControlledEmailChange(input: { db: TransactionalPostgresClient; workspaceId: string; name: string; newEmail: string }): Promise<EmailChangePreview> {
  return runInControlledAccountOpsScope(() => readOnly(input.db, async (sql) => {
    const { workspaceId } = input;
    const name = input.name.trim();
    if (name.length < 2) throw new Error("NAME_TOO_SHORT");
    const newEmail = normalizeAuthEmail(input.newEmail);
    const found = await sql.query<{ id: string; email: string; payload: Record<string, unknown> }>(`with matched as (
        select payload->>'id' as id from orbit_records where workspace_id=$1 and collection_name='auth_users' and lifecycle_state='active'
          and position($2 in coalesce(payload->>'displayName',''))>0
        union select coalesce(payload->>'id',payload->>'accountId') from orbit_records where workspace_id=$1 and collection_name='profiles'
          and lifecycle_state<>'deleted' and (position($2 in coalesce(payload->>'displayName',''))>0 or position($2 in coalesce(payload->>'name',''))>0)
        union select u.payload->>'id' from orbit_records p join orbit_records u on u.workspace_id=p.workspace_id and u.collection_name='auth_users'
          and (u.payload->>'id'=p.payload->>'id' or u.payload->>'id'=p.payload->>'accountId')
          where p.workspace_id=$1 and p.collection_name='profiles' and p.lifecycle_state<>'deleted'
          and (position($2 in coalesce(p.payload->>'displayName',''))>0 or position($2 in coalesce(p.payload->>'name',''))>0))
      select u.payload->>'id' as id, u.payload->>'email' as email, u.payload - 'passwordHash' - 'passwordReset' - 'emailVerification' as payload
      from orbit_records u where u.workspace_id=$1 and u.collection_name='auth_users' and u.lifecycle_state='active'
        and u.payload->>'id' in (select id from matched where id is not null) order by u.created_at`, [workspaceId, name]);
    const hashes = await sql.query<{ id: string; has_password: boolean }>(`select payload->>'id' as id, coalesce(payload->>'passwordHash','')<>'' as has_password
      from orbit_records where workspace_id=$1 and collection_name='auth_users' and payload->>'id'=any($2::text[])`, [workspaceId, found.rows.map((row) => row.id)]);
    const candidates: EmailCandidate[] = [];
    for (const row of found.rows) {
      let actorId: string | null = null;
      try { actorId = (await resolveControlledAccountTarget(sql, workspaceId, { email: row.email, userId: row.id })).actorId; }
      catch { actorId = null; }
      const payload = row.payload;
      const text = (key: string) => (typeof payload[key] === "string" && payload[key] !== "" ? payload[key] as string : null);
      candidates.push({ userId: row.id, actorId, maskedEmail: maskEmail(row.email), displayName: text("displayName"),
        provider: text("provider"), migrated: Boolean(text("migratedFrom")), hasPassword: hashes.rows.find((h) => h.id === row.id)?.has_password === true,
        mustChangePassword: payload.mustChangePassword === true, emailVerified: Boolean(text("emailVerifiedAt")) || payload.provider === "google",
        createdAt: text("createdAt"), passwordChangedAt: text("passwordChangedAt"), deletionRequested: Boolean(text("deletionRequestedAt")),
        hostRoles: await countHostRoles(sql, workspaceId, [row.id, ...(actorId ? [actorId] : [])]) });
    }
    const single = found.rows.length === 1 ? found.rows[0]! : null;
    const owners = single ? [single.id, ...(candidates[0]?.actorId ? [candidates[0].actorId] : [])] : [];
    return {
      candidates,
      newEmailTaken: await isTaken(sql, workspaceId, newEmail),
      oldEmailMentions: single ? await mentions(sql, workspaceId, normalizeAuthEmail(single.email), owners) : {},
      openCohostInvitesForOldEmail: single ? await openInvites(sql, workspaceId, normalizeAuthEmail(single.email)) : 0,
    };
  }));
}

export type ControlledEmailChangeResult =
  | { kind: "dry-run"; userId: string; actorId: string; from: string; to: string; profileContactEmailMatches: number }
  | { kind: "changed"; userId: string; actorId: string; from: string; to: string; profileContactEmailMatches: number; profileContactEmailChanged: number };

/**
 * Dry run unless `apply` is exactly true. Old email, new email and account id must all be given and agree.
 * Returns masked addresses only.
 */
export function runControlledEmailChange(input: {
  db: TransactionalPostgresClient;
  workspaceId: string;
  userId: string;
  fromEmail: string;
  toEmail: string;
  /** Also move the account's own profile contact email (profile.handles.email) when it is the old address. */
  alsoProfileContactEmail?: boolean;
  apply?: boolean;
  now?: () => Date;
}): Promise<ControlledEmailChangeResult> {
  return runInControlledAccountOpsScope(async () => {
    const { db, workspaceId } = input;
    if (!input.userId?.trim()) throw new Error("TARGET_ID_REQUIRED");
    const from = normalizeAuthEmail(input.fromEmail ?? "");
    const to = normalizeAuthEmail(input.toEmail ?? "");
    if (!from.includes("@") || !to.includes("@") || /\s/u.test(to)) throw new Error("EMAIL_REQUIRED");
    if (from === to) throw new Error("EMAIL_UNCHANGED");
    const now = (input.now ?? (() => new Date()))().toISOString();
    const run = async (sql: TransactionalSqlExecutor) => {
      const target = await resolveControlledAccountTarget(sql, workspaceId, { email: from, userId: input.userId });
      if (await isTaken(sql, workspaceId, to)) throw new Error("NEW_EMAIL_TAKEN");
      const contact = await sql.query<{ n: number }>(`select count(*)::int as n from orbit_records where workspace_id=$1
        and collection_name='profiles' and user_id=$2 and lifecycle_state<>'deleted' and lower(trim(payload->'handles'->>'email'))=$3`,
      [workspaceId, target.actorId, from]);
      const masked = { userId: target.userId, actorId: target.actorId, from: maskEmail(from), to: maskEmail(to),
        profileContactEmailMatches: contact.rows[0]?.n ?? 0 };
      if (input.alsoProfileContactEmail === true && masked.profileContactEmailMatches !== 1) throw new Error("PROFILE_CONTACT_EMAIL_NOT_UNIQUE");
      if (input.apply !== true) return { kind: "dry-run" as const, ...masked };
      await acquireSyncCommitOrderLock(sql);
      const locked = await sql.query(`select record_id from orbit_records where workspace_id=$1 and collection_name='auth_users'
        and record_id=$2 and payload->>'id'=$3 and lifecycle_state='active' for update`, [workspaceId, target.authRecordId, target.userId]);
      if (locked.rows.length !== 1) throw new Error("TARGET_IDENTITY_CHANGED");
      const moved = await sql.query(`insert into orbit_records select (jsonb_populate_record(null::orbit_records, to_jsonb(r) || jsonb_build_object(
          'record_id', $4::text, 'search_text', $5::text, 'updated_at', $6::text,
          'payload', (r.payload - 'emailVerifiedAt' - 'emailVerification' - 'passwordReset')
            || jsonb_build_object('email', $5::text, 'updatedAt', $6::text, 'emailChangedAt', $6::text)))).*
        from orbit_records r where r.workspace_id=$1 and r.collection_name='auth_users' and r.record_id=$2 and r.payload->>'id'=$3
        returning record_id`, [workspaceId, target.authRecordId, target.userId, authUserRecordId(to), to, now]);
      if (moved.rows.length !== 1) throw new Error("EMAIL_MOVE_FAILED");
      const removed = await sql.query(`delete from orbit_records where workspace_id=$1 and collection_name='auth_users' and record_id=$2
        and payload->>'id'=$3 returning record_id`, [workspaceId, target.authRecordId, target.userId]);
      if (removed.rows.length !== 1) throw new Error("EMAIL_MOVE_FAILED");
      let profileContactEmailChanged = 0;
      if (input.alsoProfileContactEmail === true) {
        const updated = await sql.query(`update orbit_records set payload=jsonb_set(payload,'{handles,email}',to_jsonb($4::text)),
            search_text=replace(coalesce(search_text,''),payload->'handles'->>'email',$4::text),updated_at=$5::timestamptz
          where workspace_id=$1 and collection_name='profiles' and user_id=$2 and lifecycle_state<>'deleted'
            and lower(trim(payload->'handles'->>'email'))=$3 returning record_id`, [workspaceId, target.actorId, from, to, now]);
        profileContactEmailChanged = updated.rows.length;
        if (profileContactEmailChanged !== 1) throw new Error("PROFILE_CONTACT_EMAIL_NOT_UNIQUE");
      }
      return { kind: "changed" as const, ...masked, profileContactEmailChanged };
    };
    return input.apply === true
      ? db.transaction(run, { isolation: "serializable" })
      : readOnly(db, run);
  });
}
