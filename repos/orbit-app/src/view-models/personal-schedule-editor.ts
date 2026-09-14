import type { PersonalScheduleContract } from "../api/contract/tasks";
import { localParts, resolveLocalDateTime, validTimeZone } from "../time/date-time";
export interface PersonalScheduleDraft { title: string; startDate: string; startTime: string; endDate: string; endTime: string; location: string; }
export function personalScheduleDraft(item: PersonalScheduleContract | null, zone: string): PersonalScheduleDraft {
  const start = item ? localParts(item.startsAt, zone) : { date: "", time: "" };
  const end = item?.endsAt ? localParts(item.endsAt, zone) : { date: "", time: "" };
  return { title: item?.title ?? "", startDate: start.date, startTime: start.time, endDate: end.date, endTime: end.time, location: item?.location ?? "" };
}
export function buildPersonalScheduleChange(item: PersonalScheduleContract | null, draft: PersonalScheduleDraft, zone: string): { kind: "invalid"; message: string } | { kind: "unchanged" } | { kind: "ready"; fields: Record<string, string | null> } {
  const invalid = (message: string) => ({ kind: "invalid" as const, message });
  if (!validTimeZone(zone)) return invalid("无法读取设备时区，草稿已保留。");
  if (!draft.title.trim()) return invalid("请填写日程标题。");
  const previous = personalScheduleDraft(item, zone);
  const start = item && draft.startDate === previous.startDate && draft.startTime === previous.startTime ? item.startsAt : resolveLocalDateTime(draft.startDate, draft.startTime, zone);
  if (!start) return invalid("请填写明确的开始日期和时间；此当地时间可能不存在或重复。");
  let end: string | null = null;
  if (draft.endDate || draft.endTime) {
    end = item?.endsAt && draft.endDate === previous.endDate && draft.endTime === previous.endTime ? item.endsAt : resolveLocalDateTime(draft.endDate, draft.endTime, zone);
    if (!end || Date.parse(end) <= Date.parse(start)) return invalid("结束日期和时间需一起填写，并晚于开始时间。");
  }
  const fields: Record<string, string | null> = {};
  if (!item || draft.title.trim() !== item.title) fields.title = draft.title.trim();
  if (!item || start !== item.startsAt) fields.startsAt = start;
  if (end !== (item?.endsAt ?? null)) fields.endsAt = end;
  if (draft.location.trim() !== (item?.location ?? "")) fields.location = draft.location.trim() || null;
  return Object.keys(fields).length ? { kind: "ready", fields } : { kind: "unchanged" };
}
