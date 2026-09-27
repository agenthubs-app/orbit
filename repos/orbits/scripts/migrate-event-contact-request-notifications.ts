import { createLegacyEventContactRequestMigration } from "../features/notifications/event-contact-request-inbox-migration";
import { resolveLiveDatabaseConnectionConfig } from "../shared/storage/live-database-config";
import { createTransactionalPostgresClient } from "../shared/storage/transactional-postgres";
import { loadLocalEnv } from "./load-local-env";

// Sprint 0129: move business-card exchange notifications written by the
// pre-0129 worker from the legacy `notifications` collection into the typed
// inbox. Repeatable; legacy rows are archived (kept), never deleted.
//
//   npm run db:migrate:exchange-notifications              -> dry run, prints counts
//   npm run db:migrate:exchange-notifications -- --apply   -> migrates (local database only)
//
// A non-local database additionally needs `--confirm-remote=<workspace id>`.
// Run the dry run again after --apply: `migrate` must be 0.
async function main(): Promise<void> {
  loadLocalEnv();
  const config = resolveLiveDatabaseConnectionConfig();
  if (!config) throw new Error("DATABASE_UNCONFIGURED");
  const apply = process.argv.includes("--apply");
  const confirmRemote = process.argv.find((arg) => arg.startsWith("--confirm-remote="))?.slice("--confirm-remote=".length);
  const host = new URL(config.connectionString).hostname;
  const local = config.target === "local" && ["localhost", "127.0.0.1", "::1"].includes(host);
  if (apply && !local && confirmRemote !== config.workspaceId) {
    throw new Error(`REFUSED: ${config.target} database ${host}; pass --confirm-remote=${config.workspaceId} to migrate there.`);
  }
  const client = createTransactionalPostgresClient({ connectionString: config.connectionString, max: 2 });
  try {
    const migration = createLegacyEventContactRequestMigration({ client, workspaceId: config.workspaceId });
    const result = apply ? await migration.apply() : await migration.plan();
    const skipped = result.items.filter((item) => item.action === "skip").map((item) => ({ legacyId: item.legacyId, reason: item.reason }));
    console.log(JSON.stringify({
      mode: apply ? "apply" : "dry-run", target: config.target, workspaceId: config.workspaceId,
      candidates: result.candidates, migrate: result.migrate, alreadyInInbox: result.alreadyInInbox, skipped: result.skipped,
      ...("migrated" in result ? { migrated: result.migrated } : {}),
      readStates: { read: result.items.filter((i) => i.readState === "read").length, ignored: result.items.filter((i) => i.readState === "ignored").length },
      skippedItems: skipped,
    }, null, 2));
  } finally {
    await client.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "EXCHANGE_NOTIFICATION_MIGRATION_FAILED");
  process.exitCode = 1;
});
