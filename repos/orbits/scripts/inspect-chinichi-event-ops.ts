/**
 * 2026-11-12 read-only diagnostic for moving the party-app matching / grouping results of the four
 * 「中日创业交流会」 events into Orbit: row counts of every event_ops table for those events and how
 * an attendee row points back at its party-app profile. One read-only transaction; prints ids and
 * key names only, no profile contents.
 *
 *   npx tsx scripts/inspect-chinichi-event-ops.ts
 */
import { pathToFileURL } from "node:url";

import { createEventOperationsPostgresClient } from "../features/events/event-operations/storage/postgres-client";
import { resolveLiveDatabaseConnectionConfig } from "../shared/storage/live-database-config";
import { TARGETS } from "./fix-chinichi-startup-event-details";
import { loadLocalEnv } from "./load-local-env";

async function main() {
  loadLocalEnv();
  const config = resolveLiveDatabaseConnectionConfig();
  if (!config) throw new Error("DATABASE_UNCONFIGURED");
  const client = createEventOperationsPostgresClient({ connectionString: config.connectionString, max: 1 });
  const ws = config.workspaceId;
  const ids = Object.keys(TARGETS);
  const out: Record<string, unknown> = {};
  try {
    await client.transaction(async (sql) => {
      await sql.query("set transaction read only");
      const tables = await sql.query<{ table_name: string; has_event: boolean; has_generation: boolean; has_publication: boolean }>(
        `select table_name,
                bool_or(column_name='event_id') has_event, bool_or(column_name='generation_id') has_generation, bool_or(column_name='publication_id') has_publication
           from information_schema.columns where table_schema='public' and (table_name like 'event\\_%' or table_name like 'organizer\\_%') group by table_name order by table_name`);
      const counts: Record<string, Record<string, number>> = {};
      for (const t of tables.rows) {
        let where: string | null = null;
        if (t.has_event) where = `event_id = $2`;
        else if (t.has_generation) where = `generation_id in (select generation_id from event_ops_generations where workspace_id=$1 and event_id=$2)`;
        else if (t.has_publication) where = `publication_id in (select publication_id from event_ops_publications where workspace_id=$1 and event_id=$2)`;
        if (!where) continue;
        const hasWs = (await sql.query<{ n: string }>(`select count(*)::text n from information_schema.columns where table_schema='public' and table_name=$1 and column_name='workspace_id'`, [t.table_name])).rows[0]?.n === "1";
        const row: Record<string, number> = {};
        for (const id of ids) {
          const r = await sql.query<{ n: string }>(`select count(*)::text n from "${t.table_name}" where ${hasWs ? "workspace_id=$1 and " : "$1::text is not null and "}${where}`, [ws, id]);
          const n = Number(r.rows[0]?.n ?? 0);
          if (n) row[id.slice(0, 8)] = n;
        }
        if (Object.keys(row).length) counts[t.table_name] = row;
      }
      out.counts = counts;
      const sample = await sql.query<{ event_id: string; actor_id: string; participant_id: string; source_registration_id: string; keys: string[] }>(
        `select distinct on (h.event_id) h.event_id, h.actor_id, h.participant_id, v.source_registration_id, array(select jsonb_object_keys(v.profile_payload)) keys
           from event_ops_membership_heads h join event_ops_profile_versions v on v.workspace_id=h.workspace_id and v.event_id=h.event_id and v.participant_id=h.participant_id and v.profile_version=h.profile_version
          where h.workspace_id=$1 and h.event_id = any($2::text[]) and h.actor_id <> 'user_mvsxuw18_e5ofbg' order by h.event_id, h.actor_id`, [ws, ids]);
      out.sampleAttendee = sample.rows;
      const actorKinds = await sql.query<{ kind: string; n: string }>(
        `select split_part(actor_id, ':', 1) || ':' || split_part(actor_id, ':', 2) kind, count(*)::text n from event_ops_membership_heads where workspace_id=$1 and event_id = any($2::text[]) group by 1`, [ws, ids]);
      out.actorKinds = actorKinds.rows;
      const statuses = await sql.query<{ event_id: string; status: string; n: string }>(`select event_id, status, count(*)::text n from event_ops_membership_heads where workspace_id=$1 and event_id = any($2::text[]) group by 1,2 order by 1,2`, [ws, ids]);
      out.membershipStatus = statuses.rows;
      const gens = await sql.query(`select generation_id, event_id, status, created_at from event_ops_generations where workspace_id=$1 and event_id = any($2::text[]) order by created_at`, [ws, ids]);
      out.generations = gens.rows;
      const events = await sql.query(`select event_id, lifecycle_state_v2, starts_at, ends_at, source_payload ? 'partyApp' as has_party_key, array(select jsonb_object_keys(source_payload)) payload_keys from event_ops_events where workspace_id=$1 and event_id = any($2::text[])`, [ws, ids]);
      out.events = events.rows;
    });
    console.info(`chinichi-event-ops INSPECT ${JSON.stringify(out)}`);
  } finally {
    await client.close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(`chinichi-event-ops INSPECT_FAILED ${error instanceof Error ? error.message : "unknown"}`);
    process.exitCode = 1;
  });
}
