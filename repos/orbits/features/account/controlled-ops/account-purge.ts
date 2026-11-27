import { createHash, randomUUID } from "node:crypto";

import type { EventOperationsPostgresClient } from "../../events/event-operations/storage/postgres-client";
import { createPostgresEventAdmissionRepository } from "../../events/admission/storage/postgres-repository";
import { runInControlledAccountOpsScope } from "../data-rights/purge/local-gate";
import { runClaimedAccountPurge } from "../data-rights/purge/runner";
import type { TransactionalPostgresClient, TransactionalSqlExecutor } from "../../../shared/storage/transactional-postgres";
import { countHostRoles, isHost, resolveControlledAccountTarget, type ControlledAccountTarget, type HostRoleCounts } from "./target";

/**
 * One account, fully removed with the product's own purge steps (features/account/data-rights/purge). Stricter than
 * the local runner: email and account id must both be given and match, a dry run is the default, an organizer or
 * co-operator is refused, and it runs only from the build-time operator script. The domain steps are not changed.
 */

const PURGE_LEASE_MS = 30 * 60_000;
const ACTIVE_APPLICATIONS = ["pending_review", "waitlisted", "admitted"];
const ACTOR_COLUMNS = ["actor_id", "subject_actor_id", "organizer_actor_id", "requester_actor_id", "target_actor_id",
  "invited_actor_id", "used_by", "owner_actor_id", "inviter_actor_id", "redeemer_actor_id", "decision_actor_id",
  "created_by_actor_id", "published_by_actor_id", "assigned_by_actor_id", "invited_by", "sent_by", "user_id"];
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

export interface AccountPurgePreview {
  target: Pick<ControlledAccountTarget, "userId" | "actorId">;
  hostRoles: HostRoleCounts;
  /** orbit_records owned by the account (identity collections included), by collection. */
  ownedRecords: Record<string, number>;
  /** Other tables with a row naming the account in an actor column, by table. */
  tableRows: Record<string, number>;
  /** Registrations / intro requests / sign-in exchanges that name the account without owning the row. */
  referencedRecords: Record<string, number>;
  applications: { eventId: string; status: string }[];
  authState: { pendingPasswordReset: boolean; emailVerificationMailed: boolean; deletionRequested: boolean };
  /** Need an outside call (blob erase, Google revoke); this entrypoint refuses to apply while any is non-zero. */
  externalObjects: { cardImages: number; exportFiles: number; integrationTokens: number };
  deletionsInProgress: number;
}

async function readOnly<T>(db: TransactionalPostgresClient, work: (sql: TransactionalSqlExecutor) => Promise<T>): Promise<T> {
  return db.transaction(async (sql) => {
    await sql.query("set transaction read only");
    return work(sql);
  }, { isolation: "serializable" });
}

async function countTables(sql: TransactionalSqlExecutor, workspaceId: string, ids: readonly string[]): Promise<Record<string, number>> {
  const columns = await sql.query<{ table_name: string; column_name: string }>(`select c.table_name,c.column_name
    from information_schema.columns c join information_schema.columns w on w.table_schema=c.table_schema and w.table_name=c.table_name
      and w.column_name='workspace_id'
    join information_schema.tables t on t.table_schema=c.table_schema and t.table_name=c.table_name and t.table_type='BASE TABLE'
    where c.table_schema=current_schema() and c.table_name<>'orbit_records' and c.column_name=any($1::text[])
    and c.data_type in ('text','character varying') order by c.table_name,c.column_name`, [ACTOR_COLUMNS]);
  const byTable = new Map<string, string[]>();
  for (const row of columns.rows) byTable.set(row.table_name, [...(byTable.get(row.table_name) ?? []), row.column_name]);
  const counts: Record<string, number> = {};
  for (const [table, cols] of byTable) {
    const quoted = `"${table.replaceAll('"', '""')}"`;
    const result = await sql.query<{ n: number }>(`select count(*)::int as n from ${quoted} where workspace_id=$1 and (${
      cols.map((col) => `"${col}"=any($2::text[])`).join(" or ")})`, [workspaceId, [...new Set(ids)]]);
    const n = result.rows[0]?.n ?? 0;
    if (n > 0) counts[table] = n;
  }
  return counts;
}

