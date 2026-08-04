import assert from "node:assert/strict";
import test from "node:test";

import { createPostgresCanonicalRegistrationMethods } from "../../features/events/event-operations/storage/canonical-registration-repository";
import type { EventOperationsPostgresRuntime } from "../../features/events/event-operations/storage/postgres-client";

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
