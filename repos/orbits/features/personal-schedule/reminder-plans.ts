import { createHash } from "node:crypto";
import { SCHEDULE_REMINDER_PAGE_SIZE, type PersonalScheduleReminderRepository } from "./reminder-plan-storage";
import { validTimeZone } from "../tasks/local-date-time";
import type { ReminderPlanDTO } from "../notifications/reminder-plan-contract";
import type { PersonalScheduleContract } from "../../shared/contract/tasks";

// Dispatch authority is the current schedule, not the plan's delivery timestamp.
// Keep historical plan facts immutable when the series has since changed.
export function isCurrentPersonalScheduleReminderPlan(plan: ReminderPlanDTO, actorId: string, item: PersonalScheduleContract | null): boolean {
  if (!plan.id.startsWith("schedule-reminder:")) return true;
  if (plan.targetType !== "schedule_item" || plan.ownerUserId !== actorId || plan.accountId !== actorId || plan.status === "cancelled" || !item || item.ownerUserId !== actorId || item.accountId !== actorId || item.id !== plan.targetId || item.state === "cancelled" || typeof item.reminderMinutes !== "number" || ![0, 5, 15, 30, 60, 1440].includes(item.reminderMinutes) || !item.timeZone || item.timeZone !== plan.timeZone) return false;
  const start = Date.parse(item.startsAt);
  if (!Number.isFinite(start) || !Number.isFinite(Date.parse(item.updatedAt))) return false;
  const fireAt = new Date(start - item.reminderMinutes * 60_000).toISOString();
  const scope = createHash("sha256").update(JSON.stringify([actorId, item.seriesId ?? item.id])).digest("hex").slice(0, 24);
  const revision = createHash("sha256").update(JSON.stringify([item.updatedAt, item.reminderMinutes])).digest("hex").slice(0, 24);
  const occurrenceKey = createHash("sha256").update(JSON.stringify([item.id, fireAt])).digest("hex").slice(0, 24);
  return plan.id === `schedule-reminder:${scope}:${revision}:${occurrenceKey}` && plan.fireAt === fireAt;
}

// The schedule mutation/extension caller must supply a repository bound to its
// transaction and hold the same actor schedule lock as schedule/exception writes.
export async function reconcilePersonalScheduleReminderPlans(input: {
  repository: PersonalScheduleReminderRepository;
  actorId: string;
  seriesId: string;
  revision: string;
  title: string;
  timeZone: string;
  now: string;
  reminderMinutes: number | null;
  occurrences: readonly { id: string; startsAt: string }[];
}): Promise<void> {
  const at = Date.parse(input.now);
  if (!input.actorId || !input.seriesId || !input.title.trim() || !Number.isFinite(at) || !Number.isFinite(Date.parse(input.revision)) || !validTimeZone(input.timeZone)) throw new Error("Invalid schedule reminder context.");
  if (input.reminderMinutes !== null && ![0, 5, 15, 30, 60, 1440].includes(input.reminderMinutes)) throw new Error("Invalid schedule reminder lead time.");
  const scope = createHash("sha256").update(JSON.stringify([input.actorId, input.seriesId])).digest("hex").slice(0, 24);
  const prefix = `schedule-reminder:${scope}:`;
  const revision = createHash("sha256").update(JSON.stringify([input.revision, input.reminderMinutes])).digest("hex").slice(0, 24);
  const revisionPrefix = `${prefix}${revision}:`;
  const desired = new Map<string, { id: string; startsAt: string; fireAt: string }>();
  if (input.reminderMinutes !== null) for (const occurrence of input.occurrences) {
    if (occurrence.id !== input.seriesId && !occurrence.id.startsWith(`${input.seriesId}:occurrence:`)) throw new Error("Reminder occurrence does not belong to this series.");
    const start = Date.parse(occurrence.startsAt);
    if (!Number.isFinite(start)) throw new Error("Invalid reminder occurrence start.");
    const fireAt = new Date(start - input.reminderMinutes * 60_000).toISOString();
    const occurrenceKey = createHash("sha256").update(JSON.stringify([occurrence.id, fireAt])).digest("hex").slice(0, 24);
    desired.set(`${revisionPrefix}${occurrenceKey}`, { ...occurrence, fireAt });
  }
  let afterId: string | undefined;
  for (;;) {
    // Only obsolete, future, pending plans for this series cross the storage
    // boundary. A keyset (not OFFSET) remains valid as cancellation changes the
    // result set. Current-revision and historical plans are never downloaded.
    const page = await input.repository.cancellationPage({ actorId: input.actorId, prefix,
      ...(input.reminderMinutes !== null ? { keepRevisionPrefix: revisionPrefix } : {}), now: input.now, afterId });
    for (const plan of page) await input.repository.savePlan({ ...plan, status: "cancelled", cancelledAt: input.now, updatedAt: input.now });
    if (page.length < SCHEDULE_REMINDER_PAGE_SIZE) break;
    const next = page.at(-1)!.id;
    if (afterId !== undefined && next <= afterId) throw new Error("Schedule reminder cursor did not advance.");
    afterId = next;
  }
  // No historical delivery and no resurrection, including cancelled/deleted
  // identities. Existence is a bounded ID batch, not a full plan per occurrence.
  const future = [...desired].filter(([, occurrence]) => Date.parse(occurrence.startsAt) > at && Date.parse(occurrence.fireAt) >= at);
  for (let offset = 0; offset < future.length; offset += SCHEDULE_REMINDER_PAGE_SIZE) {
    const batch = future.slice(offset, offset + SCHEDULE_REMINDER_PAGE_SIZE);
    const existing = new Set(await input.repository.existingPlanIds(input.actorId, batch.map(([id]) => id)));
    for (const [id, occurrence] of batch) {
      if (existing.has(id)) continue;
      await input.repository.savePlan({ id, accountId: input.actorId, ownerUserId: input.actorId, targetType: "schedule_item", targetId: occurrence.id,
        fireAt: occurrence.fireAt, timeZone: input.timeZone, status: "scheduled", channels: ["in_app", "ios_push"], title: input.title, body: input.title,
        deepLink: `/schedule/personal/${encodeURIComponent(occurrence.id)}`, createdBy: "user", createdAt: input.now, updatedAt: input.now });
    }
  }
}
