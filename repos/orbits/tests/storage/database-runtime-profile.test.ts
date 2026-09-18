import assert from "node:assert/strict";
import test from "node:test";
import { resolveDatabaseRuntimeProfile } from "../../shared/storage/database-runtime-profile";

// Pool sizes and timeouts follow the runtime, never a global constant.
test("Vercel resolves to the serverless profile: small pool, client-side query timeout, no server GUC through the pooler", () => {
  const profile = resolveDatabaseRuntimeProfile({ VERCEL: "1" });
  assert.equal(profile.kind, "serverless");
  assert.deepEqual(
    { pool: profile.poolMax, tx: profile.transactionalPoolMax, query: profile.queryTimeoutMillis, statement: profile.statementTimeoutMillis },
    { pool: 2, tx: 2, query: 15_000, statement: null },
  );
  assert.equal(profile.connectionTimeoutMillis, 10_000);
  assert.equal(profile.idleTimeoutMillis, 10_000);
});

test("an explicit worker runtime gets a larger pool and long timeouts on both sides", () => {
  const profile = resolveDatabaseRuntimeProfile({ ORBIT_DB_RUNTIME: "worker", VERCEL: "1" });
  assert.equal(profile.kind, "worker", "explicit runtime wins over VERCEL detection");
  assert.deepEqual(
    { pool: profile.poolMax, tx: profile.transactionalPoolMax, query: profile.queryTimeoutMillis, statement: profile.statementTimeoutMillis, idle: profile.idleTimeoutMillis },
    { pool: 4, tx: 4, query: 60_000, statement: 60_000, idle: 30_000 },
  );
});

test("local is the default and every profile keeps the transactional pool at least two wide (sprint 0062 precondition)", () => {
  const local = resolveDatabaseRuntimeProfile({});
  assert.equal(local.kind, "local");
  assert.deepEqual({ pool: local.poolMax, tx: local.transactionalPoolMax, query: local.queryTimeoutMillis, statement: local.statementTimeoutMillis }, { pool: 4, tx: 4, query: 30_000, statement: 30_000 });
  for (const env of [{}, { VERCEL: "1" }, { ORBIT_DB_RUNTIME: "worker" }]) {
    assert.ok(resolveDatabaseRuntimeProfile(env).transactionalPoolMax >= 2, JSON.stringify(env));
  }
});

test("environment overrides apply per knob and invalid values fail loudly", () => {
  const profile = resolveDatabaseRuntimeProfile({
    VERCEL: "1", ORBIT_DB_POOL_MAX: "3", ORBIT_DB_TX_POOL_MAX: "5", ORBIT_DB_QUERY_TIMEOUT_MS: "2500", ORBIT_DB_STATEMENT_TIMEOUT_MS: "4000",
  });
  assert.deepEqual(
    { kind: profile.kind, pool: profile.poolMax, tx: profile.transactionalPoolMax, query: profile.queryTimeoutMillis, statement: profile.statementTimeoutMillis },
    { kind: "serverless", pool: 3, tx: 5, query: 2500, statement: 4000 },
  );
  for (const bad of [{ ORBIT_DB_POOL_MAX: "0" }, { ORBIT_DB_POOL_MAX: "many" }, { ORBIT_DB_QUERY_TIMEOUT_MS: "-1" }, { ORBIT_DB_RUNTIME: "cloud" }]) {
    assert.throws(() => resolveDatabaseRuntimeProfile(bad), /ORBIT_DB_/, JSON.stringify(bad));
  }
});
