import assert from "node:assert/strict";
import test from "node:test";
import { personalScheduleSqlFixture } from "../fixtures/personal-schedule-sql";
import { createPersonalScheduleService } from "../../features/personal-schedule/service";
import { createReminderPlanRepository } from "../../features/notifications/reminder-plan-repository";
import { createInboxRuntime } from "../../features/notifications/inbox-record-service-factory";
import { backfillBusinessCardInboxRecords } from "../../features/notifications/inbox-business-refresh";
import { reminderPlanNotification } from "../../features/notifications/inbox-business-projections";
import { inboxNotificationId } from "../../features/notifications/inbox-record-service";
import { assertReminderTargetOwned } from "../../features/notifications/reminder-plan-service-factory";
import { createTypedDeliverySources } from "../../features/notifications/typed-delivery-source";
import { createDeliveryPolicyRepository } from "../../features/notifications/delivery-policy-repository";
import type { NotificationDelivery } from "../../features/notifications/delivery-service";
import { createStorageNotificationDeliveryService } from "../../features/notifications/delivery-service";
import { createTypedDeliveryWorker } from "../../features/notifications/typed-delivery-worker";

function fixture() {
  const sql = personalScheduleSqlFixture();
  let at = "2026-09-17T08:00:00Z";
  const input = { ...sql, workspaceId: "runtime-60", now: () => at };
  const service = createPersonalScheduleService(input);
  const repository = createReminderPlanRepository(input);
  const fields = { title: "Reminder", startsAt: "2026-09-18T09:00:00Z", timeZone: "Asia/Tokyo", reminderMinutes: 15 as const, recurrence: { frequency: "daily" as const }, idempotencyKey: "runtime-series" };
  return { ...input, service, repository, fields, setNow: (value: string) => { at = value; } };
}

test("schedule, rules, receipt and reminder plan writes roll back together when plan storage fails", async () => {
  const f = fixture();
  f.failPlans();
  await assert.rejects(f.service.create("owner", f.fields), /plan storage failure/);
  assert.deepEqual(await f.store.listRecords({ limit: "unbounded", workspaceId: f.workspaceId }), []);
  assert.equal(f.locks.includes(JSON.stringify(["personal-schedule", f.workspaceId, "owner"])), true);
});

test("inbox source access recognizes the authoritative occurrence and rejects it after cancellation", async () => {
  const f = fixture();
  const { scheduleItem } = await f.service.create("owner", { ...f.fields, recurrence: { frequency: "daily", until: "2026-09-20" } });
  const plan = (await f.repository.listPlans({ actorId: "owner" }))[0]!;
  const source = { sourceKind: "reminder_plan" as const, sourceId: plan.id, sourceRevision: plan.updatedAt, occurredAt: plan.createdAt, readAt: f.now() };
  const inbox = createInboxRuntime(f);
  assert.equal(await inbox.sourceAccess("owner", source), "available");
  await f.service.remove("owner", plan.targetId, { expectedUpdatedAt: scheduleItem.updatedAt, idempotencyKey: "cancel-instance", scope: "occurrence" });
  assert.equal(await inbox.sourceAccess("owner", source), "unavailable");
  assert.equal(await inbox.sourceAccess("other", source), "unavailable");
});

test("one due series extends its finite plan horizon under the schedule mutation lock", async () => {
  const f = fixture();
  const { scheduleItem } = await f.service.create("owner", f.fields);
  const old = await f.repository.listPlans({ actorId: "owner" });
  f.setNow("2026-12-16T08:00:00Z");
  assert.equal('refreshReminderPlans' in f.service, false, 'the obsolete actor-wide refresh has no fallback entry');
  await f.service.refreshReminderPlansForSeries({ actorId: "owner", id: scheduleItem.id });
  const plans = await f.repository.listPlans({ actorId: "owner" });
  assert.equal(plans.length > old.length, true);
  assert.equal(plans.some(plan => plan.targetId.endsWith("2027-01-01")), true);
  assert.equal(f.locks.filter(lock => lock === JSON.stringify(["personal-schedule", f.workspaceId, "owner"])).length, 2);
});

