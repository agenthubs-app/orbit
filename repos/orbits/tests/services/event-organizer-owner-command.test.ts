import assert from "node:assert/strict";
import test from "node:test";

import {
  parseEventOrganizerOwnerCommand,
  runEventOrganizerOwnerCommand,
} from "../../scripts/migrate-event-organizer-owners";
import type {
  EventOrganizerOwnerPlan,
  EventOrganizerOwnerSqlClient,
} from "../../features/events/organizer-accounts/owner-migration";

const actorId = "account_orbit_generated";
const hash = "a".repeat(64);

test("owner migration command accepts only the reviewed dry-run and apply forms", () => {
  assert.deepEqual(parseEventOrganizerOwnerCommand([
    "--dry-run", "--xiaoyu-actor-id", actorId,
  ]), { kind: "dry-run", xiaoyuActorId: actorId });
  assert.deepEqual(parseEventOrganizerOwnerCommand([
    "--apply", "--xiaoyu-actor-id", actorId,
    "--expected-count", "16", "--expected-plan-hash", hash,
  ]), {
    expectedCount: 16,
    expectedPlanHash: hash,
    kind: "apply",
    xiaoyuActorId: actorId,
  });
});

test("owner migration command rejects invalid flags before database setup", () => {
  for (const args of [
    [],
    ["--dry-run", "--apply", "--xiaoyu-actor-id", actorId],
    ["--dry-run", "--dry-run", "--xiaoyu-actor-id", actorId],
    ["--dry-run", "--xiaoyu-actor-id", actorId, "--unknown"],
    ["--dry-run", "--xiaoyu-actor-id", "account_other"],
    ["--apply", "--xiaoyu-actor-id", actorId, "--expected-count", "15", "--expected-plan-hash", hash],
    ["--apply", "--xiaoyu-actor-id", actorId, "--expected-count", "16", "--expected-plan-hash", "A".repeat(64)],
    ["--apply", "--xiaoyu-actor-id", actorId, "--expected-count", "16", "--expected-count", "16", "--expected-plan-hash", hash],
  ]) {
    assert.throws(() => parseEventOrganizerOwnerCommand(args));
  }
});

function plan(): EventOrganizerOwnerPlan {
  return {
    assignments: Array.from({ length: 16 }, (_, index) => ({
      accountId: `user-${index}`,
      eventId: `event-${index}`,
    })),
    count: 16,
    hash,
    manifestVersion: "event-organizers-v1",
    sourceHash: "b".repeat(64),
  };
}

test("owner migration runner parses before dependencies and dry-run performs no transaction", async () => {
  let createCount = 0;
  const operations: string[] = [];
  const logs: string[] = [];
  const client: EventOrganizerOwnerSqlClient = {
    query: async (text: string) => {
      operations.push(text);
      return { rows: [] };
    },
  };

  await assert.rejects(
    runEventOrganizerOwnerCommand([
      "--dry-run", "--xiaoyu-actor-id", "account_other",
    ], {
      createRuntime: () => {
        createCount += 1;
        return { client, close: async () => {}, workspaceId: "workspace:test" };
      },
    }),
    /reviewed Xiaoyu actor ID/i,
  );
  assert.equal(createCount, 0);

  await runEventOrganizerOwnerCommand([
    "--dry-run", "--xiaoyu-actor-id", actorId,
  ], {
    buildPlan: async () => plan(),
    createRuntime: () => {
      createCount += 1;
      return { client, close: async () => { operations.push("close"); }, workspaceId: "workspace:test" };
    },
    log: (value) => { logs.push(value); },
  });
  assert.equal(createCount, 1);
  assert.deepEqual(operations, ["close"]);
  assert.equal(logs.length, 1);
});
