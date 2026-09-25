import { z } from "zod";

import { createConfiguredPostgresLiveRecordStore } from "../../shared/storage/configured-live-record-store";
import type { LiveRecordSqlClient } from "../../shared/storage/postgres-live-record-store";
import { resolveSharedReadBudgetGate } from "../sync/read-budget-gate";
import { calendarDate, validTimeZone } from "./local-date-time";
import { taskRecordsValidityCte, taskTimestampSql } from "./task-page";

export const HOME_TASK_SUMMARY_DISPLAY_LIMIT = 3;
export const HOME_TASK_TITLE_PREVIEW_LIMIT = 240;

export type HomeTaskSummaryGroupKey = "overdue" | "plan-past" | "recent" | "undated";

export interface HomeTaskSummaryItem {
  dueAt?: string;
  group: HomeTaskSummaryGroupKey;
  id: string;
  plannedDate?: string;
  /** Display preview, matching the canonical task card's 240-character title boundary. */
  title: string;
}

export interface HomeTaskSummary {
  count: number;
  groupCounts: Record<HomeTaskSummaryGroupKey, number>;
  items: readonly HomeTaskSummaryItem[];
}

export interface HomeTaskSummaryWindow {
  productDate: string;
  snapshotAt: string;
  timeZone: string;
  toDate: string;
}

export interface HomeTaskSummaryReader {
  read(actorId: string, window: HomeTaskSummaryWindow): Promise<HomeTaskSummary>;
}

const strictHomeDateSql = (value: string) => {
  const year = `substring(${value} from 1 for 4)`;
  const month = `substring(${value} from 6 for 2)`;
  const day = `substring(${value} from 9 for 2)`;
  return `(case when substring(${value} from 1 for 10) ~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'
    then case when ${year}::int >= 100
      then ${day}::int <= extract(day from (make_date(${year}::int,${month}::int,1) + interval '1 month - 1 day'))
      else false end
    else false end)`;
};

const dueTimestamp = taskTimestampSql("t->>'dueAt'");
const dueIsoKey = `(case when extract(year from due_at at time zone 'UTC') > 9999
  then '+' || lpad(extract(year from due_at at time zone 'UTC')::int::text,6,'0')
    || to_char(due_at at time zone 'UTC','-MM-DD"T"HH24:MI:SS.MS"Z"')
  else to_char(due_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end)`;

/**
 * The bounded task summary keeps validity, grouping, counts, and top-3 selection
 * in one statement snapshot. No notes, activity history, or full task payloads
 * cross the read boundary.
 *
 * Same-group/same-date task rows use UTF-8 byte order for their hidden stable
 * tie-break. This is the explicit Home summary ordering contract; the visible
 * three can differ from the former localeCompare tie-break only at that edge.
 */
export const HOME_TASK_SUMMARY_SQL = `with ${taskRecordsValidityCte()},
open_tasks as materialized (
  select record_id,t,
    case when t ? 'plannedDate' then t->>'plannedDate' end as planned_date,
    case when t ? 'dueAt' then t->>'dueAt' end as due_text,
    case when t ? 'dueAt' then ${strictHomeDateSql("t->>'dueAt'")} else true end as strict_due_date
  from valid where t->>'status'='open'
),
timed as materialized (
  select *, case when due_text is not null and strict_due_date then ${dueTimestamp} end as due_at
  from open_tasks
),
classified as materialized (
  select *, case
    when due_at < $3::timestamptz then 'overdue'
    when (planned_date is not null and planned_date::date < $4::date) then 'plan-past'
    when (planned_date is not null and planned_date::date >= $4::date and planned_date::date < $5::date)
      or ((due_at at time zone $6::text)::date >= $4::date and (due_at at time zone $6::text)::date < $5::date) then 'recent'
    when planned_date is null and due_text is null then 'undated'
    else null end as home_group,
    case when due_at is not null
      then ${dueIsoKey}
      else coalesce(planned_date,'9999-12-31') end as sort_key
  from timed
),
visible as materialized (
  select * from classified where home_group is not null
  order by case home_group when 'overdue' then 0 when 'plan-past' then 1 when 'recent' then 2 else 3 end,
    sort_key collate "C",('tasks:' || record_id) collate "C"
  limit ${HOME_TASK_SUMMARY_DISPLAY_LIMIT}
),
integrity as materialized (
  select not exists (select 1 from open_tasks where not strict_due_date)
    and not exists (select 1 from visible where octet_length(record_id)>2048) as ok
)
select case when not integrity.ok then jsonb_build_object('ok',false)
  else jsonb_build_object(
    'ok',true,
    'count', (select count(*) from classified where home_group is not null),
    'groupCounts', jsonb_build_object(
      'overdue',(select count(*) from classified where home_group='overdue'),
      'plan-past',(select count(*) from classified where home_group='plan-past'),
      'recent',(select count(*) from classified where home_group='recent'),
      'undated',(select count(*) from classified where home_group='undated')),
    'items', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'id',record_id,'title',left(t->>'title',${HOME_TASK_TITLE_PREVIEW_LIMIT}),
      'dueAt',case when due_at is not null then sort_key end,
      'plannedDate',planned_date,'group',home_group))
      order by case home_group when 'overdue' then 0 when 'plan-past' then 1 when 'recent' then 2 else 3 end,
        sort_key collate "C",('tasks:' || record_id) collate "C") from visible),'[]'::jsonb)
  ) end as result from integrity`;

