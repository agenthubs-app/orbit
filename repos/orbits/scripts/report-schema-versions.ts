/**
 * 迁移预演（只读事务）：列出每张 `*_schema_migrations` 登记表里已执行的版本，以及 AI 额度上线相关的两项现状
 * （ai_usage_ledger 的 purpose 约束是否已含 agent_chat / draft_assist、ai_quota_charges 表是否存在）。
 *   node --import tsx scripts/report-schema-versions.ts
 * 读 .env.local 里的库；生产只在部署构建里跑（`…; exit 1`，不产生新版本）。不输出任何账号或内容。
 * 用法：本机测试库（已跑全部迁移）与生产各跑一次，对比得出生产还差哪些迁移，再决定是否执行 migrate-web-runtime。
 */
import { Pool } from "pg";

import { resolveLiveDatabaseConnectionConfig } from "../shared/storage/live-database-config";
import { loadLocalEnv } from "./load-local-env";

type Row = Record<string, unknown>;

async function main() {
  loadLocalEnv();
  const config = resolveLiveDatabaseConnectionConfig();
  if (!config) throw new Error("DATABASE_UNCONFIGURED");
  const pool = new Pool({ connectionString: config.connectionString, max: 1 });
  const client = await pool.connect();
  const out = (label: string, rows: unknown) => console.info(`[schema-versions] ${label} ${JSON.stringify(rows)}`);
  try {
    await client.query("begin transaction read only");
    const db = await client.query<Row>("select current_database() as db, left(coalesce(host(inet_server_addr()), 'local'), 6) as host_prefix, now() as at");
    out("database", { ...db.rows[0], vercelEnv: process.env.VERCEL_ENV ?? null, workspaceSet: Boolean(config.workspaceId) });
    const tables = await client.query<{ table_name: string }>(
      "select table_name from information_schema.tables where table_schema = current_schema() and table_name like '%schema_migrations' order by table_name",
    );
    for (const { table_name } of tables.rows) {
      const versions = await client.query<Row>(`select version, name from "${table_name.replace(/"/gu, "")}" order by version`);
      out(table_name, versions.rows.map((row) => `${row.version}:${row.name}`));
    }
    const purpose = await client.query<Row>(
      "select pg_get_constraintdef(oid) as def from pg_constraint where conrelid = to_regclass('ai_usage_ledger') and contype = 'c' and pg_get_constraintdef(oid) like '%purpose%'",
    );
    const def = String(purpose.rows[0]?.def ?? "");
    out("ai_usage_ledger.purpose", { found: Boolean(def), agent_chat: def.includes("agent_chat"), draft_assist: def.includes("draft_assist") });
    const charges = await client.query<Row>("select to_regclass('ai_quota_charges') is not null as exists");
    out("ai_quota_charges", charges.rows[0]);
    await client.query("rollback");
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(`[schema-versions] FAILED ${error instanceof Error ? error.message.slice(0, 200) : "unknown"}`);
  process.exitCode = 1;
});
