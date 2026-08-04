import { createConfiguredPostgresLiveRecordStore } from "../../shared/storage/configured-live-record-store";
import { createConfiguredStorageContactGraphProvider } from "../contacts/storage/contact-live-record-provider";
import { createHumanEncounterService, type HumanEncounterService } from "./service";
import { createConfiguredEventOperationsPostgresRuntime } from "../events/event-operations/storage/postgres-client";

export function createConfiguredHumanEncounterService(): HumanEncounterService | null {
  const configured = createConfiguredPostgresLiveRecordStore<Record<string, unknown>>();
  const contactProvider = createConfiguredStorageContactGraphProvider();
  const eventRuntime = createConfiguredEventOperationsPostgresRuntime();
  return configured && contactProvider && eventRuntime ? createHumanEncounterService({
    contactProvider,
    relationshipAuthority: {
      async isCanonicalRelationshipSide(input) {
        if (!input.eventId) return false;
        const result = await eventRuntime.client.query(`
          select 1
          from event_ops_relationship_sides side
          join event_ops_relationship_pairs pair
            on pair.workspace_id = side.workspace_id
            and pair.relationship_pair_id = side.relationship_pair_id
          join event_ops_contact_requests request
            on request.workspace_id = pair.workspace_id
            and request.request_id = pair.request_id
            and request.relationship_pair_id = pair.relationship_pair_id
          where side.workspace_id = $1 and pair.event_id = $2
            and side.owner_actor_id = $3 and side.contact_id = $4
            and request.event_id = pair.event_id
            and request.status = 'accepted'
          limit 1
        `, [eventRuntime.workspaceId, input.eventId, input.actorId, input.contactId]);
        return result.rowCount === 1;
      },
    },
    store: configured.store,
    workspaceId: configured.workspaceId,
  }) : null;
}