test("explicit card backfill projects owned batches but leaves reminders to the canonical worker", async () => {
  const f = fixture();
  const { scheduleItem } = await f.service.create("owner", { ...f.fields, recurrence: { frequency: "daily", until: "2026-09-20" } });
  f.setNow("2026-09-18T08:45:00Z");
  const batch = { id: "batch-owner", actorId: "owner", status: "ready_for_review", totalItems: 2, processedItems: 2,
    failedItems: 0, confirmedItems: 0, skippedItems: 0, sourceFiles: [], createdAt: f.now(), updatedAt: f.now(), expiresAt: "2026-10-18T08:45:00Z" };
  await f.store.upsertRecord({ workspaceId: f.workspaceId, collectionName: "businessCardBatches", recordId: batch.id, userId: "owner",
    sourceType: "manual", sourceId: batch.id, evidenceIds: [], lifecycleState: "active", createdAt: batch.createdAt, updatedAt: batch.updatedAt, payload: { batch } });
  const inbox = createInboxRuntime(f);
  await backfillBusinessCardInboxRecords({ ...f, actorId: "owner", service: inbox.service, since: "2026-09-17T00:00:00Z" });
  await backfillBusinessCardInboxRecords({ ...f, actorId: "owner", service: inbox.service, since: "2026-09-17T00:00:00Z" });
  const rows = await f.store.listRecords({ limit: "unbounded", workspaceId: f.workspaceId, collectionName: "inboxNotifications", userId: "owner" });
  assert.equal(rows.length, 1);
  const stored = rows[0]!.payload.notification as { id: string; semanticKey: string; title: string };
  assert.equal(stored.semanticKey, "batch:v1:batch-owner");
  assert.equal(stored.title, "名片处理完成，请复核");
  const notification = await inbox.service.get("owner", stored.id);
  assert.equal(notification.target.status, "available");
  assert.equal(notification.revision, 1);
  const reminderPlan = (await f.repository.listPlans({ actorId: "owner" })).find(plan => plan.targetId.endsWith(":2026-09-18"))!;
  const reminderId = inboxNotificationId("owner", `reminder-plan:${reminderPlan.id}`);
  assert.equal(await f.store.getRecord({ workspaceId: f.workspaceId, collectionName: "inboxNotifications", recordId: reminderId, userId: "owner" }), null,
    "card backfill must not create a reminder from the actor plan collection");
  assert.equal(await inbox.sourceAccess("owner", { sourceKind: "reminder_plan", sourceId: reminderPlan.id,
    sourceRevision: reminderPlan.updatedAt, occurredAt: reminderPlan.createdAt, readAt: f.now() }), "available",
  "reminder target authority remains available to the canonical worker and details");
});

test("the real reminder target authorizer accepts an owned occurrence, not another actor or nonexistent date", async () => {
  const f = fixture();
  const { scheduleItem } = await f.service.create("owner", { ...f.fields, recurrence: { frequency: "weekly" } });
  const input = { store: f.store, workspaceId: f.workspaceId, actorId: "owner", targetType: "schedule_item" as const, targetId: `${scheduleItem.id}:occurrence:2026-09-18` };
  await assertReminderTargetOwned(input);
  await assert.rejects(assertReminderTargetOwned({ ...input, actorId: "other" }));
  await assert.rejects(assertReminderTargetOwned({ ...input, targetId: `${scheduleItem.id}:occurrence:2026-09-19` }));
  await assert.rejects(assertReminderTargetOwned({ ...input, targetId: `${scheduleItem.id}:occurrence:2026-02-30` }));
  await f.service.remove("owner", input.targetId, { expectedUpdatedAt: scheduleItem.updatedAt, idempotencyKey: "cancel-authorized", scope: "occurrence" });
  await assert.rejects(assertReminderTargetOwned(input));
});

