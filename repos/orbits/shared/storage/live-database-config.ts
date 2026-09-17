export interface LiveDatabaseConnectionConfig {
  connectionString: string;
  workspaceId: string;
}

export type LiveDatabaseEnv = Record<string, string | undefined>;

function readEnv(env: LiveDatabaseEnv, key: string): string | null {
  const value = env[key]?.trim();

  return value ? value : null;
}

export function resolveLiveDatabaseConnectionConfig(
  env: LiveDatabaseEnv = process.env,
): LiveDatabaseConnectionConfig | null {
  if (env.VERCEL_ENV === "production" &&
      (!readEnv(env, "ORBIT_EXPECTED_DATABASE_HOST") || !readEnv(env, "ORBIT_EXPECTED_WORKSPACE_ID"))) {
    throw new Error("Production database target must be explicitly pinned.");
  }
  const connectionString =
    readEnv(env, "ORBIT_EVENT_DATABASE_URL") ??
    readEnv(env, "ORBIT_LIVE_DATABASE_URL") ??
    readEnv(env, "ORBIT_DATABASE_URL");

  if (!connectionString) {
    if (readEnv(env, "ORBIT_EXPECTED_DATABASE_HOST")) {
      throw new Error("Production database connection is missing.");
    }
    return null;
  }

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
        (expectedWorkspace && readEnv(env, "ORBIT_WORKSPACE_ID") !== expectedWorkspace)) {
      // Never include connection strings or credentials in diagnostics.
      throw new Error("Database target does not match the approved environment.");
    }
  }

  return {
    connectionString,
    workspaceId: readEnv(env, "ORBIT_WORKSPACE_ID") ?? "workspace:default",
  };
}
