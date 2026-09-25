import { contactIntrosSummarySchema } from "../../shared/api-schema/contact-intros-summary";
import type { ContactIntrosSummaryContract } from "../../shared/contract/contact-intros-summary";
import { createConfiguredPostgresLiveRecordStore } from "../../shared/storage/configured-live-record-store";
import type { LiveRecordSqlClient } from "../../shared/storage/postgres-live-record-store";
import { resolveSharedReadBudgetGate } from "../sync/read-budget-gate";

const JS_TRIM_CHARS_SQL = [
  "chr(9)", "chr(10)", "chr(11)", "chr(12)", "chr(13)", "' '",
  "chr(160)", "chr(5760)", "chr(8192)", "chr(8193)", "chr(8194)",
  "chr(8195)", "chr(8196)", "chr(8197)", "chr(8198)", "chr(8199)",
  "chr(8200)", "chr(8201)", "chr(8202)", "chr(8232)", "chr(8233)",
  "chr(8239)", "chr(8287)", "chr(12288)", "chr(65279)",
].join(" || ");

const SOURCE_TYPES_SQL = "'manual','business_card_ocr','qr_scan','event_import','external_contacts','email_signal','calendar_signal','referral','chat_summary','agent_action','system'";
const RELATIONSHIP_STAGES_SQL = "'captured','reviewing','active','needs_follow_up','nurture','archived'";
const CONNECTION_EVIDENCE_SOURCE_TYPES_SQL = "'manual','event_import','email_signal','calendar_signal','referral','chat_summary','agent_action'";

/**
 * One actor-scoped database read for ContactIntros. Contact and relationship
 * payloads stay inside PostgreSQL; only counts and five bounded card fields
 * cross the API boundary. A repeated relationship or contact identity is
 * excluded from candidates rather than choosing an arbitrary row.
 */
