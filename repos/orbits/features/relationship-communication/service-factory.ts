import { actorDisplayName } from "../../shared/domain/actor-display-name";
import type { AuthenticatedApiActor } from "../../app/api/_shared/authenticated-actor";
import { createConfiguredPostgresLiveRecordStore } from "../../shared/storage/configured-live-record-store";
import { createConfiguredTransactionalPostgresRuntime } from "../../shared/storage/transactional-postgres";
import { createConfiguredEventOperationsPostgresRuntime } from "../events/event-operations/storage/postgres-client";
import { createPostgresRelationshipEventExchanges } from "./event-exchange-link";
import { createPostgresRelationshipInviteLinks } from "./invite-link";
import { createPostgresRelationshipMeetingProposals } from "./meeting-proposals";
import { createRelationshipMessageStore } from "./message-store";
import {
  createRelationshipCommunicationService,
  type RelationshipCommunicationService,
} from "./service";

function unavailableService(message: string): RelationshipCommunicationService {
  const unavailable = async () => {
    throw new Error(message);
  };
  return {
    acceptInvitation: unavailable,
    createInvitation: unavailable,
    getConversation: unavailable,
    getEligibility: unavailable,
    getInvitationPreview: unavailable,
    getReplyDraft: unavailable,
    listConversations: unavailable,
    markConversationRead: unavailable,
    revokeContactBinding: unavailable,
    saveReplyDraft: unavailable,
    sendMessage: unavailable,
    startConversation: unavailable,
  } as RelationshipCommunicationService;
}

export function createConfiguredRelationshipCommunicationService(
  actor: AuthenticatedApiActor,
  invitationBaseUrl: string,
): RelationshipCommunicationService {
  const configured = createConfiguredPostgresLiveRecordStore<Record<string, unknown>>();
  const transactional = createConfiguredTransactionalPostgresRuntime();
  const accountId = actor.accountId ?? actor.id;
  const displayName = actorDisplayName(actor)?.trim();
  const email = actor.email?.trim();
  if (!configured || !transactional || transactional.workspaceId !== configured.workspaceId) {
    return unavailableService("Relationship communication storage is unavailable.");
  }
  if (!accountId || !displayName || !email) {
    return unavailableService("The signed-in account identity is incomplete.");
  }
  // R39: appointments live in the same database (same connection configuration);
  // the proposal is created inside the message transaction, the other reads use this runtime.
  const appointments = createConfiguredEventOperationsPostgresRuntime();
  return createRelationshipCommunicationService({
    actor: { accountId, displayName, email },
    eventExchanges: createPostgresRelationshipEventExchanges(transactional.client, transactional.workspaceId),
    meetings: appointments && appointments.workspaceId === transactional.workspaceId
      ? createPostgresRelationshipMeetingProposals({ runtime: appointments })
      : null,
    invitationBaseUrl,
    inviteLinks: createPostgresRelationshipInviteLinks(transactional.client, transactional.workspaceId),
    messages: createRelationshipMessageStore({ client: transactional.client, workspaceId: transactional.workspaceId }),
    async resolveContact(contactId, ownerAccountId) {
      // Bounded point lookup: the owner's contact with this id (sprint 0109).
      const records = await configured.store.listRecords({
        limit: 2,
        collectionName: "contacts",
        payloadId: contactId,
        userId: ownerAccountId,
        workspaceId: configured.workspaceId,
      });
      const matching = records.find(
        (item) =>
          item.payload.id === contactId &&
          (item.userId === ownerAccountId || item.payload.accountId === ownerAccountId),
      );
      if (!matching || typeof matching.payload.displayName !== "string") return null;
      return {
        contactId,
        displayName: matching.payload.displayName,
        organization:
          typeof matching.payload.organization === "string"
            ? matching.payload.organization
            : "",
        recipientEmail:
          typeof matching.payload.primaryEmail === "string"
            ? matching.payload.primaryEmail
            : undefined,
      };
    },
    store: configured.store,
    workspaceId: configured.workspaceId,
  });
}
