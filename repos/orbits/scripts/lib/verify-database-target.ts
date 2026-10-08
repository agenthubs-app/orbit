/**
 * W0016：verify 脚本共用的本机库三重断言（`seed-verify-accounts.ts`、`verify-session-cookie.ts`、
 * `verify-server.sh` 经 `--assert-only` 调用）。失败信息只含 host / 库名 / workspace，不含连接串与凭据。
 */
import { resolveLiveDatabaseConnectionConfig } from "../../shared/storage/live-database-config";

export const VERIFY_EXPECTED_DATABASE_NAME = "orbit_newui_events_20260922";
export const VERIFY_EXPECTED_WORKSPACE_ID = "workspace:orbit-small-staging-20260917";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);

export interface VerifyDatabaseTarget {
  connectionString: string;
  workspaceId: string;
}

/** 三重断言。失败时抛出的信息只含 host / 库名 / workspace，不含连接串与凭据。 */
export function assertVerifyDatabaseTarget(
  env: Record<string, string | undefined> = process.env,
): VerifyDatabaseTarget {
  let config: ReturnType<typeof resolveLiveDatabaseConnectionConfig>;
  try {
    config = resolveLiveDatabaseConnectionConfig(env);
  } catch {
    throw new Error("拒绝执行：数据库配置无法解析。");
  }
  if (!config) throw new Error("拒绝执行：没有配置数据库连接（ORBIT_EVENT_DATABASE_URL）。");
  let url: URL;
  try {
    url = new URL(config.connectionString);
  } catch {
    throw new Error("拒绝执行：数据库连接串无法解析。");
  }
  if (!LOCAL_HOSTS.has(url.hostname)) {
    throw new Error(`拒绝执行：数据库 host 不是本机（${url.hostname}），只允许 localhost / 127.0.0.1。`);
  }
  const databaseName = decodeURIComponent(url.pathname.replace(/^\//u, ""));
  if (databaseName !== VERIFY_EXPECTED_DATABASE_NAME) {
    throw new Error(`拒绝执行：数据库名 ${databaseName || "(空)"} 不等于 ${VERIFY_EXPECTED_DATABASE_NAME}。`);
  }
  if (config.workspaceId !== VERIFY_EXPECTED_WORKSPACE_ID) {
    throw new Error(`拒绝执行：workspace ${config.workspaceId} 不等于 ${VERIFY_EXPECTED_WORKSPACE_ID}。`);
  }
  return { connectionString: config.connectionString, workspaceId: config.workspaceId };
}