async function readPreview(sql: TransactionalSqlExecutor, workspaceId: string, target: ControlledAccountTarget): Promise<AccountPurgePreview> {
  const ids = [...new Set([target.actorId, target.userId])];
  const owned = await sql.query<{ collection_name: string; n: number }>(`select collection_name,count(*)::int as n from orbit_records
    where workspace_id=$1 and (user_id=any($2::text[]) or (collection_name='auth_users' and record_id=$3))
    group by collection_name order by collection_name`, [workspaceId, ids, target.authRecordId]);
  const referenced = await sql.query<{ kind: string; n: number }>(`select kind,count(*)::int as n from (
      select 'event_registrations (registration.userId)' as kind from orbit_records where workspace_id=$1 and collection_name='event_registrations'
        and user_id is distinct from $2 and payload->'registration'->>'userId'=$2
      union all select 'matchmakingIntroductionRequests' from orbit_records where workspace_id=$1 and collection_name='matchmakingIntroductionRequests'
        and (payload->>'requesterActorId'=$2 or payload->>'targetActorId'=$2 or payload->>'organizerActorId'=$2)
      union all select 'mobile_auth_exchanges' from orbit_records where workspace_id=$1 and collection_name='mobile_auth_exchanges'
        and payload->'user'->>'id'=$3
      union all select 'shared event records mentioning the account' from orbit_records where workspace_id=$1
        and (left(collection_name,5)='event' or collection_name in ('attendees','organizerFollows'))
        and user_id is distinct from $2 and position(to_jsonb($2::text)::text in payload::text)>0
    ) refs group by kind order by kind`, [workspaceId, target.actorId, target.userId]);
  const hasTable = async (table: string) =>
    Boolean((await sql.query<{ found: string | null }>("select to_regclass($1)::text as found", [table])).rows[0]?.found);
  const applications = await hasTable("event_ops_admission_application_heads")
    ? (await sql.query<{ event_id: string; status: string }>(`select event_id,status from event_ops_admission_application_heads
      where workspace_id=$1 and actor_id=$2 order by event_id`, [workspaceId, target.actorId])).rows : [];
  const auth = await sql.query<{ reset: boolean; mailed: boolean; deletion: boolean }>(`select payload ? 'passwordReset' as reset,
    payload ? 'emailVerification' as mailed, coalesce(payload->>'deletionRequestedAt','')<>'' as deletion
    from orbit_records where workspace_id=$1 and collection_name='auth_users' and record_id=$2`, [workspaceId, target.authRecordId]);
  const cardImages = await hasTable("bc_ingest_batches") ? Number((await sql.query<{ n: number }>(`select count(distinct key)::int as n from (
      select i.derivative_object_key as key from bc_ingest_items i join bc_ingest_batches b on b.workspace_id=i.workspace_id and b.id=i.batch_id
        where b.workspace_id=$1 and b.actor_id=$2
      union all select object_key from bc_ingest_raw_uploads where workspace_id=$1 and actor_id=$2
      union all select payload->'item'->>'imagePath' from orbit_records where workspace_id=$1 and user_id=$2 and collection_name='businessCardBatchItems'
    ) keys where key is not null and key<>''`, [workspaceId, target.actorId])).rows[0]?.n ?? 0) : 0;
  const exportFiles = Number((await sql.query<{ n: number }>(`select count(*)::int as n from orbit_records where workspace_id=$1
    and collection_name='account_exports' and user_id=$2 and payload->>'fileKey' is not null`, [workspaceId, target.actorId])).rows[0]?.n ?? 0);
  const integrationTokens = Number((await sql.query<{ n: number }>(`select count(*)::int as n from orbit_records where workspace_id=$1
    and collection_name='integrationTokens' and user_id=$2`, [workspaceId, target.actorId])).rows[0]?.n ?? 0);
  const deletions = await sql.query<{ n: number }>(`select count(*)::int as n from orbit_records where workspace_id=$1
    and collection_name='account_deletion_requests' and payload->>'status' in ('pending','purging')`, [workspaceId]);
  return {
    target: { userId: target.userId, actorId: target.actorId },
    hostRoles: await countHostRoles(sql, workspaceId, ids),
    ownedRecords: Object.fromEntries(owned.rows.map((row) => [row.collection_name, row.n])),
    tableRows: await countTables(sql, workspaceId, ids),
    referencedRecords: Object.fromEntries(referenced.rows.map((row) => [row.kind, row.n])),
    applications: applications.map((row) => ({ eventId: row.event_id, status: row.status })),
    authState: { pendingPasswordReset: auth.rows[0]?.reset === true, emailVerificationMailed: auth.rows[0]?.mailed === true,
      deletionRequested: auth.rows[0]?.deletion === true },
    externalObjects: { cardImages, exportFiles, integrationTokens },
    deletionsInProgress: deletions.rows[0]?.n ?? 0,
  };
}

