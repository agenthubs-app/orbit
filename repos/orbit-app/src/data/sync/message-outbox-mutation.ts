import type { LocalSyncOutboxMutation } from "./local-sync-repository";

/**
 * Sprint 0135 (message plan M4): a text message written offline in a
 * conversation the device holds and that is active. One queue row per message:
 * the request id is the mutation id (the server derives the message id from
 * conversation + sender + request id, so a replay stores one message), and the
 * row's record id is the conversation, so the uploader sends one conversation's
 * messages strictly in the order they were written.
 */
export const MESSAGE_OUTBOX_DOMAIN = "relationship-messages";
export const MESSAGE_BODY_MAX_LENGTH = 10_000;

export type OfflineMessageMutationInput = Omit<LocalSyncOutboxMutation, "actorId" | "workspaceId" | "kind" | "operation"> & {
  kind: "relationship_message";
  operation: "send";
};

/** The frozen request body; `retireDraftThrough` is the server time of the draft the device knew (null: none). */
export interface OfflineMessageRequest {
  body: string;
  qualificationVersion: string;
  requestId: string;
  retireDraftThrough: string | null;
}

const REQUEST_KEYS = ["body", "qualificationVersion", "requestId", "retireDraftThrough"];

export function buildOfflineMessageMutation(input: {
  requestId: string;
  conversationId: string;
  body: string;
  qualificationVersion: string;
  retireDraftThrough: string | null;
  createdAt: string;
}): OfflineMessageMutationInput {
  const request: OfflineMessageRequest = {
    body: input.body.trim(),
    qualificationVersion: input.qualificationVersion.trim(),
    requestId: input.requestId.trim(),
    retireDraftThrough: input.retireDraftThrough,
  };
  assertRequest(request, input.conversationId.trim(), input.requestId);
  return {
    domainId: MESSAGE_OUTBOX_DOMAIN,
    mutationId: request.requestId,
    kind: "relationship_message",
    id: input.conversationId.trim(),
    operation: "send",
    patch: { body: request.body },
    requestJson: JSON.stringify(request),
    baseRevision: null,
    createdAt: input.createdAt,
    retryCount: 0,
    nextRetryAt: null,
    lastErrorCode: null,
  };
}

/** Validates a stored queue row's frozen request again before it is shown or uploaded. */
export function parseOfflineMessageRequest(mutation: Pick<LocalSyncOutboxMutation, "domainId" | "kind" | "operation" | "id" | "mutationId" | "requestJson">): {
  conversationId: string;
  request: OfflineMessageRequest;
} {
  if (mutation.domainId !== MESSAGE_OUTBOX_DOMAIN || mutation.kind !== "relationship_message" || mutation.operation !== "send" || !mutation.requestJson) {
    throw new TypeError("message mutation is not eligible");
  }
  let value: unknown;
  try { value = JSON.parse(mutation.requestJson); } catch { throw new TypeError("message mutation request is invalid"); }
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError("message mutation request is invalid");
  const record = value as Record<string, unknown>;
  if (Object.keys(record).sort().join(",") !== REQUEST_KEYS.join(",")) throw new TypeError("message mutation request is invalid");
  const request = record as unknown as OfflineMessageRequest;
  assertRequest(request, mutation.id, mutation.mutationId);
  return { conversationId: mutation.id, request };
}

function assertRequest(request: OfflineMessageRequest, conversationId: string, mutationId: string): void {
  if (!conversationId || typeof request.body !== "string" || !request.body.trim() || request.body !== request.body.trim() || request.body.length > MESSAGE_BODY_MAX_LENGTH ||
      typeof request.qualificationVersion !== "string" || !request.qualificationVersion.trim() ||
      typeof request.requestId !== "string" || !request.requestId.trim() || request.requestId !== mutationId ||
      (request.retireDraftThrough !== null && (typeof request.retireDraftThrough !== "string" || !Number.isFinite(Date.parse(request.retireDraftThrough))))) {
    throw new TypeError("message mutation request is invalid");
  }
}
