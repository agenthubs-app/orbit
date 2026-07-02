import {
  GENERATED_FIXTURE_LIVE_SEED_EXPECTED_COLLECTIONS,
  seedGeneratedRelationshipFixturesIntoLiveStore,
} from "../shared/storage/seed-generated-fixtures";
import { resolveLiveDatabaseConnectionConfig } from "../shared/storage/live-database-config";
import { runOrbitRecordsMigration } from "../shared/storage/migrations";
import {
  createPgLiveRecordSqlClient,
  createPostgresLiveRecordStore,
} from "../shared/storage/postgres-live-record-store";
import { loadLocalEnv } from "./load-local-env";

async function main(): Promise<void> {
  loadLocalEnv();

  const config = resolveLiveDatabaseConnectionConfig();

  if (!config) {
    console.error(
      "Set ORBIT_EVENT_DATABASE_URL, ORBIT_LIVE_DATABASE_URL, or ORBIT_DATABASE_URL before seeding generated fixture records.",
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

    let completedCollections = 0;
    const result = await seedGeneratedRelationshipFixturesIntoLiveStore({
      onCollectionSeeded: (collection) => {
        completedCollections += 1;
        console.log(
          `Seeded ${collection.collectionName} (${collection.recordIds.length} records, ${completedCollections}/${GENERATED_FIXTURE_LIVE_SEED_EXPECTED_COLLECTIONS.length} collections).`,
        );
      },
      store,
      workspaceId: config.workspaceId,
    });

    console.log(
      `Seeded ${result.totalRecords} generated fixture live records for ${result.workspaceId}.`,
    );

    for (const collection of result.collections) {
      console.log(
        `- ${collection.collectionName}: ${collection.recordIds.length} records`,
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
