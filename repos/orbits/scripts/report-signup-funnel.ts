/**
 * 注册漏斗统计（只读事务）。用法：
 *   node --import tsx scripts/report-signup-funnel.ts [--days 30] [--from 2026-11-25 --to 2026-12-25]
 * 读 .env.local 里的库；要看别的库就在命令前设 ORBIT_EVENT_DATABASE_URL 和 ORBIT_WORKSPACE_ID。
 */
import { Pool } from "pg";

import { formatSignupFunnel, readSignupFunnel } from "../features/signup-funnel/report";
import { resolveLiveDatabaseConnectionConfig } from "../shared/storage/live-database-config";
import { loadLocalEnv } from "./load-local-env";

function arg(name: string): string | undefined {
  const at = process.argv.indexOf(`--${name}`);
  return at > 0 ? process.argv[at + 1] : undefined;
}

const tokyoDay = (at: number) => new Date(at + 9 * 3_600_000).toISOString().slice(0, 10);
const isDay = (value: string | undefined): value is string => /^\d{4}-\d{2}-\d{2}$/u.test(value ?? "");

async function main() {
  loadLocalEnv();
  const config = resolveLiveDatabaseConnectionConfig();
  if (!config) throw new Error("DATABASE_UNCONFIGURED");
  const days = Math.min(Math.max(Number(arg("days") ?? 30) || 30, 1), 366);
  const from = arg("from") ?? tokyoDay(Date.now() - (days - 1) * 86_400_000);
  const to = arg("to") ?? tokyoDay(Date.now());
  if (!isDay(from) || !isDay(to)) throw new Error("--from / --to 要写成 YYYY-MM-DD");
  const pool = new Pool({ connectionString: config.connectionString, max: 1 });
  const client = await pool.connect();
  try {
    await client.query("begin transaction read only");
    const rows = await readSignupFunnel({ query: (sql, values) => client.query(sql, values ? [...values] : undefined) as never }, config.workspaceId, from, to);
    await client.query("rollback");
    console.info(`注册漏斗 ${from} 〜 ${to}（东京日期，按第一次打开或建号那天分组；括号是占上一步的比例）\n`);
    console.info(formatSignupFunnel(rows));
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "REPORT_FAILED");
  process.exitCode = 1;
});
