import { parseArgs } from "node:util";
import { Client } from "pg";
import { inspectSyncRevision, migrateSyncRevisionOnline, rollbackSyncRevision } from "../features/sync/sync-revision-migration";
import { resolveLiveDatabaseConnectionConfig } from "../shared/storage/live-database-config";
import { loadLocalEnv } from "./load-local-env";

// Sprint 0108: strict sync_revision for orbit_records.
//   --check                 read-only: print the current state and stop
//   (no flag)               migrate to strict (idempotent, batched backfill)
//   --rollback=relax        keep revisions, stop checking the commit-order lock
//   --rollback=disable      drop the trigger and NOT NULL (last resort)
//   --batch-size=N          backfill rows per transaction (default 1000)
// Deploy the code that takes the commit-order lock BEFORE migrating: once the
// strict trigger is on, an unlocked write to notes/tasks/personal_schedule_items fails.
async function main(): Promise<void> {
  loadLocalEnv();
  const { values } = parseArgs({ options: { check: { type: "boolean", default: false }, rollback: { type: "string" }, "batch-size": { type: "string" } } });
  if (values.rollback !== undefined && !["relax", "disable"].includes(values.rollback)) throw new Error("--rollback must be relax or disable");
  const config = resolveLiveDatabaseConnectionConfig();
  if (!config) throw new Error("DATABASE_UNCONFIGURED");
  const url = new URL(config.connectionString);
  console.log(`target=${config.target} host=${url.hostname} database=${url.pathname.slice(1)}`);
  const client = new Client({ connectionString: config.connectionString });
  await client.connect();
  try {
    if (values.check) {
      console.log(JSON.stringify(await inspectSyncRevision(client)));
      return;
    }
    if (values.rollback) {
      console.log(JSON.stringify(await rollbackSyncRevision(client, values.rollback as "relax" | "disable")));
      return;
    }
    const report = await migrateSyncRevisionOnline(client, {
      batchSize: values["batch-size"] ? Number(values["batch-size"]) : 1000,
      log: (line) => console.log(line),
    });
    console.log(JSON.stringify({ state: report.after.state, backfilledRows: report.backfilledRows, batches: report.batches }));
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "SYNC_REVISION_MIGRATION_FAILED");
  process.exitCode = 1;
});
