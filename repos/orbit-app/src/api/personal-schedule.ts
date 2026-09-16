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
    if (!item || item.ownerUserId !== actorId || item.accountId !== actorId || ids.has(item.id)) return null;
    ids.add(item.id);
    if (item.state !== "cancelled") items.push(item);
  }
  return items.sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
}
export function readPersonalSchedule(data: unknown): PersonalScheduleContract | null {
  if (!data || typeof data !== "object" || !("scheduleItem" in data)) return null;
  const result = personalScheduleSchema.safeParse(data.scheduleItem);
  if (!result.success || (result.data.endsAt && Date.parse(result.data.endsAt) <= Date.parse(result.data.startsAt))) return null;
  const item = result.data;
  if (item.seriesId !== undefined || item.occurrenceDate !== undefined) {
    if (!item.seriesId || !item.occurrenceDate || !item.recurrence || !item.timeZone || item.sourceId !== item.seriesId || item.id !== `${item.seriesId}:occurrence:${item.occurrenceDate}`) return null;
    const date = new Date(`${item.occurrenceDate}T00:00:00Z`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== item.occurrenceDate) return null;
  } else if (item.sourceId !== item.id) return null;
  return result.data as PersonalScheduleContract;
}
export function personalScheduleReceiptMatches(data: unknown, actorId: string, id: string | undefined, fields: Record<string, unknown>, deleted = false): boolean {
  const item = readPersonalSchedule(data);
  if (!item || !actorId || item.ownerUserId !== actorId || item.accountId !== actorId || (id && item.id !== id)) return false;
  if (deleted) return "deleted" in (data as object) && (data as { deleted: unknown }).deleted === true && item.state === "cancelled";
  if (item.state === "cancelled") return false;
  for (const [field, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    const actual = (item as unknown as Record<string, unknown>)[field];
    if (field === "recurrence" && value !== null) {
      if (!value || typeof value !== "object" || !actual || typeof actual !== "object") return false;
      const wanted = value as Record<string, unknown>, saved = actual as Record<string, unknown>;
      if (Object.keys(wanted).some(key => !["frequency", "until"].includes(key)) || wanted.frequency !== saved.frequency || wanted.until !== saved.until) return false;
      continue;
    }
    if (value === null ? actual !== undefined : Array.isArray(value) ? !Array.isArray(actual) || actual.length !== value.length || value.some((entry, index) => actual[index] !== entry) : field === "startsAt" || field === "endsAt" ? typeof actual !== "string" || Date.parse(actual) !== Date.parse(String(value)) : actual !== value) return false;
  }
  return true;
}
