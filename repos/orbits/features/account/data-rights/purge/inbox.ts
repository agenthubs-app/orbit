import type { TransactionalPostgresClient, TransactionalSqlExecutor } from "../../../../shared/storage/transactional-postgres";
import { assertLocalAccountPurgeTarget } from "./local-gate";

const PERSONAL_COLLECTIONS = ["inboxNotifications", "inboxSourceCheckMarks", "notification_interactions",
  "notificationCutover", "notificationDeliveryCursor", "notificationDeliveryOwners", "notifications",
  "notificationDeliveries", "notificationPreferences", "relationship_communication_bindings",
  "relationship_communication_invitations", "relationship_communication_reads", "relationshipConversationDrafts",
  "relationship_strength_state", "relationship_strengths"];

async function remove(sql: TransactionalSqlExecutor, statement: string, values: readonly unknown[]): Promise<number> {
  const rows = await sql.query<{ count: string }>(`with removed as (${statement} returning 1) select count(*)::text as count from removed`, values);
  return Number(rows.rows[0]?.count ?? 0);
}

export async function purgeAccountInbox(db: TransactionalPostgresClient, workspaceId: string, actorId: string): Promise<{ deleted: number }> {
  assertLocalAccountPurgeTarget();
  if (!workspaceId || !actorId) throw new Error("ACCOUNT_PURGE_SCOPE_REQUIRED");
  return db.transaction(async sql => {
    const scope = [workspaceId, actorId];
    let deleted = 0;
    deleted += await remove(sql, `delete from relationship_messages where workspace_id=$1 and sender_account_id=$2`, scope);
    deleted += await remove(sql, `delete from relationship_conversation_members where workspace_id=$1 and account_id=$2`, scope);
    deleted += await remove(sql, `delete from relationship_lifecycle_command_receipts where workspace_id=$1 and actor_id=$2`, scope);
    const conversations = await sql.query<{ count: string }>(`with changed as (update relationship_conversations set
      inviter_account_id=case when inviter_account_id=$2 then 'deleted-inviter' else inviter_account_id end,
      invitee_account_id=case when invitee_account_id=$2 then 'deleted-invitee' else invitee_account_id end,
      inviter_contact_id=case when inviter_account_id=$2 then 'deleted-contact' else inviter_contact_id end,
      revoked_by_account_id=case when revoked_by_account_id=$2 then null else revoked_by_account_id end,
      status='revoked',revoked_at=coalesce(revoked_at,now()),sync_revision=sync_revision+1
      where workspace_id=$1 and (inviter_account_id=$2 or invitee_account_id=$2) returning 1)
      select count(*)::text as count from changed`, scope);
    deleted += Number(conversations.rows[0]?.count ?? 0);
    deleted += await remove(sql, `delete from orbit_records where workspace_id=$1 and collection_name='relationship_communication_messages'
      and payload->>'senderAccountId'=$2`, scope);
    const legacy = await sql.query<{ count: string }>(`with changed as (update orbit_records r set payload=
      (r.payload - 'contactId') || jsonb_build_object(
        'participantAccountIds', (select jsonb_agg(to_jsonb(case when p.value=$2 then 'deleted-account' else p.value end) order by p.ordinality)
          from jsonb_array_elements_text(r.payload->'participantAccountIds') with ordinality p(value,ordinality)),
        'participantDisplayNames', coalesce(r.payload->'participantDisplayNames','{}'::jsonb)-$2,
        'status','revoked'),updated_at=now()
      where r.workspace_id=$1 and r.collection_name='relationship_communication_conversations'
        and jsonb_typeof(r.payload->'participantAccountIds')='array' and r.payload->'participantAccountIds' ? $2
      returning 1) select count(*)::text as count from changed`, scope);
    deleted += Number(legacy.rows[0]?.count ?? 0);
    deleted += await remove(sql, `delete from orbit_records where workspace_id=$1 and user_id=$2 and collection_name=any($3::text[])`,
      [workspaceId, actorId, PERSONAL_COLLECTIONS]);
    deleted += await remove(sql, `delete from orbit_read_receipts where account_id=$1`, [actorId]);
    deleted += await remove(sql, `delete from orbit_read_cost_daily_accounts where account_id=$1`, [actorId]);
    return { deleted };
  }, { isolation: "read committed" });
}
