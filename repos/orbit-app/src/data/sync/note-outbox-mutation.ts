import { parseMutation } from "./mutation-adapters";
import type { OfflineNoteMutationInput } from "./sync-coordinator";

export function buildOfflineNoteMutation(input: {
  mutationId: string;
  entityId: string;
  operation: string;
  baseRevision: string | null;
  requestBody: unknown;
  createdAt: string;
  dependsOn?: string;
  requestAttemptedAt?: string;
}): OfflineNoteMutationInput {
  if (typeof input.requestBody !== "object" || input.requestBody === null || Array.isArray(input.requestBody)) {
    throw new TypeError("note mutation request must be an object");
  }
  const requestBody = input.requestBody as Record<string, unknown>;
  if (requestBody.idempotencyKey !== input.mutationId) throw new TypeError("note mutation receipt key mismatch");
  const patch = { ...requestBody };
  delete patch.idempotencyKey;
  if (input.operation === "update") delete patch.expectedVersion;

  const parsed = parseMutation({
    mutationId: input.mutationId,
    kind: "note",
    entityId: input.entityId,
    operation: input.operation,
    baseRevision: input.baseRevision,
    patch,
    createdAt: input.createdAt,
  });
  if (parsed.kind !== "note" || parsed.operation !== input.operation || parsed.entityId !== input.entityId) {
    throw new TypeError("note mutation request does not match its queue identity");
  }
  return {
    domainId: "notes",
    mutationId: input.mutationId,
    kind: "note",
    id: input.entityId,
    operation: input.operation as "create" | "update",
    patch: parsed.patch,
    requestJson: JSON.stringify(requestBody),
    baseRevision: input.baseRevision,
    createdAt: input.createdAt,
    retryCount: 0,
    nextRetryAt: null,
    lastErrorCode: null,
    ...(input.dependsOn ? { dependsOn: input.dependsOn } : {}),
    ...(input.requestAttemptedAt ? { requestAttemptedAt: input.requestAttemptedAt, lastErrorCode: "NETWORK_ERROR" } : {}),
  };
}

/** Validates the durable HTTP body separately from the outbox's internal mutation envelope. */
export function parseOfflineNoteRequest(mutation: OfflineNoteMutationInput): { requestBody: Record<string, unknown>; mutation: ReturnType<typeof parseMutation> } {
  if (mutation.domainId !== "notes" || mutation.kind !== "note" || !mutation.requestJson) {
    throw new TypeError("note mutation is not eligible");
  }
  let requestBody: Record<string, unknown>;
  try {
    const parsed = JSON.parse(mutation.requestJson) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new TypeError();
    requestBody = parsed as Record<string, unknown>;
  } catch {
    throw new TypeError("note mutation is not eligible");
  }
  if (requestBody.idempotencyKey !== mutation.mutationId) throw new TypeError("note mutation receipt key mismatch");
  const patch = { ...requestBody };
  delete patch.idempotencyKey;
  if (mutation.operation === "update") delete patch.expectedVersion;
  const parsed = parseMutation({
    mutationId: mutation.mutationId,
    kind: "note",
    entityId: mutation.id,
    operation: mutation.operation,
    baseRevision: mutation.baseRevision,
    patch,
    createdAt: mutation.createdAt,
  });
  if (parsed.kind !== "note" || parsed.operation !== mutation.operation || parsed.entityId !== mutation.id ||
      JSON.stringify(parsed.patch) !== JSON.stringify(mutation.patch)) {
    throw new TypeError("note mutation request does not match its queue identity");
  }
  return { requestBody, mutation: parsed };
}
