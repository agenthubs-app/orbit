import type { LiveRecordCustomRead } from "../../../../shared/storage/configured-live-record-store";
import type { LiveRecord } from "../../../../shared/storage/live-record-store";
import {
  rowToRecord,
  type LiveRecordSqlClient,
  type PostgresLiveRecordRow,
} from "../../../../shared/storage/postgres-live-record-store";
import type { StorageEventPayload } from "./storage-event-provider";

/** The actor's own legacy events: `user_id` is the actor or `payload.accountId` is the actor (string). */
export type OwnedEventRecordReader = (
  actorId: string,
) => Promise<readonly LiveRecord<StorageEventPayload>[]>;

// W0041: the ownership test of `listEvents` moved into SQL. `payload -> 'accountId'`
// is compared as jsonb with a jsonb string, so a numeric 123 never equals the
// actor "123" — exactly the JavaScript `===` it replaces (never `->>`, which
// would compare text). Columns, row mapping and ORDER BY are the ones the
// shared live-record store uses for a list read.
export const OWNED_EVENT_RECORDS_SQL = `
  select
    workspace_id,
    collection_name,
    record_id,
    user_id,
    source_type,
    source_id,
    source_label,
    provider,
    provider_record_id,
    evidence_ids,
    target_type,
    target_id,
    occurred_at,
    lifecycle_state,
    search_text,
    payload,
    created_at,
    updated_at,
    deleted_at
  from orbit_records
  where workspace_id = $1
    and collection_name = $2
    and lifecycle_state <> 'deleted'
    and (user_id = $3 or payload -> 'accountId' = to_jsonb($3::text))
  order by coalesce(occurred_at, updated_at) desc, updated_at desc
`;

export function createPostgresOwnedEventRecordReader(input: {
  client: LiveRecordSqlClient;
  /** Configured stores pass `customRead` so the read-budget gate and in-flight sharing apply. */
  read?: LiveRecordCustomRead;
  workspaceId: string;
}): OwnedEventRecordReader {
  return async (actorId) => {
    const query = async () => {
      const result = await input.client.query<PostgresLiveRecordRow>(
        OWNED_EVENT_RECORDS_SQL,
        [input.workspaceId, "events", actorId],
      );
      return result.rows.map((row) => rowToRecord<StorageEventPayload>(row));
    };
    return input.read
      ? input.read({
          collectionName: "events",
          key: `ownedEventRecords\u0000${input.workspaceId}\u0000${actorId}`,
          read: query,
        })
      : query();
  };
}
