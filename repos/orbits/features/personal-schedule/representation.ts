import type { PersonalScheduleContract, ScheduleItemContract } from "../../shared/contract/tasks";
import { personalScheduleSchema } from "../../shared/api-schema/personal-schedule";

export function personalScheduleRepresentation(item: PersonalScheduleContract, request: Request): PersonalScheduleContract {
  const checked = personalScheduleSchema.parse(item);
  if (request.headers.get("x-orbit-personal-schedule-version") === "2") return checked;
  const { allDay, timeZone, meetingMethod, meetingUrl, contactIds, noteIds, ...legacy } = checked;
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
