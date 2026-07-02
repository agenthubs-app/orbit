import { resolveLiveDatabaseConnectionConfig } from "../shared/storage/live-database-config";
import { runOrbitRecordsMigration } from "../shared/storage/migrations";
import {
  createPgLiveRecordSqlClient,
  createPostgresLiveRecordStore,
} from "../shared/storage/postgres-live-record-store";
import { seedEventsMockDataIntoLiveStore } from "../features/events/storage/seed-live-events";
import { loadLocalEnv } from "./load-local-env";

async function main(): Promise<void> {
  loadLocalEnv();

  const config = resolveLiveDatabaseConnectionConfig();

  if (!config) {
    console.error(
      "Set ORBIT_EVENT_DATABASE_URL, ORBIT_LIVE_DATABASE_URL, or ORBIT_DATABASE_URL before seeding live event records.",
    );
    process.exitCode = 1;
    return;
  }

  const client = createPgLiveRecordSqlClient({
    connectionString: config.connectionString,
  });
  const store = createPostgresLiveRecordStore<Record<string, unknown>>({
    client,
  });

  try {
    await runOrbitRecordsMigration(client);

    const result = await seedEventsMockDataIntoLiveStore({
      store,
      workspaceId: config.workspaceId,
    });

    console.log(
      `Seeded ${result.totalRecords} live event records for ${result.workspaceId}.`,
    );

    for (const collection of result.collections) {
      console.log(
        `- ${collection.collectionName}: ${collection.recordIds.join(", ")}`,
      );
    }
  } finally {
    await client.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
