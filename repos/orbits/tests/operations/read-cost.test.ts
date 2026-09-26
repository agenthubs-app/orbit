import assert from "node:assert/strict";
import test from "node:test";

import { isReadCostAdmin, readCostAdminAccountIds } from "../../features/operations/read-cost/config";
import { median, pendingDayCandidates } from "../../features/operations/read-cost/rollup";
import { createNeonUsageReader } from "../../features/operations/read-cost/neon-usage";

test("admin accounts come only from ORBIT_READ_COST_ADMIN_ACCOUNT_IDS; empty means nobody", () => {
  assert.deepEqual(readCostAdminAccountIds({ ORBIT_READ_COST_ADMIN_ACCOUNT_IDS: " a , b,,a " }), ["a", "b"]);
  assert.deepEqual(readCostAdminAccountIds({}), []);
  assert.equal(isReadCostAdmin("a", { ORBIT_READ_COST_ADMIN_ACCOUNT_IDS: "a,b" }), true);
  assert.equal(isReadCostAdmin("c", { ORBIT_READ_COST_ADMIN_ACCOUNT_IDS: "a,b" }), false);
  assert.equal(isReadCostAdmin("", { ORBIT_READ_COST_ADMIN_ACCOUNT_IDS: "," }), false);
  assert.equal(isReadCostAdmin(undefined, { ORBIT_READ_COST_ADMIN_ACCOUNT_IDS: "a" }), false);
});

test("median handles odd, even and empty inputs", () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(median([]), null);
});

test("rollup candidates are the last 13 complete UTC days, oldest first", () => {
  const days = pendingDayCandidates(new Date("2026-03-20T00:10:00.000Z"));
  assert.equal(days.length, 13);
  assert.equal(days[0], "2026-03-07");
  assert.equal(days.at(-1), "2026-03-19");
});

test("Neon reader: unconfigured is null; a malformed response is 'failed', never a number", async () => {
  assert.equal(createNeonUsageReader({ env: { NEON_API_KEY: "k" }, fetch: fetch }), null);
  assert.equal(createNeonUsageReader({ env: { NEON_PROJECT_ID: "p" }, fetch: fetch }), null);
  const malformed = createNeonUsageReader({
    env: { NEON_API_KEY: "k", NEON_PROJECT_ID: "p" },
    fetch: (async () => Response.json({ projects: [] })) as typeof fetch,
  })!;
  assert.deepEqual(await malformed("2026-03-19"), { status: "failed", reason: "unexpected_response" });
  const throwing = createNeonUsageReader({
    env: { NEON_API_KEY: "k", NEON_PROJECT_ID: "p" },
    fetch: (async () => { throw new TypeError("network down"); }) as typeof fetch,
  })!;
  assert.deepEqual(await throwing("2026-03-19"), { status: "failed", reason: "request_failed" });
  const ok = createNeonUsageReader({
    env: { NEON_API_KEY: "k", NEON_PROJECT_ID: "p" },
    fetch: (async () => Response.json({ projects: [{ project_id: "p", periods: [{ consumption: [{ data_transfer_bytes: 10 }, { data_transfer_bytes: 5 }] }] }] })) as typeof fetch,
  })!;
  assert.deepEqual(await ok("2026-03-19"), { status: "ok", bytes: 15 });
});
