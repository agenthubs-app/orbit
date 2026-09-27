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


// Recorded from the official Neon v2 project consumption response shape
// (https://api-docs.neon.tech/reference/getconsumptionhistoryperprojectv2 and
// https://neon.com/docs/guides/consumption-metrics). Zero-valued metrics may be omitted.
function officialV2Body(day: string, metrics: Array<{ metric_name: string; value: number }>) {
  return {
    projects: [
      {
        project_id: "delicate-dawn-54854667",
        periods: [
          {
            period_id: "90c7f107-3fe7-4652-b1da-c61f71043128",
            period_plan: "launch",
            period_start: "2026-02-02T18:04:52Z",
            consumption: [
              { timeframe_start: "2026-03-18T00:00:00Z", timeframe_end: "2026-03-19T00:00:00Z", metrics: [{ metric_name: "public_network_transfer_bytes", value: 999 }] },
              { timeframe_start: `${day}T00:00:00Z`, timeframe_end: "2026-03-20T00:00:00Z", metrics },
            ],
          },
        ],
      },
    ],
    pagination: { cursor: "delicate-dawn-54854667" },
  };
}

const NEON_ENV = { NEON_API_KEY: "k", NEON_PROJECT_ID: "delicate-dawn-54854667", NEON_ORG_ID: "org-cool-breeze-12345678" };

test("Neon reader: unconfigured (key, project or org missing) is null", () => {
  assert.equal(createNeonUsageReader({ env: { NEON_API_KEY: "k" }, fetch: fetch }), null);
  assert.equal(createNeonUsageReader({ env: { NEON_PROJECT_ID: "p" }, fetch: fetch }), null);
  assert.equal(createNeonUsageReader({ env: { NEON_API_KEY: "k", NEON_PROJECT_ID: "p" }, fetch: fetch }), null, "the v2 endpoint requires org_id");
});

test("Neon reader: calls the v2 project consumption endpoint with the transfer metrics and parses the official shape", async () => {
  const urls: URL[] = [];
  const reader = createNeonUsageReader({
    env: NEON_ENV,
    fetch: (async (input: string | URL | Request) => {
      urls.push(new URL(String(input)));
      return Response.json(officialV2Body("2026-03-19", [
        { metric_name: "compute_unit_seconds", value: 84 },
        { metric_name: "public_network_transfer_bytes", value: 1414 },
        { metric_name: "private_network_transfer_bytes", value: 6 },
      ]));
    }) as typeof fetch,
  })!;
  assert.deepEqual(await reader("2026-03-19"), { status: "ok", bytes: 1420 }, "only the requested day, only the transfer metrics");
  assert.equal(urls.length, 1);
  const url = urls[0]!;
  assert.equal(url.origin + url.pathname, "https://console.neon.tech/api/v2/consumption_history/v2/projects");
  assert.equal(url.searchParams.get("org_id"), "org-cool-breeze-12345678");
  assert.equal(url.searchParams.get("project_ids"), "delicate-dawn-54854667");
  assert.deepEqual(url.searchParams.get("metrics")?.split(","), ["public_network_transfer_bytes", "private_network_transfer_bytes"]);
  assert.equal(url.searchParams.get("granularity"), "daily");
  assert.equal(url.searchParams.get("from"), "2026-03-19T00:00:00Z");
  assert.equal(url.searchParams.get("to"), "2026-03-20T00:00:00Z");

  // Zero-valued metrics may be omitted: a present day with no transfer metric is 0 bytes, not an error.
  const zero = createNeonUsageReader({
    env: NEON_ENV,
    fetch: (async () => Response.json(officialV2Body("2026-03-19", [{ metric_name: "compute_unit_seconds", value: 3 }]))) as typeof fetch,
  })!;
  assert.deepEqual(await zero("2026-03-19"), { status: "ok", bytes: 0 });
});

test("Neon reader: an unsupported plan is 'unavailable'; errors and a missing day are 'failed', never a number", async () => {
  const reader = (respond: () => Response | Promise<Response>) =>
    createNeonUsageReader({ env: NEON_ENV, fetch: (async () => respond()) as typeof fetch })!;
  const plan = reader(() => Response.json(
    { message: "This endpoint is not available for your plan. It is only supported with Launch, Scale, Agent, and Enterprise plan accounts." },
    { status: 403 },
  ));
  assert.deepEqual(await plan("2026-03-19"), { status: "unavailable", reason: "plan_unsupported" });
  assert.deepEqual(await reader(() => new Response("{}", { status: 500 }))("2026-03-19"), { status: "failed", reason: "http_500" });
  assert.deepEqual(await reader(() => { throw new TypeError("network down"); })("2026-03-19"), { status: "failed", reason: "request_failed" });
  assert.deepEqual(await reader(() => Response.json({ projects: [] }))("2026-03-19"), { status: "failed", reason: "no_data" });
  // The previously self-invented shape is not accepted.
  const legacy = reader(() => Response.json({ projects: [{ project_id: "delicate-dawn-54854667", periods: [{ consumption: [{ timeframe_start: "2026-03-19T00:00:00Z", data_transfer_bytes: 10 }] }] }] }));
  assert.deepEqual(await legacy("2026-03-19"), { status: "failed", reason: "unexpected_response" });
});