test("a stored schedule colliding with an occurrence identity fails closed", async () => {
  const f = fixture();
  const { scheduleItem } = await f.service.create("owner", { ...f.fields, recurrence: { frequency: "weekly" } });
  const id = `${scheduleItem.id}:occurrence:2026-09-18`;
  await f.store.upsertRecord({ workspaceId: f.workspaceId, collectionName: "personal_schedule_items", recordId: id, userId: "owner", sourceType: "manual", sourceId: id, evidenceIds: [], lifecycleState: "active", createdAt: scheduleItem.createdAt, updatedAt: scheduleItem.updatedAt, payload: { ...scheduleItem, id, sourceId: id, recurrence: undefined } });
  await assert.rejects(f.service.get({ actorId: "owner", id }), /identity/i);
});

test("malformed occurrence targets cannot gain authority through an unrelated payload reference", async () => {
  const f = fixture();
  const targetId = "personal:example:occurrence:2026-09";
  await f.store.upsertRecord({ workspaceId: f.workspaceId, collectionName: "contacts", recordId: "contact-ref", userId: "owner", sourceType: "manual", sourceId: "contact-ref", evidenceIds: [], lifecycleState: "active", createdAt: f.now(), updatedAt: f.now(), payload: { reference: targetId } });
  await assert.rejects(assertReminderTargetOwned({ store: f.store, workspaceId: f.workspaceId, actorId: "owner", targetId, targetType: "schedule_item" }));
});

for (const mutation of ["move", "disable", "cancel"] as const) {
  test(`a stale managed reminder source becomes unavailable after ${mutation}`, async () => {
    const f = fixture();
    const { scheduleItem } = await f.service.create("owner", f.fields);
    const old = (await f.repository.listPlans({ actorId: "owner" })).find(plan => plan.targetId.endsWith(":2026-09-18"))!;
    f.setNow("2026-09-18T08:46:00Z");
    const command = { expectedUpdatedAt: scheduleItem.updatedAt, idempotencyKey: `stale-${mutation}`, scope: "series" as const };
    if (mutation === "cancel") await f.service.remove("owner", scheduleItem.id, command);
    else await f.service.update("owner", scheduleItem.id, { ...command, patch: mutation === "disable" ? { reminderMinutes: null } : { startsAt: "2026-09-18T10:00:00Z" } });
    assert.deepEqual(await f.repository.getPlan("owner", old.id), old);
    const inbox = createInboxRuntime(f);
    const source = { sourceKind: "reminder_plan" as const, sourceId: old.id, sourceRevision: old.updatedAt, occurredAt: old.createdAt, readAt: f.now() };
    assert.equal(await inbox.sourceAccess("owner", source), "unavailable");
  });
}

test("a materialized delivered reminder remains visible but its stale queued source cannot dispatch", async () => {
  const f = fixture();
  const { scheduleItem } = await f.service.create("owner", f.fields);
  const initial = (await f.repository.listPlans({ actorId: "owner" })).find(plan => plan.targetId.endsWith(":2026-09-18"))!;
  f.setNow("2026-09-18T08:45:00Z");
  const delivered = { ...initial, status: "delivered" as const, updatedAt: f.now() };
  await f.repository.savePlan(delivered);
  const inbox = createInboxRuntime(f);
  const projected = reminderPlanNotification(delivered, f.now());
  assert.ok(projected);
  await inbox.service.upsert(projected);
  const rows = await f.store.listRecords({ limit: "unbounded", workspaceId: f.workspaceId, collectionName: "inboxNotifications", userId: "owner" });
  const stored = rows[0]!.payload.notification as { id: string; scheduledFor: string };
  await f.store.upsertRecord({ workspaceId: f.workspaceId, collectionName: "notificationCutover", recordId: "owner", userId: "owner", sourceType: "system", sourceId: "owner", evidenceIds: [], lifecycleState: "active", createdAt: f.now(), updatedAt: f.now(), payload: { enabled: true, generation: 1, since: "2026-09-17T00:00:00Z", batchId: "test" } });
  const sources = createTypedDeliverySources({ ...f, actorId: "owner", repository: createDeliveryPolicyRepository(f) });
  const queue = { actorId: "owner", policySource: { kind: "notification", id: stored.id, eventKey: stored.id + ":" + stored.scheduledFor } } as NotificationDelivery;
  assert.notEqual(await sources.resolve(queue), null);
  const ledger = createStorageNotificationDeliveryService({ ...f, actorId: "owner", store: f.store as never });
  const queued = (await ledger.materialize({ signalId: stored.id, signalRevision: "1", phase: "commitment", title: "Reminder", body: "Reminder", scheduledFor: stored.scheduledFor, policySource: queue.policySource })).delivery;
  f.setNow("2026-09-18T08:46:00Z");
  await f.service.update("owner", scheduleItem.id, { expectedUpdatedAt: scheduleItem.updatedAt, idempotencyKey: "delivered-reschedule", scope: "series", patch: { startsAt: "2026-09-18T10:00:00Z" } });
  assert.deepEqual(await f.repository.getPlan("owner", initial.id), delivered);
  assert.equal((await inbox.service.get("owner", stored.id)).target.status, "available");
  assert.equal(await sources.resolve(queue), null);
  let sends = 0;
  const worker = createTypedDeliveryWorker({ ...f, actorId: "owner", ledger, repository: createDeliveryPolicyRepository(f), sources, devices: { listActive: async () => [{ deviceId: "actor-device", token: "boundary-token" }] } as never, push: { send: async () => { sends++; return { receiptId: "boundary-ticket" }; } } });
  assert.equal((await worker.run({ workerId: "stale-managed" })).suppressed, 1);
  assert.equal((await ledger.get(queued.deliveryId))?.status, "suppressed");
  assert.equal(sends, 0);
});

