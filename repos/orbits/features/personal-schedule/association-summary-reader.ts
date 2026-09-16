import type { LiveRecordSqlClient } from "../../shared/storage/postgres-live-record-store";
import type { AssociationCandidateReader } from "./association-options";
import { CONTACT_ACTOR_AUTHORIZATION_SQL } from "../contacts/storage/contact-read-authorization";
import { isOwnedNoteIdentity } from "../notes/note-record";

export function createAssociationSummaryReader(input: { client: LiveRecordSqlClient; workspaceId: string }): AssociationCandidateReader {
  return async query => {
    if (!query.actorId.trim() || !Number.isSafeInteger(query.limit) || query.limit < 1 || query.limit > 40) throw new Error("Invalid association summary request.");
    const note = query.kind === "note";
    const identity = note ? "c.payload->'note'" : "c.payload";
    const title = note
      ? `case when c.payload->>'schemaVersion' = '1' then case when jsonb_typeof(c.payload->'note'->'body') = 'string' then to_jsonb(trim(substring(c.payload->'note'->>'body' from '[^[:space:]][^\\r\\n]*'))) end else c.payload->'note'->'title' end`
      : "c.payload->'displayName'";
    const result = await input.client.query<{ source_version: unknown; candidates: unknown }>(`
      with authorized as (
        select c.record_id, c.updated_at,
          jsonb_build_object(
            'id', ${identity}->'id', 'recordId', c.record_id, 'title', ${title},
            'userId', c.user_id, 'lifecycleState', c.lifecycle_state,
            'schemaVersion', c.payload->'schemaVersion',
            'accountId', ${identity}->'accountId', 'ownerUserId', ${identity}->'ownerUserId',
            'version', ${identity}->'version', 'createdAt', ${identity}->'createdAt', 'updatedAt', ${identity}->'updatedAt'
          ) as summary
        from orbit_records c
        where c.workspace_id = $1 and c.collection_name = $2
          and c.lifecycle_state <> 'deleted'
          and ${note ? "c.user_id = $4 and $5::text = 'connections'" : CONTACT_ACTOR_AUTHORIZATION_SQL}
      )
      select
        coalesce((select md5(string_agg(record_id || '|' || updated_at::text || '|' || summary::text, ',' order by record_id collate "C")) from authorized), 'empty') as source_version,
        coalesce((select jsonb_agg(summary order by record_id collate "C") from (
          select record_id, summary from authorized where record_id collate "C" > $3
          order by record_id collate "C" limit $6
        ) candidates), '[]'::jsonb) as candidates
    `, [input.workspaceId, note ? "notes" : "contacts", query.afterId ?? "", query.actorId, "connections", query.limit + 1]);
    const row = result.rows[0];
    if (!row || typeof row.source_version !== "string" || !row.source_version || !Array.isArray(row.candidates) || row.candidates.length > query.limit + 1) throw new Error("Invalid association summary page.");
    const candidates = row.candidates.slice(0, query.limit).map(value => {
      if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("Invalid association summary.");
      const item = value as Record<string, unknown>;
      if (typeof item.id !== "string" || !item.id || item.id !== item.recordId || typeof item.title !== "string" || !item.title.trim() || item.lifecycleState === "deleted") throw new Error("Invalid association summary.");
      if (note && (!isOwnedNoteIdentity(item, query.actorId) || item.userId !== query.actorId || (item.schemaVersion !== 1 && item.schemaVersion !== 2) || !Number.isSafeInteger(item.version) || Number(item.version) < 1 || typeof item.createdAt !== "string" || !Number.isFinite(Date.parse(item.createdAt)) || typeof item.updatedAt !== "string" || !Number.isFinite(Date.parse(item.updatedAt)))) throw new Error("Invalid association summary authorization or metadata.");
      return { id: item.id, title: item.title };
    });
    return { candidates, sourceVersion: row.source_version, hasMore: row.candidates.length > query.limit };
  };
}
