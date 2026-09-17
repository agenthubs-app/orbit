import type { PersonalScheduleContract } from "../api/contract/tasks";
import { calendarDate, localParts, resolveLocalDateTime } from "../time/date-time";
import { personalScheduleDraft, type PersonalScheduleDraft } from "./personal-schedule-editor";

export function applyPersonalSchedulePicker(draft: PersonalScheduleDraft, baseline: PersonalScheduleContract | null, zone: string, field: "startDate" | "startTime" | "endDate" | "endTime", value: string): PersonalScheduleDraft {
  if (draft[field] === value) return draft;
  if (field.endsWith("Date") && !calendarDate(value)) return draft;
  const next = { ...draft, [field]: value };
  if (field === "endDate" || field === "endTime") {
    delete next.pickerEndInstant;
    if (next.endTime && !next.endDate) next.endDate = next.startDate;
    return next;
  }
  if (next.allDay) return next;
  const start = resolveLocalDateTime(next.startDate, next.startTime, zone);
  if (!start) return next; // Existing save validation explains gaps/folds visibly.
  const previous = personalScheduleDraft(baseline, zone);
  const oldStart = baseline && !baseline.allDay && draft.startDate === previous.startDate && draft.startTime === previous.startTime ? baseline.startsAt : resolveLocalDateTime(draft.startDate, draft.startTime, zone);
  const oldEnd = draft.pickerEndInstant ?? (baseline?.endsAt && draft.endDate === previous.endDate && draft.endTime === previous.endTime ? baseline.endsAt : resolveLocalDateTime(draft.endDate, draft.endTime, zone));
  const duration = oldStart && oldEnd ? Date.parse(oldEnd) - Date.parse(oldStart) : null;
  const milliseconds = duration !== null && duration > 0 ? duration : !baseline && !oldStart && !draft.endDate && !draft.endTime ? 30 * 60_000 : null;
  if (milliseconds === null) return next;
  const endInstant = new Date(Date.parse(start) + milliseconds).toISOString();
  const end = localParts(endInstant, zone);
  return { ...next, endDate: end.date, endTime: end.time, pickerEndInstant: endInstant };
}
