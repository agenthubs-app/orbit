import { DASHBOARD_GRAPH_VERSION_INDEX_SQL } from "../features/sync/migrations";
import { resolveLiveDatabaseConnectionConfig } from "../shared/storage/live-database-config";
import { createPgLiveRecordSqlClient } from "../shared/storage/postgres-live-record-store";
import { loadLocalEnv } from "./load-local-env";

// Sprint 0102: adds orbit_records_graph_version_idx on a database that already
// has sync_revision. Without the column the dashboard keeps computing gaps and
// opportunities from the full graph, so this script refuses instead of adding
// the column (that belongs to the sync migration and its write lock).
async function main(): Promise<void> {
  loadLocalEnv();
  const config = resolveLiveDatabaseConnectionConfig();
  if (!config) throw new Error("DATABASE_UNCONFIGURED");
  const client = createPgLiveRecordSqlClient({ connectionString: config.connectionString });
  try {
    const column = await client.query(
      "select 1 from information_schema.columns where table_name = 'orbit_records' and column_name = 'sync_revision' and table_schema = current_schema()",
    );
    if (column.rows.length === 0) {
      console.error("orbit_records.sync_revision is missing; the dashboard graph version is unavailable on this database.");
      process.exitCode = 1;
      return;
    }
    await client.query(DASHBOARD_GRAPH_VERSION_INDEX_SQL);
    console.log(`Dashboard graph-version index ready (${config.target}).`);
  } finally {
    await client.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "DASHBOARD_GRAPH_VERSION_MIGRATION_FAILED");
  process.exitCode = 1;
});
