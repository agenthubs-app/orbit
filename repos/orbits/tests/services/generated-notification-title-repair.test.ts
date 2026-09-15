import assert from "node:assert/strict";
import test from "node:test";

import {
  applyGeneratedNotificationTitleRepair,
  planGeneratedNotificationTitleRepair,
} from "../../shared/storage/generated-notification-title-repair";
import {
  createMemoryLiveRecordStore,
  type LiveRecord,
} from "../../shared/storage/live-record-store";

const workspaceId = "workspace:repair-test";
const actorId = "account:generated";
const originalUpdatedAt = "2026-08-19T13:22:52.493Z";

function liveRecord(input: {
  collectionName: string;
  id: string;
  payload: Record<string, unknown>;
  provider?: string;
  userId?: string | null;
}): LiveRecord<Record<string, unknown>> {
  return {
    workspaceId,
    collectionName: input.collectionName,
    recordId: input.id,
    userId: input.userId === undefined ? actorId : input.userId,
    sourceType: "system",
    sourceId: `source:${input.id}`,
    provider: input.provider ?? "generated-relationship-fixtures",
    evidenceIds: input.collectionName === "notifications" ? ["evidence:notification:001"] : [],
    createdAt: "2026-06-30T14:14:38.537Z",
    updatedAt: originalUpdatedAt,
    lifecycleState: "active",
    payload: input.payload,
  };
}

function eligibleRecords(): LiveRecord<Record<string, unknown>>[] {
  return [
    liveRecord({
      collectionName: "notifications",
      id: "notification_001",
      payload: {
        body: "保留正文",
        id: "notification_001",
        status: "pending",
        title: "Review follow-up for contact_021",
        updatedAt: originalUpdatedAt,
      },
    }),
    liveRecord({
      collectionName: "evidence",
      id: "evidence:notification:001",
      userId: null,
      payload: {
        id: "evidence:notification:001",
        summary: "Notification generated for task task_001.",
      },
    }),
    liveRecord({
      collectionName: "tasks",
      id: "task_001",
      payload: {
        contactId: "contact_001",
        id: "task_001",
        title: "复核与佐藤健一的下一步",
      },
    }),
    liveRecord({
      collectionName: "contacts",
      id: "contact_001",
      payload: { displayName: "佐藤健一", id: "contact_001" },
    }),
  ];
}

test("repair plan resolves the current task and contact while ignoring unrelated notifications", async () => {
  const store = createMemoryLiveRecordStore([
    ...eligibleRecords(),
    liveRecord({
      collectionName: "notifications",
      id: "manual",
      provider: "manual",
      payload: { title: "Review follow-up for contact_099" },
    }),
    liveRecord({
      collectionName: "notifications",
      id: "already-readable",
      payload: { title: "复核与高橋智子的下一步" },
    }),
    liveRecord({
      collectionName: "notifications",
      id: "other-account",
      userId: "account:other",
      payload: { title: "Review follow-up for contact_088" },
    }),
  ]);

  const plan = await planGeneratedNotificationTitleRepair({ actorId, store, workspaceId });

  assert.equal(plan.candidateCount, 1);
  assert.equal(plan.rejected.length, 0);
  assert.deepEqual(plan.changes, [{
    contactId: "contact_001",
    fromTitle: "Review follow-up for contact_021",
    notificationId: "notification_001",
    taskId: "task_001",
    toTitle: "复核与佐藤健一的下一步",
  }]);
  assert.match(plan.hash, /^[a-f0-9]{64}$/u);
});

test("repair plan rejects a candidate whose evidence chain cannot prove a current named contact", async () => {
  const records = eligibleRecords().filter(record => record.collectionName !== "contacts");
  const plan = await planGeneratedNotificationTitleRepair({
    actorId,
    store: createMemoryLiveRecordStore(records),
    workspaceId,
  });

  assert.equal(plan.changes.length, 0);
  assert.deepEqual(plan.rejected, [{
    notificationId: "notification_001",
    reason: "contact_not_found",
  }]);
});

test("apply requires the reviewed count and hash, preserves payload fields, and is idempotent", async () => {
  const store = createMemoryLiveRecordStore(eligibleRecords());
  const plan = await planGeneratedNotificationTitleRepair({ actorId, store, workspaceId });

  await assert.rejects(
    applyGeneratedNotificationTitleRepair({
      actorId,
      expectedCount: plan.changes.length,
      expectedHash: "0".repeat(64),
      now: () => "2026-09-15T12:30:00.000Z",
      store,
      workspaceId,
    }),
    /reviewed repair plan no longer matches/u,
  );

  const report = await applyGeneratedNotificationTitleRepair({
    actorId,
    expectedCount: plan.changes.length,
    expectedHash: plan.hash,
    now: () => "2026-09-15T12:30:00.000Z",
    store,
    workspaceId,
  });
  assert.equal(report.updated, 1);

  const notification = store.getRecord({
    collectionName: "notifications",
    recordId: "notification_001",
    workspaceId,
  });
  assert.deepEqual(notification?.payload, {
    body: "保留正文",
    id: "notification_001",
    status: "pending",
    title: "复核与佐藤健一的下一步",
    updatedAt: "2026-09-15T12:30:00.000Z",
  });
  assert.equal(notification?.createdAt, "2026-06-30T14:14:38.537Z");
  assert.equal(notification?.updatedAt, "2026-09-15T12:30:00.000Z");

  const secondPlan = await planGeneratedNotificationTitleRepair({ actorId, store, workspaceId });
  assert.equal(secondPlan.changes.length, 0);
  assert.equal(secondPlan.candidateCount, 0);
});
