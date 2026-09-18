const localHosts = new Set(["localhost", "127.0.0.1", "[::1]", "::1", "postgres", "db"]);

/** Fail before loading test modules; never print a connection string. */
export function assertLocalTestDatabases(env = process.env) {
  for (const [key, value] of Object.entries(env)) {
    if (!value?.trim() || !/(?:DATABASE_URL|POSTGRES_URL|PGHOST)(?:_|$)/.test(key)) continue;
    let hostname;
    try {
      hostname = key.includes("PGHOST") ? value.trim() : new URL(value).hostname;
    } catch {
      throw new Error(`Refusing test run: ${key} is not a valid local database configuration.`);
    }
    if (hostname.startsWith("/")) continue; // Unix socket; no external server.
    if (!localHosts.has(hostname) && !hostname.endsWith(".invalid")) {
      throw new Error(`Refusing test run: ${key} points outside the local test boundary. Use a dedicated local PostgreSQL database; cloud smoke checks must be separately budgeted.`);
    }
  }
}
