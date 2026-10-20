import type { TransactionalSqlExecutor } from "../../../../shared/storage/transactional-postgres";

export function assertLocalAccountPurgeTarget(env: Record<string, string | undefined> = process.env): void {
  if (env.ORBIT_DATABASE_TARGET !== "local" || env.NODE_ENV === "production" || env.VERCEL_ENV === "production") {
    throw new Error("LOCAL_PURGE_DISABLED");
  }
  let url: URL;
  try { url = new URL(env.ORBIT_LOCAL_DATABASE_URL ?? ""); }
  catch { throw new Error("LOCAL_PURGE_DISABLED"); }
  if (!["postgres:", "postgresql:"].includes(url.protocol) ||
      !["localhost", "127.0.0.1"].includes(url.hostname) || url.pathname !== "/orbit_line_c_test") {
    throw new Error("LOCAL_PURGE_DISABLED");
  }
}

/** Check the actual connection as well as the configured URL before deleting anything. */
export async function assertLocalAccountPurgeDatabase(sql: TransactionalSqlExecutor): Promise<void> {
  const result = await sql.query<{ database: string; address: string | null }>(
    "select current_database() as database, host(inet_server_addr()) as address",
  );
  const row = result.rows[0];
  if (row?.database !== "orbit_line_c_test" || !["127.0.0.1", "::1"].includes(row.address ?? "")) {
    throw new Error("LOCAL_PURGE_DISABLED");
  }
}
