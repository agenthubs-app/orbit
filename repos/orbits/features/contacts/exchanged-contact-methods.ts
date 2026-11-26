import { profileContactMethods, type ProfileContactMethods } from "../../shared/compute/profile-contact-methods";
import { createConfiguredPostgresLiveRecordStore } from "../../shared/storage/configured-live-record-store";
import type { LiveRecordSqlClient } from "../../shared/storage/postgres-live-record-store";

/** Authorize against both sides of the accepted pair; respect any projected contact tombstones. */
export async function readExchangedContactMethods(
  client: LiveRecordSqlClient, workspace: string, actorId: string, contactId: string,
): Promise<ProfileContactMethods> {
  const { rows } = await client.query<{ handles: unknown }>(`
    select profile.payload -> 'handles' as handles
    from event_ops_relationship_sides own
    join event_ops_relationship_pairs pair on pair.workspace_id = own.workspace_id
      and pair.relationship_pair_id = own.relationship_pair_id
    join event_ops_contact_requests request on request.workspace_id = pair.workspace_id
      and request.request_id = pair.request_id and request.relationship_pair_id = pair.relationship_pair_id
      and request.status = 'accepted' and (
        (request.requester_actor_id = own.owner_actor_id and request.target_actor_id = own.other_actor_id)
        or (request.target_actor_id = own.owner_actor_id and request.requester_actor_id = own.other_actor_id)
      )
    join event_ops_relationship_sides peer on peer.workspace_id = own.workspace_id
      and peer.relationship_pair_id = own.relationship_pair_id and peer.owner_actor_id = own.other_actor_id
      and peer.other_actor_id = own.owner_actor_id
    join orbit_records profile on profile.workspace_id = peer.workspace_id and profile.collection_name = 'profiles'
      and profile.user_id = peer.owner_actor_id and profile.payload ->> 'accountId' = peer.owner_actor_id
      and profile.lifecycle_state = 'active'
    where own.workspace_id = $1 and own.owner_actor_id = $2 and own.contact_id = $3
      and exists (select 1 from orbit_records consent
        where consent.workspace_id = peer.workspace_id || ':profile-onboarding-actor:' || peer.owner_actor_id
          and consent.collection_name = 'profileOnboardingFlow' and consent.record_id = 'current'
          and consent.user_id = peer.owner_actor_id and consent.lifecycle_state = 'active'
          and consent.payload -> 'contactMethodsConfirmed' = 'true'::jsonb)
      and not exists (select 1 from orbit_records tombstone where tombstone.workspace_id = own.workspace_id
        and tombstone.collection_name = 'contacts' and tombstone.lifecycle_state = 'deleted'
        and ((tombstone.record_id = own.contact_id and tombstone.user_id = own.owner_actor_id)
          or (tombstone.record_id = peer.contact_id and tombstone.user_id = peer.owner_actor_id)))
    order by coalesce(profile.occurred_at, profile.updated_at) desc, profile.updated_at desc, profile.record_id
    limit 1
  `, [workspace, actorId, contactId]);
  return profileContactMethods(rows[0]?.handles);
}

export async function configuredExchangedContactMethods(actorId: string, contactId: string): Promise<ProfileContactMethods> {
  if (!contactId.startsWith("contact:event-consent:")) return {};
  const db = createConfiguredPostgresLiveRecordStore();
  if (!db) return {};
  return readExchangedContactMethods(db.client, db.workspaceId, actorId, contactId);
}
