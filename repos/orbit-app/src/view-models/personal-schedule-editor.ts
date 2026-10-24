import type { PersonalScheduleContract } from "../api/contract/tasks";
import { personalScheduleRecurrenceSchema } from "../api/schema/personal-schedule";
import type { MessageKey } from "../i18n/messages";
import { localDayStart, localParts, resolveLocalDateTime, shiftCalendarDate, validTimeZone } from "../time/date-time";
export interface PersonalScheduleDraft { title: string; startDate: string; startTime: string; endDate: string; endTime: string; location: string; allDay?: boolean | undefined; meetingMethod?: PersonalScheduleContract["meetingMethod"]; meetingUrl?: string; contactIds?: string[]; noteIds?: string[]; reminderMinutes?: PersonalScheduleContract["reminderMinutes"] | null; recurrence?: PersonalScheduleContract["recurrence"] | null; pickerEndInstant?: string; }
export type PersonalScheduleFields = Record<string, string | number | boolean | string[] | NonNullable<PersonalScheduleContract["recurrence"]> | null>;
export function personalScheduleDraft(item: PersonalScheduleContract | null, zone: string): PersonalScheduleDraft {
  const start = item ? localParts(item.startsAt, zone) : { date: "", time: "" };
  const end = item?.endsAt ? localParts(item.allDay ? Date.parse(item.endsAt) - 1 : item.endsAt, zone) : { date: "", time: "" };
  return { title: item?.title ?? "", startDate: start.date, startTime: start.time, endDate: end.date, endTime: end.time, location: item?.location ?? "", allDay: item?.allDay, meetingMethod: item?.meetingMethod, meetingUrl: item?.meetingUrl ?? "", contactIds: [...(item?.contactIds ?? [])], noteIds: [...(item?.noteIds ?? [])], reminderMinutes: item?.reminderMinutes ?? null, recurrence: item?.recurrence ? { ...item.recurrence } : null };
}
export function applyPersonalScheduleDuration(draft: PersonalScheduleDraft, zone: string, minutes: 30 | 60 | 120, baseline: PersonalScheduleContract | null = null): { kind: "invalid"; messageKey: MessageKey } | { kind: "ready"; draft: PersonalScheduleDraft } {
  if (!validTimeZone(zone)) return { kind: "invalid" as const, messageKey: "schedule.timezoneUnavailable" };
  const previous = personalScheduleDraft(baseline, zone);
  const start = baseline && !baseline.allDay && draft.startDate === previous.startDate && draft.startTime === previous.startTime ? baseline.startsAt : resolveLocalDateTime(draft.startDate, draft.startTime, zone);
  if (!start) return { kind: "invalid", messageKey: "personal60.durationStartRequired" };
  const pickerEndInstant = new Date(Date.parse(start) + minutes * 60_000).toISOString();
  const end = localParts(pickerEndInstant, zone);
  const next = { ...draft, allDay: false, endDate: end.date, endTime: end.time, pickerEndInstant };
  return { kind: "ready", draft: next };
}
export function buildPersonalScheduleChange(item: PersonalScheduleContract | null, draft: PersonalScheduleDraft, zone: string): { kind: "invalid"; messageKey: MessageKey } | { kind: "unchanged" } | { kind: "ready"; fields: PersonalScheduleFields } {
  const invalid = (messageKey: MessageKey) => ({ kind: "invalid" as const, messageKey });
  if (!validTimeZone(zone)) return invalid("schedule.timezoneUnavailable");
  if (!draft.title.trim()) return invalid("personal60.titleRequired");
  const previous = personalScheduleDraft(item, zone);
  const dayStart = draft.allDay ? localDayStart(draft.startDate, zone) : null;
  const start = draft.allDay ? dayStart !== null && localParts(dayStart, zone).date === draft.startDate ? new Date(dayStart).toISOString() : null
    : item && !item.allDay && draft.startDate === previous.startDate && draft.startTime === previous.startTime ? item.startsAt : resolveLocalDateTime(draft.startDate, draft.startTime, zone);
  if (!start) return invalid("personal60.startInvalid");
  let end: string | null = null;
  if (draft.allDay) {
    if (draft.endDate && draft.endDate < draft.startDate) return invalid("personal60.allDayEndInvalid");
    const endDate = shiftCalendarDate(draft.endDate || draft.startDate, 1);
    const endStart = localDayStart(endDate, zone);
    if (endStart === null || localParts(endStart, zone).date !== endDate || endStart <= Date.parse(start)) return invalid("personal60.allDayEndInvalid");
    end = new Date(endStart).toISOString();
  } else if (draft.endDate || draft.endTime) {
    const pickedEnd = draft.pickerEndInstant && Number.isFinite(Date.parse(draft.pickerEndInstant)) ? localParts(draft.pickerEndInstant, zone) : null;
    end = pickedEnd?.date === draft.endDate && pickedEnd.time === draft.endTime ? draft.pickerEndInstant! : item?.endsAt && draft.endDate === previous.endDate && draft.endTime === previous.endTime ? item.endsAt : resolveLocalDateTime(draft.endDate, draft.endTime, zone);
    if (!end || Date.parse(end) <= Date.parse(start)) return invalid("personal60.timedEndInvalid");
  }
  const fields: PersonalScheduleFields = {};
  if (draft.reminderMinutes !== undefined && draft.reminderMinutes !== null && ![0, 5, 15, 30, 60, 1440].includes(draft.reminderMinutes)) return invalid("personal60.invalidReminder");
  if (draft.recurrence && (!personalScheduleRecurrenceSchema.safeParse(draft.recurrence).success || (!item?.seriesId && draft.recurrence.until !== undefined && draft.recurrence.until < draft.startDate))) return invalid("personal60.invalidUntil");
  if (draft.reminderMinutes !== undefined && draft.reminderMinutes !== (item?.reminderMinutes ?? null)) fields.reminderMinutes = draft.reminderMinutes;
  if (draft.recurrence !== undefined && (draft.recurrence?.frequency !== item?.recurrence?.frequency || draft.recurrence?.until !== item?.recurrence?.until)) fields.recurrence = draft.recurrence;
  if (!item?.timeZone && (typeof fields.reminderMinutes === "number" || fields.recurrence)) fields.timeZone = zone;
  if (!item || draft.title.trim() !== item.title) fields.title = draft.title.trim();
  if (!item || start !== item.startsAt) fields.startsAt = start;
  if (end !== (item?.endsAt ?? null)) fields.endsAt = end;
  if (draft.location.trim() !== (item?.location ?? "")) fields.location = draft.location.trim() || null;
  if (draft.allDay !== item?.allDay && draft.allDay !== undefined) fields.allDay = draft.allDay;
  if (!item || fields.startsAt !== undefined || typeof fields.endsAt === "string" || fields.allDay !== undefined) fields.timeZone = zone;
  if (draft.meetingMethod !== item?.meetingMethod && draft.meetingMethod !== undefined) fields.meetingMethod = draft.meetingMethod;
  const url = draft.meetingUrl?.trim() ?? "";
  if (url) { try { const parsed = new URL(url); if (!["http:", "https:"].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password) return invalid("personal60.meetingUrlInvalid"); } catch { return invalid("personal60.meetingUrlInvalid"); } }
  if (url !== (item?.meetingUrl ?? "")) fields.meetingUrl = url || null;
  for (const key of ["contactIds", "noteIds"] as const) {
    const values = draft[key] ?? [];
    if (values.length > 50 || new Set(values).size !== values.length || values.some(value => !value.trim())) return invalid("personal60.associationsInvalid");
    if (JSON.stringify(values) !== JSON.stringify(item?.[key] ?? [])) fields[key] = [...values];
  }
  return Object.keys(fields).length ? { kind: "ready", fields } : { kind: "unchanged" };
}

/** UX-8: a new personal schedule starts at the next full hour and lasts one hour (iOS Calendar's default). */
export function newScheduleDraft(zone: string, now = Date.now()): PersonalScheduleDraft {
  const base = personalScheduleDraft(null, zone);
  if (!validTimeZone(zone)) return base;
  // The next full hour on the zone's own clock (half-hour offset zones included).
  const local = localParts(new Date(now + 60_000).toISOString(), zone);
  const [hour, minute] = local.time.split(":").map(Number) as [number, number];
  const nextHour = minute > 0 ? hour + 1 : hour;
  const startDate = nextHour >= 24 ? shiftCalendarDate(local.date, 1) : local.date;
  const startTime = `${String(nextHour % 24).padStart(2, "0")}:00`;
  const startInstant = resolveLocalDateTime(startDate, startTime, zone);
  if (!startInstant) return base;
  const endParts = localParts(new Date(Date.parse(startInstant) + 3_600_000).toISOString(), zone);
  return { ...base, startDate, startTime, endDate: endParts.date, endTime: endParts.time };
}
