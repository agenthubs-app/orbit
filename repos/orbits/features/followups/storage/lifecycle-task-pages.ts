import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { createConfiguredPostgresLiveRecordStore } from "../../../shared/storage/configured-live-record-store";
import type { LiveRecordSqlClient } from "../../../shared/storage/postgres-live-record-store";
import { RELATIONSHIP_LIFECYCLE_FACTS_CTES } from "./relationship-lifecycle-facts-reader";
import { SOURCE_TYPES, RELATIONSHIP_STAGE_VALUES } from "../../../shared/domain/source-types";

export const lifecycleGroups = ["current", "history", "orphan"] as const;
export type LifecycleGroup = typeof lifecycleGroups[number];
export type LifecycleCursors = Partial<Record<LifecycleGroup, string>>;

// Exactly ECMAScript String.trim whitespace. PG's default trim only removes spaces.
const whitespace = "\\0009\\000A\\000B\\000C\\000D\\0020\\00A0\\1680\\2000\\2001\\2002\\2003\\2004\\2005\\2006\\2007\\2008\\2009\\200A\\2028\\2029\\202F\\205F\\3000\\FEFF";
const nonblank = (value: string) => `(jsonb_typeof(${value}) = 'string' and btrim(${value} #>> '{}', U&'${whitespace}') <> '')`;
const enumSql = (values: readonly string[]) => `(${values.map(value => `'${value.replaceAll("'", "''")}'`).join(",")})`;
const stages = enumSql(RELATIONSHIP_STAGE_VALUES);
const sourceTypes = enumSql(SOURCE_TYPES);
const required = (keys: string[]) => keys.map(key => nonblank(`v -> '${key}'`)).join(" and ");

/** Full actor validity/classification stays inside PG; only bounded display cards leave it.
 * Keep the legacy facts decoder as the differential oracle, never limit its shared graph.
 */
export const LIFECYCLE_TASK_CLASSIFIED_CTES = `${RELATIONSHIP_LIFECYCLE_FACTS_CTES},
projected as materialized (
  select value as v from task_projection union all
  select value from connection_projection union all select value from contact_projection
),
normalized as materialized (
  select (v - array['contactId','connectionId','dueAt','organization','source','evidenceIds'])
    || case when ${nonblank("v -> 'contactId'")} then jsonb_build_object('contactId', v -> 'contactId') else '{}'::jsonb end
    || case when ${nonblank("v -> 'connectionId'")} then jsonb_build_object('connectionId', v -> 'connectionId') else '{}'::jsonb end
    || case when ${nonblank("v -> 'dueAt'")} then jsonb_build_object('dueAt', v -> 'dueAt') else '{}'::jsonb end
    || case when ${nonblank("v -> 'organization'")} then jsonb_build_object('organization', v -> 'organization') else '{}'::jsonb end
    || jsonb_build_object('source', ((v -> 'source') - 'label')
      || case when ${nonblank("v -> 'source' -> 'label'")} then jsonb_build_object('label', v -> 'source' -> 'label') else '{}'::jsonb end,
      'evidenceIds', evidence.ids) as v
  from projected cross join lateral (
    select jsonb_agg(e order by ordinal) as ids
    from jsonb_array_elements(case when jsonb_typeof(v -> 'evidenceIds') = 'array' then v -> 'evidenceIds' else '[]'::jsonb end) with ordinality a(e, ordinal)
    where ${nonblank("e")}
  ) evidence
  where ${required(["id", "createdAt", "updatedAt"])}
    and ${nonblank("v -> 'source' -> 'id'")}
    and v -> 'source' ->> 'type' in ${sourceTypes} and evidence.ids is not null
    and case v ->> 'kind'
      when 'task' then ${required(["title"])} and v ->> 'status' in ('open','scheduled','completed','dismissed')
      when 'connection' then ${required(["accountId", "contactId", "summary"])} and v ->> 'stage' in ${stages}
      when 'contact' then ${required(["displayName"])} and v ->> 'stage' in ${stages}
      else false end
),
integrity as (
  select not exists (
    select 1 from normalized group by v ->> 'kind', v ->> 'id'
    having count(distinct (v #- '{metadata,recordId}')) > 1
  ) and not exists (
    select 1 from projected where not ${nonblank("v -> 'metadata' -> 'recordId'")}
      or v -> 'metadata' ->> 'lifecycleState' not in ('active','archived')
      or v -> 'metadata' ->> 'createdAt' is null or v -> 'metadata' ->> 'updatedAt' is null
  ) as ok
),
contacts as materialized (
  select distinct on (v ->> 'id') v from normalized where v ->> 'kind' = 'contact'
  order by v ->> 'id', v -> 'metadata' ->> 'recordId'
),
connections as materialized (
  select distinct on (v ->> 'id') v from normalized where v ->> 'kind' = 'connection'
  order by v ->> 'id', v -> 'metadata' ->> 'recordId'
),
-- Validation predicates on JSON have very poor cardinality estimates. Joining
-- three materialized JSON sets can choose repeated full CTE scans (quadratic).
-- These narrow, statement-local lookup objects are scalar initplans: build once,
-- then binary-search IDs per task. They are not cross-request permission caches.
contact_lookup as materialized (
  select coalesce(jsonb_object_agg(v ->> 'id', jsonb_build_object('id', v ->> 'id',
    'displayName', left(v ->> 'displayName', 120), 'organization', left(v ->> 'organization', 120))), '{}'::jsonb) as value
  from contacts
),
connection_lookup as materialized (
  select coalesce(jsonb_object_agg(v ->> 'id', jsonb_build_object('contactId', v ->> 'contactId', 'stage', v ->> 'stage')), '{}'::jsonb) as value
  from connections
),
linked as materialized (
  select v as task,
    (select value from connection_lookup) -> (v ->> 'connectionId') as connection,
    (select value from contact_lookup) -> (v ->> 'contactId') as direct_contact
  from normalized where v ->> 'kind' = 'task'
),
linked_contacts as (
  select *, (select value from contact_lookup) -> (connection ->> 'contactId') as fallback_contact from linked
),
resolved as materialized (
  select task, connection,
    case when task ? 'contactId' and direct_contact is null then '联系人未在关系数据中找到。'
      when task ? 'connectionId' and connection is null then '关系连接未在关系数据中找到。'
      when direct_contact is not null and connection is not null and direct_contact ->> 'id' <> connection ->> 'contactId' then '联系人与关系连接不一致。'
      when coalesce(direct_contact, fallback_contact) is null then '未找到可打开的联系人。' end as issue,
    case when task ? 'contactId' and direct_contact is null then null
      when task ? 'connectionId' and connection is null then direct_contact
      when direct_contact is not null and connection is not null and direct_contact ->> 'id' <> connection ->> 'contactId' then null
      else coalesce(direct_contact, fallback_contact) end as contact
  from linked_contacts
),
classified as materialized (
  select *, case when issue is not null then 'orphan'
    when task ->> 'status' in ('open','scheduled') then 'current' else 'history' end as category,
    coalesce(task ->> 'dueAt', '9999-12-31T23:59:59.999Z') as due,
    task ->> 'id' as id, task -> 'metadata' ->> 'recordId' as record_id
  from resolved
)`;

