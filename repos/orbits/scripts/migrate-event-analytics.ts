import { runEventAnalyticsMigrations } from "../features/events/event-analytics/migrations";
import { createConfiguredEventOperationsPostgresRuntime } from "../features/events/event-operations/storage/postgres-client";
import { loadLocalEnv } from "./load-local-env";

async function main(): Promise<void> {
  loadLocalEnv();
  const runtime = createConfiguredEventOperationsPostgresRuntime();
  if (!runtime) {
    throw new Error(
      "Set ORBIT_EVENT_DATABASE_URL, ORBIT_LIVE_DATABASE_URL, or ORBIT_DATABASE_URL before migrating event analytics.",
    );
  }
  await runEventAnalyticsMigrations(runtime.client);
  console.log(`Migrated event analytics for ${runtime.workspaceId}.`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
