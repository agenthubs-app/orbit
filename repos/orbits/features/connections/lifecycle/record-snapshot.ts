// Preserve PostgreSQL microseconds and normalize the timezone in SQL. Converting
// timestamptz through JavaScript Date would lose source-hash precision.
export const lifecycleRecordColumns = `
  workspace_id as "workspaceId", collection_name as "collectionName",
  record_id as "recordId", user_id as "userId",
  source_type as "sourceType", source_id as "sourceId", source_label as "sourceLabel",
  provider, provider_record_id as "providerRecordId", evidence_ids as "evidenceIds",
  target_type as "targetType", target_id as "targetId",
  to_char(occurred_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as "occurredAt",
  lifecycle_state as "lifecycleState", search_text as "searchText", payload,
  to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as "createdAt",
  to_char(updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as "updatedAt",
  to_char(deleted_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as "deletedAt"
`;
