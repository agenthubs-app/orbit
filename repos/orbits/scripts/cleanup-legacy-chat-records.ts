import {
  countLegacyChatRecords,
  deleteLegacyChatRecords,
} from "../features/chat/storage/legacy-chat-cleanup";
import { resolveLiveDatabaseConnectionConfig } from "../shared/storage/live-database-config";
import { createPgLiveRecordSqlClient } from "../shared/storage/postgres-live-record-store";
import { loadLocalEnv } from "./load-local-env";

// Sprint 0104: remove the retired legacy chat rows (`conversations`,
// `messages`) from the configured workspace.
//
//   npm run db:cleanup:legacy-chat              -> dry run, prints counts
//   npm run db:cleanup:legacy-chat -- --apply   -> deletes (local database only)
//
// A non-local database additionally needs `--confirm-remote=<workspace id>`,
// so a production run is always a deliberate, workspace-specific decision.
async function main(): Promise<void> {
  loadLocalEnv();
  const config = resolveLiveDatabaseConnectionConfig();
  if (!config) throw new Error("DATABASE_UNCONFIGURED");
  const apply = process.argv.includes("--apply");
  const confirmRemote = process.argv.find((arg) => arg.startsWith("--confirm-remote="))?.slice("--confirm-remote=".length);
  const host = new URL(config.connectionString).hostname;
  const local = config.target === "local" && ["localhost", "127.0.0.1", "::1"].includes(host);
  if (apply && !local && confirmRemote !== config.workspaceId) {
    throw new Error(`REFUSED: ${config.target} database ${host}; pass --confirm-remote=${config.workspaceId} to delete there.`);
  }
  const client = createPgLiveRecordSqlClient({ connectionString: config.connectionString });
  try {
    if (!apply) {
      const counts = await countLegacyChatRecords(client, config.workspaceId);
      console.log(`Dry run (${config.target}, ${config.workspaceId}): conversations ${counts.conversations}, messages ${counts.messages}. Pass --apply to delete.`);
      return;
    }
    const result = await deleteLegacyChatRecords(client, config.workspaceId);
    console.log(`Legacy chat cleanup (${config.target}, ${config.workspaceId}): conversations ${result.counts.conversations}, messages ${result.counts.messages}; deleted ${result.deleted} row(s).`);
  } finally {
    await client.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "LEGACY_CHAT_CLEANUP_FAILED");
  process.exitCode = 1;
});
