import { personalScheduleSchema } from "./schema/personal-schedule";
import type { PersonalScheduleContract } from "./contract/tasks";

export const personalSchedulePath = (id?: string) => id ? `/api/schedule-items/${encodeURIComponent(id)}` : "/api/schedule-items";
export const personalScheduleListPath = "/api/schedule-items?scope=personal";
export function personalScheduleList(data: unknown, actorId: string): PersonalScheduleContract[] | null {
  if (!actorId || !data || typeof data !== "object" || !("scheduleItems" in data) || !Array.isArray(data.scheduleItems)) return null;
  const items: PersonalScheduleContract[] = [];
  const ids = new Set<string>();
  for (const raw of data.scheduleItems) {
    if (!raw || typeof raw !== "object") return null;
    if (raw.kind !== "personal") continue;
    const item = readPersonalSchedule({ scheduleItem: raw });
    if (!item || item.ownerUserId !== actorId || item.accountId !== actorId || item.sourceId !== item.id || ids.has(item.id)) return null;
    ids.add(item.id);
    if (item.state !== "cancelled") items.push(item);
  }
  return items.sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
}
export function readPersonalSchedule(data: unknown): PersonalScheduleContract | null {
  if (!data || typeof data !== "object" || !("scheduleItem" in data)) return null;
  const result = personalScheduleSchema.safeParse(data.scheduleItem);
  return result.success ? result.data as PersonalScheduleContract : null;
}
export function personalScheduleReceiptMatches(data: unknown, actorId: string, id: string | undefined, fields: Record<string, unknown>, deleted = false): boolean {
  const item = readPersonalSchedule(data);
  if (!item || !actorId || item.ownerUserId !== actorId || item.accountId !== actorId || item.sourceId !== item.id || (id && item.id !== id)) return false;
  if (deleted) return "deleted" in (data as object) && (data as { deleted: unknown }).deleted === true && item.state === "cancelled";
  if (item.state === "cancelled") return false;
  for (const [field, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    const actual = (item as unknown as Record<string, unknown>)[field];
    if (value === null ? actual !== undefined : field === "startsAt" || field === "endsAt" ? typeof actual !== "string" || Date.parse(actual) !== Date.parse(String(value)) : actual !== value) return false;
  }
  return true;
}
