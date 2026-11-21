import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { backfillSummary, runAgentV1Backfill } from "../features/agent-v1/rollout/backfill";
import { resolveLiveDatabaseConnectionConfig } from "../shared/storage/live-database-config";
import { createTransactionalPostgresClient } from "../shared/storage/transactional-postgres";
import { loadLocalEnv } from "./load-local-env";

// agent-design AG18-1: fill the new multi-value fields from the old single values, only where they are missing
// (features/agent-v1/rollout/backfill.ts has the rules). Read-only unless --apply.
//
//   npm run db:backfill:agent-v1                              # dry run: counts per collection + every unprocessable row
//   npm run db:backfill:agent-v1 -- --preview                 # also writes every planned change to a JSON file
//   npm run db:backfill:agent-v1 -- --apply                   # write (local database only)
//   ... -- --apply --confirm-remote=<host>/<database>         # a remote database: only after the owner approved it (需用户授权)
//   ... -- --out-dir=<folder>                                 # where the preview file goes
//
// Re-running changes 0 rows. The workspace is the configured one (ORBIT_WORKSPACE_ID / ORBIT_LOCAL_WORKSPACE_ID).

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

function flag(name: string): string | null {
  const prefix = `--${name}=`;
  const hit = process.argv.slice(2).find((arg) => arg === `--${name}` || arg.startsWith(prefix));
  if (!hit) return null;
  return hit.startsWith(prefix) ? hit.slice(prefix.length) : "";
}

export function assertBackfillTarget(input: { connectionString: string; target: "local" | "cloud"; apply: boolean; confirmRemote?: string | null }): { host: string; database: string; remote: boolean } {
  let url: URL;
  try {
    url = new URL(input.connectionString);
  } catch {
    throw new Error("AGENT_V1_BACKFILL_REFUSED: the database connection configuration is invalid.");
  }
  const host = url.hostname;
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  const remote = input.target !== "local" || !LOCAL_HOSTS.has(host);
  if (input.apply && remote && input.confirmRemote !== `${host}/${database}`) {
    throw new Error(`AGENT_V1_BACKFILL_REFUSED: remote database; after the dry run is approved pass --confirm-remote=${host}/${database}.`);
  }
  return { database, host, remote };
}

/** `--env-file=<file>` loads only that file (e.g. the eval environment), never `.env`. */
export function loadEnvFrom(file: string | null): void {
  if (!file) {
    loadLocalEnv();
    return;
  }
  for (const raw of readFileSync(path.resolve(file), "utf8").split(/\r?\n/u)) {
    const line = raw.trim();
    const at = line.indexOf("=");
    if (!line || line.startsWith("#") || at <= 0) continue;
    const key = line.slice(0, at).trim();
    const value = line.slice(at + 1).trim().replace(/^(["'])(.*)\1$/u, "$2");
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

async function main(): Promise<void> {
  loadEnvFrom(flag("env-file"));
  const known = new Set(["apply", "preview", "dry-run", "confirm-remote", "out-dir", "env-file"]);
  const unknown = process.argv.slice(2).filter((arg) => !known.has(arg.replace(/^--/, "").split("=")[0]!));
  if (unknown.length > 0) throw new Error(`Unknown argument(s): ${unknown.join(" ")}`);
  const config = resolveLiveDatabaseConnectionConfig();
  if (!config) throw new Error("DATABASE_UNCONFIGURED");
  const apply = flag("apply") !== null;
  const mode = apply ? "apply" : flag("preview") !== null ? "preview" : "dry-run";
  const target = assertBackfillTarget({ apply, confirmRemote: flag("confirm-remote"), connectionString: config.connectionString, target: config.target });
  console.log(`target: ${config.target} ${target.host}/${target.database}${target.remote ? " (remote)" : ""}, workspace ${config.workspaceId}, mode ${mode}`);
  const client = createTransactionalPostgresClient({ connectionString: config.connectionString, max: 2 });
  try {
    const result = await runAgentV1Backfill({ client, mode, workspaceId: config.workspaceId });
    console.log(backfillSummary(result));
    if (mode === "preview") {
      const outDir = path.resolve(flag("out-dir") || path.join("build", "agent-v1-backfill"));
      mkdirSync(outDir, { recursive: true });
      const previewPath = path.join(outDir, `agent-v1-backfill-preview-${target.database}-${new Date().toISOString().replace(/[:.]/g, "")}.json`);
      writeFileSync(previewPath, `${JSON.stringify(result, null, 2)}\n`, { flag: "wx", mode: 0o600 });
      console.log(`  preview: ${previewPath} (${result.changes.length} changes)`);
    }
  } finally {
    await client.close();
  }
}

if (process.argv[1] && /backfill-agent-v1-fields\.ts$/u.test(process.argv[1])) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? `${error.name}: ${error.message}` : "AGENT_V1_BACKFILL_FAILED");
    process.exitCode = 1;
  });
}
