import type { AuthenticatedApiActor } from "../../app/api/_shared/authenticated-actor";
import { createConfiguredPostgresLiveRecordStore } from "../../shared/storage/configured-live-record-store";
import { createConfiguredTransactionalPostgresRuntime } from "../../shared/storage/transactional-postgres";
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
  } as RelationshipCommunicationService;
}

export function createConfiguredRelationshipCommunicationService(
  actor: AuthenticatedApiActor,
  invitationBaseUrl: string,
): RelationshipCommunicationService {
  const configured = createConfiguredPostgresLiveRecordStore<Record<string, unknown>>();
  const transactional = createConfiguredTransactionalPostgresRuntime();
  const accountId = actor.accountId ?? actor.id;
  const displayName = actor.name?.trim();
  const email = actor.email?.trim();
  if (!configured || !transactional || transactional.workspaceId !== configured.workspaceId) {
    return unavailableService("Relationship communication storage is unavailable.");
  }
  if (!accountId || !displayName || !email) {
    return unavailableService("The signed-in account identity is incomplete.");
  }
  return createRelationshipCommunicationService({
    actor: { accountId, displayName, email },
    invitationBaseUrl,
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
