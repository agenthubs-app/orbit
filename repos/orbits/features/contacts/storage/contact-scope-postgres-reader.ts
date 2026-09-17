import type { LiveRecordSqlClient } from "../../../shared/storage/postgres-live-record-store";

export type ContactScopeRecordReader = (actorId: string, contactIds?: readonly string[]) => Promise<{
  contactIds?: readonly string[];
  connectionIds: readonly string[];
  detailStateIds: readonly string[];
}>;

/** Select keys in SQL before any private relationship or note payload leaves PostgreSQL. */
export function createPostgresContactScopeRecordReader(input: {
  client: LiveRecordSqlClient;
  workspaceId: string;
}): ContactScopeRecordReader {
  return async (actorId, contactIds) => {
    if (!actorId.trim() || contactIds?.length === 0) return { contactIds: [], connectionIds: [], detailStateIds: [] };
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
    if (allowedIds.length === 0) return { contactIds: [], connectionIds: [], detailStateIds: [] };
    const result = await input.client.query<{ collection_name: string; record_id: string }>(`
      select collection_name, record_id from orbit_records
      where workspace_id = $1 and lifecycle_state <> 'deleted'
        and payload->>'contactId' = any($3::text[])
        and ((collection_name = 'connections' and (user_id = $2 or payload->>'accountId' = $2))
          or (collection_name = 'contact_detail_states' and user_id = $2))
    `, [input.workspaceId, actorId, domainIds]);
    return {
      contactIds: allowedIds,
      connectionIds: result.rows.filter(row => row.collection_name === "connections").map(row => row.record_id),
      detailStateIds: result.rows.filter(row => row.collection_name === "contact_detail_states").map(row => row.record_id),
    };
  };
}
