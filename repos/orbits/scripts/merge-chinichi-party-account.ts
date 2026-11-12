/**
 * 2026-11-12 one-off data fix (user request): the four imported 「中日创业交流会」 events were
 * imported from party-app with the user's party-app account as an opaque actor
 * (`party-app:account:be2b…`). That one actor is both the organizer of all four events and an
 * attendee (membership + profile + check-in) of each. The user's Orbit login for the same email
 * is `user_mvsxuw18_e5ofbg`. This moves the party-app actor onto the Orbit login:
 *
 *   - event_ops_events.organizer_actor_id → Orbit login (per event: event_version / revision + 1
 *     and one new event_event_versions row, same write path as the host lifecycle's setEvent);
 *   - attendee rows (membership versions / heads, profile versions / heads, check-ins) → Orbit login.
 *
 * Left as history on purpose: event_ops_audit_log (who did what at the time) and the older
 * event_event_versions rows. The organizer display name stays the payload's organizerName
 * (日中创新创业协会), which the user wants to differ from the attendee name.
 *
 * Guards (any failure aborts the whole transaction): the email's auth user is the expected id; the
 * Orbit login has no rows of its own in the four events; the party-app actor is referenced only by
 * the expected tables and only inside the four events; nobody follows the old organizer key.
 *
 *   npx tsx scripts/merge-chinichi-party-account.ts              # dry run (read-only plan)
 *   npx tsx scripts/merge-chinichi-party-account.ts --rollback   # write in a transaction, verify, roll back
 *   npx tsx scripts/merge-chinichi-party-account.ts --apply      # write
 */
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

import { createEventOperationsPostgresClient, type EventOperationsSqlExecutor } from "../features/events/event-operations/storage/postgres-client";
import { organizerKeyFor } from "../features/events/journey/live-mapping";
import { acquireSyncCommitOrderLock } from "../features/sync/commit-order-lock";
import { resolveLiveDatabaseConnectionConfig } from "../shared/storage/live-database-config";
import { TARGETS } from "./fix-chinichi-startup-event-details";
import { loadLocalEnv } from "./load-local-env";

export const OLD_ACTOR = "party-app:account:be2b0327-cce9-4cff-a0a7-9edb4ecccf41";
export const NEW_ACTOR = "user_mvsxuw18_e5ofbg";
export const EMAIL = "cherlytae@gmail.com";
export const EVENT_IDS = Object.keys(TARGETS);

/** Where the party-app actor may appear; anything else aborts. `moved` ones are rewritten, the rest stay as history. */
export const EXPECTED_REFS: Readonly<Record<string, "moved" | "history">> = {
  "event_ops_events.organizer_actor_id": "moved",
  "event_ops_membership_versions.actor_id": "moved",
  "event_ops_membership_heads.actor_id": "moved",
  "event_ops_profile_versions.actor_id": "moved",
  "event_ops_profile_heads.actor_id": "moved",
  "event_ops_checkins.actor_id": "moved",
  "event_ops_audit_log.actor_id": "history",
  "event_event_versions.organizer_actor_id": "history",
};

const ACTOR_COLUMN = /(^|_)(actor|account|user|owner|host|inviter|invitee|redeemer|subject|sender)(_[a-z]+)*_id$|^used_by$|^undone_by$|^owner_id$/u;

class Rollback extends Error {}

export async function refCounts(sql: EventOperationsSqlExecutor, actor: string) {
  const cols = await sql.query<{ table_name: string; column_name: string }>(
    `select c.table_name, c.column_name from information_schema.columns c join information_schema.tables t on t.table_schema=c.table_schema and t.table_name=c.table_name
      where c.table_schema='public' and t.table_type='BASE TABLE' and c.data_type in ('text','character varying')`);
  const counts: Record<string, { total: number; outsideEvents: number | null }> = {};
  for (const c of cols.rows.filter((r) => ACTOR_COLUMN.test(r.column_name))) {
    const hasEvent = (await sql.query<{ n: string }>(`select count(*)::text n from information_schema.columns where table_schema='public' and table_name=$1 and column_name='event_id'`, [c.table_name])).rows[0]?.n === "1";
    const r = await sql.query<{ total: string; outside: string | null }>(
      `select count(*)::text total, ${hasEvent ? `count(*) filter (where event_id <> all($2::text[]))::text` : "null"} outside from "${c.table_name}" where "${c.column_name}" = $1`, hasEvent ? [actor, EVENT_IDS] : [actor]);
    const total = Number(r.rows[0]?.total ?? 0);
    if (total > 0) counts[`${c.table_name}.${c.column_name}`] = { total, outsideEvents: r.rows[0]?.outside == null ? null : Number(r.rows[0].outside) };
  }
  return counts;
}

