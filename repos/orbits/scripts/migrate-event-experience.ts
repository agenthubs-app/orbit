import { createConfiguredEventOperationsPostgresRuntime } from "../features/events/event-operations/storage/postgres-client";
import { runEventExperienceMigrations } from "../features/events/experience/storage/migrations";
import { loadLocalEnv } from "./load-local-env";

async function main(): Promise<void> {
  loadLocalEnv();
  const runtime = createConfiguredEventOperationsPostgresRuntime();
  if (!runtime) {
    throw new Error(
      "Set ORBIT_EVENT_DATABASE_URL, ORBIT_LIVE_DATABASE_URL, or ORBIT_DATABASE_URL before migrating event experience.",
    );
  }
  await runEventExperienceMigrations(runtime.client);
  console.log(`Migrated event experience for ${runtime.workspaceId}.`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