export const LIFECYCLE_CARD_JSON_SQL = `jsonb_build_object(
  'id', id, 'recordId', record_id, 'dueKey', due,
  'titlePreview', left(task ->> 'title', 240), 'status', task ->> 'status',
  'dueAt', task ->> 'dueAt', 'updatedAt', task ->> 'updatedAt',
  'contactId', contact ->> 'id', 'connectionId', task ->> 'connectionId',
  'contactNamePreview', left(coalesce(contact ->> 'displayName', '未关联联系人'), 120),
  'organizationPreview', left(coalesce(contact ->> 'organization', ''), 120),
  'relationshipStage', connection ->> 'stage', 'issue', issue
)`;

export const LIFECYCLE_SORT_RUNTIME_CTE = `runtime as (
  select current_setting('server_version_num') as pg, current_setting('server_encoding') as encoding,
    c.collversion as catalog, pg_catalog.pg_collation_actual_version(c.oid) as actual,
    c.collprovider as provider, c.collisdeterministic as deterministic
  from pg_catalog.pg_collation c where c.oid = 'pg_catalog."und-x-icu"'::regcollation
)`;

export const LIFECYCLE_TASK_PAGES_SQL = `${LIFECYCLE_TASK_CLASSIFIED_CTES},
settings as (
  select * from jsonb_to_recordset($3::jsonb) as s(category text, due text, id text, record_id text)
),
pages as (
  select s.category, coalesce(p.items, '[]'::jsonb) as items from settings s
  cross join lateral (
    select jsonb_agg(${LIFECYCLE_CARD_JSON_SQL} order by due collate pg_catalog."und-x-icu", id collate pg_catalog."und-x-icu", record_id collate "C") as items
    from (
      select * from classified c where c.category = s.category
        and (s.due is null or (c.due collate pg_catalog."und-x-icu", c.id collate pg_catalog."und-x-icu", c.record_id collate "C")
          > (s.due collate pg_catalog."und-x-icu", s.id collate pg_catalog."und-x-icu", s.record_id collate "C"))
      order by due collate pg_catalog."und-x-icu", id collate pg_catalog."und-x-icu", record_id collate "C" limit $4
    ) page_window
  ) p
),
${LIFECYCLE_SORT_RUNTIME_CTE}
select jsonb_build_object('ok', integrity.ok,
  'runtime', (select to_jsonb(runtime) from runtime),
  'counts', jsonb_build_object('current', (select count(*) from classified where category = 'current'),
    'history', (select count(*) from classified where category = 'history'),
    'orphan', (select count(*) from classified where category = 'orphan')),
  'pages', (select jsonb_object_agg(category, items) from pages)
) as result from integrity
`;

