import type { PersonalScheduleContract } from "../../../../shared/contract/tasks";
import { calendarDate, localDateTimeCandidates, localParts, resolveLocalDateTime, validTimeZone } from "../../../../features/tasks/local-date-time";
export interface PersonalScheduleDraft { title: string; startDate: string; startTime: string; endDate: string; endTime: string; location: string; allDay?: boolean | undefined; meetingMethod?: PersonalScheduleContract["meetingMethod"]; meetingUrl?: string; contactIds?: string[]; noteIds?: string[]; reminderMinutes?: PersonalScheduleContract["reminderMinutes"] | null; recurrence?: PersonalScheduleContract["recurrence"] | null; pickerEndInstant?: string; }
export type PersonalScheduleFields = Record<string, string | boolean | string[] | number | NonNullable<PersonalScheduleContract["recurrence"]> | null>;
function personalScheduleDayStart(date: string, zone: string): string | null {
  if (!calendarDate(date) || !validTimeZone(zone)) return null;
  const midnight = localDateTimeCandidates(date, "00:00", zone);
  if (midnight.length) return new Date(midnight[0]!).toISOString();
  const center = Date.parse(`${date}T00:00:00Z`); let low = center - 48 * 3_600_000; let high = center + 48 * 3_600_000;
  while (high - low > 1) { const middle = Math.floor((low + high) / 2); if (localParts(middle, zone).date < date) low = middle; else high = middle; }
  return localParts(high, zone).date === date ? new Date(high).toISOString() : null;
}
export function personalScheduleDraft(item: PersonalScheduleContract | null, zone: string): PersonalScheduleDraft {
  const start = item ? localParts(item.startsAt, zone) : { date: "", time: "" };
  const end = item?.endsAt ? localParts(item.allDay ? Date.parse(item.endsAt) - 1 : item.endsAt, zone) : { date: "", time: "" };
  return { title: item?.title ?? "", startDate: start.date, startTime: start.time, endDate: end.date, endTime: end.time, location: item?.location ?? "", allDay: item?.allDay, meetingMethod: item?.meetingMethod, meetingUrl: item?.meetingUrl ?? "", contactIds: [...(item?.contactIds ?? [])], noteIds: [...(item?.noteIds ?? [])], reminderMinutes: item?.reminderMinutes ?? null, recurrence: item?.recurrence ? { ...item.recurrence } : null };
}
export function applyPersonalScheduleDuration(draft: PersonalScheduleDraft, zone: string, minutes: 30 | 60 | 120, baseline: PersonalScheduleContract | null = null) {
  if (!validTimeZone(zone)) return { kind: "invalid" as const, message: "请先填写明确的开始日期和时间。" };
  const previous = personalScheduleDraft(baseline, zone);
  const start = baseline && !baseline.allDay && draft.startDate === previous.startDate && draft.startTime === previous.startTime ? baseline.startsAt : resolveLocalDateTime(draft.startDate, draft.startTime, zone);
  if (!start) return { kind: "invalid" as const, message: "请先填写明确的开始日期和时间。" };
  const pickerEndInstant = new Date(Date.parse(start) + minutes * 60_000).toISOString();
  const end = localParts(pickerEndInstant, zone);
  const next = { ...draft, allDay: false, endDate: end.date, endTime: end.time, pickerEndInstant };
  return { kind: "ready" as const, draft: next };
}
export function buildPersonalScheduleChange(item: PersonalScheduleContract | null, draft: PersonalScheduleDraft, zone: string): { kind: "invalid"; message: string } | { kind: "unchanged" } | { kind: "ready"; fields: PersonalScheduleFields } {
  const invalid = (message: string) => ({ kind: "invalid" as const, message });
  if (!validTimeZone(zone)) return invalid("无法读取设备时区，草稿已保留。");
  if (!draft.title.trim()) return invalid("请填写日程标题。");
  const previous = personalScheduleDraft(item, zone);
  const start = draft.allDay ? personalScheduleDayStart(draft.startDate, zone) : item && !item.allDay && draft.startDate === previous.startDate && draft.startTime === previous.startTime ? item.startsAt : resolveLocalDateTime(draft.startDate, draft.startTime, zone);
  if (!start) return invalid("请填写明确的开始日期和时间；此当地时间可能不存在或重复。");
  let end: string | null = null;
  if (draft.allDay) {
    if (draft.endDate && draft.endDate < draft.startDate) return invalid("全天结束日期无效。");
    const nextDay = calendarDate(draft.endDate || draft.startDate);
    if (!nextDay) return invalid("全天结束日期无效。");
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    const endDate = nextDay.toISOString().slice(0, 10);
    end = personalScheduleDayStart(endDate, zone);
    if (!end || Date.parse(end) <= Date.parse(start)) return invalid("全天结束日期无效。");
  } else if (draft.endDate || draft.endTime) {
    const pickedEnd = draft.pickerEndInstant && Number.isFinite(Date.parse(draft.pickerEndInstant)) ? localParts(draft.pickerEndInstant, zone) : null;
    end = pickedEnd?.date === draft.endDate && pickedEnd.time === draft.endTime ? draft.pickerEndInstant! : item?.endsAt && draft.endDate === previous.endDate && draft.endTime === previous.endTime ? item.endsAt : resolveLocalDateTime(draft.endDate, draft.endTime, zone);
    if (!end || Date.parse(end) <= Date.parse(start)) return invalid("结束日期和时间需一起填写，并晚于开始时间。");
  }
  const fields: PersonalScheduleFields = {};
  if (!item || draft.title.trim() !== item.title) fields.title = draft.title.trim();
  if (!item || start !== item.startsAt) fields.startsAt = start;
  if (end !== (item?.endsAt ?? null)) fields.endsAt = end;
  if (draft.location.trim() !== (item?.location ?? "")) fields.location = draft.location.trim() || null;
  if (draft.allDay !== item?.allDay && draft.allDay !== undefined) fields.allDay = draft.allDay;
  if (!item || fields.startsAt !== undefined || typeof fields.endsAt === "string" || fields.allDay !== undefined) fields.timeZone = zone;
  if (draft.meetingMethod !== item?.meetingMethod && draft.meetingMethod !== undefined) fields.meetingMethod = draft.meetingMethod;
  const url = draft.meetingUrl?.trim() ?? "";
  if (url) { try { const parsed = new URL(url); if (!["http:", "https:"].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password) return invalid("请填写完整的 http 或 https 会议链接。"); } catch { return invalid("请填写完整的会议链接。"); } }
  if (url !== (item?.meetingUrl ?? "")) fields.meetingUrl = url || null;
  for (const key of ["contactIds", "noteIds"] as const) { const values = draft[key] ?? []; if (values.length > 50 || new Set(values).size !== values.length || values.some(value => !value.trim())) return invalid("关联对象无效或过多。"); if (JSON.stringify(values) !== JSON.stringify(item?.[key] ?? [])) fields[key] = [...values]; }
  if (draft.reminderMinutes != null && ![0, 5, 15, 30, 60, 1440].includes(draft.reminderMinutes)) return invalid("提醒设置无效。");
  if (draft.recurrence) {
    if (!["daily", "weekly", "monthly"].includes(draft.recurrence.frequency) || (draft.recurrence.until !== undefined && (!calendarDate(draft.recurrence.until) || draft.recurrence.until < draft.startDate))) return invalid("重复结束日期不能早于开始日期。");
  }
  if (draft.reminderMinutes !== undefined && (draft.reminderMinutes ?? null) !== (item?.reminderMinutes ?? null)) fields.reminderMinutes = draft.reminderMinutes;
  if (draft.recurrence !== undefined && (draft.recurrence?.frequency !== item?.recurrence?.frequency || draft.recurrence?.until !== item?.recurrence?.until)) fields.recurrence = draft.recurrence;
  return Object.keys(fields).length ? { kind: "ready", fields } : { kind: "unchanged" };
}

export function personalScheduleWindow(zone: string, now = new Date()) {
  const day = calendarDate(localParts(now, zone).date)!;
  const fromDay = new Date(day); fromDay.setUTCDate(fromDay.getUTCDate() - 31);
  const toDay = new Date(day); toDay.setUTCDate(toDay.getUTCDate() + 93);
  const from = personalScheduleDayStart(fromDay.toISOString().slice(0, 10), zone);
  const to = personalScheduleDayStart(toDay.toISOString().slice(0, 10), zone);
  if (!from || !to) throw new Error("无法读取日程日期范围。");
  return { from, to };
}
