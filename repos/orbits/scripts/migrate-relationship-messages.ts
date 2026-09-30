import { createRelationshipMessageMigration } from "../features/relationship-communication/message-migration";
import { runRelationshipMessageMigrations } from "../features/relationship-communication/message-tables";
import { resolveLiveDatabaseConnectionConfig } from "../shared/storage/live-database-config";
import { createTransactionalPostgresClient } from "../shared/storage/transactional-postgres";
import { loadLocalEnv } from "./load-local-env";

// Sprint 0109: move relationship messaging (bindings, conversations, messages,
// read markers) from orbit_records into the three message tables. Repeatable;
// legacy rows are only read, never changed or deleted.
//
//   npm run db:migrate:relationship-messages              -> dry run, prints counts, writes nothing
//   npm run db:migrate:relationship-messages -- --apply   -> creates the tables if missing, then migrates (local only)
//
// A non-local database additionally needs `--confirm-remote=<workspace id>`.
// Run the dry run again after --apply: create and appendedMessages must be 0.
async function main(): Promise<void> {
  loadLocalEnv();
  const config = resolveLiveDatabaseConnectionConfig();
  if (!config) throw new Error("DATABASE_UNCONFIGURED");
  const apply = process.argv.includes("--apply");
  const confirmRemote = process.argv.find((arg) => arg.startsWith("--confirm-remote="))?.slice("--confirm-remote=".length);
  const url = new URL(config.connectionString);
  const local = config.target === "local" && ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  if (apply && !local && confirmRemote !== config.workspaceId) {
    throw new Error(`REFUSED: ${config.target} database ${url.hostname}; pass --confirm-remote=${config.workspaceId} to migrate there.`);
  }
  const client = createTransactionalPostgresClient({ connectionString: config.connectionString, max: 2 });
  try {
    const tables = await client.query<{ present: boolean }>("select to_regclass('relationship_messages') is not null as present");
    if (!tables.rows[0]?.present) {
      if (!apply) {
        console.log(JSON.stringify({ mode: "dry-run", target: config.target, database: url.pathname.slice(1), workspaceId: config.workspaceId, tables: "absent (created by --apply or npm run db:migrate:live)" }));
      } else {
        await runRelationshipMessageMigrations(client);
      }
    }
    if (!apply && !tables.rows[0]?.present) return;
    const migration = createRelationshipMessageMigration({ client, workspaceId: config.workspaceId });
    const result = apply ? await migration.apply() : await migration.plan();
    console.log(JSON.stringify({
      target: config.target, database: url.pathname.slice(1), ...result,
      items: result.items.filter((item) => item.action !== "unchanged"),
    }, null, 2));
  } finally {
    await client.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "RELATIONSHIP_MESSAGE_MIGRATION_FAILED");
  process.exitCode = 1;
});
