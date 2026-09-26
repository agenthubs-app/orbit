import { AGENT_RUN_TARGET_BACKFILL_SQL } from "../features/agent/storage/agent-runtime-live-record-provider";
import { resolveLiveDatabaseConnectionConfig } from "../shared/storage/live-database-config";
import { createPgLiveRecordSqlClient } from "../shared/storage/postgres-live-record-store";
import { loadLocalEnv } from "./load-local-env";

// Sprint 0103 (AI trace A3): one agent run is read by its envelope target.
// Rows written before 0103 (steps, actions, outbox, receipts, AI request
// records) have no target yet; this fills it from the run id they already
// hold. Idempotent, updates only rows whose target is empty, deletes nothing.
async function main(): Promise<void> {
  loadLocalEnv();
  const config = resolveLiveDatabaseConnectionConfig();
  if (!config) throw new Error("DATABASE_UNCONFIGURED");
  const client = createPgLiveRecordSqlClient({ connectionString: config.connectionString });
  try {
    const result = await client.query<{ count: number }>(
      `with updated as (${AGENT_RUN_TARGET_BACKFILL_SQL} returning 1) select count(*)::int as count from updated`,
    );
    console.log(`Agent run targets backfilled: ${result.rows[0]?.count ?? 0} row(s) (${config.target}).`);
  } finally {
    await client.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "AGENT_RUN_TARGET_MIGRATION_FAILED");
  process.exitCode = 1;
});
