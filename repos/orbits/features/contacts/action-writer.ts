import type { LiveRecordStoreLike } from "../../shared/storage/live-record-store";

export interface ContactArchiveActionWriter {
  archiveContacts: (input: {
    batchId: string;
    contacts: readonly {
      id: string;
      displayName: string;
      organization?: string;
    }[];
    evidenceIds: readonly string[];
    now: string;
  }) => Promise<{ recordIds: readonly string[] }>;
  removeContacts: (
    contactIds: readonly string[],
    now: string,
  ) => Promise<void>;
}

export function createStorageContactArchiveActionWriter(input: {
  store: LiveRecordStoreLike<Record<string, unknown>>;
  workspaceId: string;
}): ContactArchiveActionWriter {
  return {
    async archiveContacts(batch) {
      for (const contact of batch.contacts) {
        await input.store.upsertRecord({
          workspaceId: input.workspaceId,
          collectionName: "contacts",
          recordId: contact.id,
          sourceType: "agent_action",
          sourceId: batch.batchId,
          sourceLabel: "Orbit Agent confirmed contact archive",
          evidenceIds: batch.evidenceIds,
          targetType: "contact",
          targetId: contact.id,
          occurredAt: batch.now,
          lifecycleState: "active",
          searchText: `${contact.displayName} ${contact.organization ?? ""}`,
          payload: {
            id: contact.id,
            displayName: contact.displayName,
            organization: contact.organization,
            stage: "new",
            source: {
              type: "agent_action",
              id: batch.batchId,
              label: "Orbit Agent confirmed contact archive",
            },
            evidenceIds: batch.evidenceIds,
            createdAt: batch.now,
            updatedAt: batch.now,
          },
          createdAt: batch.now,
          updatedAt: batch.now,
        });
      }
      return { recordIds: batch.contacts.map((contact) => contact.id) };
    },
    async removeContacts(contactIds, now) {
      for (const contactId of contactIds) {
        await input.store.deleteRecord({
          workspaceId: input.workspaceId,
          collectionName: "contacts",
          recordId: contactId,
          deletedAt: now,
        });
      }
    },
  };
}
