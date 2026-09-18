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
  // 围栏最外层：生产环境必须显式钉死目标库和 workspace，先于任何目标选择。
  // 放在最前面，是为了让"切换开关"无法把未钉死的生产蒙混过去。
  if (env.VERCEL_ENV === "production" &&
      (!readEnv(env, "ORBIT_EXPECTED_DATABASE_HOST") || !readEnv(env, "ORBIT_EXPECTED_WORKSPACE_ID"))) {
    throw new Error("Production database target must be explicitly pinned.");
  }

  const target = resolveLiveDatabaseTarget(env);

  // 本地目标只认 ORBIT_LOCAL_DATABASE_URL：缺配置时走下面的
  // "未配置 live 数据库" 分支，而不是悄悄回退到云端连接串。
  const connectionString =
    target === "local"
      ? readEnv(env, "ORBIT_LOCAL_DATABASE_URL")
      : readEnv(env, "ORBIT_EVENT_DATABASE_URL") ??
        readEnv(env, "ORBIT_LIVE_DATABASE_URL") ??
        readEnv(env, "ORBIT_DATABASE_URL");

  if (!connectionString) {
    if (readEnv(env, "ORBIT_EXPECTED_DATABASE_HOST")) {
      throw new Error("Production database connection is missing.");
    }
    return null;
  }

  const workspaceId =
    (target === "local" ? readEnv(env, "ORBIT_LOCAL_WORKSPACE_ID") : null) ??
    readEnv(env, "ORBIT_WORKSPACE_ID") ??
    "workspace:default";

  // 钉死校验作用在解析结果上，不是原始 env：这样 target=local 与
  // ORBIT_LOCAL_WORKSPACE_ID 都无法绕过一个已经钉死的生产目标。
  const expectedHost = readEnv(env, "ORBIT_EXPECTED_DATABASE_HOST");
  const expectedWorkspace = readEnv(env, "ORBIT_EXPECTED_WORKSPACE_ID");
  if (expectedHost || expectedWorkspace) {
    let actualHost: string;
    try {
      actualHost = new URL(connectionString).hostname;
    } catch {
      throw new Error("Database connection configuration is invalid.");
    }
    if ((expectedHost && actualHost !== expectedHost) ||
        (expectedWorkspace && workspaceId !== expectedWorkspace)) {
      // Never include connection strings or credentials in diagnostics.
      throw new Error("Database target does not match the approved environment.");
    }
  }

  return { connectionString, workspaceId, target };
}
