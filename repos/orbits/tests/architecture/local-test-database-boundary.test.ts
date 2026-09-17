import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";

test("standard test entry refuses remote databases before loading test files without leaking secrets", () => {
  const result = spawnSync(process.execPath, ["scripts/run-node-tests.mjs", "must-not-be-loaded.test.ts"], {
    encoding: "utf8",
    env: { ...process.env, ORBIT_EVENT_DATABASE_URL: "postgres://user:do-not-log-password@ep-test.neon.tech/db" },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /outside the local test boundary/);
  assert.doesNotMatch(result.stderr, /do-not-log-password|ep-test|Could not find/);
});

test("local database boundary allows the dedicated local PostgreSQL database", () => {
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", "import { assertLocalTestDatabases } from './scripts/assert-local-test-databases.mjs'; assertLocalTestDatabases({ ORBIT_LIFECYCLE_TEST_DATABASE_URL: 'postgresql://localhost/orbit_cutover_test_20260917' });"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
});
