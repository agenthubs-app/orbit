import type { PersonalScheduleContract, ScheduleItemContract } from "../../shared/contract/tasks";
import { personalScheduleSchema } from "../../shared/api-schema/personal-schedule";

export function personalScheduleRepresentation(item: PersonalScheduleContract, request: Request): PersonalScheduleContract {
  const checked = personalScheduleSchema.parse(item);
  const version = request.headers.get("x-orbit-personal-schedule-version");
  if (version === "3") return checked;
  const { recurrence, reminderMinutes, seriesId, occurrenceDate, ...old } = checked;
  const compatible = { ...old, sourceId: old.id };
  if (version === "2") return compatible;
  const { allDay, timeZone, meetingMethod, meetingUrl, contactIds, noteIds, ...legacy } = compatible;
  return legacy;
}

export function personalScheduleAggregateRepresentation(item: ScheduleItemContract): ScheduleItemContract {
  return {
    id: item.id, sourceId: item.sourceId, kind: item.kind, category: item.category,
    state: item.state, title: item.title, startsAt: item.startsAt,
    ...(item.endsAt !== undefined ? { endsAt: item.endsAt } : {}),
    ...(item.location !== undefined ? { location: item.location } : {}),
    ...(item.allDay !== undefined ? { allDay: item.allDay } : {}),
    ...(item.timeZone !== undefined ? { timeZone: item.timeZone } : {}),
    ...("accountId" in item && typeof item.accountId === "string" ? { accountId: item.accountId } : {}),
    ...("ownerUserId" in item && typeof item.ownerUserId === "string" ? { ownerUserId: item.ownerUserId } : {}),
    ...("createdAt" in item && typeof item.createdAt === "string" ? { createdAt: item.createdAt } : {}),
    ...("updatedAt" in item && typeof item.updatedAt === "string" ? { updatedAt: item.updatedAt } : {}),
  };
}
