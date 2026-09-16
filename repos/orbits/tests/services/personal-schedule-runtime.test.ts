import assert from "node:assert/strict";
import test from "node:test";
import { personalScheduleSqlFixture } from "../fixtures/personal-schedule-sql";
import { createPersonalScheduleService } from "../../features/personal-schedule/service";
import { createReminderPlanRepository } from "../../features/notifications/reminder-plan-repository";
import { createInboxRuntime } from "../../features/notifications/inbox-record-service-factory";
import { refreshInboxBusinessRecords } from "../../features/notifications/inbox-business-refresh";
import { assertReminderTargetOwned } from "../../features/notifications/reminder-plan-service-factory";

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
  assert.deepEqual(await f.store.listRecords({ workspaceId: f.workspaceId }), []);
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

test("existing periodic refresh extends the finite plan horizon under the schedule mutation lock", async () => {
  const f = fixture();
  await f.service.create("owner", f.fields);
  const old = await f.repository.listPlans({ actorId: "owner" });
  f.setNow("2026-12-16T08:00:00Z");
  assert.equal(typeof (f.service as any).refreshReminderPlans, "function");
  await (f.service as any).refreshReminderPlans({ actorId: "owner" });
  const plans = await f.repository.listPlans({ actorId: "owner" });
  assert.equal(plans.length > old.length, true);
  assert.equal(plans.some(plan => plan.targetId.endsWith("2027-01-01")), true);
  assert.equal(f.locks.filter(lock => lock === JSON.stringify(["personal-schedule", f.workspaceId, "owner"])).length, 2);
});

test("the existing due inbox refresh produces one notification pointing at the exact occurrence", async () => {
  const f = fixture();
  const { scheduleItem } = await f.service.create("owner", { ...f.fields, recurrence: { frequency: "daily", until: "2026-09-20" } });
  f.setNow("2026-09-18T08:45:00Z");
  const inbox = createInboxRuntime(f);
  await refreshInboxBusinessRecords({ ...f, actorId: "owner", service: inbox.service, since: "2026-09-17T00:00:00Z", now: f.now() });
  await refreshInboxBusinessRecords({ ...f, actorId: "owner", service: inbox.service, since: "2026-09-17T00:00:00Z", now: f.now() });
  const rows = await f.store.listRecords({ workspaceId: f.workspaceId, collectionName: "inboxNotifications", userId: "owner" });
  assert.equal(rows.length, 1);
  const stored = rows[0]!.payload.notification as { id: string };
  const notification = await inbox.service.get("owner", stored.id);
  assert.equal(notification.target.status, "available");
  assert.equal(notification.target.id, `${scheduleItem.id}:occurrence:2026-09-18`);
  assert.equal(notification.scheduledFor, "2026-09-18T08:45:00.000Z");
  assert.equal(notification.revision, 1);
  const destination = await f.service.get({ actorId: "owner", id: notification.target.id });
  assert.equal(destination.startsAt, "2026-09-18T09:00:00.000Z");
  await f.service.remove("owner", destination.id, { expectedUpdatedAt: destination.updatedAt, idempotencyKey: "due-cancel", scope: "occurrence" });
  const cancelled = await inbox.service.get("owner", stored.id);
  assert.equal(cancelled.target.status, "unavailable");
  assert.equal(cancelled.target.href, null);
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
