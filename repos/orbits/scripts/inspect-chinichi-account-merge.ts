/**
 * 2026-11-12 read-only diagnostic for the 「中日创业交流会」 account merge request:
 * who the current login for an email is, which actors attend / organize the four events,
 * and how many rows in every table reference each of those actors. Writes nothing
 * (the whole run is one read-only transaction).
 *
 *   npx tsx scripts/inspect-chinichi-account-merge.ts --email <email>
 */
import { pathToFileURL } from "node:url";

import { createEventOperationsPostgresClient } from "../features/events/event-operations/storage/postgres-client";
import { resolveLiveDatabaseConnectionConfig } from "../shared/storage/live-database-config";
import { TARGETS } from "./fix-chinichi-startup-event-details";
import { loadLocalEnv } from "./load-local-env";

const ACTOR_COLUMNS = new Set(["actor_id", "user_id", "owner_actor_id", "organizer_actor_id", "requester_actor_id", "target_actor_id", "invited_actor_id", "used_by", "undone_by", "decision_actor_id", "published_by_actor_id", "created_by_actor_id", "host_actor_id", "account_id", "viewer_actor_id"]);

async function main(argv: readonly string[]) {
  loadLocalEnv();
  const emailIndex = argv.indexOf("--email");
  const email = (emailIndex >= 0 ? argv[emailIndex + 1] : process.env.ORBIT_MERGE_EMAIL ?? "").trim().toLowerCase();
  if (!email) throw new Error("USAGE: --email <email>");
  const config = resolveLiveDatabaseConnectionConfig();
  if (!config) throw new Error("DATABASE_UNCONFIGURED");
  const client = createEventOperationsPostgresClient({ connectionString: config.connectionString, max: 1 });
  const ws = config.workspaceId;
  const eventIds = Object.keys(TARGETS);
  const out: Record<string, unknown> = { workspace: ws };
  try {
    await client.transaction(async (sql) => {
      await sql.query("set transaction read only");
      const auth = await sql.query<{ record_id: string; payload: Record<string, unknown>; lifecycle_state: string }>(
        `select record_id, payload, lifecycle_state from orbit_records where workspace_id=$1 and collection_name='auth_users' and lower(payload->>'email')=$2`, [ws, email]);
      out.authUsers = auth.rows.map((r) => ({ recordId: r.record_id, id: r.payload.id, provider: r.payload.provider, displayName: r.payload.displayName, createdAt: r.payload.createdAt, state: r.lifecycle_state }));
      const userIds = auth.rows.map((r) => String(r.payload.id));
      const memberships = await sql.query<{ record_id: string; user_id: string; payload: Record<string, unknown>; lifecycle_state: string }>(
        `select record_id, user_id, payload, lifecycle_state from orbit_records where workspace_id=$1 and collection_name='profiles' and payload->>'id' = any($2::text[])`, [ws, userIds]);
      out.authMemberships = memberships.rows.map((r) => ({ recordId: r.record_id, userId: r.user_id, accountId: r.payload.accountId, state: r.lifecycle_state }));
      const profiles = await sql.query<{ record_id: string; user_id: string; payload: Record<string, unknown> }>(
        `select record_id, user_id, payload from orbit_records where workspace_id=$1 and collection_name='profiles' and (user_id = any($2::text[]) or payload->>'accountId' = any($2::text[]))`, [ws, userIds]);
      out.profiles = profiles.rows.map((r) => ({ recordId: r.record_id, userId: r.user_id, accountId: r.payload.accountId, displayName: r.payload.displayName, displayNameConfirmed: r.payload.displayNameConfirmed }));

      const events = await sql.query<{ event_id: string; title: string; organizer_actor_id: string; event_version: string; lifecycle_state_v2: string; organizer_name: string | null }>(
        `select event_id, title, organizer_actor_id, event_version::text, lifecycle_state_v2, source_payload->>'organizerName' as organizer_name from event_ops_events where workspace_id=$1 and event_id = any($2::text[])`, [ws, eventIds]);
      out.events = events.rows;

      const members = await sql.query<{ event_id: string; actor_id: string; participant_id: string; status: string; payload: Record<string, unknown> }>(
        `select h.event_id, h.actor_id, h.participant_id, h.status, v.profile_payload as payload
           from event_ops_membership_heads h
           left join event_ops_profile_versions v on v.workspace_id=h.workspace_id and v.event_id=h.event_id and v.participant_id=h.participant_id and v.profile_version=h.profile_version
          where h.workspace_id=$1 and h.event_id = any($2::text[]) order by h.event_id, h.actor_id`, [ws, eventIds]);
      const matchesEmail = (payload: unknown) => JSON.stringify(payload ?? {}).toLowerCase().includes(email);
      out.memberCounts = Object.fromEntries(eventIds.map((id) => [id, members.rows.filter((m) => m.event_id === id).length]));
      out.emailMembers = members.rows.filter((m) => matchesEmail(m.payload) || userIds.includes(m.actor_id)).map((m) => ({ eventId: m.event_id, actorId: m.actor_id, participantId: m.participant_id, status: m.status, payloadKeys: Object.keys(m.payload ?? {}), name: m.payload?.displayName ?? m.payload?.name ?? null }));

      const candidates = new Set<string>([...userIds, ...events.rows.map((e) => e.organizer_actor_id), ...(out.emailMembers as { actorId: string }[]).map((m) => m.actorId)]);
      // Any actor record (accounts / auth_users / profiles) that carries the email in its search text.
      const byEmail = await sql.query<{ collection_name: string; record_id: string; user_id: string | null }>(
        `select collection_name, record_id, user_id from orbit_records where workspace_id=$1 and collection_name in ('accounts','profiles','auth_users') and lower(coalesce(search_text,'')) like '%' || $2 || '%'`, [ws, email]);
      out.recordsMentioningEmail = byEmail.rows;
      for (const r of byEmail.rows) if (r.user_id) candidates.add(r.user_id);

      const cols = await sql.query<{ table_name: string; column_name: string }>(
        `select table_name, column_name from information_schema.columns where table_schema='public' and column_name = any($1::text[])`, [[...ACTOR_COLUMNS]]);
      const refs: Record<string, Record<string, number>> = {};
      for (const actor of candidates) {
        refs[actor] = {};
        for (const c of cols.rows) {
          const r = await sql.query<{ n: string }>(`select count(*)::text as n from "${c.table_name}" where "${c.column_name}" = $1`, [actor]);
          if (Number(r.rows[0]?.n) > 0) refs[actor][`${c.table_name}.${c.column_name}`] = Number(r.rows[0]?.n);
        }
        const coll = await sql.query<{ collection_name: string; n: string }>(`select collection_name, count(*)::text as n from orbit_records where workspace_id=$1 and user_id=$2 group by 1 order by 1`, [ws, actor]);
        refs[actor]["orbit_records.byCollection"] = Object.fromEntries(coll.rows.map((r) => [r.collection_name, Number(r.n)])) as unknown as number;
        const acc = await sql.query<{ collection_name: string; payload: Record<string, unknown> }>(`select collection_name, payload from orbit_records where workspace_id=$1 and collection_name in ('accounts','auth_users') and (record_id=$2 or payload->>'id'=$2)`, [ws, actor]);
        refs[actor]["identity"] = acc.rows.map((r) => ({ c: r.collection_name, name: r.payload.name ?? r.payload.displayName, email: r.payload.email ?? null, createdAt: r.payload.createdAt })) as unknown as number;
      }
      out.actorRefs = refs;
      const organizerProfiles = await sql.query(`select profile_id, owner_actor_id, slug, display_name from organizer_profiles where workspace_id=$1 and owner_actor_id = any($2::text[])`, [ws, [...candidates]]);
      out.organizerProfiles = organizerProfiles.rows;
    });
    console.info(`chinichi-account-merge INSPECT ${JSON.stringify(out)}`);
  } finally {
    await client.close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(`chinichi-account-merge INSPECT_FAILED ${error instanceof Error ? error.message : "unknown"}`);
    process.exitCode = 1;
  });
}
