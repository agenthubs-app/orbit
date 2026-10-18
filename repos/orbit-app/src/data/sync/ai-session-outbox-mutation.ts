import type { AiSessionOrganizationMutationContract } from "../../api/contract/ai-sessions";
import { aiSessionOrganizationMutationSchema } from "../../api/schema/ai-sessions";
import type { LocalSyncOutboxMutation } from "./local-sync-repository";

export type OfflineAiSessionMutationInput = Omit<LocalSyncOutboxMutation, "actorId" | "workspaceId"> & {
  domainId: "ai-sessions";
  kind: "ai_session";
  operation: "update";
  requestJson: string;
};

export type OfflineAiSessionDeleteInput = Omit<LocalSyncOutboxMutation, "actorId" | "workspaceId"> & {
  domainId: "ai-sessions";
  kind: "ai_session";
  operation: "delete";
  patch: null;
  requestJson: string;
};

export function buildOfflineAiSessionDelete(input: {
  mutationId: string;
  sessionId: string;
  expectedRevision: number;
  createdAt: string;
}): OfflineAiSessionDeleteInput {
  if (!input.mutationId.trim() || !input.sessionId.trim() ||
      !Number.isInteger(input.expectedRevision) || input.expectedRevision < 0 ||
      !Number.isFinite(Date.parse(input.createdAt))) throw new TypeError("AI session delete identity is invalid");
  return {
    domainId: "ai-sessions", mutationId: input.mutationId, kind: "ai_session", id: input.sessionId,
    operation: "delete", patch: null,
    requestJson: JSON.stringify({ mutationId: input.mutationId, sessionId: input.sessionId, expectedRevision: input.expectedRevision }),
    baseRevision: String(input.expectedRevision), createdAt: input.createdAt, retryCount: 0,
    nextRetryAt: new Date(Date.parse(input.createdAt) + 5000).toISOString(), lastErrorCode: null,
  };
}

export function parseOfflineAiSessionDelete(mutation: OfflineAiSessionDeleteInput) {
  if (mutation.domainId !== "ai-sessions" || mutation.kind !== "ai_session" || mutation.operation !== "delete" || mutation.patch !== null) {
    throw new TypeError("AI session delete is not eligible");
  }
  let request: Record<string, unknown>;
  try { request = JSON.parse(mutation.requestJson); }
  catch { throw new TypeError("AI session delete request is invalid"); }
  if (request.mutationId !== mutation.mutationId || request.sessionId !== mutation.id ||
      typeof request.expectedRevision !== "number" || !Number.isInteger(request.expectedRevision) ||
      String(request.expectedRevision) !== mutation.baseRevision ||
      !Number.isFinite(Date.parse(mutation.createdAt)) ||
      !mutation.nextRetryAt || Date.parse(mutation.nextRetryAt) < Date.parse(mutation.createdAt) + 5000) {
    throw new TypeError("AI session delete request changed");
  }
  return { mutationId: mutation.mutationId, sessionId: mutation.id, expectedRevision: request.expectedRevision as number };
}

export function buildOfflineAiSessionMutation(input: {
  mutationId: string;
  sessionId: string;
  expectedRevision: number;
  patch: AiSessionOrganizationMutationContract["patch"];
  createdAt: string;
}): OfflineAiSessionMutationInput {
  const requestBody = aiSessionOrganizationMutationSchema.parse({
    expectedRevision: input.expectedRevision,
    mutationId: input.mutationId,
    patch: input.patch,
  });
  if (!input.sessionId.trim() || !Number.isFinite(Date.parse(input.createdAt))) {
    throw new TypeError("AI session mutation identity is invalid");
  }
  return {
    domainId: "ai-sessions",
    mutationId: requestBody.mutationId,
    kind: "ai_session",
    id: input.sessionId,
    operation: "update",
    patch: requestBody.patch,
    requestJson: JSON.stringify(requestBody),
    baseRevision: String(requestBody.expectedRevision),
    createdAt: input.createdAt,
    retryCount: 0,
    nextRetryAt: null,
    lastErrorCode: null,
  };
}

export function parseOfflineAiSessionRequest(mutation: OfflineAiSessionMutationInput) {
  if (mutation.domainId !== "ai-sessions" || mutation.kind !== "ai_session" || mutation.operation !== "update") {
    throw new TypeError("AI session mutation is not eligible");
  }
  let requestBody: AiSessionOrganizationMutationContract;
  try {
    requestBody = aiSessionOrganizationMutationSchema.parse(JSON.parse(mutation.requestJson));
  } catch {
    throw new TypeError("AI session mutation request is invalid");
  }
  if (requestBody.mutationId !== mutation.mutationId) throw new TypeError("AI session mutation id changed");
  if (String(requestBody.expectedRevision) !== mutation.baseRevision) throw new TypeError("AI session mutation revision changed");
  if (JSON.stringify(requestBody.patch) !== JSON.stringify(mutation.patch)) throw new TypeError("AI session mutation patch changed");
  return { requestBody };
}
