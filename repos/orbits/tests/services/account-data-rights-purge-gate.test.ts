import assert from "node:assert/strict";
import test from "node:test";

test("due purge can run only against the dedicated local test database and never in production", async () => {
  const { assertLocalAccountPurgeTarget, assertLocalAccountPurgeDatabase } = await import("../../features/account/data-rights/purge/local-gate");
  const local = { ORBIT_DATABASE_TARGET: "local", ORBIT_LOCAL_DATABASE_URL: "postgresql://xzhao@127.0.0.1:5432/orbit_line_c_test", NODE_ENV: "test" };
  assert.doesNotThrow(() => assertLocalAccountPurgeTarget(local));
  for (const env of [
    { ...local, ORBIT_LOCAL_DATABASE_URL: "postgresql://xzhao@127.0.0.1:5432/orbit_line_c" },
    { ...local, ORBIT_LOCAL_DATABASE_URL: "postgresql://user@neon.example.com/orbit_line_c_test" },
    { ...local, ORBIT_DATABASE_TARGET: "cloud" },
    { ...local, NODE_ENV: "production" },
    { ...local, VERCEL_ENV: "production" },
  ]) assert.throws(() => assertLocalAccountPurgeTarget(env), /LOCAL_PURGE_DISABLED/);
  const executor = (database: string, address: string) => ({ query: async () => ({ rows: [{ database, address }] }) });
  await assert.doesNotReject(assertLocalAccountPurgeDatabase(executor("orbit_line_c_test", "127.0.0.1") as never));
  await assert.rejects(assertLocalAccountPurgeDatabase(executor("orbit_production", "127.0.0.1") as never), /LOCAL_PURGE_DISABLED/);
  await assert.rejects(assertLocalAccountPurgeDatabase(executor("orbit_line_c_test", "203.0.113.4") as never), /LOCAL_PURGE_DISABLED/);
});