const key = z.string().min(1).max(2048);
const positionSchema = z.object({ due: key, id: key, record_id: key }).strict();
export const cardSchema = z.object({
  id: key, recordId: key, dueKey: key,
  titlePreview: z.string().max(480), status: z.enum(["open", "scheduled", "completed", "dismissed"]),
  dueAt: key.nullable(), updatedAt: key,
  contactId: key.nullable(), connectionId: key.nullable(),
  contactNamePreview: z.string().max(240), organizationPreview: z.string().max(240),
  relationshipStage: z.enum(RELATIONSHIP_STAGE_VALUES).nullable(),
  issue: z.string().nullable(),
}).strict();
export type LifecycleTaskCard = z.infer<typeof cardSchema>;
export interface LifecycleTaskPages {
  counts: Record<LifecycleGroup, number>;
  pages: Record<LifecycleGroup, { items: LifecycleTaskCard[]; nextCursor: string | null }>;
}
export interface LifecycleTaskPagesReader {
  read(actorId: string, cursors?: LifecycleCursors): Promise<LifecycleTaskPages>;
}

export const lifecycleSortRuntimeSchema = z.object({ pg: z.literal("160012"), encoding: z.literal("UTF8"), catalog: z.literal("153.136"), actual: z.literal("153.136"), provider: z.literal("i"), deterministic: z.literal(true) }).strict();
export function assertLifecycleNodeSortRuntime() {
  if (process.versions.node !== "25.6.0" || process.versions.icu !== "78.2" || process.versions.unicode !== "17.0") throw new Error("LIFECYCLE_SORT_RUNTIME_UNVERIFIED");
}

function cursorCodec(secret: string, workspaceId: string, actorId: string, category: LifecycleGroup) {
  if (Buffer.byteLength(secret) < 32) throw new Error("READ_CURSOR_SECRET_MISSING");
  const scope = JSON.stringify(["lifecycle-pages:v1", workspaceId, actorId, category]);
  const sign = (value: string) => createHmac("sha256", secret).update(scope).update(value).digest();
  return {
    encode(value: z.infer<typeof positionSchema>) {
      const payload = Buffer.from(JSON.stringify(positionSchema.parse(value))).toString("base64url");
      return `${payload}.${sign(payload).toString("base64url")}`;
    },
    decode(token?: string) {
      if (!token) return null;
      try {
        if (token.length > 18000) throw Error();
        const [payload, signature, ...rest] = token.split(".");
        if (!payload || !signature || rest.length) throw Error();
        const actual = Buffer.from(signature, "base64url"), expected = sign(payload);
        if (actual.toString("base64url") !== signature || actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw Error();
        return positionSchema.parse(JSON.parse(Buffer.from(payload, "base64url").toString("utf8")));
      } catch { throw new Error("LIFECYCLE_CURSOR_INVALID"); }
    },
  };
}

export function createLifecycleTaskPagesReader(input: { client: LiveRecordSqlClient; workspaceId: string; secret: string }): LifecycleTaskPagesReader {
  return {
    async read(actorId, cursors = {}) {
      if (!actorId.trim()) throw new Error("ACTOR_REQUIRED");
      const codecs = Object.fromEntries(lifecycleGroups.map(group => [group, cursorCodec(input.secret, input.workspaceId, actorId, group)])) as Record<LifecycleGroup, ReturnType<typeof cursorCodec>>;
      const settings = lifecycleGroups.map(category => ({ category, ...codecs[category].decode(cursors[category]) }));
      const response = await input.client.query<{ result: unknown }>(LIFECYCLE_TASK_PAGES_SQL, [input.workspaceId, actorId, JSON.stringify(settings), 31]);
      if (response.rows.length !== 1) throw new Error("LIFECYCLE_PAGE_INVALID");
      const groupShape = Object.fromEntries(lifecycleGroups.map(group => [group, z.array(cardSchema).max(31)])) as Record<LifecycleGroup, z.ZodArray<typeof cardSchema>>;
      const result = z.object({
        ok: z.literal(true),
        counts: z.object({ current: z.number().int().nonnegative(), history: z.number().int().nonnegative(), orphan: z.number().int().nonnegative() }).strict(),
        pages: z.object(groupShape).strict(),
        runtime: lifecycleSortRuntimeSchema,
      }).strict().parse(response.rows[0]!.result);
      // Preserves the old localeCompare order only on the verified runtime tuple.
      assertLifecycleNodeSortRuntime();
      const pages = {} as LifecycleTaskPages["pages"];
      for (const group of lifecycleGroups) {
        const items = result.pages[group].slice(0, 30);
        const last = items.at(-1);
        pages[group] = { items, nextCursor: result.pages[group].length > 30 && last
          ? codecs[group].encode({ due: last.dueKey, id: last.id, record_id: last.recordId }) : null };
      }
      return { counts: result.counts, pages };
    },
  };
}

export function createConfiguredLifecycleTaskPagesReader(): LifecycleTaskPagesReader | null {
  const configured = createConfiguredPostgresLiveRecordStore();
  if (!configured) return null;
  return createLifecycleTaskPagesReader({ client: configured.client, workspaceId: configured.workspaceId,
    secret: process.env.ORBIT_READ_CURSOR_SECRET ?? process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? "" });
}
