import assert from "node:assert/strict";
import test from "node:test";

import {
  CANONICAL_REMINDER_PLAN_COLLECTION,
  createCanonicalReminderMaintenanceTask,
  createPostgresCanonicalReminderDueActorScanner,
  DEFAULT_CANONICAL_REMINDER_MAX_ACTORS,
  DEFAULT_CANONICAL_REMINDER_MAX_PLANS_PER_ACTOR,
} from "../../features/notifications/canonical-reminder-maintenance-task";
import type { MaintenanceTaskOutcome } from "../../features/operations/maintenance/pass";

const NOW = new Date("2026-09-16T00:10:00.000Z");

function context(deadline = NOW.getTime() + 60_000) {
  return { deadline, now: () => NOW };
}

function counts(value: MaintenanceTaskOutcome): Record<string, number> {
  if ("skipped" in value) throw new Error(`unexpected skipped task: ${value.skipped}`);
  return value;
}

test("canonical reminder task scans distinct due actors and passes an exact per-actor limit", async () => {
  const calls: Array<{ actorId: string; limit: number; workerId: string }> = [];
  let scannedLimit = 0;
  const task = createCanonicalReminderMaintenanceTask({
    actorScanner: {
      async listDueActorIds(input) {
        scannedLimit = input.limit;
        return ["actor:a", "actor:a", "actor:b", "actor:c"];
      },
    },
    dispatcher: {
      async dispatchDueForActor(input) {
        calls.push(input);
        return {
          claimed: 2,
          inAppDelivered: 2,
          pushDelivered: 0,
          pushFailed: input.actorId === "actor:b" ? 1 : 0,
          quietHoursSuppressed: 0,
        };
      },
    },
    maxActors: 2,
    maxPlansPerActor: 3,
    now: () => NOW,
    workerId: "maintenance-test",
  });

  const result = counts(await task.run(context()));
  assert.equal(scannedLimit, 2);
  assert.deepEqual(calls, [
    { actorId: "actor:a", limit: 3, now: NOW.toISOString(), workerId: "maintenance-test:0" },
    { actorId: "actor:b", limit: 3, now: NOW.toISOString(), workerId: "maintenance-test:1" },
  ]);
  assert.deepEqual(result, {
    actorLimit: 2,
    actorsScanned: 2,
    actorsDeferred: 0,
    actorsFailed: 0,
    claimed: 4,
    inAppDelivered: 4,
    pushDelivered: 0,
    pushFailed: 1,
    quietHoursSuppressed: 0,
    failed: 1,
    truncatedActors: 1,
    plansLimitPerActor: 3,
  });
});

test("canonical reminder task isolates actor failures and defers work after the maintenance deadline", async () => {
  const attempted: string[] = [];
  const task = createCanonicalReminderMaintenanceTask({
    actorScanner: { async listDueActorIds() { return ["actor:a", "actor:b", "actor:c"]; } },
    dispatcher: {
      async dispatchDueForActor({ actorId }) {
        attempted.push(actorId);
        if (actorId === "actor:b") throw new Error("provider failure");
        return { claimed: 1, inAppDelivered: 1, pushDelivered: 0, pushFailed: 0, quietHoursSuppressed: 0 };
      },
    },
    maxActors: 3,
    now: () => NOW,
    workerId: "maintenance-failure-test",
  });

  const result = counts(await task.run(context()));
  assert.deepEqual(attempted, ["actor:a", "actor:b", "actor:c"]);
  assert.equal(result.actorsFailed, 1);
  assert.equal(result.failed, 1);
  assert.equal(result.claimed, 2);

  const deferred = counts(await task.run({ deadline: NOW.getTime(), now: () => NOW }));
  assert.equal(deferred.actorsDeferred, 3);
  assert.equal(deferred.claimed, 0);
});

test("defaults and bounds are explicit, and the SQL scanner is canonical-only and limited", async () => {
  const calls: Array<{ text: string; values?: readonly unknown[] }> = [];
  const scanner = createPostgresCanonicalReminderDueActorScanner({
    client: {
      async query<TRow = Record<string, unknown>>(text, values) {
        calls.push({ text, values });
        return { rows: [{ actor_id: "actor:a" }, { actor_id: null }] as unknown as readonly TRow[] };
      },
    },
    workspaceId: "workspace:test",
  });
  assert.deepEqual(await scanner.listDueActorIds({ now: NOW.toISOString(), limit: 4 }), ["actor:a"]);
  assert.equal(calls.length, 1);
  assert.match(calls[0]?.text ?? "", /collection_name = \$2/u);
  assert.match(calls[0]?.text ?? "", /payload->'entity'->>'status' = 'scheduled'/u);
  assert.deepEqual(calls[0]?.values, ["workspace:test", CANONICAL_REMINDER_PLAN_COLLECTION, NOW.toISOString(), 4]);

  const defaults = createCanonicalReminderMaintenanceTask({
    actorScanner: { async listDueActorIds() { return []; } },
    dispatcher: { async dispatchDueForActor() { throw new Error("must not run"); } },
    workerId: "defaults",
  });
  const empty = counts(await defaults.run({ deadline: Date.now() + 1_000, now: () => NOW }));
  assert.equal(empty.actorLimit, DEFAULT_CANONICAL_REMINDER_MAX_ACTORS);
  assert.equal(empty.plansLimitPerActor, DEFAULT_CANONICAL_REMINDER_MAX_PLANS_PER_ACTOR);

  assert.throws(() => createCanonicalReminderMaintenanceTask({
    actorScanner: { async listDueActorIds() { return []; } },
    dispatcher: { async dispatchDueForActor() { throw new Error("must not run"); } },
    maxActors: 101,
    workerId: "invalid",
  }), /between 1 and 100/u);
});
