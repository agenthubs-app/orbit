/**
 * 只跑 network-analysis 一组迁移（2026-11-27 用户授权：AI 额度上线 = v9 ai-usage-agent-chat-draft-assist + v10 ai-quota-tier-charges）。
 *   node --import tsx scripts/migrate-network-analysis.ts            预演：只读，打印已执行版本与将要执行的版本
 *   node --import tsx scripts/migrate-network-analysis.ts --apply    执行（只在待执行版本恰好是 --expect 列出的版本时才动手）
 *   --expect 9,10（默认）
 * 不用 migrate-web-runtime：那会顺带执行其他模块尚未授权的迁移。生产只在部署构建里跑（`…; exit 1`）。
 */
import { Pool } from "pg";

import { NETWORK_ANALYSIS_MIGRATIONS, runNetworkAnalysisMigrations } from "../features/network-analysis/migrations";
import { createConfiguredEventOperationsPostgresRuntime } from "../features/events/event-operations/storage/postgres-client";
import { resolveLiveDatabaseConnectionConfig } from "../shared/storage/live-database-config";
import { loadLocalEnv } from "./load-local-env";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const expectArg = args.find((arg) => arg.startsWith("--expect="))?.slice("--expect=".length) ?? "9,10";
const expected = expectArg.split(",").map(Number).sort((a, b) => a - b);
const log = (label: string, value: unknown) => console.info(`[migrate-network-analysis] ${label} ${JSON.stringify(value)}`);

async function applied(connectionString: string): Promise<number[]> {
  const pool = new Pool({ connectionString, max: 1 });
  try {
    const db = await pool.query("select current_database() as db, now() as at");
    log("database", { ...db.rows[0], vercelEnv: process.env.VERCEL_ENV ?? null });
    const exists = await pool.query("select to_regclass('network_analysis_schema_migrations') is not null as ok");
    if (!exists.rows[0]?.ok) return [];
    const rows = await pool.query<{ version: number }>("select version from network_analysis_schema_migrations order by version");
    return rows.rows.map((row) => Number(row.version));
  } finally {
    await pool.end();
  }
}

async function main() {
  loadLocalEnv();
  const config = resolveLiveDatabaseConnectionConfig();
  if (!config) throw new Error("DATABASE_UNCONFIGURED");
  const before = await applied(config.connectionString);
  const pending = NETWORK_ANALYSIS_MIGRATIONS.map((m) => m.version).filter((v) => !before.includes(v)).sort((a, b) => a - b);
  log("applied", before);
  log("pending", NETWORK_ANALYSIS_MIGRATIONS.filter((m) => pending.includes(m.version)).map((m) => `${m.version}:${m.name}`));
  if (!apply) { log("mode", "dry-run (no writes)"); return; }
  if (JSON.stringify(pending) !== JSON.stringify(expected)) throw new Error(`REFUSED pending=${pending.join(",")} expected=${expected.join(",")}`);
  const runtime = createConfiguredEventOperationsPostgresRuntime();
  if (!runtime) throw new Error("DATABASE_UNCONFIGURED");
  try {
    await runNetworkAnalysisMigrations(runtime.client);
  } finally {
    await runtime.client.close();
  }
  const after = await applied(config.connectionString);
  log("after", after);
  if (!expected.every((v) => after.includes(v))) throw new Error("NOT_APPLIED");
  log("result", `network-analysis migrated: ${expected.join(",")}`);
}

main().catch((error) => {
  console.error(`[migrate-network-analysis] FAILED ${error instanceof Error ? error.message.slice(0, 200) : "unknown"}`);
  process.exitCode = 1;
});
