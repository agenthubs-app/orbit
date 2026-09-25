import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { contactPipelinePageSchema } from "../../shared/api-schema/contact-pipeline-page";
import type { ContactPipelinePageContract } from "../../shared/contract/contact-pipeline-page";
import type { LiveRecordSqlClient } from "../../shared/storage/postgres-live-record-store";
import { createConfiguredPostgresLiveRecordStore } from "../../shared/storage/configured-live-record-store";
import { resolveSharedReadBudgetGate } from "../sync/read-budget-gate";
import { taskRecordsValidityCte, taskTimestampSql } from "../tasks/task-page";
import { CONTACT_PIPELINE_STAGES, type ContactPipelineStage } from "./pipeline-contract";

const MAX_LIMIT = 20;
const SOURCE_TYPES = ["manual", "business_card_ocr", "qr_scan", "event_import", "external_contacts", "email_signal", "calendar_signal", "referral", "chat_summary", "agent_action", "system"];
const RELATIONSHIP_STAGES = ["captured", "reviewing", "active", "needs_follow_up", "nurture", "archived"];
const CONTACT_PIPELINE_CONNECTION_STAGES = ["needs_follow_up", "active", "nurture", "archived"];
const whitespace = "\\0009\\000A\\000B\\000C\\000D\\0020\\00A0\\1680\\2000\\2001\\2002\\2003\\2004\\2005\\2006\\2007\\2008\\2009\\200A\\2028\\2029\\202F\\205F\\3000\\FEFF";
const nonblank = (value: string) => `(jsonb_typeof(${value})='string' and btrim(${value} #>> '{}',U&'${whitespace}')<>'')`;
const valuesSql = (values: readonly string[]) => values.map(value => `'${value}'`).join(",");
const isoPattern = "^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])T(([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]([.][0-9]{1,3})?|24:00:00([.]0{1,3})?)(Z|[+-]([01][0-9]|2[0-3]):[0-5][0-9])$";
const instant = (value: string) => `(jsonb_typeof(${value})='string' and (${value} #>> '{}') ~ '${isoPattern}')`;

