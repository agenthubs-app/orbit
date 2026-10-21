import type { OrbitApiClient } from "../../api/client";
import type { SyncRecord } from "../../api/contract/sync";
import { parseOfflineContactDelete } from "./contact-outbox-mutation";
import type { LocalSyncQueuedMutation } from "./local-sync-repository";
import { createOutboxUploader, type OutboxUploadRepository } from "./outbox-uploader";

type Repository = OutboxUploadRepository & {
  getRecord(input: { workspaceId: string; kind: "contact"; id: string }): Promise<SyncRecord | null>;
};

/**
 * LF12: sends the queued contact deletes (DELETE /api/contacts/:id — a soft delete, idempotent). 2xx and 404 (the contact
 * is already gone) are acknowledged with a tombstone, so the device drops the row at once; a network failure, 5xx or 429
 * retries later; 401 stops the round (kept); other refusals mark the delete failed and the contact shows again.
 */
export function createContactOutboxUploader(input: {
  actorId: string;
  workspaceId: string;
  repository: Repository;
  writeClient: Pick<OrbitApiClient, "delete">;
  now?: () => number;
}) {
  const now = input.now ?? Date.now;
  const repository: OutboxUploadRepository = {
    listQueuedMutations: (query) => input.repository.listQueuedMutations({ ...query, domainId: "contacts" } as { workspaceId: string }),
    beginOutboxMutationAttempt: (value) => input.repository.beginOutboxMutationAttempt(value),
    acknowledgeOutboxMutation: (value) => input.repository.acknowledgeOutboxMutation(value),
    markOutboxMutationFailure: (value) => input.repository.markOutboxMutationFailure(value),
  };
  return createOutboxUploader({
    repository,
    workspaceId: input.workspaceId,
    confirmOnline: async () => true,
    now,
    uploadOne: async (row: LocalSyncQueuedMutation, signal) => {
      let contactId: string;
      try { contactId = parseOfflineContactDelete(row).contactId; } catch { return { status: 400 }; }
      const response = await input.writeClient.delete<unknown>(`/api/contacts/${encodeURIComponent(contactId)}`, { signal });
      if (!response.success && response.status !== 404) return { status: response.status, ...("error" in response ? { errorCode: response.error.code } : {}) };
      const at = new Date(now()).toISOString();
      const previous = await input.repository.getRecord({ workspaceId: input.workspaceId, kind: "contact", id: row.id });
      const record: SyncRecord = previous && previous.actorId === input.actorId
        ? { ...previous, updatedAt: at, deletedAt: at, payload: null, syncState: "synced" }
        : { actorId: input.actorId, workspaceId: input.workspaceId, kind: "contact", id: row.id, revision: "0", updatedAt: at, deletedAt: at, payload: null, syncState: "synced", aiVisibility: "excluded" };
      return { status: 200, record };
    },
    pull: async () => {},
  });
}
