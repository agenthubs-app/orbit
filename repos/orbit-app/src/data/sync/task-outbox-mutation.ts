import { parseMutation } from "./mutation-adapters";
import type { OfflineTaskMutationInput } from "./sync-coordinator";

const taskOperations = new Set(["create", "update", "complete", "reopen", "cancel", "delete"]);

/**
 * A personal task for offline writes is the actor's own task in one of the shared offline contract's task categories
 * (personal / work / other). Relationship follow-ups, meeting and event tasks stay online (design D6).
 */
export const OFFLINE_TASK_CATEGORIES = ["personal", "work", "other"] as const;
export function isOfflineTaskCategory(category: unknown): boolean {
  return typeof category === "string" && (OFFLINE_TASK_CATEGORIES as readonly string[]).includes(category);
}

export function buildOfflineTaskMutation(input: {
  mutationId: string;
  entityId: string;
  operation: string;
  baseRevision: string | null;
  requestBody: unknown;
  createdAt: string;
  dependsOn?: string;
  requestAttemptedAt?: string;
}): OfflineTaskMutationInput {
  if (typeof input.requestBody !== "object" || input.requestBody === null || Array.isArray(input.requestBody)) {
    throw new TypeError("task mutation request must be an object");
  }
  if (!taskOperations.has(input.operation)) throw new TypeError("task mutation operation is not eligible");
  const requestBody = input.requestBody as Record<string, unknown>;
  if (requestBody.idempotencyKey !== input.mutationId) throw new TypeError("task mutation receipt key mismatch");
  const patch = taskPatchFromRequest(requestBody, input.operation);
  const parsed = parseMutation({
    mutationId: input.mutationId,
    kind: "task",
    entityId: input.entityId,
    operation: input.operation,
    baseRevision: input.baseRevision,
    patch,
    createdAt: input.createdAt,
  });
  if (parsed.kind !== "task" || parsed.operation !== input.operation || parsed.entityId !== input.entityId ||
      (parsed.operation === "create" && !isOfflineTaskCategory(parsed.patch.category)) ||
      (parsed.operation === "update" && parsed.patch.category !== undefined && !isOfflineTaskCategory(parsed.patch.category))) {
    throw new TypeError("task mutation request does not match its queue identity");
  }
  return {
    domainId: "tasks",
    mutationId: input.mutationId,
    kind: "task",
    id: input.entityId,
    operation: input.operation as OfflineTaskMutationInput["operation"],
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

/** Validates the stored request separately from the internal queue envelope. */
export function parseOfflineTaskRequest(mutation: OfflineTaskMutationInput) {
  if (mutation.domainId !== "tasks" || mutation.kind !== "task" || !mutation.requestJson) {
    throw new TypeError("task mutation is not eligible");
  }
  let requestBody: Record<string, unknown>;
  try {
    const value = JSON.parse(mutation.requestJson) as unknown;
    if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError();
    requestBody = value as Record<string, unknown>;
  } catch {
    throw new TypeError("task mutation request is invalid");
  }
  if (requestBody.idempotencyKey !== mutation.mutationId) throw new TypeError("task mutation receipt key mismatch");
  const patch = taskPatchFromRequest(requestBody, mutation.operation);
  const parsed = parseMutation({
    mutationId: mutation.mutationId,
    kind: "task",
    entityId: mutation.id,
    operation: mutation.operation,
    baseRevision: mutation.baseRevision,
    patch,
    createdAt: mutation.createdAt,
  });
  if (parsed.kind !== "task" || parsed.operation !== mutation.operation || parsed.entityId !== mutation.id ||
      JSON.stringify(parsed.patch) !== JSON.stringify(mutation.patch) ||
      (parsed.operation === "create" && !isOfflineTaskCategory(parsed.patch.category)) ||
      (parsed.operation === "update" && parsed.patch.category !== undefined && !isOfflineTaskCategory(parsed.patch.category))) {
    throw new TypeError("task mutation request does not match its queue identity");
  }
  return { requestBody, mutation: parsed };
}

function taskPatchFromRequest(body: Record<string, unknown>, operation: string): Record<string, unknown> {
  if (operation === "create") {
    const patch = { ...body };
    delete patch.idempotencyKey;
    return patch;
  }
  if (operation === "update") {
    if (body.action !== "update" || typeof body.expectedUpdatedAt !== "string" || !body.expectedUpdatedAt.trim() ||
        !isExactKeys(body, ["action", "expectedUpdatedAt", "idempotencyKey", "patch"])) {
      throw new TypeError("task update request is invalid");
    }
    return recordValue(body.patch);
  }
  if (operation === "delete") {
    if (typeof body.expectedUpdatedAt !== "string" || !body.expectedUpdatedAt.trim() ||
        !isExactKeys(body, ["expectedUpdatedAt", "idempotencyKey"])) {
      throw new TypeError("task delete request is invalid");
    }
    return {};
  }
  if (body.action !== operation || !isExactKeys(body, ["action", "idempotencyKey"])) {
    throw new TypeError("task transition request is invalid");
  }
  return {};
}

function recordValue(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError("task patch is invalid");
  return value as Record<string, unknown>;
}

function isExactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).length === keys.length && Object.keys(value).every(key => keys.includes(key));
}