export const CONTACT_INTROS_SUMMARY_SQL = `with
private_contacts as materialized (
  select c.record_id, c.payload->>'id' as contact_id,
    c.payload->>'displayName' as display_name,
    coalesce(c.payload->>'organization','') as organization,
    coalesce(c.payload->>'role','') as role,
    c.payload->>'lifecycleInitialization' as lifecycle_initialization,
    c.occurred_at, c.updated_at
  from orbit_records c
  where c.workspace_id=$1 and c.collection_name='contacts'
    and c.lifecycle_state <> 'deleted' and c.user_id=$2
    and (c.payload->'accountId' is null or c.payload->'accountId'='null'::jsonb or c.payload->'accountId'=to_jsonb($2::text))
    and jsonb_typeof(c.payload->'id')='string'
    and nullif(btrim(c.payload->>'id',${JS_TRIM_CHARS_SQL}),'') is not null
    and jsonb_typeof(c.payload->'displayName')='string'
    and nullif(btrim(c.payload->>'displayName',${JS_TRIM_CHARS_SQL}),'') is not null
    and c.payload->>'stage' in (${RELATIONSHIP_STAGES_SQL})
    and jsonb_typeof(c.payload->'source')='object'
    and jsonb_typeof(c.payload->'source'->'type')='string'
    and c.payload->'source'->>'type' in (${SOURCE_TYPES_SQL})
    and jsonb_typeof(c.payload->'source'->'id')='string'
    and nullif(btrim(c.payload->'source'->>'id',${JS_TRIM_CHARS_SQL}),'') is not null
    and jsonb_typeof(c.payload->'evidenceIds')='array'
    and exists (
      select 1 from jsonb_array_elements(case when jsonb_typeof(c.payload->'evidenceIds')='array' then c.payload->'evidenceIds' else '[]'::jsonb end) e(value)
      where jsonb_typeof(e.value)='string' and nullif(btrim(e.value #>> '{}',${JS_TRIM_CHARS_SQL}),'') is not null
    )
    and jsonb_typeof(c.payload->'createdAt')='string'
    and nullif(btrim(c.payload->>'createdAt',${JS_TRIM_CHARS_SQL}),'') is not null
    and jsonb_typeof(c.payload->'updatedAt')='string'
    and nullif(btrim(c.payload->>'updatedAt',${JS_TRIM_CHARS_SQL}),'') is not null
    and case when not c.payload ? 'version' then true
      when jsonb_typeof(c.payload->'version') <> 'number' then false
      else (c.payload->>'version')::numeric=trunc((c.payload->>'version')::numeric)
        and (c.payload->>'version')::numeric between 1 and 9007199254740991 end
), identified_contacts as materialized (
  select *, count(*) over(partition by contact_id) as contact_identity_count
  from private_contacts
), private_relationships as materialized (
  select r.record_id, r.payload->>'contactId' as contact_id,
    r.payload->>'lifecycleInitialization' as lifecycle_initialization,
    case when jsonb_typeof(r.payload->'valueTypes')='array' then exists (
      select 1 from jsonb_array_elements(r.payload->'valueTypes') v(value)
      where jsonb_typeof(v.value)='string' and v.value #>> '{}'='referral_path'
    ) else false end as has_referral_path,
    coalesce(
      case when jsonb_typeof(r.payload->'relationshipStrength')='number' then
        case when (r.payload->>'relationshipStrength')::numeric between -1.7976931348623157e308 and 1.7976931348623157e308
          then (r.payload->>'relationshipStrength')::double precision end end,
      case when jsonb_typeof(r.payload->'businessRelevanceScore')='number' then
        case when (r.payload->>'businessRelevanceScore')::numeric between -1.7976931348623157e308 and 1.7976931348623157e308
          then (r.payload->>'businessRelevanceScore')::double precision end end,
      50::double precision
    ) as strength_score,
    case
      when link.source_type='referral' or link.source_label ~* '^warm referral for ' then true
      else false
    end as has_referral_source,
    case
      when link.source_type='referral' or link.source_label ~* '^warm referral for ' then '朋友介绍'
      when link.source_type in ('qr_scan','event_import') or link.source_label ~* '^direct qr scan for ' then '二维码记录'
      when link.source_type='manual' then '关系证据'
      else '联系人记录'
    end as source_label
  from orbit_records r
  cross join lateral (
    select e.value #>> '{}' as evidence_id
    from jsonb_array_elements(case when jsonb_typeof(r.payload->'evidenceIds')='array' then r.payload->'evidenceIds' else '[]'::jsonb end) with ordinality e(value,ordinality)
    where jsonb_typeof(e.value)='string' and nullif(btrim(e.value #>> '{}',${JS_TRIM_CHARS_SQL}),'') is not null
    order by e.ordinality limit 1
  ) first_id
  left join orbit_records evidence
    on evidence.workspace_id=r.workspace_id and evidence.collection_name='evidence'
    and evidence.record_id=first_id.evidence_id and evidence.lifecycle_state <> 'deleted'
  left join lateral (
    select case
      when evidence.payload->>'id'=first_id.evidence_id
        and jsonb_typeof(evidence.payload->'id')='string'
        and evidence.payload->>'sourceType' in (${SOURCE_TYPES_SQL})
        and jsonb_typeof(evidence.payload->'sourceType')='string'
        and jsonb_typeof(evidence.payload->'sourceId')='string'
        and nullif(btrim(evidence.payload->>'sourceId',${JS_TRIM_CHARS_SQL}),'') is not null
        and jsonb_typeof(evidence.payload->'summary')='string'
        and nullif(btrim(evidence.payload->>'summary',${JS_TRIM_CHARS_SQL}),'') is not null
        and jsonb_typeof(evidence.payload->'occurredAt')='string'
        and nullif(btrim(evidence.payload->>'occurredAt',${JS_TRIM_CHARS_SQL}),'') is not null
        and jsonb_typeof(evidence.payload->'confidence')='number'
        and jsonb_typeof(evidence.payload->'createdBy')='string'
        and nullif(btrim(evidence.payload->>'createdBy',${JS_TRIM_CHARS_SQL}),'') is not null
      then evidence.payload->>'sourceType' end as valid_evidence_source_type,
      case when evidence.payload->>'id'=first_id.evidence_id
        and jsonb_typeof(evidence.payload->'id')='string'
        and evidence.payload->>'sourceType' in (${SOURCE_TYPES_SQL})
        and jsonb_typeof(evidence.payload->'sourceType')='string'
        and jsonb_typeof(evidence.payload->'sourceId')='string'
        and nullif(btrim(evidence.payload->>'sourceId',${JS_TRIM_CHARS_SQL}),'') is not null
        and jsonb_typeof(evidence.payload->'summary')='string'
        and nullif(btrim(evidence.payload->>'summary',${JS_TRIM_CHARS_SQL}),'') is not null
        and jsonb_typeof(evidence.payload->'occurredAt')='string'
        and nullif(btrim(evidence.payload->>'occurredAt',${JS_TRIM_CHARS_SQL}),'') is not null
        and jsonb_typeof(evidence.payload->'confidence')='number'
        and jsonb_typeof(evidence.payload->'createdBy')='string'
        and nullif(btrim(evidence.payload->>'createdBy',${JS_TRIM_CHARS_SQL}),'') is not null
      then evidence.payload->>'sourceId' end as valid_evidence_source_id
  ) evidence_link on true
  cross join lateral (
    select
      case when evidence_link.valid_evidence_source_type is not null
        then case when evidence_link.valid_evidence_source_type in (${CONNECTION_EVIDENCE_SOURCE_TYPES_SQL}) then evidence_link.valid_evidence_source_type else 'manual' end
        else case when r.payload->'source'->>'type' in (${CONNECTION_EVIDENCE_SOURCE_TYPES_SQL}) then r.payload->'source'->>'type' else 'manual' end
      end as source_type,
      coalesce(nullif(btrim(r.payload->'source'->>'label',${JS_TRIM_CHARS_SQL}),''), evidence_link.valid_evidence_source_id, 'Live connection evidence') as source_label
  ) link
  where r.workspace_id=$1 and r.collection_name='connections'
    and r.lifecycle_state <> 'deleted' and r.user_id=$2
    and r.payload->'accountId'=to_jsonb($2::text)
    and jsonb_typeof(r.payload->'id')='string'
    and nullif(btrim(r.payload->>'id',${JS_TRIM_CHARS_SQL}),'') is not null
    and jsonb_typeof(r.payload->'accountId')='string'
    and nullif(btrim(r.payload->>'accountId',${JS_TRIM_CHARS_SQL}),'') is not null
    and jsonb_typeof(r.payload->'contactId')='string'
    and nullif(btrim(r.payload->>'contactId',${JS_TRIM_CHARS_SQL}),'') is not null
    and r.payload->>'stage' in (${RELATIONSHIP_STAGES_SQL})
    and jsonb_typeof(r.payload->'summary')='string'
    and nullif(btrim(r.payload->>'summary',${JS_TRIM_CHARS_SQL}),'') is not null
    and jsonb_typeof(r.payload->'source')='object'
    and r.payload->'source'->>'type' in (${SOURCE_TYPES_SQL})
    and jsonb_typeof(r.payload->'source'->'type')='string'
    and jsonb_typeof(r.payload->'source'->'id')='string'
    and nullif(btrim(r.payload->'source'->>'id',${JS_TRIM_CHARS_SQL}),'') is not null
    and jsonb_typeof(r.payload->'evidenceIds')='array'
    and exists (
      select 1 from jsonb_array_elements(case when jsonb_typeof(r.payload->'evidenceIds')='array' then r.payload->'evidenceIds' else '[]'::jsonb end) e(value)
      where jsonb_typeof(e.value)='string' and nullif(btrim(e.value #>> '{}',${JS_TRIM_CHARS_SQL}),'') is not null
    )
    and jsonb_typeof(r.payload->'createdAt')='string'
    and nullif(btrim(r.payload->>'createdAt',${JS_TRIM_CHARS_SQL}),'') is not null
    and jsonb_typeof(r.payload->'updatedAt')='string'
    and nullif(btrim(r.payload->>'updatedAt',${JS_TRIM_CHARS_SQL}),'') is not null
    and case when not r.payload ? 'version' then true
      when jsonb_typeof(r.payload->'version') <> 'number' then false
      else (r.payload->>'version')::numeric=trunc((r.payload->>'version')::numeric)
        and (r.payload->>'version')::numeric between 1 and 9007199254740991 end
), relationship_counts as materialized (
  select contact_id, count(*) as relationship_count,
    bool_or(has_referral_path) as has_referral_path,
    bool_or(has_referral_source) as has_referral_source,
    coalesce(bool_or(lifecycle_initialization='pending'),false) as relationship_pending,
    min(strength_score) as strength_score,
    min(source_label) as source_label
  from private_relationships group by contact_id
), eligible as materialized (
  select c.record_id,c.contact_id,c.display_name,c.organization,c.role,
    c.occurred_at,c.updated_at,r.has_referral_path,r.has_referral_source,r.strength_score,r.source_label
  from identified_contacts c
  join relationship_counts r on r.contact_id=c.contact_id
  where c.contact_identity_count=1 and r.relationship_count=1
    and c.lifecycle_initialization is distinct from 'pending'
    and not r.relationship_pending
    and (r.has_referral_path or r.has_referral_source)
), top_candidates as materialized (
  select * from eligible
  order by strength_score desc,coalesce(occurred_at,updated_at) desc,updated_at desc,record_id collate "C" asc,contact_id collate "C" asc
  limit 5
)
select jsonb_build_object(
  'ok',not exists(select 1 from top_candidates where octet_length(contact_id)>512),
  'totalContacts',(select count(*) from private_contacts),
  'referralCandidateCount',(select count(*) from eligible),
  'candidates',case when exists(select 1 from top_candidates where octet_length(contact_id)>512) then '[]'::jsonb else
    coalesce((select jsonb_agg(jsonb_build_object(
      'id',contact_id,'displayName',left(display_name,128),'organization',left(organization,128),'role',left(role,128),
      'hasReferralPath',has_referral_path,'sourceLabel',source_label,'strengthScore',strength_score
    ) order by strength_score desc,coalesce(occurred_at,updated_at) desc,updated_at desc,record_id collate "C" asc,contact_id collate "C" asc) from top_candidates),'[]'::jsonb)
  end
) as result`;

