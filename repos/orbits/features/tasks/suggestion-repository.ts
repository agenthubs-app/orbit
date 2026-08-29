import type { LiveRecordStoreLike } from "../../shared/storage/live-record-store";
import {
  TASK_CATEGORIES,
  type TaskCategory,
  type TaskSuggestionDTO,
  type TaskSuggestionStatus,
} from "./contract";

export const TASK_SUGGESTION_COLLECTION = "taskSuggestions";

const statuses = new Set<TaskSuggestionStatus>([
  "pending",
  "accepted",
  "dismissed",
  "snoozed",
  "expired",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function optionalString(value: unknown): value is string | undefined {
  return value === undefined || nonEmpty(value);
}

function isoDateTime(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function localDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function decodeSuggestion(
  value: unknown,
  actorId: string,
): TaskSuggestionDTO | null {
  if (!isRecord(value)) {
    return null;
  }
  if (
    !nonEmpty(value.id) ||
    value.accountId !== actorId ||
    value.ownerUserId !== actorId ||
    !nonEmpty(value.title) ||
    !nonEmpty(value.reason) ||
    !TASK_CATEGORIES.includes(value.category as TaskCategory) ||
    !statuses.has(value.status as TaskSuggestionStatus) ||
    (value.suggestedPlannedDate !== undefined &&
      !localDate(value.suggestedPlannedDate)) ||
    (value.suggestedDueAt !== undefined && !isoDateTime(value.suggestedDueAt)) ||
    !optionalString(value.relatedContactId) ||
    !optionalString(value.relatedEventId) ||
    !optionalString(value.relatedMeetingId) ||
    !optionalString(value.relatedConversationId) ||
    !Array.isArray(value.evidenceIds) ||
    !value.evidenceIds.every(nonEmpty) ||
    typeof value.confidence !== "number" ||
    value.confidence < 0 ||
    value.confidence > 1 ||
    !nonEmpty(value.deduplicationKey) ||
    (value.nextVisibleAt !== undefined && !isoDateTime(value.nextVisibleAt)) ||
    (value.expiresAt !== undefined && !isoDateTime(value.expiresAt)) ||
    !optionalString(value.acceptedTaskId) ||
    !isoDateTime(value.createdAt) ||
    !isoDateTime(value.updatedAt)
  ) {
    return null;
  }
  if (
    value.status === "accepted" &&
    !nonEmpty(value.acceptedTaskId)
  ) {
    return null;
  }
  return value as unknown as TaskSuggestionDTO;
}

export interface TaskSuggestionRepository {
  get: (actorId: string, suggestionId: string) => Promise<TaskSuggestionDTO | null>;
  list: (actorId: string) => Promise<readonly TaskSuggestionDTO[]>;
  save: (suggestion: TaskSuggestionDTO) => Promise<TaskSuggestionDTO>;
}

export function createTaskSuggestionRepository(input: {
  store: LiveRecordStoreLike<Record<string, unknown>>;
  workspaceId: string;
}): TaskSuggestionRepository {
  return {
    async get(actorId, suggestionId) {
      const record = await input.store.getRecord({
        workspaceId: input.workspaceId,
        collectionName: TASK_SUGGESTION_COLLECTION,
        recordId: suggestionId,
      });
      if (!record || record.userId !== actorId) {
        return null;
      }
      return decodeSuggestion(record.payload.suggestion, actorId);
    },

    async list(actorId) {
      const records = await input.store.listRecords({
        workspaceId: input.workspaceId,
        collectionName: TASK_SUGGESTION_COLLECTION,
        userId: actorId,
      });
      return records
        .map((record) => decodeSuggestion(record.payload.suggestion, actorId))
        .filter((item): item is TaskSuggestionDTO => item !== null);
    },

    async save(suggestion) {
      const validated = decodeSuggestion(suggestion, suggestion.ownerUserId);
      if (!validated || validated.accountId !== suggestion.ownerUserId) {
        throw new Error("Task suggestion is invalid");
      }
      const saved = await input.store.upsertRecord({
        workspaceId: input.workspaceId,
        collectionName: TASK_SUGGESTION_COLLECTION,
        recordId: suggestion.id,
        userId: suggestion.ownerUserId,
        sourceType: "task_suggestion",
        sourceId: suggestion.deduplicationKey,
        sourceLabel: "Orbit task suggestion",
        evidenceIds: suggestion.evidenceIds,
        targetType: suggestion.relatedEventId
          ? "event"
          : suggestion.relatedContactId
            ? "contact"
            : "task_suggestion",
        targetId:
          suggestion.relatedEventId ??
          suggestion.relatedContactId ??
          suggestion.id,
        occurredAt: suggestion.updatedAt,
        createdAt: suggestion.createdAt,
        updatedAt: suggestion.updatedAt,
        lifecycleState: "active",
        searchText: `${suggestion.title} ${suggestion.reason}`,
        payload: { version: 1, suggestion: { ...suggestion } },
      });
      const decoded = decodeSuggestion(
        saved.payload.suggestion,
        suggestion.ownerUserId,
      );
      if (!decoded) {
        throw new Error("Saved task suggestion failed validation");
      }
      return decoded;
    },
  };
}
