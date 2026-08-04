import assert from "node:assert/strict";
import test from "node:test";

import { createPostgresCanonicalRegistrationMethods } from "../../features/events/event-operations/storage/canonical-registration-repository";
import type { EventOperationsPostgresRuntime } from "../../features/events/event-operations/storage/postgres-client";
import type { EventRegistration } from "../../features/events/registration/contract";

test("canonical registration batch lookup keys the account by actor_id in one query", async () => {
  const calls: Array<{ params: readonly unknown[]; sql: string }> = [];
  const runtime = {
    client: {
      async query(sql: string, params: readonly unknown[]) {
        calls.push({ params, sql });
        return { rows: [] };
      },
    },
    workspaceId: "workspace:test",
  } as unknown as EventOperationsPostgresRuntime;
  const methods = createPostgresCanonicalRegistrationMethods(runtime);

  const result = await methods.listCanonicalRegistrationsForUser(
    "actor:registered",
    ["event:a", "event:b", "event:a"],
  );

  assert.deepEqual(result, []);
  assert.equal(calls.length, 1);
  assert.match(calls[0]!.sql, /membership_head\.actor_id = \$2/u);
  assert.doesNotMatch(calls[0]!.sql, /membership_head\.participant_id = \$2/u);
  assert.match(calls[0]!.sql, /membership_head\.event_id = any\(\$3::text\[\]\)/u);
  assert.deepEqual(calls[0]!.params, [
    "workspace:test",
    "actor:registered",
    ["event:a", "event:b"],
  ]);
});

test("canonical registration batch lookup skips storage for an empty catalogue", async () => {
  let queryCount = 0;
  const runtime = {
    client: {
      async query() {
        queryCount += 1;
        return { rows: [] };
      },
    },
    workspaceId: "workspace:test",
  } as unknown as EventOperationsPostgresRuntime;

  const result = await createPostgresCanonicalRegistrationMethods(
    runtime,
  ).listCanonicalRegistrationsForUser("actor:registered", []);

  assert.deepEqual(result, []);
  assert.equal(queryCount, 0);
});

test("canonical registration activation wrapper opens one transaction and delegates all SQL to its executor", async () => {
  let transactionCount = 0;
  const executors: unknown[] = [];
  const queries: string[] = [];
  const executor = {
    async query(sql: string) {
      queries.push(sql);
      if (sql.includes("from event_ops_events event_row")) {
        return {
          rowCount: 1,
          rows: [
            {
              db_now: "2026-08-05T10:00:00.000Z",
              profile_edit_deadline_at: null,
              registration_migration_state: "legacy",
            },
          ],
        };
      }
      if (sql.includes("head_count")) {
        return { rowCount: 1, rows: [{ head_count: "0", orphan_count: "0" }] };
      }
      if (sql.includes("from event_ops_membership_heads")) {
        return { rowCount: 1, rows: [{ count: "0" }] };
      }
      return { rowCount: 1, rows: [] };
    },
  };
  const runtime = {
    client: {
      async transaction<TValue>(
        operation: (value: unknown) => Promise<TValue>,
      ) {
        transactionCount += 1;
        executors.push(executor);
        return operation(executor);
      },
    },
    workspaceId: "workspace:test",
  } as unknown as EventOperationsPostgresRuntime;

  const result = await createPostgresCanonicalRegistrationMethods(
    runtime,
  ).activateCanonicalRegistrations("event:activation", [], {
    evidenceId: "operator-manifest:test",
    profileEditDeadlineAt: "2026-08-06T10:00:00.000Z",
    source: "operator_manifest",
  });

  assert.deepEqual(result, {
    count: 0,
    hash: "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
    state: "canonical",
  });
  assert.equal(transactionCount, 1);
  assert.deepEqual(executors, [executor]);
  assert.equal(queries.length, 6);
});

test("canonical registration activation rejects invalid identities before opening a transaction", async () => {
  let transactionCount = 0;
  const runtime = {
    client: {
      async transaction() {
        transactionCount += 1;
        throw new Error("transaction must not open for invalid input");
      },
    },
    workspaceId: "workspace:test",
  } as unknown as EventOperationsPostgresRuntime;

  await assert.rejects(
    createPostgresCanonicalRegistrationMethods(
      runtime,
    ).activateCanonicalRegistrations("event:expected", [
      { eventId: "event:mismatched" } as EventRegistration,
    ]),
    (error: unknown) =>
      error instanceof Error &&
      error.message ===
        "Legacy event registrations contain mismatched or duplicate migration identities." &&
      (error as { code?: unknown }).code === "EVENT_REGISTRATION_WINDOW_INVALID",
  );
  assert.equal(transactionCount, 0);
});