const SQL = `with actor_contacts as materialized (
  select c.record_id,c.user_id,c.occurred_at,c.updated_at,c.payload,
    case when c.payload ? 'version' then case
      when jsonb_typeof(c.payload->'version')<>'number' then 'Invalid contact lifecycle version'
      when (c.payload->>'version')::numeric<>trunc((c.payload->>'version')::numeric) then 'Invalid contact lifecycle version'
      when (c.payload->>'version')::numeric<1 or (c.payload->>'version')::numeric>9007199254740991 then 'Invalid contact lifecycle version'
      else null end else null end as version_error
  from orbit_records c
  where c.workspace_id=$1 and c.collection_name='contacts' and c.lifecycle_state<>'deleted'
    and c.user_id=$2 and (c.payload->'accountId' is null or c.payload->'accountId'='null'::jsonb or c.payload->'accountId'=to_jsonb($2::text))
), valid_contacts as materialized (
  select record_id,payload->>'id' as contact_id,payload->>'displayName' as display_name,
    coalesce(payload->>'organization','') as organization,coalesce(payload->>'role','') as role,
    payload->>'stage' as contact_stage,payload->>'lifecycleInitialization' as lifecycle_initialization,
    coalesce(occurred_at,updated_at) as sort_occurred_at,updated_at as sort_updated_at
  from actor_contacts c
  where version_error is null
    and ${nonblank("payload->'id'")} and ${nonblank("payload->'displayName'")}
    and payload->>'stage' in (${valuesSql(RELATIONSHIP_STAGES)})
    and jsonb_typeof(payload->'source')='object'
    and payload->'source'->>'type' in (${valuesSql(SOURCE_TYPES)})
    and jsonb_typeof(payload->'source'->'type')='string' and ${nonblank("payload->'source'->'id'")}
    and jsonb_typeof(payload->'evidenceIds')='array'
    and exists(select 1 from jsonb_array_elements(case when jsonb_typeof(payload->'evidenceIds')='array' then payload->'evidenceIds' else '[]'::jsonb end) e(value) where ${nonblank("e.value")})
    and ${nonblank("payload->'createdAt'")} and ${nonblank("payload->'updatedAt'")}
), actor_connections as materialized (
  select c.record_id,c.occurred_at,c.updated_at,c.payload,
    case when c.payload ? 'version' then case
      when jsonb_typeof(c.payload->'version')<>'number' then 'Invalid connection lifecycle version'
      when (c.payload->>'version')::numeric<>trunc((c.payload->>'version')::numeric) then 'Invalid connection lifecycle version'
      when (c.payload->>'version')::numeric<1 or (c.payload->>'version')::numeric>9007199254740991 then 'Invalid connection lifecycle version'
      else null end else null end as version_error
  from orbit_records c
  where c.workspace_id=$1 and c.collection_name='connections' and c.lifecycle_state<>'deleted'
    and c.user_id=$2 and (c.payload->'accountId' is null or c.payload->'accountId'='null'::jsonb or c.payload->'accountId'=to_jsonb($2::text))
), valid_connections as materialized (
  select record_id,payload->>'id' as connection_id,payload->>'contactId' as contact_id,
    payload->>'stage' as stage,payload->>'lifecycleInitialization' as lifecycle_initialization,
    (case when payload ? 'version' then (payload->>'version')::numeric end) as version,
    coalesce(occurred_at,updated_at) as sort_occurred_at,updated_at as sort_updated_at
  from actor_connections c
  where version_error is null and ${nonblank("payload->'id'")} and ${nonblank("payload->'accountId'")}
    and ${nonblank("payload->'contactId'")} and payload->>'stage' in (${valuesSql(RELATIONSHIP_STAGES)})
    and ${nonblank("payload->'summary'")}
    and jsonb_typeof(payload->'source')='object' and payload->'source'->>'type' in (${valuesSql(SOURCE_TYPES)})
    and jsonb_typeof(payload->'source'->'type')='string' and ${nonblank("payload->'source'->'id'")}
    and jsonb_typeof(payload->'evidenceIds')='array'
    and exists(select 1 from jsonb_array_elements(case when jsonb_typeof(payload->'evidenceIds')='array' then payload->'evidenceIds' else '[]'::jsonb end) e(value) where ${nonblank("e.value")})
    and ${nonblank("payload->'createdAt'")} and ${nonblank("payload->'updatedAt'")}
    and exists(select 1 from valid_contacts c where c.contact_id=payload->>'contactId')
), connection_groups as materialized (
  select contact_id,count(*) as candidate_count,
    bool_or(version is not null or lifecycle_initialization in ('pending','ready')) as has_lifecycle_marker
  from valid_connections group by contact_id
), ordered_connections as materialized (
  select c.*,g.candidate_count,g.has_lifecycle_marker,
    row_number() over(partition by c.contact_id order by c.sort_occurred_at desc,c.sort_updated_at desc,c.record_id collate "C" asc) as ordinal
  from valid_connections c join connection_groups g using(contact_id)
), canonical_connections as materialized (
  select contact_id,stage,lifecycle_initialization
  from ordered_connections
  where ordinal=1 and (version is not null or lifecycle_initialization='ready')
    and lifecycle_initialization is distinct from 'pending' and stage in (${valuesSql(CONTACT_PIPELINE_CONNECTION_STAGES)})
), classified_contacts as materialized (
  select c.record_id,c.contact_id,c.display_name,c.organization,c.role,
    c.sort_occurred_at,c.sort_updated_at,
    case coalesce(cc.stage,c.contact_stage)
      when 'captured' then 'to_contact'
      when 'needs_follow_up' then 'to_contact'
      when 'reviewing' then 'in_progress'
      when 'active' then 'in_progress'
      when 'nurture' then 'nurture'
      when 'archived' then 'archived'
    end as stage
  from valid_contacts c left join canonical_connections cc on cc.contact_id=c.contact_id
  where c.lifecycle_initialization is distinct from 'pending'
), stage_counts as (
  select count(*) filter(where stage='to_contact') as to_contact,
    count(*) filter(where stage='in_progress') as in_progress,
    count(*) filter(where stage='nurture') as nurture,
    count(*) filter(where stage='archived') as archived
  from classified_contacts
), selected_page as materialized (
  select c.*,row_number() over(order by c.sort_occurred_at desc,c.sort_updated_at desc,c.record_id collate "C" asc) as page_position
  from classified_contacts c
  where c.stage=$3 and ($5::timestamptz is null
    or c.sort_occurred_at<$5::timestamptz
    or (c.sort_occurred_at=$5::timestamptz and c.sort_updated_at<$6::timestamptz)
    or (c.sort_occurred_at=$5::timestamptz and c.sort_updated_at=$6::timestamptz and c.record_id collate "C">$7 collate "C"))
  order by c.sort_occurred_at desc,c.sort_updated_at desc,c.record_id collate "C" asc
  limit $4::integer+1
), ${taskRecordsValidityCte()}, valid_action_tasks as materialized (
  select v.record_id,v.t,contact.contact_id,contact.display_name as contact_name,contact.organization,contact.role
  from valid v join valid_contacts contact on contact.contact_id=v.t->>'relatedContactId'
  where v.t->>'status'='open' and v.t ? 'dueAt' and ${nonblank("v.t->'relatedContactId'")}
), action_candidates as materialized (
  select record_id,t->>'id' as task_id,contact_id,contact_name,organization,role,
    t->>'title' as title,t->>'dueAt' as due_at,${taskTimestampSql("t->>'dueAt'")} as due_instant
  from valid_action_tasks
), top_actions as materialized (
  select * from action_candidates
  order by due_instant asc,due_at collate "C" asc,task_id collate "C" asc,record_id collate "C" asc
  limit 3
), integrity as (
  select case
    when exists(select 1 from actor_contacts where version_error is not null) then 'CONTACT_PIPELINE_RECORD_INVALID'
    when exists(select 1 from actor_connections where version_error is not null) then 'CONTACT_PIPELINE_RECORD_INVALID'
    when exists(select 1 from connection_groups where candidate_count>1 and has_lifecycle_marker) then 'CONTACT_PIPELINE_CONNECTION_AMBIGUOUS'
    when exists(select 1 from valid_contacts group by contact_id having count(*)>1) then 'CONTACT_PIPELINE_CONTACT_AMBIGUOUS'
    when exists(select 1 from selected_page where octet_length(record_id)>2048 or octet_length(contact_id)>2048) then 'CONTACT_PIPELINE_RECORD_INVALID'
    when exists(select 1 from top_actions where octet_length(task_id)>2048 or octet_length(contact_id)>2048) then 'CONTACT_PIPELINE_RECORD_INVALID'
    else null end as error_code
)
select jsonb_build_object(
  'ok',(integrity.error_code is null),'errorCode',integrity.error_code,
  'stageCounts',jsonb_build_object('to_contact',counts.to_contact,'in_progress',counts.in_progress,'nurture',counts.nurture,'archived',counts.archived),
  'items',coalesce((select jsonb_agg(jsonb_build_object('id',p.contact_id,'displayName',left(p.display_name,128),
    'organization',left(p.organization,128),'role',left(p.role,128)) order by p.page_position)
    from selected_page p where p.page_position<=$4),'[]'::jsonb),
  'hasMore',(select count(*)>$4 from selected_page),
  'lastPosition',(select jsonb_build_object('occurredAt',to_char(p.sort_occurred_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'updatedAt',to_char(p.sort_updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'id',p.record_id)
    from selected_page p where p.page_position=$4),
  'actions',coalesce((select jsonb_agg(jsonb_build_object('taskId',a.task_id,'contactId',a.contact_id,
    'contactName',left(a.contact_name,128),'organization',left(a.organization,128),'role',left(a.role,128),
    'title',left(a.title,240),'dueAt',a.due_at) order by a.due_instant asc,a.due_at collate "C" asc,a.task_id collate "C" asc,a.record_id collate "C" asc)
    from top_actions a),'[]'::jsonb)
) as result
from stage_counts counts cross join integrity`;

