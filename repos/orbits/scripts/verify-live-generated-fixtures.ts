import {
  GENERATED_FIXTURE_LIVE_SEED_EXPECTED_COLLECTIONS,
  verifyGeneratedRelationshipFixturesInLiveStore,
} from "../shared/storage/seed-generated-fixtures";
import { resolveLiveDatabaseConnectionConfig } from "../shared/storage/live-database-config";
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
      "Set ORBIT_EVENT_DATABASE_URL, ORBIT_LIVE_DATABASE_URL, or ORBIT_DATABASE_URL before verifying generated fixture records.",
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
    console.log(
      `Verifying generated fixture live records for ${config.workspaceId}.`,
    );

    const result = await verifyGeneratedRelationshipFixturesInLiveStore({
      store,
      workspaceId: config.workspaceId,
    });
    const expectedByCollection = new Map(
      GENERATED_FIXTURE_LIVE_SEED_EXPECTED_COLLECTIONS.map((collection) => [
        collection.collectionName,
        collection.recordIds.length,
      ]),
    );

    for (const collection of result.collections) {
      const expectedCount = expectedByCollection.get(collection.collectionName);

      console.log(
        `- ${collection.collectionName}: ${collection.recordIds.length}/${expectedCount ?? "?"} generated fixture records`,
      );
    }

    if (result.success === false) {
      console.error("Generated fixture live seed verification failed:");
      for (const failure of result.failures) {
        console.error(`  ${failure}`);
      }
      process.exitCode = 1;
      return;
    }

    console.log(
      `Generated fixture live seed verification passed with ${result.totalRecords} records.`,
    );
  } finally {
    await client.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
