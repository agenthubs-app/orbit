import { createHash } from "node:crypto";

import type {
  TaskCategory,
  TaskItemDTO,
  TaskPriority,
  TaskSuggestionDTO,
} from "./contract";
import type { TaskService } from "./service";
import type { TaskSuggestionRepository } from "./suggestion-repository";

const DISMISS_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

export class TaskSuggestionServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TaskSuggestionServiceError";
  }
}

export interface TaskSuggestionService {
  get: (input: {
    actorId: string;
    suggestionId: string;
  }) => Promise<TaskSuggestionDTO | null>;
  list: (input: {
    actorId: string;
    now: string;
    category?: TaskCategory;
  }) => Promise<readonly TaskSuggestionDTO[]>;
  suggest: (input: {
    actorId: string;
    title: string;
    reason: string;
    category: TaskCategory;
    suggestedPlannedDate?: string;
    suggestedDueAt?: string;
    relatedContactId?: string;
    relatedEventId?: string;
    relatedMeetingId?: string;
    relatedConversationId?: string;
    evidenceIds: readonly string[];
    confidence: number;
    deduplicationKey: string;
    expiresAt?: string;
    now: string;
  }) => Promise<TaskSuggestionDTO>;
  accept: (input: {
    actorId: string;
    suggestionId: string;
    overrides?: {
      title?: string;
      category?: TaskCategory;
      plannedDate?: string;
      dueAt?: string;
      priority?: TaskPriority;
    };
    idempotencyKey: string;
    now: string;
  }) => Promise<{ suggestion: TaskSuggestionDTO; task: TaskItemDTO }>;
  dismiss: (input: SuggestionMutationInput) => Promise<TaskSuggestionDTO>;
  snooze: (
    input: SuggestionMutationInput & { nextVisibleAt: string },
  ) => Promise<TaskSuggestionDTO>;
}

interface SuggestionMutationInput {
  actorId: string;
  suggestionId: string;
  idempotencyKey: string;
  now: string;
}

function suggestionId(actorId: string, deduplicationKey: string): string {
  return `task-suggestion:${createHash("sha256")
    .update(`${actorId}\u0000${deduplicationKey}`)
    .digest("hex")
    .slice(0, 24)}`;
}

function requireSuggestion(
  suggestion: TaskSuggestionDTO | null,
): TaskSuggestionDTO {
  if (!suggestion) {
    throw new TaskSuggestionServiceError("Task suggestion not found");
  }
  return suggestion;
}

function cooldownEnd(now: string): string {
  return new Date(Date.parse(now) + DISMISS_COOLDOWN_MS).toISOString();
}

