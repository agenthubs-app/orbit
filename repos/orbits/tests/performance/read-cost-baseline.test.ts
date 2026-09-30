import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { Pool } from "pg";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { createTransactionalPostgresClient } from "../../shared/storage/transactional-postgres";
import {
  assertWithinBudget,
  createReadCostLedger,
  READ_COST_DIMENSIONS,
  ReadCostBudgetError,
  type ReadCost,
  type ReadCostBook,
} from "./read-cost-ledger";
import { seedReadCostChains } from "./read-cost-chains";

const databaseUrl = process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL;
const BASELINE_PATH = new URL("./read-cost-baseline.json", import.meta.url);
const baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf8")) as {
  actorId: string;
  chains: ReadCostBook;
};

test("assertWithinBudget bites: one unit under the actual cost fails on that dimension", () => {
  const actual: ReadCostBook = { "contacts.list": { queries: 3, rows: 40, bytes: 9000 } };
  assertWithinBudget(actual, { "contacts.list": { queries: 3, rows: 40, bytes: 9000 } });
  for (const dimension of READ_COST_DIMENSIONS) {
    const tight: ReadCost = { ...actual["contacts.list"]!, [dimension]: actual["contacts.list"]![dimension] - 1 };
    assert.throws(
      () => assertWithinBudget(actual, { "contacts.list": tight }),
      (error: unknown) => error instanceof ReadCostBudgetError
        && error.violations.length === 1
        && error.violations[0]!.startsWith(`contacts.list.${dimension}:`),
    );
  }
  assert.throws(() => assertWithinBudget(actual, {}), /no budget recorded/);
});

test("operation chains are reproducible and stay within the frozen read-cost baseline", {
  skip: databaseUrl ? false : "Explicit isolated PostgreSQL URL required",
  timeout: 120_000,
}, async () => {
  assert.ok(databaseUrl);
  assert.ok(["localhost", "127.0.0.1"].includes(new URL(databaseUrl).hostname), "Local read-cost baseline only");
  const schema = `read_cost_${randomUUID().replaceAll("-", "")}`;
  const workspaceId = `workspace:read-cost:${schema}`;
  const actorId = baseline.actorId;
  const admin = new Pool({ connectionString: databaseUrl, max: 1 });
  const pool = new Pool({ connectionString: databaseUrl, max: 2, options: `-c search_path=${schema} -c statement_timeout=20000` });
  const ledger = createReadCostLedger();
  const client = createTransactionalPostgresClient({ connectionString: databaseUrl, pool, readMetrics: ledger.observer });
  try {
    await admin.query(`create schema ${schema}`);
    await client.query(ORBIT_RECORDS_SCHEMA_SQL);
    const chains = await seedReadCostChains({ client, databaseUrl, schema, workspaceId, actorId });

    const actual: ReadCostBook = {};
    for (const [chain, run] of Object.entries(chains)) {
      const first = await ledger.measure(chain, run);
      const second = await ledger.measure(chain, run);
      assert.deepEqual(first.result, second.result, `${chain} result differs between runs`);
      assert.deepEqual(second.cost, first.cost, `${chain} read cost is not reproducible`);
      assert.ok(first.cost.queries > 0, `${chain} must issue at least one measured SQL read`);
      actual[chain] = first.cost;
    }
    console.info(JSON.stringify({ event: "read_cost_baseline_measured", chains: actual }));

    // Ratchet: never above the frozen baseline. Later sprints move the JSON down, not up.
    assertWithinBudget(actual, baseline.chains);
    // The budget must bite against real numbers, not just synthetic ones.
    for (const [chain, cost] of Object.entries(actual)) {
      assert.throws(
        () => assertWithinBudget({ [chain]: cost }, { [chain]: { ...cost, rows: cost.rows - 1 } }),
        ReadCostBudgetError,
        `${chain}: budget one row under actual must fail`,
      );
    }
  } finally {
    try { await client.close(); } finally {
      try { await admin.query(`drop schema if exists ${schema} cascade`); } finally { await admin.end(); }
    }
  }
});