export interface ContactIntrosSummaryReader {
  read(actorId: string, actorWorkspaceId: string): Promise<ContactIntrosSummaryContract>;
}

export function createContactIntrosSummaryReader(input: {
  client: LiveRecordSqlClient;
  workspaceId: string;
}): ContactIntrosSummaryReader {
  return {
    async read(actorId, actorWorkspaceId) {
      if (!actorId.trim()) throw new Error("CONTACT_INTROS_ACTOR_REQUIRED");
      if (!actorWorkspaceId.trim() || actorWorkspaceId !== input.workspaceId) throw new Error("CONTACT_INTROS_WORKSPACE_MISMATCH");
      const response = await input.client.query<{ result: unknown }>(CONTACT_INTROS_SUMMARY_SQL, [input.workspaceId, actorId]);
      if (response.rows.length !== 1) throw new Error("CONTACT_INTROS_SUMMARY_INVALID");
      const result = response.rows[0]!.result as Record<string, unknown> | null;
      if (!result || result.ok !== true) throw new Error("CONTACT_INTROS_SUMMARY_INVALID");
      const { ok: _ok, ...data } = result;
      return contactIntrosSummarySchema.parse(data);
    },
  };
}

export function createConfiguredContactIntrosSummaryReader(): ContactIntrosSummaryReader | null {
  const configured = createConfiguredPostgresLiveRecordStore();
  if (!configured) return null;
  const reader = createContactIntrosSummaryReader({ client: configured.client, workspaceId: configured.workspaceId });
  return {
    read(actorId, actorWorkspaceId) {
      const gate = resolveSharedReadBudgetGate();
      gate?.assertAllowed({ collectionName: "contacts" });
      gate?.assertAllowed({ collectionName: "connections" });
      gate?.assertAllowed({ collectionName: "evidence" });
      return reader.read(actorId, actorWorkspaceId);
    },
  };
}
