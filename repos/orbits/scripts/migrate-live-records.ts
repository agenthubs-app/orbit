import { resolveLiveDatabaseConnectionConfig } from "../shared/storage/live-database-config";
import { runOrbitRecordsMigration } from "../shared/storage/migrations";
import { createPgLiveRecordSqlClient } from "../shared/storage/postgres-live-record-store";

async function main(): Promise<void> {
  const config = resolveLiveDatabaseConnectionConfig();

  if (!config) {
    console.error(
      "Set ORBIT_EVENT_DATABASE_URL, ORBIT_LIVE_DATABASE_URL, or ORBIT_DATABASE_URL before running live record migrations.",
    );
    process.exitCode = 1;
    return;
  }

  const client = createPgLiveRecordSqlClient({
    connectionString: config.connectionString,
  });

  try {
    await runOrbitRecordsMigration(client);
    console.log(`Migrated orbit_records for ${config.workspaceId}.`);
  } finally {
    await client.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
