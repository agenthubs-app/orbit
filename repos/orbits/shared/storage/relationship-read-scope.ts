import type { LiveRecord } from "./live-record-store";
import { rowToRecord, type LiveRecordSqlClient, type PostgresLiveRecordRow } from "./postgres-live-record-store";

export interface RelationshipScopedRecords {
  tasks: readonly LiveRecord<Record<string, unknown>>[];
  contacts: readonly LiveRecord<Record<string, unknown>>[];
  connections: readonly LiveRecord<Record<string, unknown>>[];
  evidence: readonly LiveRecord<Record<string, unknown>>[];
  notifications: readonly LiveRecord<Record<string, unknown>>[];
}
export type RelationshipScopeRecordReader = (actorId: string) => Promise<RelationshipScopedRecords>;

/** Legacy payload ownership is accepted only when it does not contradict a row owner. */
export function relationshipRecordOwnedByActor(record: LiveRecord<Record<string, unknown>>, actorId: string): boolean {
  if (!actorId.trim()) return false;
  const alias = record.payload.accountId;
  return record.userId === actorId ? alias == null || alias === actorId
    : !record.userId && alias === actorId;
}

/**
 * Purpose-specific selection for the two legacy relationship graphs. Their
 * contact reference formats differ: followups use payload.id; legacy uses row ID.
 * Evidence references in these graphs use row metadata, not payload.evidenceIds.
 * No arbitrary JSON ID search is an authorization source. Selection and payload
 * retrieval share one SQL snapshot: no authorization-to-payload ownership race.
 */
export function createPostgresRelationshipScopeReader(input: {
  client: LiveRecordSqlClient;
  workspaceId: string;
  purpose: "followups" | "legacy-notifications";
  beforeRead?: () => void;
}): RelationshipScopeRecordReader {
  return async actorId => {
    const selected: Record<keyof RelationshipScopedRecords, LiveRecord<Record<string, unknown>>[]> = {
      tasks: [], contacts: [], connections: [], evidence: [], notifications: [],
    };
    if (!actorId.trim() || !input.workspaceId.trim()) return selected;
    input.beforeRead?.();
    const result = await input.client.query<PostgresLiveRecordRow>(`
      with owned as (
        select collection_name,record_id,payload,evidence_ids,target_id,target_type
        from orbit_records r
        where r.workspace_id=$1 and r.collection_name in ('tasks','contacts','connections','evidence','notifications')
          and r.lifecycle_state<>'deleted' and ($3='followups' or r.lifecycle_state<>'archived')
          and ($3<>'followups' or r.user_id=$2)
          and ((r.user_id=$2 and (r.payload->>'accountId' is null or r.payload->'accountId'=to_jsonb($2::text)))
            or (nullif(r.user_id,'') is null and r.payload->'accountId'=to_jsonb($2::text)))
      ), notifications as (
        select collection_name,record_id,payload,evidence_ids,target_id,target_type from orbit_records
        where $3='legacy-notifications' and workspace_id=$1 and collection_name='notifications'
          and user_id=$2 and lifecycle_state not in ('deleted','archived')
      ), primary_records as (
        select * from owned where collection_name in ('tasks','connections')
      ), contact_refs as (
        select payload->>'contactId' as id from primary_records
        union select target_id from notifications where target_type='contact'
      ), contacts as (
        select c.collection_name,c.record_id,c.payload,c.evidence_ids,c.target_id,c.target_type
        from orbit_records c where c.workspace_id=$1 and c.collection_name='contacts'
          and c.lifecycle_state<>'deleted' and ($3='followups' or c.lifecycle_state<>'archived')
          and (c.record_id in (select record_id from owned where collection_name='contacts')
            or case when $3='followups' then c.payload->>'id' else c.record_id end in (select id from contact_refs))
      ), sources as (
        select * from primary_records union all select * from contacts union all select * from notifications
      ), evidence_refs as (
        select distinct unnest(evidence_ids) as id from sources
      ), evidence as (
        select e.collection_name,e.record_id from orbit_records e
        where e.workspace_id=$1 and e.collection_name='evidence' and e.lifecycle_state<>'deleted'
          and ($3='followups' or e.lifecycle_state<>'archived')
          and (e.record_id in (select record_id from owned where collection_name='evidence')
            or e.record_id in (select id from evidence_refs))
      ), selected as (
        select collection_name,record_id from sources
        union all select collection_name,record_id from evidence
      )
      select r.workspace_id,r.collection_name,r.record_id,r.user_id,r.source_type,r.source_id,r.source_label,
        r.provider,r.provider_record_id,r.evidence_ids,r.target_type,r.target_id,r.occurred_at,r.lifecycle_state,
        r.search_text,r.payload,r.created_at,r.updated_at,r.deleted_at
      from selected s join orbit_records r on r.workspace_id=$1
        and r.collection_name=s.collection_name and r.record_id=s.record_id
      order by coalesce(r.occurred_at,r.updated_at) desc,r.updated_at desc
    `, [input.workspaceId, actorId, input.purpose]);
    for (const row of result.rows) selected[row.collection_name as keyof RelationshipScopedRecords].push(rowToRecord(row));
    return selected;
  };
}