const cursorPosition = z.object({
  occurredAt: z.string().min(1).max(64),
  updatedAt: z.string().min(1).max(64),
  id: z.string().min(1).max(2048),
}).strict();

export interface ContactPipelinePageQuery {
  stage: ContactPipelineStage;
  limit?: number;
  cursor?: string | null;
}

export interface ContactPipelinePageReader {
  page(query: ContactPipelinePageQuery, actorId: string, actorWorkspaceId?: string): Promise<ContactPipelinePageContract>;
}

export function createPostgresContactPipelineReader(input: {
  client: LiveRecordSqlClient;
  workspaceId: string;
  cursorSecret: string;
  now?: () => string;
}) {
  const identity = (actorId: string, stage: ContactPipelineStage, limit: number) =>
    JSON.stringify(["contact-pipeline-page:v1", input.workspaceId, actorId, stage, limit]);
  const sign = (actorId: string, stage: ContactPipelineStage, limit: number, payload: string) =>
    createHmac("sha256", input.cursorSecret).update(identity(actorId, stage, limit)).update(payload).digest();

  function readCursor(actorId: string, stage: ContactPipelineStage, limit: number, cursor?: string | null) {
    if (!cursor) return null;
    try {
      if (cursor.length > 4096) throw Error();
      const [payload, signature, ...extra] = cursor.split(".");
      if (!payload || !signature || extra.length) throw Error();
      const provided = Buffer.from(signature, "base64url");
      const expected = sign(actorId, stage, limit, payload);
      if (provided.toString("base64url") !== signature || provided.length !== expected.length || !timingSafeEqual(provided, expected)) throw Error();
      return cursorPosition.parse(JSON.parse(Buffer.from(payload, "base64url").toString("utf8")));
    } catch {
      throw Error("CONTACT_PIPELINE_CURSOR_INVALID");
    }
  }

  async function page(query: ContactPipelinePageQuery, actorId: string): Promise<ContactPipelinePageContract> {
    const limit = query.limit ?? MAX_LIMIT;
    if (!actorId.trim() || actorId.length > 2048 || !CONTACT_PIPELINE_STAGES.includes(query.stage) ||
      !Number.isSafeInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
      throw Error("CONTACT_PIPELINE_INPUT_INVALID");
    }
    if (Buffer.byteLength(input.cursorSecret) < 32) throw Error("CONTACT_PIPELINE_CURSOR_SECRET_MISSING");
    const after = readCursor(actorId, query.stage, limit, query.cursor);
    const result = await input.client.query<{ result: unknown }>(SQL, [input.workspaceId, actorId, query.stage, limit,
      after?.occurredAt ?? null, after?.updatedAt ?? null, after?.id ?? null]);
    if (result.rows.length !== 1 || typeof result.rows[0]?.result !== "object" || result.rows[0]?.result === null) {
      throw Error("CONTACT_PIPELINE_RESULT_INVALID");
    }
    const data = result.rows[0].result as Record<string, unknown>;
    if (data.ok !== true) {
      throw Error(typeof data.errorCode === "string" ? data.errorCode : "CONTACT_PIPELINE_RESULT_INVALID");
    }
    const rawItems = data.items;
    const rawActions = data.actions;
    if (!Array.isArray(rawItems) || rawItems.length > limit + 1 || !Array.isArray(rawActions) || rawActions.length > 3 ||
      typeof data.hasMore !== "boolean") {
      throw Error("CONTACT_PIPELINE_RESULT_INVALID");
    }
    const hasMore = data.hasMore;
    const last = hasMore ? cursorPosition.parse(data.lastPosition) : null;
    if (hasMore && !last) throw Error("CONTACT_PIPELINE_RESULT_INVALID");
    const cursorPayload = last ? Buffer.from(JSON.stringify(last)).toString("base64url") : null;
    const nextCursor = cursorPayload ? `${cursorPayload}.${sign(actorId, query.stage, limit, cursorPayload).toString("base64url")}` : null;
    const response = contactPipelinePageSchema.parse({
      asOf: input.now?.() ?? new Date().toISOString(),
      stage: query.stage,
      stageCounts: data.stageCounts,
      items: rawItems,
      hasMore,
      nextCursor,
      actions: rawActions,
    });
    if (response.items.length > limit || response.items.length < (hasMore ? limit : 0)) throw Error("CONTACT_PIPELINE_RESULT_INVALID");
    return response;
  }

  return { page };
}

export function createConfiguredContactPipelinePageReader(): ContactPipelinePageReader | null {
  const configured = createConfiguredPostgresLiveRecordStore();
  if (!configured) return null;
  const reader = createPostgresContactPipelineReader({
    client: configured.client,
    workspaceId: configured.workspaceId,
    cursorSecret: process.env.ORBIT_READ_CURSOR_SECRET ?? process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? "",
  });
  return {
    page(query, actorId, actorWorkspaceId) {
      if (!actorWorkspaceId?.trim() || actorWorkspaceId !== configured.workspaceId) throw Error("CONTACT_PIPELINE_WORKSPACE_MISMATCH");
      const gate = resolveSharedReadBudgetGate();
      gate?.assertAllowed({ collectionName: "contacts" });
      gate?.assertAllowed({ collectionName: "connections" });
      gate?.assertAllowed({ collectionName: "tasks" });
      return reader.page(query, actorId);
    },
  };
}
