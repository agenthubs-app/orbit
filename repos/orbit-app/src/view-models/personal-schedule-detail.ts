import type { PersonalScheduleContract } from "../api/contract/tasks";
import { localParts, validTimeZone } from "../time/date-time";

export function personalScheduleDetail(item: PersonalScheduleContract, fallbackZone: string) {
  const zone = item.timeZone ?? fallbackZone;
  if (!validTimeZone(zone)) return null;
  const start = localParts(item.startsAt, zone);
  const end = item.endsAt ? localParts(item.endsAt, zone) : null;
  const endDate = item.allDay && item.endsAt ? localParts(new Date(Date.parse(item.endsAt) - 1).toISOString(), zone).date : end?.date;
  let meetingUrl: string | undefined;
  if (item.meetingMethod === "video" && item.meetingUrl) {
    try { const url = new URL(item.meetingUrl); if (["https:", "http:"].includes(url.protocol) && url.hostname && !url.username && !url.password) meetingUrl = item.meetingUrl; } catch { /* No action for an invalid saved URL. */ }
  }
  return { id: item.id, updatedAt: item.updatedAt, title: item.title, zone, date: start.date, startTime: start.time, endDate, endTime: end?.time, allDay: item.allDay === true,
    durationMinutes: item.endsAt ? (Date.parse(item.endsAt) - Date.parse(item.startsAt)) / 60_000 : null, location: item.location, meetingMethod: item.meetingMethod, meetingUrl,
    editHref: `/schedule/personal/${encodeURIComponent(item.id)}/edit`, contactIds: item.contactIds ?? [], noteIds: item.noteIds ?? [] };
}
