/**
 * 2026-11-14 one-off (user request): give cherlytae@gmail.com (user_mvsxuw18_e5ofbg) the organizer
 * page 「日中创新创业协会」 (slug `jcie`, chosen by the user; slugs never change) and attach the four
 * imported 「中日创业交流会」 events to it. The user cannot do this in the UI because ended events
 * no longer accept edits.
 *
 * In one transaction behind the sync commit-order lock:
 *   1. organizer_profiles: one row owned by the login, public, slug `jcie` (the same insert the
 *      host UI does).
 *   2. Each event: organizer_profile_id → the new page, event_version / revision + 1 and a new
 *      event_event_versions row (the host lifecycle's setEvent path; appendVersion).
 *   3. Follows of the login's actor-level organizer key (`org_…`), if any, move to the page key
 *      (`orgp_…`) keeping the original follow time — only when every event of this login is one
 *      of the four, so no other event loses its followers (guarded).
 *
 * Guards: the auth user; the four events are this login's and have no organizer page yet; the
 * slug is free; the login has no page with the same name.
 *
 *   npx tsx scripts/create-chinichi-organizer-profile.ts              # dry run (read-only)
 *   npx tsx scripts/create-chinichi-organizer-profile.ts --rollback   # write, verify, roll back
 *   npx tsx scripts/create-chinichi-organizer-profile.ts --apply      # write
 */
import { pathToFileURL } from "node:url";

import { createPostgresActorRecordStore } from "../features/events/actor-records/store";
import { createEventOperationsPostgresClient, type EventOperationsSqlExecutor } from "../features/events/event-operations/storage/postgres-client";
import { appendVersion, readHostEvent } from "../features/events/host/storage/lifecycle";
import { createOrganizerFollowService } from "../features/events/journey/attendee-records";
import { organizerKeyFor, organizerKeyForProfile } from "../features/events/journey/live-mapping";
import { acquireSyncCommitOrderLock } from "../features/sync/commit-order-lock";
import { resolveLiveDatabaseConnectionConfig } from "../shared/storage/live-database-config";
import { TARGETS } from "./fix-chinichi-startup-event-details";
import { loadLocalEnv } from "./load-local-env";

const OWNER = "user_mvsxuw18_e5ofbg";
const EMAIL = "cherlytae@gmail.com";
const NAME = "日中创新创业协会";
const SLUG = "jcie";
const EVENT_IDS = Object.keys(TARGETS);

class Rollback extends Error {}

async function guards(sql: EventOperationsSqlExecutor, ws: string) {
  const auth = await sql.query<{ id: string }>(`select payload->>'id' as id from orbit_records where workspace_id=$1 and collection_name='auth_users' and lifecycle_state='active' and lower(payload->>'email')=$2`, [ws, EMAIL]);
  if (auth.rows.length !== 1 || auth.rows[0]!.id !== OWNER) throw new Error(`GUARD_AUTH_USER:${auth.rows.length}`);
  const events = await sql.query<{ event_id: string; organizer_actor_id: string; organizer_profile_id: string | null; lifecycle_state_v2: string; title: string }>(
    `select event_id, organizer_actor_id, organizer_profile_id, lifecycle_state_v2, title from event_ops_events where workspace_id=$1 and event_id = any($2::text[])`, [ws, EVENT_IDS]);
  for (const id of EVENT_IDS) {
    const e = events.rows.find((row) => row.event_id === id);
    if (!e || e.title.trim() !== TARGETS[id]!.title || e.organizer_actor_id !== OWNER || e.organizer_profile_id !== null) throw new Error(`GUARD_EVENT:${id.slice(0, 8)}:${e ? `${e.organizer_actor_id === OWNER}/${e.organizer_profile_id ?? "-"}` : "missing"}`);
  }
  const slugTaken = (await sql.query(`select 1 from organizer_profiles where workspace_id=$1 and slug=$2`, [ws, SLUG])).rows.length > 0;
  if (slugTaken) throw new Error("GUARD_SLUG_TAKEN");
  const own = await sql.query<{ display_name: string }>(`select display_name from organizer_profiles where workspace_id=$1 and owner_actor_id=$2`, [ws, OWNER]);
  if (own.rows.some((row) => row.display_name.trim() === NAME)) throw new Error("GUARD_NAME_EXISTS");
  const otherEvents = Number((await sql.query<{ n: string }>(`select count(*)::text n from event_ops_events where workspace_id=$1 and organizer_actor_id=$2 and lifecycle_state_v2 is not null and organizer_profile_id is null and event_id <> all($3::text[])`, [ws, OWNER, EVENT_IDS])).rows[0]?.n ?? 0);
  const actorKey = organizerKeyFor(OWNER)!;
  const follows = Number((await sql.query<{ n: string }>(`select count(*)::text n from orbit_records where workspace_id=$1 and collection_name='organizerFollows' and lifecycle_state <> 'deleted' and payload->>'organizerId'=$2`, [ws, actorKey])).rows[0]?.n ?? 0);
  return { existingPages: own.rows.length, otherEventsWithoutPage: otherEvents, actorKeyFollows: follows, events: events.rows.map((row) => ({ eventId: row.event_id.slice(0, 8), lifecycle: row.lifecycle_state_v2 })) };
}

