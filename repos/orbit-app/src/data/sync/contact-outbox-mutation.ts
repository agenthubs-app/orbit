import type { LocalSyncOutboxMutation } from "./local-sync-repository";

/**
 * LF12: a contact deleted while the server could not be reached (R11a 代定 9). The contacts domain takes no device
 * writes, so the delete waits in the device's outbox (encrypted with the mirror, counted with the other unsynced
 * writes, sent by every sync round) and the device's contact reads hide the contact until it is acknowledged.
 */
export type OfflineContactDeleteInput = Omit<LocalSyncOutboxMutation, "actorId" | "workspaceId"> & {
  domainId: "contacts";
  kind: "contact";
  operation: "delete";
  patch: null;
  requestJson: string;
};

/** `recordId` is the mirror row (what the device hides and the acknowledgement tombstones); `contactId` is the API's id. */
export function buildOfflineContactDelete(input: { mutationId: string; recordId: string; contactId: string; createdAt: string }): OfflineContactDeleteInput {
  if (!input.mutationId.trim() || !input.recordId.trim() || !input.contactId.trim() || !Number.isFinite(Date.parse(input.createdAt))) throw new TypeError("contact delete identity is invalid");
  return {
    domainId: "contacts", mutationId: input.mutationId, kind: "contact", id: input.recordId, operation: "delete", patch: null,
    requestJson: JSON.stringify({ mutationId: input.mutationId, contactId: input.contactId }),
    baseRevision: null, createdAt: input.createdAt, retryCount: 0, nextRetryAt: null, lastErrorCode: null,
  };
}

export function parseOfflineContactDelete(mutation: Pick<LocalSyncOutboxMutation, "domainId" | "kind" | "operation" | "patch" | "requestJson" | "mutationId" | "id">): { contactId: string } {
  if (mutation.domainId !== "contacts" || mutation.kind !== "contact" || mutation.operation !== "delete" || mutation.patch !== null) throw new TypeError("contact delete is not eligible");
  let request: Record<string, unknown>;
  try { request = JSON.parse(mutation.requestJson ?? "") as Record<string, unknown>; } catch { throw new TypeError("contact delete request is invalid"); }
  if (request.mutationId !== mutation.mutationId || typeof request.contactId !== "string" || !request.contactId.trim()) throw new TypeError("contact delete request changed");
  return { contactId: request.contactId };
}
