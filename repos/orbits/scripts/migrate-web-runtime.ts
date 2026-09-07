import { runOrbitRecordsMigration } from "../shared/storage/migrations";
import { createConfiguredEventOperationsPostgresRuntime } from "../features/events/event-operations/storage/postgres-client";
import { resolveLiveDatabaseConnectionConfig } from "../shared/storage/live-database-config";
import { createPgLiveRecordSqlClient } from "../shared/storage/postgres-live-record-store";
import { runEventExperienceMigrations } from "../features/events/experience/storage/migrations";
import { runEventAnalyticsMigrations } from "../features/events/event-analytics/migrations";
import { runAppointmentMigrations } from "../features/appointments/storage/migrations";
import { runBusinessCardIngestV2Migrations } from "../features/acquisition/business-card-ingest-v2/migrations";
import { loadLocalEnv } from "./load-local-env";

async function main() {
  loadLocalEnv();
  const runtime = createConfiguredEventOperationsPostgresRuntime();
  const config = resolveLiveDatabaseConnectionConfig();
  if (!runtime || !config) throw new Error("DATABASE_UNCONFIGURED");
  const recordsClient = createPgLiveRecordSqlClient({ connectionString: config.connectionString });
  let phase = "records";
  try {
    await runOrbitRecordsMigration(recordsClient);
    phase = "event-experience";
    await runEventExperienceMigrations(runtime.client);
    phase = "event-analytics";
    await runEventAnalyticsMigrations(runtime.client);
    phase = "appointments";
    await runAppointmentMigrations(runtime.client);
    phase = "business-card-ingest";
    await runBusinessCardIngestV2Migrations(runtime.client);
    console.info("Web runtime schemas migrated; no demo data seeded.");
  } catch {
    throw new Error(`WEB_MIGRATION_FAILED:${phase}`);
  } finally {
    await Promise.all([recordsClient.close(), runtime.client.close()]);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "WEB_MIGRATION_FAILED");
  process.exitCode = 1;
});
