import { EVENT_LIVE_SEED_EXPECTED_RECORDS } from "../features/events/storage/seed-live-events";
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
      "Set ORBIT_EVENT_DATABASE_URL, ORBIT_LIVE_DATABASE_URL, or ORBIT_DATABASE_URL before verifying live event records.",
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
  const missing: string[] = [];

  try {
    console.log(`Verifying live event records for ${config.workspaceId}.`);

    for (const expected of EVENT_LIVE_SEED_EXPECTED_RECORDS) {
      const records = await store.listRecords({
        workspaceId: config.workspaceId,
        collectionName: expected.collectionName,
      });
      const recordIds = records.map((record) => record.recordId).sort();
      const expectedIds = [...expected.recordIds].sort();
      const missingIds = expectedIds.filter(
        (recordId) => !recordIds.includes(recordId),
      );

      if (missingIds.length > 0) {
        missing.push(
          `${expected.collectionName}: missing ${missingIds.join(", ")}`,
        );
      }

      console.log(
        `- ${expected.collectionName}: ${records.length} records (${recordIds.join(", ")})`,
      );
    }

    if (missing.length > 0) {
      console.error("Live event seed verification failed:");
      for (const item of missing) {
        console.error(`  ${item}`);
      }
      process.exitCode = 1;
      return;
    }

    console.log("Live event seed verification passed.");
  } finally {
    await client.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