async function write(sql: EventOperationsSqlExecutor, ws: string, before: Awaited<ReturnType<typeof guards>>) {
  const profileId = `prof_${crypto.randomUUID().replaceAll("-", "").slice(0, 20)}`;
  const inserted = await sql.query(
    `insert into organizer_profiles (workspace_id, profile_id, owner_actor_id, slug, display_name, emoji, bio, visibility)
     values ($1, $2, $3, $4, $5, null, null, 'public') on conflict (workspace_id, slug) do nothing returning profile_id`,
    [ws, profileId, OWNER, SLUG, NAME]);
  if (!inserted.rows[0]) throw new Error("SLUG_RACE");
  const versions: Array<{ eventId: string; from: number; to: number }> = [];
  for (const id of EVENT_IDS) {
    const current = await readHostEvent(sql, ws, id, true);
    if (!current) throw new Error(`EVENT_GONE:${id}`);
    const updated = await sql.query(
      `update event_ops_events set organizer_profile_id = $3, event_version = event_version + 1, revision = revision + 1, updated_at = now()
        where workspace_id = $1 and event_id = $2 and event_version = $4 and organizer_profile_id is null returning event_id`,
      [ws, id, profileId, current.version]);
    if (!updated.rows[0]) throw new Error(`VERSION_CONFLICT:${id}`);
    const saved = (await readHostEvent(sql, ws, id))!;
    await appendVersion(sql, ws, saved);
    versions.push({ eventId: id.slice(0, 8), from: current.version, to: saved.version });
  }
  // Follows: move the login's actor-level follows to the page only when the four events are all it hosts.
  let followsMoved = 0;
  if (before.actorKeyFollows > 0 && before.otherEventsWithoutPage === 0) {
    const query = async (text: string, values?: readonly unknown[]) => ({ rows: [...(await sql.query<Record<string, unknown>>(text, values as unknown[])).rows] });
    const follows = createOrganizerFollowService({ store: createPostgresActorRecordStore({ query, workspaceId: ws }) });
    const actorKey = organizerKeyFor(OWNER)!;
    const rows = await sql.query<{ user_id: string; followed_at: string | null }>(`select user_id, payload->>'followedAt' as followed_at from orbit_records where workspace_id=$1 and collection_name='organizerFollows' and lifecycle_state <> 'deleted' and payload->>'organizerId'=$2`, [ws, actorKey]);
    for (const row of rows.rows) {
      await follows.adopt(row.user_id, organizerKeyForProfile(profileId)!, row.followed_at ?? new Date().toISOString());
      await follows.drop(row.user_id, actorKey);
      followsMoved += 1;
    }
  }
  const linked = Number((await sql.query<{ n: string }>(`select count(*)::text n from event_ops_events where workspace_id=$1 and organizer_profile_id=$2`, [ws, profileId])).rows[0]?.n ?? 0);
  if (linked !== EVENT_IDS.length) throw new Error(`VERIFY_LINKED:${linked}`);
  const publicCount = Number((await sql.query<{ n: string }>(`select count(*)::text n from event_ops_events where workspace_id=$1 and organizer_profile_id=$2 and lifecycle_state_v2 in ('published','archived') and coalesce(source_payload #>> '{host,cancelledAt}', '') = ''`, [ws, profileId])).rows[0]?.n ?? 0);
  return { profileId, slug: SLUG, versions, followsMoved, linked, listedOnPublicPage: publicCount };
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
        const before = await guards(sql, config.workspaceId);
        out.before = before;
        if (!apply && !rollback) return;
        out.written = await write(sql, config.workspaceId, before);
        if (rollback) throw new Rollback();
      });
    } catch (error) {
      if (!(error instanceof Rollback)) throw error;
      out.rolledBack = true;
    }
    console.info(`chinichi-organizer-profile ${out.mode} ${JSON.stringify(out)}`);
  } finally {
    await client.close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(`chinichi-organizer-profile FAILED ${error instanceof Error ? error.message : "unknown"}`);
    process.exitCode = 1;
  });
}
