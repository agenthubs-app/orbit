import type { LiveRecord, LiveRecordStoreLike } from "../../shared/storage/live-record-store";
import { rowToRecord, type LiveRecordSqlClient, type PostgresLiveRecordRow } from "../../shared/storage/postgres-live-record-store";
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

type ExceptionSelection = { occurrenceDate: string; window?: never } | {
  occurrenceDate?: never;
  window: { from: string; to: string; occurrenceDates: readonly string[] };
};

export async function readPersonalScheduleOccurrenceExceptions(input: { store: LiveRecordStoreLike; workspaceId: string; actorId: string; seriesId: string; executor?: LiveRecordSqlClient | undefined } & ExceptionSelection): Promise<PersonalScheduleOccurrenceException[]> {
  if (!input.actorId || !input.workspaceId || !input.seriesId) throw new Error("An owned schedule exception context is required.");
  if (input.occurrenceDate !== undefined && !calendarDate(input.occurrenceDate)) throw new Error("A valid occurrence date is required.");
  const scope = { workspaceId: input.workspaceId, collectionName: PERSONAL_SCHEDULE_EXCEPTION_COLLECTION, userId: input.actorId, sourceId: input.seriesId };
  let records: readonly LiveRecord[];
  if (input.window) {
    const from = Date.parse(input.window.from), to = Date.parse(input.window.to);
    if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from || to - from > 366 * 86_400_000 || input.window.occurrenceDates.some(date => !calendarDate(date))) throw new Error("A valid schedule exception window is required.");
    const ids = input.window.occurrenceDates.map(date => `${input.seriesId}:occurrence:${date}`);
    // Retain original anchors (including cancellations/moves out), plus any
    // startsAt patch that could move another anchor in. ISO dates with offsets
    // need a conservative date envelope; final membership still uses the real
    // instant in the recurrence service. No historical title/body is needed.
    const earliest = new Date(from - 2 * 86_400_000).toISOString().slice(0, 10);
    const latest = new Date(to + 2 * 86_400_000).toISOString().slice(0, 10);
    if (input.executor) {
      const result = await input.executor.query<PostgresLiveRecordRow>(`select workspace_id,collection_name,record_id,user_id,source_type,source_id,lifecycle_state,payload,created_at,updated_at
        from orbit_records where workspace_id=$1 and collection_name=$2 and user_id=$3 and source_id=$4 and lifecycle_state<>'deleted'
        and (record_id=any($5::text[]) or left(payload->'patch'->>'startsAt',10) between $6 and $7)
        order by record_id collate "C"`, [input.workspaceId, PERSONAL_SCHEDULE_EXCEPTION_COLLECTION, input.actorId, input.seriesId, ids, earliest, latest]);
      records = result.rows.map(rowToRecord);
    } else {
      // In-memory service/tests use the same selection. Configured database
      // list and mutation paths supply their current SQL executor; SQL errors
      // never fall back to enumerating the record store.
      const idSet = new Set(ids);
      records = (await input.store.listRecords({ ...scope, limit: "unbounded" })).filter(record => {
        const patch = record.payload.patch as Record<string, unknown> | undefined;
        const movedDate = typeof patch?.startsAt === "string" ? patch.startsAt.slice(0, 10) : "";
        return idSet.has(record.recordId) || (movedDate >= earliest && movedDate <= latest);
      });
    }
  } else {
    records = await input.store.listRecords({ ...scope, limit: 1, recordIds: [`${input.seriesId}:occurrence:${input.occurrenceDate}`] });
  }
  const dates = new Set<string>();
  return records.map(record => {
    const value = exceptionSchema.parse(record.payload);
    if (record.workspaceId !== input.workspaceId || record.collectionName !== PERSONAL_SCHEDULE_EXCEPTION_COLLECTION || record.userId !== input.actorId || record.lifecycleState !== "active" || record.sourceId !== input.seriesId || value.seriesId !== input.seriesId || record.recordId !== `${input.seriesId}:occurrence:${value.occurrenceDate}` || (input.occurrenceDate !== undefined && value.occurrenceDate !== input.occurrenceDate) || Date.parse(record.updatedAt) !== Date.parse(value.updatedAt) || dates.has(value.occurrenceDate)) throw new Error("Personal schedule exception storage integrity mismatch.");
    if (Object.hasOwn(value.patch, "recurrence") || Object.hasOwn(value.patch, "reminderMinutes")) throw new Error("Series rules cannot be changed by an occurrence exception.");
    const patch = Object.keys(value.patch).length ? personalScheduleUpdateSchema.parse({ expectedUpdatedAt: value.updatedAt, idempotencyKey: "validate-stored-exception", patch: value.patch }).patch : {};
    if (!value.cancelled && !Object.keys(patch).length) throw new Error("An active occurrence exception must have a patch.");
    dates.add(value.occurrenceDate);
    return { ...value, patch };
  });
}
