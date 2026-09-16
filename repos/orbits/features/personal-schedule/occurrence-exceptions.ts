import type { LiveRecordStoreLike } from "../../shared/storage/live-record-store";
import { personalScheduleUpdateSchema, type PersonalScheduleUpdate } from "../../shared/api-schema/personal-schedule";
import { z } from "zod";
import { calendarDate } from "../tasks/local-date-time";

export const PERSONAL_SCHEDULE_EXCEPTION_COLLECTION = "personal_schedule_occurrence_exceptions";
const exceptionSchema = z.object({ seriesId: z.string().min(1), occurrenceDate: z.string().refine(value => calendarDate(value) !== null), cancelled: z.boolean(), patch: z.record(z.string(), z.unknown()), updatedAt: z.string().datetime({ offset: true }) }).strict();

export interface PersonalScheduleOccurrenceException {
  seriesId: string;
  occurrenceDate: string;
  cancelled: boolean;
  patch: PersonalScheduleUpdate["patch"];
  updatedAt: string;
}

export async function readPersonalScheduleOccurrenceExceptions(input: { store: LiveRecordStoreLike; workspaceId: string; actorId: string; seriesId: string }): Promise<PersonalScheduleOccurrenceException[]> {
  if (!input.actorId || !input.workspaceId || !input.seriesId) throw new Error("An owned schedule exception context is required.");
  const records = await input.store.listRecords({ workspaceId: input.workspaceId, collectionName: PERSONAL_SCHEDULE_EXCEPTION_COLLECTION, userId: input.actorId, sourceId: input.seriesId });
  const dates = new Set<string>();
  return records.map(record => {
    const value = exceptionSchema.parse(record.payload);
    if (record.workspaceId !== input.workspaceId || record.collectionName !== PERSONAL_SCHEDULE_EXCEPTION_COLLECTION || record.userId !== input.actorId || record.lifecycleState !== "active" || record.sourceId !== input.seriesId || value.seriesId !== input.seriesId || record.recordId !== `${input.seriesId}:occurrence:${value.occurrenceDate}` || Date.parse(record.updatedAt) !== Date.parse(value.updatedAt) || dates.has(value.occurrenceDate)) throw new Error("Personal schedule exception storage integrity mismatch.");
    if (Object.hasOwn(value.patch, "recurrence") || Object.hasOwn(value.patch, "reminderMinutes")) throw new Error("Series rules cannot be changed by an occurrence exception.");
    const patch = Object.keys(value.patch).length ? personalScheduleUpdateSchema.parse({ expectedUpdatedAt: value.updatedAt, idempotencyKey: "validate-stored-exception", patch: value.patch }).patch : {};
    if (!value.cancelled && !Object.keys(patch).length) throw new Error("An active occurrence exception must have a patch.");
    dates.add(value.occurrenceDate);
    return { ...value, patch };
  });
}
