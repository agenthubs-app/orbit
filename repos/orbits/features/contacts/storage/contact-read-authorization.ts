import type { LiveRecord } from "../../../shared/storage/live-record-store";

/** Private contacts/relationships require a real matching owner. A reference
 * from somebody else's relationship is not permission to read this record. */
export function contactRecordOwnedByActor(
  record: LiveRecord<Record<string, unknown>>,
  actorId: string,
): boolean {
  return !!actorId.trim() && record.userId === actorId
    && (record.payload.accountId == null || record.payload.accountId === actorId);
}

// c/$4/$5 are shared fixed bindings. Keep $5 typed for legacy reader callers.
export const CONTACT_ACTOR_AUTHORIZATION_SQL = `(
        c.user_id = $4
        and (c.payload->'accountId' is null or c.payload->'accountId'='null'::jsonb or c.payload->'accountId'=to_jsonb($4::text))
        and $5::text = 'connections'
      )`;
