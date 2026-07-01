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
  const connectionString =
    readEnv(env, "ORBIT_EVENT_DATABASE_URL") ??
    readEnv(env, "ORBIT_LIVE_DATABASE_URL") ??
    readEnv(env, "ORBIT_DATABASE_URL");

  if (!connectionString) {
    return null;
  }

  return {
    connectionString,
    workspaceId: readEnv(env, "ORBIT_WORKSPACE_ID") ?? "workspace:default",
  };
}
