import assert from "node:assert/strict";
import test from "node:test";

import { invalidateAccountRightsAccessState, readAccountRightsGateState } from "../../features/account/data-rights/access-policy";

// LF4: the per-request account-rights gate (proxy.ts) is cached per instance and lets requests through when the store
// cannot be read, instead of one query per request and a 503 for every API on any database error.
const KEYS = ["ORBIT_DATABASE_URL", "ORBIT_LIVE_DATABASE_URL", "ORBIT_EVENT_DATABASE_URL", "ORBIT_LOCAL_DATABASE_URL"] as const;

function withEnv<T>(value: string | undefined, run: () => Promise<T>): Promise<T> {
  const saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));
  for (const key of KEYS) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  return run().finally(() => { for (const key of KEYS) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; } });
}

test("LF4: an unreachable store lets the request through (no 503 for every API)", async () => {
  invalidateAccountRightsAccessState();
  const state = await withEnv("postgresql://nobody@127.0.0.1:1/orbit_unreachable", () => readAccountRightsGateState("user:gate-1"));
  assert.equal(state, "active");
});

test("LF4: without a configured store the gate is open (production misconfiguration no longer locks every API)", async () => {
  invalidateAccountRightsAccessState();
  const state = await withEnv(undefined, () => readAccountRightsGateState("user:gate-2"));
  assert.equal(state, "active");
});
