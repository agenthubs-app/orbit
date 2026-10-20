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
