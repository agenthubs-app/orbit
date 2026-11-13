/**
 * 2026-11-13 read-only check after migrate-chinichi-party-attendees: for every login that now
 * attends one of the four 「中日创业交流会」 events, run the real attendee read
 * (EventOperationsService.attendeeWorkspace — what the event page shows a signed-in attendee) and
 * count what comes back: results state, round-one / round-two table, recommendations.
 *
 * Every database connection is opened with default_transaction_read_only=on, so any write path the
 * read might touch fails instead of writing. Prints counts and hashed ids only.
 *
 *   npx tsx scripts/check-chinichi-attendee-views.ts
 */
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

import { loadLocalEnv } from "./load-local-env";
import { TARGETS } from "./fix-chinichi-startup-event-details";

function forceReadOnlyConnections() {
  let changed = 0;
  for (const [key, value] of Object.entries(process.env)) {
    if (!value || !/^postgres(ql)?:\/\//u.test(value)) continue;
    const url = new URL(value);
    url.searchParams.set("options", "-c default_transaction_read_only=on");
    process.env[key] = url.toString();
    changed++;
  }
  if (!changed) throw new Error("NO_DATABASE_URL");
  return changed;
}

async function main() {
  loadLocalEnv();
  const connections = forceReadOnlyConnections();
  const { createConfiguredEventOperationsService } = await import("../features/events/event-operations/runtime");
  const { createEventOperationsPostgresClient } = await import("../features/events/event-operations/storage/postgres-client");
  const { resolveLiveDatabaseConnectionConfig } = await import("../shared/storage/live-database-config");
  const config = resolveLiveDatabaseConnectionConfig();
  if (!config) throw new Error("DATABASE_UNCONFIGURED");
  const client = createEventOperationsPostgresClient({ connectionString: config.connectionString, max: 1 });
  const service = createConfiguredEventOperationsService();
  if (!service) throw new Error("SERVICE_UNCONFIGURED");
  const eventIds = Object.keys(TARGETS);
  const short = (v: string) => createHash("sha256").update(v).digest("hex").slice(0, 8);
  try {
    const writeProbe = await client.query<{ ro: string }>("select current_setting('default_transaction_read_only') ro");
    const rows = (await client.query<{ actor_id: string; event_id: string; migrated: boolean }>(
      `select h.actor_id, h.event_id, coalesce((u.payload->>'migratedFrom') = 'party-app:chinichi-2026', false) migrated
         from event_ops_membership_heads h
         join orbit_records u on u.workspace_id=h.workspace_id and u.collection_name='auth_users' and u.payload->>'id' = h.actor_id and u.lifecycle_state='active'
        where h.workspace_id=$1 and h.event_id = any($2::text[]) and h.status='rsvped'`, [config.workspaceId, eventIds])).rows;
    const orphan = Number((await client.query<{ n: string }>(
      `select count(*)::text n from event_ops_membership_heads h where h.workspace_id=$1 and h.event_id = any($2::text[]) and h.status='rsvped'
          and not exists (select 1 from orbit_records u where u.workspace_id=h.workspace_id and u.collection_name='auth_users' and u.payload->>'id'=h.actor_id and u.lifecycle_state='active')`,
      [config.workspaceId, eventIds])).rows[0]?.n ?? 0);
    const perEvent: Record<string, Record<string, number>> = {};
    const failures: Record<string, number> = {};
    const samples: unknown[] = [];
    for (const row of rows) {
      const bucket = (perEvent[row.event_id.slice(0, 8)] ??= { attendees: 0, migrated: 0, ready: 0, roundOne: 0, roundTwo: 0, withRecs: 0, recs: 0, named: 0, notReady: 0, failed: 0 });
      bucket.attendees++;
      if (row.migrated) bucket.migrated++;
      try {
        const view = await service.attendeeWorkspace({ actorId: row.actor_id, eventId: row.event_id });
        const recs = view.recommendations?.recommendations.length ?? 0;
        if (view.resultsState === "ready") bucket.ready++; else bucket.notReady++;
        if (view.roundOneTable) bucket.roundOne++;
        if (view.roundTwoTable) bucket.roundTwo++;
        if (recs) { bucket.withRecs++; bucket.recs += recs; }
        if (view.me?.displayName && view.me.displayName !== "参加者") bucket.named++;
        if (samples.length < 4 && row.migrated) samples.push({ event: row.event_id.slice(0, 8), actor: short(row.actor_id), state: view.resultsState, roundOneTable: view.roundOneTable?.tableNumber ?? null, roundTwoTable: view.roundTwoTable?.tableNumber ?? null, recs, directory: view.directory.length });
      } catch (error) {
        bucket.failed++;
        const code = error instanceof Error ? (error as { code?: string }).code ?? error.message.slice(0, 60) : "unknown";
        failures[code] = (failures[code] ?? 0) + 1;
      }
    }
    console.info(`chinichi-attendee-views READ_ONLY ${JSON.stringify({ connections, readOnly: writeProbe.rows[0]?.ro, attendeesWithLogin: rows.length, attendeesWithoutLogin: orphan, perEvent, failures, samples })}`);
  } finally {
    await client.close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().then(() => process.exit(0)).catch((error) => {
    console.error(`chinichi-attendee-views FAILED ${error instanceof Error ? error.message : "unknown"}`);
    process.exit(1);
  });
}
