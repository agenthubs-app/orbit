import { createHash } from "node:crypto";
import type { ReminderPlanRepository } from "../notifications/reminder-plan-repository";
import { validTimeZone } from "../tasks/local-date-time";

// The schedule mutation/extension caller must supply a repository bound to its
// transaction and hold the same actor schedule lock as schedule/exception writes.
export async function reconcilePersonalScheduleReminderPlans(input: {
  repository: ReminderPlanRepository;
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
  const existing = await input.repository.listPlans({ actorId: input.actorId, includeCancelled: true });
  const desired = new Map<string, { id: string; startsAt: string; fireAt: string }>();
  if (input.reminderMinutes !== null) for (const occurrence of input.occurrences) {
    if (occurrence.id !== input.seriesId && !occurrence.id.startsWith(`${input.seriesId}:occurrence:`)) throw new Error("Reminder occurrence does not belong to this series.");
    const start = Date.parse(occurrence.startsAt);
    if (!Number.isFinite(start)) throw new Error("Invalid reminder occurrence start.");
    const fireAt = new Date(start - input.reminderMinutes * 60_000).toISOString();
    const occurrenceKey = createHash("sha256").update(JSON.stringify([occurrence.id, fireAt])).digest("hex").slice(0, 24);
    desired.set(`${revisionPrefix}${occurrenceKey}`, { ...occurrence, fireAt });
  }
  for (const plan of existing) {
    if (plan.ownerUserId !== input.actorId || plan.accountId !== input.actorId || !plan.id.startsWith(prefix) || plan.status !== "scheduled" || Date.parse(plan.fireAt) < at) continue;
    // Current-revision due plans survive window extension so the authoritative
    // inbox refresh can still consume them. Mutations have a new revision.
    if (input.reminderMinutes !== null && plan.id.startsWith(revisionPrefix)) continue;
    await input.repository.savePlan({ ...plan, status: "cancelled", cancelledAt: input.now, updatedAt: input.now });
  }
  for (const [id, occurrence] of desired) {
    // No historical delivery and no resurrection, including cancelled plans.
    if (Date.parse(occurrence.startsAt) <= at || Date.parse(occurrence.fireAt) < at || await input.repository.getPlan(input.actorId, id)) continue;
    await input.repository.savePlan({ id, accountId: input.actorId, ownerUserId: input.actorId, targetType: "schedule_item", targetId: occurrence.id,
      fireAt: occurrence.fireAt, timeZone: input.timeZone, status: "scheduled", channels: ["in_app", "ios_push"], title: input.title, body: input.title,
      deepLink: `/schedule/personal/${encodeURIComponent(occurrence.id)}`, createdBy: "user", createdAt: input.now, updatedAt: input.now });
  }
}
