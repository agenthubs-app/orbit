import assert from "node:assert/strict";
import test from "node:test";
import { deliveryPolicyId, readHistoricalNotificationSuppressions } from "../../features/notifications/delivery-policy-repository";
import { readPersonalScheduleOccurrenceExceptions } from "../../features/personal-schedule/occurrence-exceptions";
import { personalScheduleSqlFixture } from "./personal-schedule-sql";

const recordedAt = "2026-09-25T12:00:00.000Z";
const collectionName = "notificationHistoricalSuppressions";

async function seedSuppression(input: {
  fixture: ReturnType<typeof personalScheduleSqlFixture>;
  workspaceId: string;
  actorId: string;
  eventKey: string;
  recordId?: string;
  recordActorId?: string;
  recordUserId?: string;
  collectionName?: string;
  lifecycleState?: "active" | "archived" | "deleted";
  payload?: Record<string, unknown>;
}) {
  const recordId = input.recordId ?? deliveryPolicyId(input.actorId, input.eventKey);
  const recordActorId = input.recordActorId ?? input.actorId;
  await input.fixture.store.upsertRecord({
    workspaceId: input.workspaceId,
    collectionName: input.collectionName ?? collectionName,
    recordId,
    userId: input.recordUserId ?? recordActorId,
    sourceType: "system",
    sourceId: recordId,
    evidenceIds: [],
    lifecycleState: input.lifecycleState ?? "active",
    createdAt: recordedAt,
    updatedAt: recordedAt,
    payload: {
      actorId: recordActorId,
      eventKey: input.eventKey,
      reason: "historical_backfill",
      batchId: "batch-1",
      recordedAt,
      ...input.payload,
    },
  });
}

test("SQL fixture joins historical suppressions by workspace, collection, and actor-derived record key", async () => {
  const fixture = personalScheduleSqlFixture();
  const eventKey = "inbox:reminder-1:2026-09-25T12:00:00.000Z";
  const missingEventKey = "inbox:reminder-2:2026-09-25T12:00:00.000Z";
  const wrongCollectionEventKey = "inbox:reminder-wrong-collection:2026-09-25T12:00:00.000Z";
  const wrongRecordKeyEventKey = "inbox:reminder-wrong-record-key:2026-09-25T12:00:00.000Z";
  await seedSuppression({ fixture, workspaceId: "workspace-a", actorId: "owner", eventKey, payload: { batchId: "😀".repeat(4096) } });
  await seedSuppression({ fixture, workspaceId: "workspace-a", actorId: "owner", eventKey: wrongCollectionEventKey, collectionName: "otherCollection" });
  await seedSuppression({ fixture, workspaceId: "workspace-a", actorId: "owner", eventKey: wrongRecordKeyEventKey, recordId: "wrong-derived-record-id" });

  const found = await readHistoricalNotificationSuppressions({
    executor: fixture.client,
    workspaceId: "workspace-a",
    actorId: "owner",
    eventKeys: [eventKey, missingEventKey, wrongCollectionEventKey, wrongRecordKeyEventKey],
  });
  assert.deepEqual([...found], [eventKey]);

  const wrongWorkspace = await readHistoricalNotificationSuppressions({
    executor: fixture.client,
    workspaceId: "workspace-b",
    actorId: "owner",
    eventKeys: [eventKey],
  });
  assert.deepEqual([...wrongWorkspace], []);
});

test("SQL fixture returns a same-key foreign actor fact as invalid instead of hiding it", async () => {
  const fixture = personalScheduleSqlFixture();
  const eventKey = "inbox:reminder-foreign:2026-09-25T12:00:00.000Z";
  await seedSuppression({
    fixture,
    workspaceId: "workspace-a",
    actorId: "owner",
    eventKey,
    recordActorId: "intruder",
    recordUserId: "intruder",
  });

  await assert.rejects(
    readHistoricalNotificationSuppressions({
      executor: fixture.client,
      workspaceId: "workspace-a",
      actorId: "owner",
      eventKeys: [eventKey],
    }),
    /HISTORICAL_PUSH_FACT_INVALID/,
  );
});

test("SQL fixture returns an empty set when no suppression fact exists", async () => {
  const fixture = personalScheduleSqlFixture();
  const found = await readHistoricalNotificationSuppressions({
    executor: fixture.client,
    workspaceId: "workspace-a",
    actorId: "owner",
    eventKeys: ["inbox:missing:2026-09-25T12:00:00.000Z"],
  });
  assert.deepEqual([...found], []);
});

test("SQL fixture fail-closes malformed suppression evidence", async (t) => {
  const invalidEvidence: Array<{ name: string; payload?: Record<string, unknown>; lifecycleState?: "active" | "archived" | "deleted" }> = [
    { name: "actor payload", payload: { actorId: "intruder" } },
    { name: "event key", payload: { eventKey: "inbox:other" } },
    { name: "reason", payload: { reason: "manual" } },
    { name: "empty batch id", payload: { batchId: "" } },
    { name: "oversized batch id", payload: { batchId: "x".repeat(4097) } },
    { name: "oversized non-BMP batch id", payload: { batchId: "😀".repeat(4097) } },
    { name: "non-string recorded time", payload: { recordedAt: 123 } },
    { name: "archived lifecycle", lifecycleState: "archived" },
  ];

  for (const [index, invalid] of invalidEvidence.entries()) {
    await t.test(invalid.name, async () => {
      const fixture = personalScheduleSqlFixture();
      const actorId = "owner";
      const eventKey = `inbox:invalid-${index}:2026-09-25T12:00:00.000Z`;
      await seedSuppression({ fixture, workspaceId: "workspace-a", actorId, eventKey, ...invalid });

      await assert.rejects(
        readHistoricalNotificationSuppressions({
          executor: fixture.client,
          workspaceId: "workspace-a",
          actorId,
          eventKeys: [eventKey],
        }),
        /HISTORICAL_PUSH_FACT_INVALID/,
      );
    });
  }
});

test("SQL fixture bounds occurrence exceptions by the exact same-series record ID and parameterized limit", async () => {
  const fixture = personalScheduleSqlFixture();
  const workspaceId = "workspace-schedule";
  const actorId = "owner";
  const seriesId = "personal:series";
  const collectionName = "personal_schedule_occurrence_exceptions";
  for (const occurrenceDate of ["2026-09-18", "2026-09-19"]) {
    const updatedAt = `${occurrenceDate}T08:00:00.000Z`;
    const recordId = `${seriesId}:occurrence:${occurrenceDate}`;
    await fixture.store.upsertRecord({
      workspaceId,
      collectionName,
      recordId,
      userId: actorId,
      sourceType: "manual",
      sourceId: seriesId,
      evidenceIds: [],
      lifecycleState: "active",
      createdAt: updatedAt,
      updatedAt,
      payload: {
        seriesId,
        occurrenceDate,
        cancelled: false,
        patch: {
          startsAt: `${occurrenceDate}T11:00:37Z`,
          endsAt: `${occurrenceDate}T12:00:37Z`,
        },
        updatedAt,
      },
    });
  }

  const exceptions = await readPersonalScheduleOccurrenceExceptions({
    store: fixture.store,
    workspaceId,
    actorId,
    seriesId,
    occurrenceDate: "2026-09-19",
  });
  assert.equal(exceptions.length, 1);
  assert.equal(exceptions[0]!.occurrenceDate, "2026-09-19");
});
