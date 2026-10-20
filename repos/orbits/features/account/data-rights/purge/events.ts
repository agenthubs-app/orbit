import type { TransactionalPostgresClient } from "../../../../shared/storage/transactional-postgres";
import { assertLocalAccountPurgeDatabase, assertLocalAccountPurgeTarget } from "./local-gate";

const PERSONAL_COLLECTIONS = ["attendees", "eventParticipantIntents", "eventPreferences",
  "eventAfterConfirmations", "eventHostAnswers", "organizerFollows"];

const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;

/**
 * The current event_ops schema embeds participant identity in immutable versions
 * and published snapshots. Stop on any trace until its shared-record redaction
 * rule is approved. Legacy attendee rows can be removed independently.
 */
export async function purgeAccountEvents(db: TransactionalPostgresClient, workspaceId: string, actorId: string): Promise<{ deleted: number }> {
  assertLocalAccountPurgeTarget();
  await assertLocalAccountPurgeDatabase(db);
  if (!workspaceId || !actorId) throw new Error("ACCOUNT_PURGE_SCOPE_REQUIRED");
  return db.transaction(async sql => {
    const tables = await sql.query<{ table_name: string }>(`select distinct c.table_name from information_schema.columns c
      where c.table_schema=current_schema() and left(c.table_name,10)='event_ops_' and c.column_name='workspace_id'
      order by c.table_name`);
    for (const row of tables.rows) {
      const found = await sql.query(`select 1 from ${quote(row.table_name)} t
        where t.workspace_id=$1 and position($2 in to_jsonb(t)::text)>0 limit 1`, [workspaceId, actorId]);
      if (found.rows.length) throw new Error(`EVENT_OPS_REDACTION_REQUIRED:${row.table_name}`);
    }
    const hosted = await sql.query(`select 1 from orbit_records where workspace_id=$1 and collection_name='events'
      and (user_id=$2 or payload->>'accountId'=$2) limit 1`, [workspaceId, actorId]);
    if (hosted.rows.length) throw new Error("HOSTED_EVENT_REDACTION_REQUIRED");
    const shared = await sql.query(`select 1 from orbit_records where workspace_id=$1
      and (left(collection_name,5)='event' or collection_name in ('attendees','organizerFollows'))
      and user_id is distinct from $2 and position($2 in payload::text)>0 limit 1`, [workspaceId, actorId]);
    if (shared.rows.length) throw new Error("SHARED_EVENT_REDACTION_REQUIRED");
    const deleted = await sql.query<{ count: string }>(`with removed as (delete from orbit_records where workspace_id=$1
      and ((collection_name='event_registrations' and (user_id=$2 or payload->'registration'->>'userId'=$2))
        or (collection_name=any($3::text[]) and user_id=$2)) returning 1)
      select count(*)::text as count from removed`, [workspaceId, actorId, PERSONAL_COLLECTIONS]);
    return { deleted: Number(deleted.rows[0]?.count ?? 0) };
  }, { isolation: "read committed" });
}