const count = z.number().int().nonnegative().safe();
const itemSchema = z.object({
  dueAt: z.string().optional(),
  group: z.enum(["overdue", "plan-past", "recent", "undated"]),
  id: z.string().min(1).max(2048),
  plannedDate: z.string().optional(),
  // PostgreSQL left(text, 240) counts Unicode code points; JS/Zod count UTF-16.
  title: z.string().min(1).max(HOME_TASK_TITLE_PREVIEW_LIMIT * 2),
}).strict();
const resultSchema = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    count,
    groupCounts: z.object({
      overdue: count,
      "plan-past": count,
      recent: count,
      undated: count,
    }).strict(),
    items: z.array(itemSchema).max(HOME_TASK_SUMMARY_DISPLAY_LIMIT),
  }).strict(),
  z.object({ ok: z.literal(false) }).strict(),
]);

export function createHomeTaskSummaryReader(input: {
  client: LiveRecordSqlClient;
  workspaceId: string;
}): HomeTaskSummaryReader {
  return {
    async read(actorId, window) {
      if (!actorId.trim()) throw new Error("ACTOR_REQUIRED");
      const snapshotAt = new Date(window.snapshotAt).toISOString();
      if (
        !calendarDate(window.productDate) ||
        !calendarDate(window.toDate) ||
        Date.parse(`${window.productDate}T00:00:00Z`) >= Date.parse(`${window.toDate}T00:00:00Z`) ||
        !validTimeZone(window.timeZone)
      ) {
        throw new Error("HOME_WINDOW_INVALID");
      }
      const response = await input.client.query<{ result: unknown }>(HOME_TASK_SUMMARY_SQL, [
        input.workspaceId,
        actorId,
        snapshotAt,
        window.productDate,
        window.toDate,
        window.timeZone,
      ]);
      if (response.rows.length !== 1) throw new Error("HOME_TASK_SUMMARY_INVALID");
      const result = resultSchema.parse(response.rows[0]!.result);
      if (!result.ok) throw new Error("HOME_TASK_SUMMARY_INVALID");
      const dbCount = Object.values(result.groupCounts).reduce((sum, value) => sum + value, 0);
      if (dbCount !== result.count) throw new Error("HOME_TASK_SUMMARY_INVALID");
      return {
        count: result.count,
        groupCounts: result.groupCounts,
        items: result.items,
      };
    },
  };
}

export function createConfiguredHomeTaskSummaryReader(): HomeTaskSummaryReader | null {
  const configured = createConfiguredPostgresLiveRecordStore();
  if (!configured) return null;
  const reader = createHomeTaskSummaryReader({
    client: configured.client,
    workspaceId: configured.workspaceId,
  });
  return {
    read(actorId, window) {
      resolveSharedReadBudgetGate()?.assertAllowed({ collectionName: "tasks" });
      return reader.read(actorId, window);
    },
  };
}
