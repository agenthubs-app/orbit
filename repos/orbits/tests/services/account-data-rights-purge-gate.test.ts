import assert from "node:assert/strict";
import test from "node:test";

test("due purge can run only against the dedicated local test database and never in production", async () => {
  const { assertLocalAccountPurgeTarget } = await import("../../features/account/data-rights/purge/local-gate");
  const local = { ORBIT_DATABASE_TARGET: "local", ORBIT_LOCAL_DATABASE_URL: "postgresql://xzhao@127.0.0.1:5432/orbit_line_c_test", NODE_ENV: "test" };
  assert.doesNotThrow(() => assertLocalAccountPurgeTarget(local));
  for (const env of [
    { ...local, ORBIT_LOCAL_DATABASE_URL: "postgresql://xzhao@127.0.0.1:5432/orbit_line_c" },
    { ...local, ORBIT_LOCAL_DATABASE_URL: "postgresql://user@neon.example.com/orbit_line_c_test" },
    { ...local, ORBIT_DATABASE_TARGET: "cloud" },
    { ...local, NODE_ENV: "production" },
    { ...local, VERCEL_ENV: "production" },
  ]) assert.throws(() => assertLocalAccountPurgeTarget(env), /LOCAL_PURGE_DISABLED/);
});