async function guards(sql: EventOperationsSqlExecutor, workspaceId: string) {
  const auth = await sql.query<{ id: string }>(`select payload->>'id' id from orbit_records where workspace_id=$1 and collection_name='auth_users' and lower(payload->>'email')=$2 and lifecycle_state='active'`, [workspaceId, EMAIL]);
  if (auth.rows.length !== 1 || auth.rows[0]!.id !== NEW_ACTOR) throw new Error(`GUARD_AUTH_USER:${JSON.stringify(auth.rows)}`);
  const own = await sql.query<{ n: string }>(
    `select ((select count(*) from event_ops_membership_heads where workspace_id=$1 and event_id = any($2::text[]) and actor_id=$3)
           + (select count(*) from event_ops_membership_versions where workspace_id=$1 and event_id = any($2::text[]) and actor_id=$3)
           + (select count(*) from event_ops_profile_heads where workspace_id=$1 and event_id = any($2::text[]) and actor_id=$3)
           + (select count(*) from event_ops_checkins where workspace_id=$1 and event_id = any($2::text[]) and actor_id=$3))::text n`, [workspaceId, EVENT_IDS, NEW_ACTOR]);
  if (own.rows[0]?.n !== "0") throw new Error(`GUARD_NEW_ACTOR_ALREADY_IN_EVENTS:${own.rows[0]?.n}`);
  const events = await sql.query<{ event_id: string; title: string; organizer_actor_id: string }>(`select event_id, title, organizer_actor_id from event_ops_events where workspace_id=$1 and event_id = any($2::text[])`, [workspaceId, EVENT_IDS]);
  for (const id of EVENT_IDS) {
    const e = events.rows.find((r) => r.event_id === id);
    if (!e || e.title.trim() !== TARGETS[id]!.title || e.organizer_actor_id !== OLD_ACTOR) throw new Error(`GUARD_EVENT:${id}:${JSON.stringify(e ?? null)}`);
  }
  const refs = await refCounts(sql, OLD_ACTOR);
  for (const [key, value] of Object.entries(refs)) {
    if (!EXPECTED_REFS[key]) throw new Error(`GUARD_UNEXPECTED_REF:${key}:${value.total}`);
    if (value.outsideEvents) throw new Error(`GUARD_REF_OUTSIDE_EVENTS:${key}:${value.outsideEvents}`);
  }
  const oldKey = organizerKeyFor(OLD_ACTOR)!;
  const follows = await sql.query<{ n: string }>(`select count(*)::text n from orbit_records where workspace_id=$1 and collection_name='organizerFollows' and (record_id like '%' || $2 || '%' or payload::text like '%' || $2 || '%' or payload::text like '%' || $3 || '%')`, [workspaceId, oldKey, OLD_ACTOR]);
  if (follows.rows[0]?.n !== "0") throw new Error(`GUARD_OLD_ORGANIZER_FOLLOWED:${follows.rows[0]?.n}`);
  return { refs, oldOrganizerKey: oldKey, newOrganizerKey: organizerKeyFor(NEW_ACTOR) };
}

async function moveAttendee(sql: EventOperationsSqlExecutor, workspaceId: string) {
  // The sync owner guard refuses moving a membership head to another actor (the old owner's devices
  // would keep a stale copy). So, like the data-rights purge: delete the old actor's heads (check-ins
  // first, they reference the heads), re-own the version / profile rows, then insert fresh heads and
  // check-ins for the Orbit login with revision + 1 — inserts take new sync revisions, so the login's
  // devices hear about them. The party-app actor has no login, hence no devices holding the old rows.
  const scope = [workspaceId, EVENT_IDS, OLD_ACTOR] as const;
  const checkins = await sql.query<{ data: Record<string, unknown> }>(`delete from event_ops_checkins where workspace_id=$1 and event_id = any($2::text[]) and actor_id=$3 returning to_jsonb(event_ops_checkins) as data`, scope);
  const heads = await sql.query<{ data: Record<string, unknown> }>(`delete from event_ops_membership_heads where workspace_id=$1 and event_id = any($2::text[]) and actor_id=$3 returning to_jsonb(event_ops_membership_heads) as data`, scope);
  const count = async (text: string) => (await sql.query<{ n: string }>(`with x as (${text} returning 1) select count(*)::text n from x`, [...scope, NEW_ACTOR])).rows[0]!.n;
  const mv = await count(`update event_ops_membership_versions set actor_id=$4 where workspace_id=$1 and event_id = any($2::text[]) and actor_id=$3`);
  const pv = await count(`update event_ops_profile_versions set actor_id=$4 where workspace_id=$1 and event_id = any($2::text[]) and actor_id=$3`);
  const ph = await count(`update event_ops_profile_heads set actor_id=$4, revision=revision+1, updated_at=now() where workspace_id=$1 and event_id = any($2::text[]) and actor_id=$3`);
  const reowned = (row: Record<string, unknown>, touchUpdatedAt: boolean) => ({ ...row, actor_id: NEW_ACTOR, revision: Number(row.revision) + 1, ...(touchUpdatedAt ? { updated_at: new Date().toISOString() } : {}) });
  for (const row of heads.rows) await sql.query(`insert into event_ops_membership_heads select * from jsonb_populate_record(null::event_ops_membership_heads, $1::jsonb)`, [JSON.stringify(reowned(row.data, true))]);
  for (const row of checkins.rows) await sql.query(`insert into event_ops_checkins select * from jsonb_populate_record(null::event_ops_checkins, $1::jsonb)`, [JSON.stringify(reowned(row.data, false))]);
  return { membershipHeads: heads.rows.length, checkins: checkins.rows.length, membershipVersions: Number(mv), profileVersions: Number(pv), profileHeads: Number(ph) };
}

