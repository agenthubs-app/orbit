import type { LiveRecordSqlClient } from "../../../shared/storage/postgres-live-record-store";

export type ContactScopeRecordReader = (actorId: string, contactIds: readonly string[]) => Promise<{
  connectionIds: readonly string[];
  detailStateIds: readonly string[];
}>;

/** Select keys in SQL before any private relationship or note payload leaves PostgreSQL. */
export function createPostgresContactScopeRecordReader(input: {
  client: LiveRecordSqlClient;
  workspaceId: string;
}): ContactScopeRecordReader {
  return async (actorId, contactIds) => {
    if (!actorId.trim() || contactIds.length === 0) return { connectionIds: [], detailStateIds: [] };
    const result = await input.client.query<{ collection_name: string; record_id: string }>(`
      select collection_name, record_id from orbit_records
      where workspace_id = $1 and lifecycle_state <> 'deleted'
        and payload->>'contactId' = any($3::text[])
        and ((collection_name = 'connections' and (user_id = $2 or payload->>'accountId' = $2))
          or (collection_name = 'contact_detail_states' and user_id = $2))
    `, [input.workspaceId, actorId, contactIds]);
    return {
      connectionIds: result.rows.filter(row => row.collection_name === "connections").map(row => row.record_id),
      detailStateIds: result.rows.filter(row => row.collection_name === "contact_detail_states").map(row => row.record_id),
    };
  };
}