/** Read-only. Resolves the account by email (and id when given) and counts what a purge would remove. */
export function previewControlledAccountPurge(input: { db: TransactionalPostgresClient; workspaceId: string; email: string; userId?: string }): Promise<AccountPurgePreview> {
  return runInControlledAccountOpsScope(() => readOnly(input.db, async (sql) =>
    readPreview(sql, input.workspaceId, await resolveControlledAccountTarget(sql, input.workspaceId, { email: input.email, userId: input.userId }))));
}

export type ControlledAccountPurgeResult =
  | { kind: "dry-run"; preview: AccountPurgePreview }
  | { kind: "failed"; step: string; reason: string; preview: AccountPurgePreview }
  | { kind: "deleted"; preview: AccountPurgePreview; withdrawnApplications: number; remaining: { ownedRecords: number; authRecord: number; tableRows: Record<string, number> } };

function refuse(reason: string): never { throw new Error(reason); }

/**
 * Dry run unless `apply` is exactly true. With apply: withdraws the account's live event applications through the
 * admission service (so the host's review count drops like a normal cancellation), marks the account as being deleted
 * (sign-in stops at once), then runs the product purge steps for this one account.
 */
export function runControlledAccountPurge(input: {
  db: TransactionalPostgresClient;
  /** Same database; the admission service needs the event-operations client (row counts). */
  eventClient: EventOperationsPostgresClient;
  workspaceId: string;
  email: string;
  userId: string;
  apply?: boolean;
  now?: () => Date;
}): Promise<ControlledAccountPurgeResult> {
  return runInControlledAccountOpsScope(async () => {
    const { db, workspaceId } = input;
    if (!input.userId?.trim()) refuse("TARGET_ID_REQUIRED");
    if (!input.email?.trim()) refuse("TARGET_EMAIL_REQUIRED");
    const now = input.now ?? (() => new Date());
    const target = await readOnly(db, (sql) => resolveControlledAccountTarget(sql, workspaceId, { email: input.email, userId: input.userId }));
    const preview = await readOnly(db, (sql) => readPreview(sql, workspaceId, target));
    if (isHost(preview.hostRoles)) refuse("TARGET_IS_EVENT_HOST_OR_COHOST");
    if (input.apply !== true) return { kind: "dry-run", preview };
    const { cardImages, exportFiles, integrationTokens } = preview.externalObjects;
    if (cardImages + exportFiles + integrationTokens > 0) refuse("TARGET_HAS_EXTERNAL_OBJECTS");

    // 1. Live applications: the product's own withdrawal (audit row, waitlist promotion when a seat frees up).
    const admission = createPostgresEventAdmissionRepository({ client: input.eventClient, workspaceId });
    let withdrawnApplications = 0;
    for (const application of preview.applications.filter((row) => ACTIVE_APPLICATIONS.includes(row.status))) {
      const current = await admission.getApplication(application.eventId, target.actorId);
      if (!current || !ACTIVE_APPLICATIONS.includes(current.status)) continue;
      await admission.withdrawApplication({ actorId: target.actorId, eventId: application.eventId, expectedApplicationVersion: current.applicationVersion });
      withdrawnApplications += 1;
    }

    // 2. The deletion request for exactly this account, claimed as purging (same record the product writes).
    const leaseToken = randomUUID();
    await db.transaction(async (sql) => {
      const at = now().toISOString();
      const id = `deletion:${hash(target.actorId)}`;
      await sql.query(`insert into orbit_records (workspace_id,collection_name,record_id,user_id,source_type,source_id,payload,created_at,updated_at)
        values ($1,'account_deletion_locks',$2,$3,'account-rights',$2,'{"version":0}'::jsonb,$4,$4) on conflict do nothing`, [workspaceId, id, target.actorId, at]);
      await sql.query(`select record_id from orbit_records where workspace_id=$1 and collection_name='account_deletion_locks'
        and record_id=$2 and user_id=$3 for update`, [workspaceId, id, target.actorId]);
      const existing = await sql.query<{ payload: Record<string, unknown> | string }>(`select payload from orbit_records where workspace_id=$1
        and collection_name='account_deletion_requests' and record_id=$2 and user_id=$3 for update`, [workspaceId, id, target.actorId]);
      const raw = existing.rows[0]?.payload;
      const previous = typeof raw === "string" ? JSON.parse(raw) as Record<string, unknown> : raw;
      if (previous?.status === "deleted") refuse("TARGET_ALREADY_DELETED");
      if (previous && previous.userId !== target.userId) refuse("TARGET_DELETION_REQUEST_MISMATCH");
      const version = typeof previous?.version === "number" ? previous.version : 0;
      const record = { id, actorId: target.actorId, userId: target.userId, status: "purging",
        requestedAt: typeof previous?.requestedAt === "string" ? previous.requestedAt : at, purgeAfter: at,
        reauthAt: typeof previous?.reauthAt === "string" ? previous.reauthAt : at, startedAt: at, operator: "controlled-account-ops",
        leaseToken, leaseUntil: new Date(now().getTime() + PURGE_LEASE_MS).toISOString(), version: version + 1 };
      if (previous) {
        const saved = await sql.query(`update orbit_records set payload=$4::jsonb,updated_at=$5::timestamptz where workspace_id=$1
          and collection_name='account_deletion_requests' and record_id=$2 and user_id=$3 and (payload->>'version')::int=$6 returning record_id`,
        [workspaceId, id, target.actorId, JSON.stringify(record), at, version]);
        if (saved.rows.length !== 1) refuse("DELETION_CAS_CONFLICT");
      } else {
        await sql.query(`insert into orbit_records (workspace_id,collection_name,record_id,user_id,source_type,source_id,payload,created_at,updated_at)
          values ($1,'account_deletion_requests',$2,$3,'account-rights',$2,$4::jsonb,$5,$5)`, [workspaceId, id, target.actorId, JSON.stringify(record), at]);
      }
      const revoked = await sql.query(`update orbit_records set payload=jsonb_set(payload,'{deletionRequestedAt}',
          to_jsonb(coalesce(nullif(payload->>'deletionRequestedAt',''),$4::text))),updated_at=$4::timestamptz
        where workspace_id=$1 and collection_name='auth_users' and record_id=$2 and payload->>'id'=$3 and lifecycle_state='active'
        returning record_id`, [workspaceId, target.authRecordId, target.userId, at]);
      if (revoked.rows.length !== 1) refuse("DELETION_AUTH_IDENTITY_UNAVAILABLE");
    }, { isolation: "read committed" });

    // 3. The product purge steps. Outside calls were ruled out above, so any attempt fails closed.
    const unavailable = async () => refuse("EXTERNAL_OBJECT_CALL_NOT_ALLOWED");
    const result = await runClaimedAccountPurge({
      db, workspaceId, now,
      storage: { delete: unavailable }, eraseObject: unavailable, revokeToken: unavailable,
      // The completion notice is not mailed by this operator path; the queued row is removed as delivered.
      sendCompletion: async () => undefined,
    }, { actorId: target.actorId, userId: target.userId, leaseToken });
    if (result.kind === "failed") return { ...result, preview };

    const remaining = await readOnly(db, async (sql) => ({
      ownedRecords: Number((await sql.query<{ n: number }>(`select count(*)::int as n from orbit_records where workspace_id=$1
        and user_id=any($2::text[])`, [workspaceId, [target.actorId, target.userId]])).rows[0]?.n ?? 0),
      authRecord: Number((await sql.query<{ n: number }>(`select count(*)::int as n from orbit_records where workspace_id=$1
        and collection_name='auth_users' and (record_id=$2 or payload->>'id'=$3)`, [workspaceId, target.authRecordId, target.userId])).rows[0]?.n ?? 0),
      tableRows: await countTables(sql, workspaceId, [target.actorId, target.userId]),
    }));
    return { kind: "deleted", preview, withdrawnApplications, remaining };
  });
}
