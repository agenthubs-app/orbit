import assert from "node:assert/strict";
import test from "node:test";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";
import { createReminderPlanRepository } from "../../features/notifications/reminder-plan-repository";
import { reconcilePersonalScheduleReminderPlans } from "../../features/personal-schedule/reminder-plans";

function fixture() {
  const repository = createReminderPlanRepository({ store: createMemoryLiveRecordStore(), workspaceId: "reminder-60" });
  const input = { repository, actorId: "owner", seriesId: "personal:series", revision: "2026-09-17T08:00:00Z", title: "Meeting", timeZone: "Asia/Tokyo", now: "2026-09-17T08:00:00Z", reminderMinutes: 15,
    occurrences: [{ id: "personal:series:occurrence:2026-09-17", startsAt: "2026-09-17T09:00:00Z" }, { id: "personal:series:occurrence:2026-09-18", startsAt: "2026-09-18T09:00:00Z" }] };
  return { repository, input };
}

test("derived reminder plans persist once with the exact occurrence destination and fire time", async () => {
  const { repository, input } = fixture();
  await reconcilePersonalScheduleReminderPlans(input);
  await reconcilePersonalScheduleReminderPlans(input);
  const plans = await repository.listPlans({ actorId: "owner" });
  assert.equal(plans.length, 2);
  assert.equal(plans[0]!.fireAt, "2026-09-17T08:45:00.000Z");
  assert.equal(plans[0]!.targetId, input.occurrences[0]!.id);
  assert.equal(plans[0]!.deepLink, "/schedule/personal/personal%3Aseries%3Aoccurrence%3A2026-09-17");
  assert.deepEqual(plans[0]!.channels, ["in_app", "ios_push"]);
});

test("rescheduling cancels old revision plans while preserving unrelated user plans", async () => {
  const { repository, input } = fixture();
  await reconcilePersonalScheduleReminderPlans(input);
  const original = await repository.listPlans({ actorId: "owner" });
  await repository.savePlan({ ...original[0]!, id: "manual-unrelated", targetId: "another-schedule" });
  await reconcilePersonalScheduleReminderPlans({ ...input, revision: "2026-09-17T08:01:00Z", occurrences: [{ ...input.occurrences[0]!, startsAt: "2026-09-17T10:00:00Z" }] });
  assert.equal((await repository.getPlan("owner", original[0]!.id))!.status, "cancelled");
  assert.equal((await repository.getPlan("owner", original[1]!.id))!.status, "cancelled");
  assert.equal((await repository.getPlan("owner", "manual-unrelated"))!.status, "scheduled");
  assert.equal((await repository.listPlans({ actorId: "owner" })).length, 2);
});

test("turning off reminders cancels all managed plans and replay does not resurrect them", async () => {
  const { repository, input } = fixture();
  await reconcilePersonalScheduleReminderPlans(input);
  await reconcilePersonalScheduleReminderPlans({ ...input, reminderMinutes: null });
  await reconcilePersonalScheduleReminderPlans(input);
  assert.equal((await repository.listPlans({ actorId: "owner" })).length, 0);
});

test("past starts or elapsed lead times do not cause historical reminders", async () => {
  const { repository, input } = fixture();
  await reconcilePersonalScheduleReminderPlans({ ...input, now: "2026-09-17T08:50:00Z" });
  const plans = await repository.listPlans({ actorId: "owner" });
  assert.equal(plans.length, 1);
  assert.equal(plans[0]!.targetId, input.occurrences[1]!.id);
});

test("extending a window preserves current-revision due plans pending inbox materialization", async () => {
  const { repository, input } = fixture();
  await reconcilePersonalScheduleReminderPlans(input);
  const first = (await repository.listPlans({ actorId: "owner" }))[0]!;
  await reconcilePersonalScheduleReminderPlans({ ...input, now: "2026-09-17T08:50:00Z", occurrences: [input.occurrences[1]!] });
  assert.equal((await repository.getPlan("owner", first.id))!.status, "scheduled");
});

test("another actor cannot cancel an owner's plans even with the same series identifier", async () => {
  const { repository, input } = fixture();
  await reconcilePersonalScheduleReminderPlans(input);
  await reconcilePersonalScheduleReminderPlans({ ...input, actorId: "other", reminderMinutes: null });
  assert.equal((await repository.listPlans({ actorId: "owner" })).length, 2);
  assert.equal((await repository.listPlans({ actorId: "other" })).length, 0);
});

for (const reminderMinutes of [15, null]) test(`changing a series (${reminderMinutes}) preserves delivered history and only cancels future pending plans`, async () => {
  const { repository, input } = fixture();
  await reconcilePersonalScheduleReminderPlans(input);
  const original = await repository.listPlans({ actorId: "owner" });
  const delivered = { ...original[0]!, status: "delivered" as const, deliveredAt: "2026-09-17T08:45:00Z", updatedAt: "2026-09-17T08:45:00Z" };
  await repository.savePlan(delivered);
  const elapsed = { ...original[0]!, id: `${original[0]!.id}:elapsed`, status: "scheduled" as const };
  await repository.savePlan(elapsed);
  await reconcilePersonalScheduleReminderPlans({ ...input, now: "2026-09-17T09:00:00Z", revision: "2026-09-17T09:00:00Z", reminderMinutes });
  assert.deepEqual(await repository.getPlan("owner", delivered.id), delivered);
  assert.deepEqual(await repository.getPlan("owner", elapsed.id), elapsed);
  assert.equal((await repository.getPlan("owner", original[1]!.id))!.status, "cancelled");
});