test("managed source eligibility rejects altered fire times and moved single-instance rules", async () => {
  const f = fixture();
  const { scheduleItem } = await f.service.create("owner", f.fields);
  const plan = (await f.repository.listPlans({ actorId: "owner" })).find(value => value.targetId.endsWith(":2026-09-18"))!;
  const source = { sourceKind: "reminder_plan" as const, sourceId: plan.id, sourceRevision: plan.updatedAt, occurredAt: plan.createdAt, readAt: f.now() };
  const inbox = createInboxRuntime({ ...f, forDispatch: true });
  assert.equal(await inbox.sourceAccess("owner", source), "available");
  await f.repository.savePlan({ ...plan, fireAt: "2026-09-18T08:44:00.000Z" });
  assert.equal(await inbox.sourceAccess("owner", source), "unavailable");
  await f.repository.savePlan(plan);
  f.setNow("2026-09-18T08:46:00Z");
  await f.service.update("owner", plan.targetId, { expectedUpdatedAt: scheduleItem.updatedAt, idempotencyKey: "move-one-due", scope: "occurrence", patch: { startsAt: "2026-09-18T10:00:00Z" } });
  assert.deepEqual(await f.repository.getPlan("owner", plan.id), plan);
  assert.equal(await inbox.sourceAccess("owner", source), "unavailable");
});

test("ordinary task and manually authored schedule reminders retain their original source authority", async () => {
  const f = fixture();
  const { scheduleItem } = await f.service.create("owner", { ...f.fields, recurrence: undefined });
  const managed = (await f.repository.listPlans({ actorId: "owner" }))[0]!;
  await f.store.upsertRecord({ workspaceId: f.workspaceId, collectionName: "tasks", recordId: "task:ordinary", userId: "owner", sourceType: "manual", sourceId: "task:ordinary", evidenceIds: [], lifecycleState: "active", createdAt: f.now(), updatedAt: f.now(), payload: { task: { id: "task:ordinary", status: "open", updatedAt: f.now() } } });
  const inbox = createInboxRuntime({ ...f, forDispatch: true });
  for (const plan of [
    { ...managed, id: "manual-task", targetType: "task" as const, targetId: "task:ordinary" },
    { ...managed, id: "manual-schedule", targetId: scheduleItem.id },
  ]) {
    await f.repository.savePlan(plan);
    const source = { sourceKind: "reminder_plan" as const, sourceId: plan.id, sourceRevision: plan.updatedAt, occurredAt: plan.createdAt, readAt: f.now() };
    assert.equal(await inbox.sourceAccess("owner", source), "available");
    assert.equal(await inbox.sourceAccess("other", source), "unavailable");
  }
});
