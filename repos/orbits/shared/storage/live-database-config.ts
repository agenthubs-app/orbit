export type LiveDatabaseTarget = "cloud" | "local";

export interface LiveDatabaseConnectionConfig {
  connectionString: string;
  workspaceId: string;
  target: LiveDatabaseTarget;
}

export type LiveDatabaseEnv = Record<string, string | undefined>;

function readEnv(env: LiveDatabaseEnv, key: string): string | null {
  const value = env[key]?.trim();

  return value ? value : null;
}

// ORBIT_DATABASE_TARGET 决定这台机器连云端库还是本机 Postgres。
// 只有显式写 local 才切本地；未设置、空值和无法识别的值一律按 cloud 处理，
// 部署环境不配这个变量时解析路径与切换前完全一致。
export function resolveLiveDatabaseTarget(
  env: LiveDatabaseEnv = process.env,
): LiveDatabaseTarget {
  return readEnv(env, "ORBIT_DATABASE_TARGET")?.toLowerCase() === "local"
    ? "local"
    : "cloud";
}

export function resolveLiveDatabaseConnectionConfig(
  env: LiveDatabaseEnv = process.env,
): LiveDatabaseConnectionConfig | null {
  const target = resolveLiveDatabaseTarget(env);

  // 本地目标只认 ORBIT_LOCAL_DATABASE_URL：缺配置时返回 null 走既有的
  // "未配置 live 数据库" 分支，而不是悄悄回退到云端连接串。
  const connectionString =
    target === "local"
      ? readEnv(env, "ORBIT_LOCAL_DATABASE_URL")
      : readEnv(env, "ORBIT_EVENT_DATABASE_URL") ??
        readEnv(env, "ORBIT_LIVE_DATABASE_URL") ??
        readEnv(env, "ORBIT_DATABASE_URL");

  if (!connectionString) {
    return null;
  }

  const workspaceId =
    (target === "local" ? readEnv(env, "ORBIT_LOCAL_WORKSPACE_ID") : null) ??
    readEnv(env, "ORBIT_WORKSPACE_ID") ??
    "workspace:default";

  return { connectionString, workspaceId, target };
}
