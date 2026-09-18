import type { LiveRecordSqlClient } from "../../../shared/storage/postgres-live-record-store";

const ECMASCRIPT_TRIM_CHARS_SQL = [
  "chr(9)", "chr(10)", "chr(11)", "chr(12)", "chr(13)", "' '",
  "chr(160)", "chr(5760)", "chr(8192)", "chr(8193)", "chr(8194)",
  "chr(8195)", "chr(8196)", "chr(8197)", "chr(8198)", "chr(8199)",
  "chr(8200)", "chr(8201)", "chr(8202)", "chr(8232)", "chr(8233)",
  "chr(8239)", "chr(8287)", "chr(12288)", "chr(65279)",
].join(" || ");

export type ContactScopeRecordReader = (actorId: string, contactIds?: readonly string[]) => Promise<{
  contactIds?: readonly string[];
  connectionIds: readonly string[];
  detailStateIds: readonly string[];
  evidenceRecordIds?: readonly string[];
}>;

/** Select keys in SQL before any private relationship or note payload leaves PostgreSQL. */
export function createPostgresContactScopeRecordReader(input: {
  client: LiveRecordSqlClient;
  workspaceId: string;
}): ContactScopeRecordReader {
  return async (actorId, contactIds) => {
    if (!actorId.trim() || contactIds?.length === 0) {
      return { contactIds: [], connectionIds: [], detailStateIds: [], evidenceRecordIds: [] };
    }
    const accessible = await input.client.query<{ record_id: string; contact_id: string | null }>(`
      select c.record_id, c.payload->>'id' as contact_id from orbit_records c
      where c.workspace_id = $1 and c.collection_name = 'contacts'
        and c.lifecycle_state <> 'deleted'
        and ($3::text[] is null or c.record_id = any($3::text[]))
        and (c.user_id = $2 or exists (
          select 1 from orbit_records r
          where r.workspace_id = c.workspace_id and r.collection_name = 'connections'
            and r.lifecycle_state <> 'deleted'
            and r.payload->>'contactId' = c.payload->>'id'
            and (r.user_id = $2 or r.payload->>'accountId' = $2)
        ))
    `, [input.workspaceId, actorId, contactIds ?? null]);
    const allowedIds = accessible.rows.map(row => row.record_id);
    const domainIds = accessible.rows.map(row => row.contact_id).filter((id): id is string => typeof id === "string" && id.length > 0);
    if (allowedIds.length === 0) return { contactIds: [], connectionIds: [], detailStateIds: [], evidenceRecordIds: [] };
    const result = await input.client.query<{ collection_name: string; record_id: string }>(`
      with scoped_connections as (
        select r.payload->'evidenceIds' as evidence_ids
        from orbit_records r
        where r.workspace_id = $1 and r.collection_name = 'connections'
          and r.lifecycle_state <> 'deleted'
          and r.payload->>'contactId' = any($3::text[])
          and (r.user_id = $2 or r.payload->>'accountId' = $2)
      ), referenced_evidence_ids as (
        select distinct evidence_item.value #>> '{}' as evidence_id
        from (
          select c.payload->'evidenceIds' as evidence_ids
          from orbit_records c
          where c.workspace_id = $1 and c.collection_name = 'contacts'
            and c.lifecycle_state <> 'deleted'
            and c.record_id = any($4::text[])
          union all
          select evidence_ids from scoped_connections
        ) as evidence_sources
        cross join lateral jsonb_array_elements(
          case when jsonb_typeof(evidence_sources.evidence_ids) = 'array'
            then evidence_sources.evidence_ids else '[]'::jsonb end
        ) as evidence_item(value)
        where jsonb_typeof(evidence_item.value) = 'string'
          and nullif(btrim(evidence_item.value #>> '{}', ${ECMASCRIPT_TRIM_CHARS_SQL}), '') is not null
      ), scoped_records as (
        select collection_name, record_id
        from orbit_records
        where workspace_id = $1 and lifecycle_state <> 'deleted'
          and payload->>'contactId' = any($3::text[])
          and ((collection_name = 'connections' and (user_id = $2 or payload->>'accountId' = $2))
            or (collection_name = 'contact_detail_states' and user_id = $2))
        union all
        select 'evidence' as collection_name, e.record_id
        from orbit_records e
        where e.workspace_id = $1 and e.collection_name = 'evidence'
          and e.lifecycle_state <> 'deleted'
          and e.payload->>'id' in (select evidence_id from referenced_evidence_ids)
      )
      select collection_name, record_id from scoped_records
    `, [input.workspaceId, actorId, domainIds, allowedIds]);
    return {
      contactIds: allowedIds,
      connectionIds: result.rows.filter(row => row.collection_name === "connections").map(row => row.record_id),
      detailStateIds: result.rows.filter(row => row.collection_name === "contact_detail_states").map(row => row.record_id),
      evidenceRecordIds: result.rows.filter(row => row.collection_name === "evidence").map(row => row.record_id),
    };
  };
}
