import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { loadLocalEnv } from "../../scripts/load-local-env";
import { resolveLiveDatabaseConnectionConfig } from "../../shared/storage/live-database-config";
import { createPgLiveRecordSqlClient } from "../../shared/storage/postgres-live-record-store";
import { runOrbitRecordsMigration } from "../../shared/storage/migrations";
import { createConfiguredEventOperationsPostgresRuntime } from "../../features/events/event-operations/storage/postgres-client";
import { createPostgresEventOperationsRepository } from "../../features/events/event-operations/storage/postgres-repository";

/** Real registration routes, isolated from the user's catalogue and wall-clock fixture expiry. */
export async function createIsolatedRegistrationRuntime() {
  loadLocalEnv();
  const config = resolveLiveDatabaseConnectionConfig();
  if (!config) throw new Error("Registration integration tests require a local test database.");
  const schema = `registration_route_${randomUUID().replaceAll("-", "")}`;
  const workspaceId = `test:${schema}`;
  const admin = new Pool({ connectionString: config.connectionString, max: 1 });
  const scopedUrl = new URL(config.connectionString);
  scopedUrl.searchParams.set("options", `-c search_path=${schema}`);
  const previous = new Map(["ORBIT_EVENT_DATABASE_URL", "ORBIT_WORKSPACE_ID"].map((key) => [key, process.env[key]]));
  const records = createPgLiveRecordSqlClient({ connectionString: scopedUrl.toString() });
  let runtime: ReturnType<typeof createConfiguredEventOperationsPostgresRuntime> = null;
  const close = async () => {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await records.close();
    if (runtime) await runtime.client.close();
    try { await admin.query(`drop schema if exists ${schema} cascade`); }
    finally { await admin.end(); }
  };
  try {
    await admin.query(`create schema ${schema}`);
    await runOrbitRecordsMigration(records);
    process.env.ORBIT_EVENT_DATABASE_URL = scopedUrl.toString();
    process.env.ORBIT_WORKSPACE_ID = workspaceId;
    runtime = createConfiguredEventOperationsPostgresRuntime();
    if (!runtime) throw new Error("Isolated registration runtime unavailable.");
    const repository = createPostgresEventOperationsRepository(runtime);
    const now = Date.now();
    for (const [eventId, title, days] of [
      ["event_01", "已结束的独立测试活动", -7],
      ["event_signup_01", "关西跨境商务对接会", 7],
      ["event_signup_02", "东京 AI 落地伙伴对接会", 14],
    ] as const) {
      const at = (minutes: number) => new Date(now + days * 86_400_000 + minutes * 60_000).toISOString();
      await repository.saveConfiguration({
        eventId, organizerActorId: "organizer:test", eventStartsAt: at(0), eventEndsAt: at(180),
        checkInOpensAt: at(-10), profileEditDeadlineAt: at(-60), registrationCutoffAt: at(-30),
        resultsAvailableAt: at(-15), roundOneStartsAt: at(15), roundTwoStartsAt: at(60),
        maxAttemptsPerTask: 3, recommendationCount: 4, shardSize: 6, tableSize: 6,
        updatedAt: new Date(now).toISOString(),
      });
      await runtime.client.query(
        `update event_ops_events set title=$3, description='Isolated registration fixture',
           venue='Tokyo', timezone='Asia/Tokyo', starts_at=$4, ends_at=$5, public_code=$6, lifecycle_state_v2='published'
         where workspace_id=$1 and event_id=$2`,
        [workspaceId, eventId, title, at(0), at(180), eventId.replaceAll("_", "").replace("event", "EVT").toUpperCase()],
      );
      for (const [alias, type] of [[eventId, "event_id"], [eventId.replaceAll("_", "").replace("event", "EVT").toUpperCase(), "public_code"]]) {
        await runtime.client.query(
          `insert into event_aliases (workspace_id, normalized_alias, alias_value, alias_type, event_id, source_payload)
           values ($1, lower($2), $2, $3, $4, '{}')`, [workspaceId, alias, type, eventId],
        );
      }
      await repository.activateCanonicalRegistrations(eventId, []);
    }
    return { close };
  } catch (error) {
    await close();
    throw error;
  }
}
