/**
 * 2026-11-13 read-only check for the host report's 申込の推移 on the four 「中日创业交流会」 events:
 * how many admission applications exist, and when the members' first registration (registered_at)
 * is dated — party-app sign-up times, or the day they were imported. Prints counts and dates only.
 *
 *   npx tsx scripts/inspect-chinichi-signup-times.ts
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
  const out: Record<string, unknown> = {};
  try {
    await client.transaction(async (sql) => {
      await sql.query("set transaction read only");
      for (const eventId of Object.keys(TARGETS)) {
        const event = (await sql.query<{ starts_at: Date }>(`select starts_at from event_ops_events where workspace_id=$1 and event_id=$2`, [config.workspaceId, eventId])).rows[0];
        const apps = (await sql.query<{ n: string }>(`select count(*)::text n from event_ops_admission_application_heads where workspace_id=$1 and event_id=$2`, [config.workspaceId, eventId])).rows[0]?.n;
        const days = (await sql.query<{ day: string; n: number }>(
          `select to_char((first at time zone 'Asia/Tokyo')::date, 'YYYY-MM-DD') as day, count(*)::int as n
             from (select actor_id, min(registered_at) first from event_ops_membership_versions where workspace_id=$1 and event_id=$2 group by actor_id) s
            group by 1 order by 1`, [config.workspaceId, eventId])).rows;
        out[eventId.slice(0, 8)] = { startsAt: event?.starts_at, applications: Number(apps), registeredByDay: days.map((d) => `${d.day}:${d.n}`) };
      }
    });
    console.info(`chinichi-signup-times READ_ONLY ${JSON.stringify(out)}`);
  } finally {
    await client.close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(`chinichi-signup-times FAILED ${error instanceof Error ? error.message : "unknown"}`);
    process.exitCode = 1;
  });
}
