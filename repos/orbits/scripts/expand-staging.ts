import { readFileSync } from "node:fs";
import { Client, type QueryResult } from "pg";
import type { EventOperationsPostgresClient } from "../features/events/event-operations/storage/postgres-client";
import { buildMinimalStagingSeed, validateStagingTarget } from "./lib/minimal-staging";
import { applyRichStagingExpansion, buildRichStagingExpansion, RICH_STAGING_LIMITS } from "./lib/rich-staging";

async function main() {
  const args = process.argv.slice(2);
  const cloud = args.includes("--cloud");
  const path = args.find(a => a.startsWith("--config="))?.slice(9);
  if (!path) throw Error("RICH_STAGING_PRIVATE_CONFIG_REQUIRED");
  const config = JSON.parse(readFileSync(path, "utf8")) as {databaseUrl: string; password: string};
  const connectionString = cloud ? config.databaseUrl : "postgresql://li@localhost:5432/orbit_staging_20260917";
  validateStagingTarget(connectionString, cloud);
  const now = new Date().toISOString();
  if (!args.includes("--apply")) {
    const baseline = await buildMinimalStagingSeed(config.password, now);
    const plan = await buildRichStagingExpansion(baseline.records, now);
    console.info(JSON.stringify({dryRun: true, addedContacts: 28, addedEvents: plan.events.count, addedRecords: plan.records.length,
      finalPrimaryContacts: 30, finalEvents: 10, seedBytes: plan.seedBytes, limits: RICH_STAGING_LIMITS}));
    return;
  }
  const pg = new Client({connectionString, statement_timeout: 15000, connectionTimeoutMillis: 15000});
  let queries = 0, returnedBytes = 0;
  const client: EventOperationsPostgresClient = {
    async query<T>(sql: string, values?: readonly unknown[]) {
      if (++queries > RICH_STAGING_LIMITS.queries) throw Error("RICH_STAGING_QUERY_BUDGET_EXCEEDED");
      const raw = await pg.query(sql, values ? [...values] : undefined);
      const results: QueryResult[] = Array.isArray(raw) ? raw : [raw];
      const rows = results.flatMap(r => r.rows) as T[];
      returnedBytes += Buffer.byteLength(JSON.stringify(rows));
      if (returnedBytes > RICH_STAGING_LIMITS.returnedBytes) throw Error("RICH_STAGING_RETURN_BUDGET_EXCEEDED");
      return {rows, rowCount: results.reduce((n,r) => n + (r.rowCount ?? r.rows.length), 0)};
    },
    transaction: async operation => operation(client),
    close: async () => {},
  };
  await pg.connect();
  try {
    await pg.query("begin isolation level serializable");
    const result = await applyRichStagingExpansion(client, config.password, now);
    await pg.query("commit");
    console.info(JSON.stringify({applied: true, cloud, ...result, queries, approximateReturnedBytes: returnedBytes}));
  } catch (error) {
    await pg.query("rollback");
    if (!cloud && error instanceof Error) console.error(error.stack);
    throw error;
  } finally {await pg.end();}
}
main().catch(error => {
  console.error(error instanceof Error && /^(RICH_)?STAGING_[A-Z_]+$/.test(error.message) ? error.message : "RICH_STAGING_FAILED_ROLLED_BACK");
  process.exitCode = 1;
});
