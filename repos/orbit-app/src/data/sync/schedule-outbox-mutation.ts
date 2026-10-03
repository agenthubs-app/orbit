import type { PersonalScheduleContract } from "../../api/contract/tasks";
import {
  personalScheduleCreateSchema,
  personalScheduleDeleteSchema,
  personalScheduleUpdateSchema,
} from "../../api/schema/personal-schedule";
import type { OfflineScheduleMutationInput } from "./sync-coordinator";

/**
 * Sprint 0134: offline writes of the actor's own non-recurring personal schedule
 * (design D7). The frozen request is exactly what POST/PATCH/DELETE
 * /api/schedule-items accepts (validated with the server's own schemas); a
 * repeating series, a single occurrence, scope and repeat rules stay online.
 */
export const SCHEDULE_DOMAIN = "personal-schedule";
const scheduleOperations = new Set(["create", "update", "delete"]);
const localEntityId = /^local:[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[1-8][0-9A-Fa-f]{3}-[89AaBb][0-9A-Fa-f]{3}-[0-9A-Fa-f]{12}$/u;

export function isOfflineScheduleEditable(item: PersonalScheduleContract | null | undefined, actorId: string): boolean {
  return Boolean(item && actorId && item.kind === "personal" && item.ownerUserId === actorId && item.accountId === actorId &&
    !item.recurrence && item.seriesId === undefined && item.occurrenceDate === undefined && item.state !== "cancelled");
}

export function buildOfflineScheduleMutation(input: {
  mutationId: string;
  entityId: string;
  operation: string;
  baseRevision: string | null;
  requestBody: unknown;
  createdAt: string;
  dependsOn?: string;
}): OfflineScheduleMutationInput {
  if (typeof input.requestBody !== "object" || input.requestBody === null || Array.isArray(input.requestBody)) {
    throw new TypeError("schedule mutation request must be an object");
  }
  const requestBody = input.requestBody as Record<string, unknown>;
  const patch = validateScheduleRequest({ ...input, requestBody });
  return {
    domainId: SCHEDULE_DOMAIN,
    mutationId: input.mutationId,
    kind: "personal_schedule",
    id: input.entityId,
    operation: input.operation as OfflineScheduleMutationInput["operation"],
    patch,
    requestJson: JSON.stringify(requestBody),
    baseRevision: input.baseRevision,
    createdAt: input.createdAt,
    retryCount: 0,
    nextRetryAt: null,
    lastErrorCode: null,
    ...(input.dependsOn ? { dependsOn: input.dependsOn } : {}),
  };
}

/** Revalidates a stored row: the frozen request and the queue envelope must still agree. */
export function parseOfflineScheduleRequest(mutation: Pick<OfflineScheduleMutationInput, "domainId" | "kind" | "mutationId" | "id" | "operation" | "baseRevision" | "requestJson" | "patch">): { requestBody: Record<string, unknown>; patch: Record<string, unknown> } {
  if (mutation.domainId !== SCHEDULE_DOMAIN || mutation.kind !== "personal_schedule" || !mutation.requestJson) {
    throw new TypeError("schedule mutation is not eligible");
  }
  let requestBody: Record<string, unknown>;
  try {
    const value = JSON.parse(mutation.requestJson) as unknown;
    if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError();
    requestBody = value as Record<string, unknown>;
  } catch {
    throw new TypeError("schedule mutation request is invalid");
  }
  const patch = validateScheduleRequest({ mutationId: mutation.mutationId, entityId: mutation.id, operation: mutation.operation, baseRevision: mutation.baseRevision, requestBody });
  if (JSON.stringify(patch) !== JSON.stringify(mutation.patch)) throw new TypeError("schedule mutation request does not match its queue identity");
  return { requestBody, patch };
}

/** The temporary (`local:`) note ids a schedule request links; they must be uploaded first. */
export function localNoteIdsOfSchedule(mutation: { operation: string; requestJson?: string | null }): string[] {
  if (!mutation.requestJson) return [];
  try {
    return noteIdsOf(JSON.parse(mutation.requestJson) as Record<string, unknown>, mutation.operation).filter(id => id.startsWith("local:"));
  } catch {
    return [];
  }
}

function noteIdsOf(requestBody: Record<string, unknown>, operation: string): string[] {
  const fields = operation === "update" ? requestBody.patch : operation === "create" ? requestBody : null;
  const noteIds = fields && typeof fields === "object" && !Array.isArray(fields) ? (fields as Record<string, unknown>).noteIds : undefined;
  return Array.isArray(noteIds) ? noteIds.filter((id): id is string => typeof id === "string") : [];
}

function validateScheduleRequest(input: { mutationId: string; entityId: string; operation: string; baseRevision: string | null; requestBody: Record<string, unknown> }): Record<string, unknown> {
  const { requestBody, operation } = input;
  if (!scheduleOperations.has(operation)) throw new TypeError("schedule mutation operation is not eligible");
  if (typeof input.mutationId !== "string" || !input.mutationId.trim() || requestBody.idempotencyKey !== input.mutationId) {
    throw new TypeError("schedule mutation receipt key mismatch");
  }
  const local = localEntityId.test(input.entityId);
  if (operation === "create") {
    if (!local || input.baseRevision !== null) throw new TypeError("schedule create identity is invalid");
    const parsed = personalScheduleCreateSchema.safeParse(requestBody);
    if (!parsed.success || (requestBody.recurrence !== undefined && requestBody.recurrence !== null)) throw new TypeError("schedule create request is not eligible");
    assertTimeRange(requestBody.startsAt, requestBody.endsAt);
    const patch = { ...requestBody };
    delete patch.idempotencyKey;
    return patch;
  }
  if (typeof input.entityId !== "string" || !input.entityId.trim() || input.entityId.includes(":occurrence:") ||
      (!local && (typeof input.baseRevision !== "string" || !input.baseRevision.trim()))) {
    throw new TypeError("schedule mutation needs a server revision");
  }
  if (requestBody.scope !== undefined) throw new TypeError("schedule scope needs the network");
  if (operation === "delete") {
    if (!personalScheduleDeleteSchema.safeParse(requestBody).success) throw new TypeError("schedule delete request is invalid");
    return {};
  }
  const parsed = personalScheduleUpdateSchema.safeParse(requestBody);
  const patch = requestBody.patch as Record<string, unknown> | undefined;
  if (!parsed.success || !patch || (patch.recurrence !== undefined && patch.recurrence !== null)) throw new TypeError("schedule update request is not eligible");
  assertTimeRange(patch.startsAt, patch.endsAt);
  return { ...patch };
}

function assertTimeRange(startsAt: unknown, endsAt: unknown): void {
  if (typeof startsAt === "string" && typeof endsAt === "string" && Date.parse(endsAt) <= Date.parse(startsAt)) {
    throw new TypeError("schedule end must be after its start");
  }
}
