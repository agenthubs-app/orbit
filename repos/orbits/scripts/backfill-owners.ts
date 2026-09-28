import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  assertOwnerBackfillTarget,
  runOwnerBackfill,
  type OwnerBackfillResult,
} from "../features/sync/owner-backfill";
import { resolveLiveDatabaseConnectionConfig } from "../shared/storage/live-database-config";
import { createTransactionalPostgresClient } from "../shared/storage/transactional-postgres";
import { loadLocalEnv } from "./load-local-env";

// Sprint 0114: give the contact rows sprint 0116 sends to devices an owner
// (features/sync/owner-backfill.ts has the rules). Read-only unless --apply.
//
//   npm run db:backfill:owners                          # dry run: counts per collection + every unresolvable row
//   npm run db:backfill:owners -- --preview             # also writes every planned change to a JSON file
//   npm run db:backfill:owners -- --apply               # export the rows it touches, then write (local database)
//   ... -- --apply --confirm-remote=<host>/<database>   # a remote database
//   ... -- --out-dir=/Volumes/ORICO/backups             # where the backup / preview files go
//   ... -- --assign-generated-sources                            # also own sources no live owned row cites (adds them to owned-source reads)
//
// Re-running changes 0 rows. The workspace is the configured one
// (ORBIT_WORKSPACE_ID / ORBIT_LOCAL_WORKSPACE_ID).

function flag(name: string): string | null {
  const prefix = `--${name}=`;
  const hit = process.argv.slice(2).find((arg) => arg === `--${name}` || arg.startsWith(prefix));
  if (!hit) return null;
  return hit.startsWith(prefix) ? hit.slice(prefix.length) : "";
}

function summary(result: OwnerBackfillResult): string {
  const lines = [`Owner backfill ${result.mode} (${result.workspaceId})`];
  for (const [name, counts] of Object.entries(result.counts)) {
    const rules = Object.entries(counts.byRule).map(([rule, n]) => `${rule} ${n}`).join("; ");
    lines.push(`  ${name}: total ${counts.total}, ownerless ${counts.ownerlessBefore}, assign ${counts.assigned}, copy ${counts.copied}, skip ${counts.skipped}, unresolvable ${counts.unresolvable}, ownerless after ${counts.ownerlessAfter}${rules ? ` [${rules}]` : ""}`);
  }
  const skippedReasons = new Map<string, number>();
  for (const item of result.skipped) skippedReasons.set(item.reason, (skippedReasons.get(item.reason) ?? 0) + 1);
  for (const [reason, n] of skippedReasons) lines.push(`  skipped ${n}: ${reason}`);
  lines.push(`  unresolvable rows (${result.unresolvable.length}, left unchanged):`);
  for (const item of result.unresolvable) lines.push(`    ${item.collectionName}/${item.recordId}: ${item.reason}`);
  if (result.applied) lines.push(`  applied: assigned ${result.applied.assigned}, copied ${result.applied.copied}, repointed ${result.applied.repointed}; verified ${result.verified}`);
  if (result.backup) lines.push(`  backup: ${result.backup.path} (${result.backup.rows} rows, ${result.backup.bytes} bytes)`);
  return lines.join("\n");
}

async function main(): Promise<void> {
  loadLocalEnv();
  const known = new Set(["apply", "preview", "dry-run", "confirm-remote", "out-dir", "backup-dir", "assign-generated-sources"]);
  const unknown = process.argv.slice(2).filter((arg) => !known.has(arg.replace(/^--/, "").split("=")[0]!));
  if (unknown.length > 0) throw new Error(`Unknown argument(s): ${unknown.join(" ")}`);
  const config = resolveLiveDatabaseConnectionConfig();
  if (!config) throw new Error("DATABASE_UNCONFIGURED");
  const apply = flag("apply") !== null;
  const mode = apply ? "apply" : flag("preview") !== null ? "preview" : "dry-run";
  const target = assertOwnerBackfillTarget({ connectionString: config.connectionString, target: config.target, apply, confirmRemote: flag("confirm-remote") });
  const outDir = path.resolve(flag("out-dir") || flag("backup-dir") || path.join("build", "owner-backfill"));
  const stamp = new Date().toISOString().replace(/[:.]/g, "");
  let backupPath: string | undefined;
  if (mode !== "dry-run") mkdirSync(outDir, { recursive: true });
  if (apply) backupPath = path.join(outDir, `owner-backfill-${target.database}-${stamp}.jsonl`);
  console.log(`${flag("assign-generated-sources") !== null ? "assign-generated-sources, " : ""}target: ${config.target} ${target.host}/${target.database}${target.remote ? " (remote)" : ""}, workspace ${config.workspaceId}, mode ${mode}`);
  const client = createTransactionalPostgresClient({ connectionString: config.connectionString, max: 2 });
  try {
    const result = await runOwnerBackfill({ client, workspaceId: config.workspaceId, mode, backupPath, assignGeneratedSources: flag("assign-generated-sources") !== null });
    console.log(summary(result));
    if (mode === "preview") {
      const previewPath = path.join(outDir, `owner-backfill-preview-${target.database}-${stamp}.json`);
      writeFileSync(previewPath, `${JSON.stringify(result, null, 2)}\n`, { flag: "wx", mode: 0o600 });
      console.log(`  preview: ${previewPath} (${result.assignments.length} assignments, ${result.copies.length} copies)`);
    }
  } finally {
    await client.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? `${error.name}: ${error.message}` : "OWNER_BACKFILL_FAILED");
  process.exitCode = 1;
});