async function moveOrganizer(sql: EventOperationsSqlExecutor, workspaceId: string, eventId: string) {
  const found = await sql.query<{ event_version: string }>(`select event_version::text from event_ops_events where workspace_id=$1 and event_id=$2 and organizer_actor_id=$3 for update`, [workspaceId, eventId, OLD_ACTOR]);
  const version = Number(found.rows[0]?.event_version);
  if (!found.rows[0]) throw new Error(`ORGANIZER_NOT_OLD:${eventId}`);
  const updated = await sql.query<{ event_version: string; source_payload: unknown; title: string | null; description: string | null; venue: string | null; starts_at: unknown; ends_at: unknown; lifecycle_state_v2: string | null; organizer_actor_id: string; public_code: string | null; timezone: string | null }>(
    `update event_ops_events set organizer_actor_id=$3, event_version=event_version+1, revision=revision+1, updated_at=now()
      where workspace_id=$1 and event_id=$2 and event_version=$4
      returning event_version::text, source_payload, title, description, venue, starts_at, ends_at, lifecycle_state_v2, organizer_actor_id, public_code, timezone`,
    [workspaceId, eventId, NEW_ACTOR, version]);
  const saved = updated.rows[0];
  if (!saved) throw new Error(`VERSION_CONFLICT:${eventId}`);
  const iso = (value: unknown) => (value instanceof Date ? value.toISOString() : value == null ? null : new Date(String(value)).toISOString());
  const contentHash = createHash("sha256").update(JSON.stringify({ description: saved.description, endsAt: iso(saved.ends_at), eventId, lifecycle: saved.lifecycle_state_v2, organizerActorId: saved.organizer_actor_id, payload: saved.source_payload, publicCode: saved.public_code, startsAt: iso(saved.starts_at), timezone: saved.timezone, title: saved.title, venue: saved.venue })).digest("hex");
  await sql.query(
    `insert into event_event_versions (
       workspace_id, event_id, event_version, public_code, title, description, venue, timezone, starts_at, ends_at,
       lifecycle_state_v2, source_payload, cancelled_at, archived_at, organizer_actor_id, content_hash, created_at
     ) select workspace_id, event_id, event_version, public_code, title, description, venue, timezone, starts_at, ends_at,
              lifecycle_state_v2, source_payload, cancelled_at, archived_at, organizer_actor_id, $3, now()
       from event_ops_events where workspace_id=$1 and event_id=$2`,
    [workspaceId, eventId, contentHash]);
  return { eventId, fromVersion: version, toVersion: Number(saved.event_version) };
}

async function main(argv: readonly string[]) {
  loadLocalEnv();
  const apply = argv.includes("--apply");
  const rollback = argv.includes("--rollback");
  if (apply && rollback) throw new Error("USAGE: --apply and --rollback are exclusive");
  const config = resolveLiveDatabaseConnectionConfig();
  if (!config) throw new Error("DATABASE_UNCONFIGURED");
  const client = createEventOperationsPostgresClient({ connectionString: config.connectionString, max: 1 });
  const out: Record<string, unknown> = { mode: apply ? "APPLY" : rollback ? "ROLLBACK" : "DRY_RUN" };
  try {
    try {
      await client.transaction(async (sql) => {
        if (!apply && !rollback) await sql.query("set transaction read only");
        else await acquireSyncCommitOrderLock(sql);
        out.before = await guards(sql, config.workspaceId);
        if (!apply && !rollback) return;
        out.attendee = await moveAttendee(sql, config.workspaceId);
        out.organizer = [];
        for (const id of EVENT_IDS) (out.organizer as unknown[]).push(await moveOrganizer(sql, config.workspaceId, id));
        const after = await refCounts(sql, OLD_ACTOR);
        for (const [key, kind] of Object.entries(EXPECTED_REFS)) if (kind === "moved" && after[key]) throw new Error(`VERIFY_LEFTOVER:${key}:${after[key]!.total}`);
        out.afterOld = after;
        out.afterNew = Object.fromEntries(Object.entries(await refCounts(sql, NEW_ACTOR)).filter(([k]) => k.startsWith("event_")));
        if (rollback) throw new Rollback();
      });
    } catch (error) {
      if (!(error instanceof Rollback)) throw error;
      out.rolledBack = true;
    }
    console.info(`chinichi-party-account-merge ${out.mode} ${JSON.stringify(out)}`);
  } finally {
    await client.close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(`chinichi-party-account-merge FAILED ${error instanceof Error ? error.message : "unknown"}`);
    process.exitCode = 1;
  });
}
