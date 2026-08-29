import type { FollowupTask } from "../../../../features/followups/contract";
import type { FollowupTaskGenerationService } from "../../../../features/followups/service";
import { createFollowupTaskGenerationService } from "../../../../features/followups/service-factory";
import {
  followupTaskGenerationFailureToAppError,
} from "../../../../features/followups/service";
import { AppError } from "../../../../shared/errors/app-error";
import { resolveFeatureMode } from "../../../../shared/config/feature-mode";
import { authenticatedApiActorRequiredResponse } from "../../_shared/authenticated-actor";
import {
  suggestionActorResolver,
  suggestionBody,
  suggestionError,
  suggestionExactKeys,
  suggestionNow,
  suggestionService,
  suggestionString,
  suggestionSuccess,
  type TaskSuggestionRouteDependencies,
} from "../../task-suggestions/route-support";

interface GenerateSuggestionDependencies
  extends TaskSuggestionRouteDependencies {
  followupService?: FollowupTaskGenerationService;
}

function readTriggerKinds(value: unknown): readonly string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new AppError("VALIDATION_ERROR", "triggerKinds must be a string array.");
  }
  return value;
}

function readLimit(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new AppError("VALIDATION_ERROR", "limit must be a positive integer.");
  }
  return value;
}

function dueAt(task: FollowupTask, now: string): string | undefined {
  if (task.dueAt) return task.dueAt;
  if (!Number.isFinite(task.dueInDays)) return undefined;
  return new Date(
    Date.parse(now) + task.dueInDays * 24 * 60 * 60 * 1000,
  ).toISOString();
}

function confidence(task: FollowupTask): number {
  if (task.priority === "today") return 0.9;
  if (task.priority === "this_week") return 0.8;
  return 0.65;
}

export function createTaskSuggestionsGeneratePostHandler(
  dependencies?: GenerateSuggestionDependencies,
) {
  return async function POST(request: Request): Promise<Response> {
    const actor = await suggestionActorResolver(dependencies)();
    if (!actor) return authenticatedApiActorRequiredResponse(resolveFeatureMode());
    try {
      const body = await suggestionBody(request);
      suggestionExactKeys(body, ["connectionId", "limit", "scenario", "triggerKinds"]);
      const followups = await (
        dependencies?.followupService ?? createFollowupTaskGenerationService()
      ).generateTasks({
        actorId: actor.id,
        ...(body.connectionId !== undefined
          ? { connectionId: suggestionString(body.connectionId, "connectionId") }
          : {}),
        ...(readLimit(body.limit) !== undefined
          ? { limit: readLimit(body.limit) }
          : {}),
        ...(body.scenario !== undefined
          ? { scenario: suggestionString(body.scenario, "scenario") }
          : {}),
        ...(readTriggerKinds(body.triggerKinds)
          ? { triggerKinds: readTriggerKinds(body.triggerKinds) }
          : {}),
      });
      if (followups.success === false) {
        throw followupTaskGenerationFailureToAppError(followups);
      }

      const now = suggestionNow(dependencies);
      const suggestions = await Promise.all(
        followups.data.tasks.map((task) =>
          suggestionService(dependencies).suggest({
            actorId: actor.id,
            title: task.title,
            reason: task.rationale,
            category: "relationship",
            ...(dueAt(task, now) ? { suggestedDueAt: dueAt(task, now) } : {}),
            ...(task.contactId ? { relatedContactId: task.contactId } : {}),
            evidenceIds: task.evidenceIds,
            confidence: confidence(task),
            deduplicationKey: `followup:${task.taskId}`,
            now,
          }),
        ),
      );
      return suggestionSuccess({
        state: suggestions.length > 0 ? "success" : "empty",
        suggestions,
        generatedCount: suggestions.length,
        provenance: followups.data.provenance,
      });
    } catch (error) {
      return suggestionError(error);
    }
  };
}
