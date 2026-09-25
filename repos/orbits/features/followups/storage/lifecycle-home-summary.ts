import { z } from "zod";
import { createConfiguredPostgresLiveRecordStore } from "../../../shared/storage/configured-live-record-store";
import type { LiveRecordSqlClient } from "../../../shared/storage/postgres-live-record-store";
import {
  LIFECYCLE_TASK_CLASSIFIED_CTES, LIFECYCLE_CARD_JSON_SQL, LIFECYCLE_SORT_RUNTIME_CTE,
  cardSchema, lifecycleSortRuntimeSchema, assertLifecycleNodeSortRuntime,
} from "./lifecycle-task-pages";

// Match the home adapter's strict ISO input, not PostgreSQL's permissive date parser.
// Truncate excess fractional digits BEFORE casting (JS Date has millisecond precision).
const isoPattern = "^[0-9]{4}-[0-9]{2}-[0-9]{2}T(([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](\\.[0-9]+)?|24:00:00(\\.0+)?)(Z|[+-]([01][0-9]|2[0-3]):[0-5][0-9])$";
export const LIFECYCLE_HOME_SUMMARY_SQL = `${LIFECYCLE_TASK_CLASSIFIED_CTES},
date_parts as materialized (
  select *, regexp_replace(regexp_replace(task ->> 'dueAt', '(Z|[+-][0-9]{2}:[0-9]{2})$', ''), '(\\.[0-9]{3})[0-9]+', '\\1') as wall,
    right(task ->> 'dueAt', 6) as zone
  from classified where category = 'current'
),
dated as materialized (
  select *, case when task ->> 'dueAt' ~ '${isoPattern}'
    and left(task ->> 'dueAt', 4) > '0099'
    and pg_input_is_valid(wall, 'timestamp without time zone')
    then (wall::timestamp at time zone 'UTC') - case when right(zone, 1) = 'Z' then interval '0'
      else make_interval(mins => (substring(zone from 2 for 2)::int * 60 + right(zone, 2)::int) * case left(zone, 1) when '-' then -1 else 1 end) end
    end as due_instant
  from date_parts
),
eligible as materialized (
  select *, case when not (task ? 'dueAt') then 'undated'
    when due_instant < $3::timestamptz then 'overdue' else 'recent' end as home_group
  from dated where not (task ? 'dueAt') or due_instant < $3::timestamptz
    or (due_instant >= $4::timestamptz and due_instant < $5::timestamptz)
),
home_window as (
  select * from eligible order by case home_group when 'overdue' then 0 when 'recent' then 1 else 2 end,
    due_instant asc nulls last, ('followups:' || id) collate pg_catalog."und-x-icu", record_id collate "C" limit 3
),
${LIFECYCLE_SORT_RUNTIME_CTE}
select jsonb_build_object('ok', integrity.ok and not exists (select 1 from dated where task ? 'dueAt' and due_instant is null),
  'runtime', (select to_jsonb(runtime) from runtime),
  'counts', jsonb_build_object('current', (select count(*) from eligible),
    'history', (select count(*) from classified where category = 'history'),
    'orphan', (select count(*) from classified where category = 'orphan')),
  'groups', jsonb_build_object('overdue', (select count(*) from eligible where home_group = 'overdue'),
    'recent', (select count(*) from eligible where home_group = 'recent'),
    'undated', (select count(*) from eligible where home_group = 'undated')),
  'items', coalesce((select jsonb_agg(${LIFECYCLE_CARD_JSON_SQL} || jsonb_build_object('group', home_group)
    order by case home_group when 'overdue' then 0 when 'recent' then 1 else 2 end,
      due_instant asc nulls last, ('followups:' || id) collate pg_catalog."und-x-icu", record_id collate "C") from home_window), '[]'::jsonb)
) as result from integrity
`;

const count = z.number().int().nonnegative();
const summarySchema = z.object({
  ok: z.literal(true), runtime: lifecycleSortRuntimeSchema,
  counts: z.object({ current: count, history: count, orphan: count }).strict(),
  groups: z.object({ overdue: count, recent: count, undated: count }).strict(),
  items: z.array(cardSchema.extend({ group: z.enum(["overdue", "recent", "undated"]) }).strict()).max(3),
}).strict();
export type LifecycleHomeSummary = Pick<z.infer<typeof summarySchema>, "counts" | "groups" | "items">;
export interface LifecycleHomeSummaryReader {
  read(actorId: string, window: { snapshotAt: string; from: string; to: string }): Promise<LifecycleHomeSummary>;
}

export function createLifecycleHomeSummaryReader(input: { client: LiveRecordSqlClient; workspaceId: string }): LifecycleHomeSummaryReader {
  return { async read(actorId, window) {
    if (!actorId.trim()) throw new Error("ACTOR_REQUIRED");
    const times = [window.snapshotAt, window.from, window.to].map(value => new Date(value).toISOString());
    if (Date.parse(times[1]) > Date.parse(times[0]) || Date.parse(times[0]) >= Date.parse(times[2])) throw new Error("HOME_WINDOW_INVALID");
    assertLifecycleNodeSortRuntime();
    const rows = await input.client.query<{ result: unknown }>(LIFECYCLE_HOME_SUMMARY_SQL, [input.workspaceId, actorId, ...times]);
    if (rows.rows.length !== 1) throw new Error("LIFECYCLE_HOME_INVALID");
    const result = summarySchema.parse(rows.rows[0]!.result);
    return { counts: result.counts, groups: result.groups, items: result.items };
  } };
}

export function createConfiguredLifecycleHomeSummaryReader(): LifecycleHomeSummaryReader | null {
  const configured = createConfiguredPostgresLiveRecordStore();
  return configured ? createLifecycleHomeSummaryReader({ client: configured.client, workspaceId: configured.workspaceId }) : null;
}
