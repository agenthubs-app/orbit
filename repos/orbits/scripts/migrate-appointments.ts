import { createConfiguredEventOperationsPostgresRuntime } from "../features/events/event-operations/storage/postgres-client";
import { runAppointmentMigrations } from "../features/appointments/storage/migrations";
import { loadLocalEnv } from "./load-local-env";

async function main(): Promise<void> {
  loadLocalEnv();
  const runtime = createConfiguredEventOperationsPostgresRuntime();
  if (!runtime) throw new Error("Set ORBIT_EVENT_DATABASE_URL, ORBIT_LIVE_DATABASE_URL, or ORBIT_DATABASE_URL before migrating appointments.");
  await runAppointmentMigrations(runtime.client);
  console.log(`Migrated appointment aggregates for ${runtime.workspaceId}.`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