export function createTaskSuggestionService(input: {
  repository: TaskSuggestionRepository;
  taskService: TaskService;
}): TaskSuggestionService {
  return {
    get(query) {
      return input.repository.get(query.actorId, query.suggestionId);
    },

    async list(query) {
      const suggestions = await input.repository.list(query.actorId);
      const visible: TaskSuggestionDTO[] = [];

      for (const current of suggestions) {
        let suggestion = current;
        if (
          ["pending", "snoozed"].includes(suggestion.status) &&
          suggestion.expiresAt &&
          suggestion.expiresAt <= query.now
        ) {
          suggestion = await input.repository.save({
            ...suggestion,
            status: "expired",
            updatedAt: query.now,
          });
        } else if (
          suggestion.status === "snoozed" &&
          suggestion.nextVisibleAt &&
          suggestion.nextVisibleAt <= query.now
        ) {
          const { nextVisibleAt: _nextVisibleAt, ...rest } = suggestion;
          suggestion = await input.repository.save({
            ...rest,
            status: "pending",
            updatedAt: query.now,
          });
        }

        if (
          suggestion.status === "pending" &&
          (query.category === undefined || suggestion.category === query.category)
        ) {
          visible.push(suggestion);
        }
      }

      return visible.sort((left, right) => {
        if (left.confidence !== right.confidence) {
          return right.confidence - left.confidence;
        }
        return left.createdAt.localeCompare(right.createdAt);
      });
    },

    async suggest(suggestInput) {
      const id = suggestionId(
        suggestInput.actorId,
        suggestInput.deduplicationKey,
      );
      const existing = await input.repository.get(suggestInput.actorId, id);
      if (existing) {
        if (
          existing.status === "dismissed" &&
          existing.nextVisibleAt &&
          existing.nextVisibleAt <= suggestInput.now
        ) {
          const { nextVisibleAt: _nextVisibleAt, ...rest } = existing;
          return input.repository.save({
            ...rest,
            status: "pending",
            updatedAt: suggestInput.now,
          });
        }
        return existing;
      }

      return input.repository.save({
        id,
        accountId: suggestInput.actorId,
        ownerUserId: suggestInput.actorId,
        title: suggestInput.title,
        reason: suggestInput.reason,
        category: suggestInput.category,
        status: "pending",
        ...(suggestInput.suggestedPlannedDate
          ? { suggestedPlannedDate: suggestInput.suggestedPlannedDate }
          : {}),
        ...(suggestInput.suggestedDueAt
          ? { suggestedDueAt: suggestInput.suggestedDueAt }
          : {}),
        ...(suggestInput.relatedContactId
          ? { relatedContactId: suggestInput.relatedContactId }
          : {}),
        ...(suggestInput.relatedEventId
          ? { relatedEventId: suggestInput.relatedEventId }
          : {}),
        ...(suggestInput.relatedMeetingId
          ? { relatedMeetingId: suggestInput.relatedMeetingId }
          : {}),
        ...(suggestInput.relatedConversationId
          ? { relatedConversationId: suggestInput.relatedConversationId }
          : {}),
        evidenceIds: suggestInput.evidenceIds,
        confidence: suggestInput.confidence,
        deduplicationKey: suggestInput.deduplicationKey,
        ...(suggestInput.expiresAt ? { expiresAt: suggestInput.expiresAt } : {}),
        createdAt: suggestInput.now,
        updatedAt: suggestInput.now,
      });
    },

    async accept(acceptInput) {
      const suggestion = requireSuggestion(
        await input.repository.get(
          acceptInput.actorId,
          acceptInput.suggestionId,
        ),
      );

      if (suggestion.status === "accepted" && suggestion.acceptedTaskId) {
        const task = (await input.taskService.list({ actorId: acceptInput.actorId }))
          .find((item) => item.id === suggestion.acceptedTaskId);
        if (task) {
          return { suggestion, task };
        }
      }
      if (!["pending", "snoozed"].includes(suggestion.status)) {
        throw new TaskSuggestionServiceError(
          `Task suggestion cannot be accepted from ${suggestion.status}`,
        );
      }

      const taskResult = await input.taskService.create({
        actorId: acceptInput.actorId,
        title: acceptInput.overrides?.title ?? suggestion.title,
        category: acceptInput.overrides?.category ?? suggestion.category,
        plannedDate:
          acceptInput.overrides?.plannedDate ?? suggestion.suggestedPlannedDate,
        dueAt: acceptInput.overrides?.dueAt ?? suggestion.suggestedDueAt,
        priority: acceptInput.overrides?.priority ?? "normal",
        source: "ai_confirmed",
        relatedContactId: suggestion.relatedContactId,
        relatedEventId: suggestion.relatedEventId,
        relatedMeetingId: suggestion.relatedMeetingId,
        relatedConversationId: suggestion.relatedConversationId,
        suggestionId: suggestion.id,
        idempotencyKey: `accepted-suggestion:${suggestion.id}`,
        now: acceptInput.now,
      });
      const accepted = await input.repository.save({
        ...suggestion,
        status: "accepted",
        acceptedTaskId: taskResult.task.id,
        updatedAt: acceptInput.now,
      });
      return { suggestion: accepted, task: taskResult.task };
    },

    async dismiss(dismissInput) {
      const suggestion = requireSuggestion(
        await input.repository.get(
          dismissInput.actorId,
          dismissInput.suggestionId,
        ),
      );
      if (suggestion.status === "dismissed") {
        return suggestion;
      }
      if (!["pending", "snoozed"].includes(suggestion.status)) {
        throw new TaskSuggestionServiceError(
          `Task suggestion cannot be dismissed from ${suggestion.status}`,
        );
      }
      return input.repository.save({
        ...suggestion,
        status: "dismissed",
        nextVisibleAt: cooldownEnd(dismissInput.now),
        updatedAt: dismissInput.now,
      });
    },

    async snooze(snoozeInput) {
      const suggestion = requireSuggestion(
        await input.repository.get(
          snoozeInput.actorId,
          snoozeInput.suggestionId,
        ),
      );
      if (!["pending", "snoozed"].includes(suggestion.status)) {
        throw new TaskSuggestionServiceError(
          `Task suggestion cannot be snoozed from ${suggestion.status}`,
        );
      }
      return input.repository.save({
        ...suggestion,
        status: "snoozed",
        nextVisibleAt: snoozeInput.nextVisibleAt,
        updatedAt: snoozeInput.now,
      });
    },
  };
}
