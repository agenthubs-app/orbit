import { mkdirSync } from "node:fs";
import path from "node:path";

import {
  assertLegacyTraceCleanupTarget,
  runLegacyTraceCleanup,
} from "../features/agent/retention/legacy-trace-cleanup";
import { resolveLiveDatabaseConnectionConfig } from "../shared/storage/live-database-config";
import { createTransactionalPostgresClient } from "../shared/storage/transactional-postgres";
import { loadLocalEnv } from "./load-local-env";

// Sprint 0111 (AI A5): one-off cleanup of the duplicate AI trace — analytics
// events, plain-answer runs and their step rows; request records lose only
// their link to those runs. Dry run by default (counts only, read-only).
//
//   npm run db:cleanup:agent-trace-legacy                      # dry run
//   npm run db:cleanup:agent-trace-legacy -- --execute         # export, then delete (local)
//   ... -- --execute --confirm-remote=<host>/<database>        # remote database
//   ... -- --backup-dir=/Volumes/ORICO/backups                 # where the JSON Lines backup goes
//
// Run `npm run db:migrate:agent-run-targets` first: deletion refuses to start
// while child rows lack the 0103 run target. Re-running deletes only what is left.

function flag(name: string): string | null {
  const prefix = `--${name}=`;
  const hit = process.argv.slice(2).find((arg) => arg === `--${name}` || arg.startsWith(prefix));
  if (!hit) return null;
  return hit.startsWith(prefix) ? hit.slice(prefix.length) : "";
}

async function main(): Promise<void> {
  loadLocalEnv();
  const known = new Set(["execute", "confirm-remote", "backup-dir"]);
  const unknown = process.argv.slice(2).filter((arg) => !known.has(arg.replace(/^--/, "").split("=")[0]!));
  if (unknown.length > 0) throw new Error(`Unknown argument(s): ${unknown.join(" ")}`);
  const config = resolveLiveDatabaseConnectionConfig();
  if (!config) throw new Error("DATABASE_UNCONFIGURED");
  const execute = flag("execute") !== null;
  const target = assertLegacyTraceCleanupTarget({
    connectionString: config.connectionString,
    target: config.target,
    execute,
    confirmRemote: flag("confirm-remote"),
  });
  let backupPath: string | undefined;
  if (execute) {
    const dir = path.resolve(flag("backup-dir") || path.join("build", "agent-trace-cleanup"));
    mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "");
    backupPath = path.join(dir, `agent-trace-${target.database}-${stamp}.jsonl`);
  }
  console.log(JSON.stringify({
    event: "agent_trace_cleanup_start", mode: execute ? "execute" : "dry-run",
    target: config.target, host: target.host, database: target.database, workspaceId: config.workspaceId,
  }));
  const client = createTransactionalPostgresClient({ connectionString: config.connectionString, max: 2 });
  try {
    const result = await runLegacyTraceCleanup({ client, workspaceId: config.workspaceId, execute, backupPath });
    console.log(JSON.stringify({ event: "agent_trace_cleanup_done", ...result }, null, 2));
  } finally {
    await client.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? `${error.name}: ${error.message}` : "AGENT_TRACE_CLEANUP_FAILED");
  process.exitCode = 1;
});
