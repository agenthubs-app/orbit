import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { Pool } from "pg";
import { createLiveContactsListSearchAndFilterService } from "../../features/contacts/live-service";
import {
  createPostgresContactRecordPageReader,
  createStorageContactGraphProvider,
} from "../../features/contacts/storage/contact-live-record-provider";
import { createPostgresContactScopeRecordReader } from "../../features/contacts/storage/contact-scope-postgres-reader";
import { createLiveDashboardAggregateService } from "../../features/dashboard/live-service";
import { createStorageDashboardAggregateProvider } from "../../features/dashboard/storage/dashboard-live-record-provider";
import { createLiveEventCrudAndImportService } from "../../features/events/event-crud-and-import/live-service";
import { createStorageEventStoreProvider } from "../../features/events/event-crud-and-import/providers/storage-event-provider";
import { createNoteAssociationReader } from "../../features/notes/association-reader";
import { createNoteRepository } from "../../features/notes/repository";
import { createNoteService } from "../../features/notes/service";
import { createTaskRepository } from "../../features/tasks/repository";
import { createTaskService } from "../../features/tasks/service";
import { createConfiguredPostgresLiveRecordStore } from "../../shared/storage/configured-live-record-store";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { seedGeneratedRelationshipFixturesIntoLiveStore } from "../../shared/storage/seed-generated-fixtures";
import { createTransactionalPostgresClient } from "../../shared/storage/transactional-postgres";
import {
  assertWithinBudget,
  createReadCostLedger,
  READ_COST_DIMENSIONS,
  ReadCostBudgetError,
  type ReadCost,
  type ReadCostBook,
} from "./read-cost-ledger";

const databaseUrl = process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL;
const BASELINE_PATH = new URL("./read-cost-baseline.json", import.meta.url);
const baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf8")) as {
  actorId: string;
  chains: ReadCostBook;
};
const SEEDED_AT = "2026-09-18T00:00:00.000Z";
const NOTE_COUNT = 12;
const TASK_COUNT = 12;

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
    // Production composition (read-dedupe wrapper included); only the SQL client is swapped for the measured one.
    const configured = createConfiguredPostgresLiveRecordStore({
      createClient: () => ({ query: client.query.bind(client), close: async () => {} }),
      env: {
        ORBIT_DATABASE_TARGET: "local",
        ORBIT_LOCAL_DATABASE_URL: `${databaseUrl}#${schema}`,
        ORBIT_LOCAL_WORKSPACE_ID: workspaceId,
      },
    });
    assert.ok(configured);
    const { store } = configured;
    await seedGeneratedRelationshipFixturesIntoLiveStore({ store, workspaceId, now: () => SEEDED_AT });
    const notes = createNoteService({
      repository: createNoteRepository({ store, workspaceId }),
      associationReader: createNoteAssociationReader({
        contactProvider: createStorageContactGraphProvider({ store, workspaceId }),
        store,
        workspaceId,
      }),
    });
    for (let index = 0; index < NOTE_COUNT; index += 1) {
      await notes.create({
        actorId,
        title: `Baseline note ${index}`,
        body: `Deterministic note body ${index}`,
        idempotencyKey: `read-cost:note:${index}`,
        now: SEEDED_AT,
      });
    }

    // Generated fixture tasks are legacy-shaped and invisible to the canonical task list;
    // the measured actor's tasks are created through the real service like API traffic.
    const tasks = createTaskService({ repository: createTaskRepository({ store, workspaceId, transactionClient: client }) });
    for (let index = 0; index < TASK_COUNT; index += 1) {
      await tasks.create({
        actorId,
        title: `Baseline task ${index}`,
        category: "work",
        idempotencyKey: `read-cost:task:${index}`,
        now: SEEDED_AT,
      });
    }

    const contactProvider = createStorageContactGraphProvider({
      store,
      workspaceId,
      contactScopeRecordReader: createPostgresContactScopeRecordReader({ client, workspaceId }),
      contactRecordPageReader: createPostgresContactRecordPageReader({ client, workspaceId }),
    });
    const chains: Record<string, () => Promise<unknown>> = {
      "contacts.list": async () => {
        const result = await createLiveContactsListSearchAndFilterService({ provider: contactProvider }).listContacts({ actorId });
        assert.ok(result.success, "contacts.list must succeed");
        assert.ok(result.data.contacts.length > 0, "contacts.list must return the actor's contacts");
        return result.data.contacts.length;
      },
      "tasks.list": async () => {
        const items = await tasks.list({ actorId });
        assert.equal(items.length, TASK_COUNT);
        return items.length;
      },
      "notes.list": async () => {
        const items = await notes.list({ actorId });
        assert.equal(items.length, NOTE_COUNT);
        return items.length;
      },
      "dashboard": async () => {
        const result = await createLiveDashboardAggregateService({
          provider: createStorageDashboardAggregateProvider({ store, workspaceId, sqlClient: client }),
        }).getDashboardAggregate({ actorId });
        assert.ok(result.success, "dashboard must succeed");
        return result.success;
      },
      "events.list": async () => {
        const result = await createLiveEventCrudAndImportService({
          provider: createStorageEventStoreProvider({ store, workspaceId }),
        }).listEvents({ actorId });
        assert.ok(result.success, "events.list must succeed");
        return result.success;
      },
    };

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
