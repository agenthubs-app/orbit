import assert from "node:assert/strict";
import test from "node:test";

import { createTaskSuggestionsGetHandler } from "../../app/api/task-suggestions/handler";
import { createTaskSuggestionAcceptPostHandler } from "../../app/api/task-suggestions/[id]/accept/handler";
import { createTaskSuggestionDismissPostHandler } from "../../app/api/task-suggestions/[id]/dismiss/handler";
import { createTaskSuggestionSnoozePostHandler } from "../../app/api/task-suggestions/[id]/snooze/handler";
import { createTaskSuggestionsGeneratePostHandler } from "../../app/api/tasks/generate/suggestion-handler";
import { createMockFollowupTaskGenerationService } from "../../features/followups/mock-service";
import { createTaskRepository } from "../../features/tasks/repository";
import { createTaskService } from "../../features/tasks/service";
import { createTaskSuggestionRepository } from "../../features/tasks/suggestion-repository";
import { createTaskSuggestionService } from "../../features/tasks/suggestion-service";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";

const actorId = "account:xiaoyu";
const workspaceId = "workspace:task-suggestion-routes";
const now = "2026-08-29T09:00:00.000Z";

function dependencies(authenticatedActor: string | null = actorId) {
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  const taskService = createTaskService({
    repository: createTaskRepository({ store, workspaceId }),
  });
  const suggestionService = createTaskSuggestionService({
    repository: createTaskSuggestionRepository({ store, workspaceId }),
    taskService,
  });
  return {
    now: () => now,
    resolveActor: async () =>
      authenticatedActor ? { id: authenticatedActor, workspaceId } : null,
    service: suggestionService,
    taskService,
  };
}

async function seed(
  service: ReturnType<typeof createTaskSuggestionService>,
  suffix = "primary",
) {
  return service.suggest({
    actorId,
    title: "给田中发送会后感谢",
    reason: "昨天首次见面，尚未记录后续行动",
    category: "relationship",
    relatedContactId: "contact:tanaka",
    evidenceIds: ["evidence:encounter"],
    confidence: 0.88,
    deduplicationKey: `contact:tanaka:thank-you:${suffix}`,
    now,
  });
}

async function json(response: Response) {
  return (await response.json()) as any;
}

test("lists actor-owned pending suggestions", async () => {
  const deps = dependencies();
  await seed(deps.service);
  const response = await createTaskSuggestionsGetHandler(deps)(
    new Request("https://orbit.local/api/task-suggestions?category=relationship"),
  );

  assert.equal(response.status, 200);
  assert.equal((await json(response)).data.suggestions.length, 1);
});

test("accepts only allowlisted overrides and creates one canonical task", async () => {
  const deps = dependencies();
  const suggestion = await seed(deps.service);
  const handler = createTaskSuggestionAcceptPostHandler(deps);
  const context = { params: Promise.resolve({ id: suggestion.id }) };
  const response = await handler(
    new Request(`https://orbit.local/api/task-suggestions/${suggestion.id}/accept`, {
      body: JSON.stringify({
        idempotencyKey: "accept:tanaka-thanks",
        overrides: { plannedDate: "2026-08-29", priority: "high" },
      }),
      method: "POST",
    }),
    context,
  );

  assert.equal(response.status, 200);
  assert.equal((await json(response)).data.task.priority, "high");
  assert.equal((await deps.taskService.list({ actorId })).length, 1);

  const forged = await handler(
    new Request(`https://orbit.local/api/task-suggestions/${suggestion.id}/accept`, {
      body: JSON.stringify({
        actorId: "account:other",
        idempotencyKey: "accept:forged",
      }),
      method: "POST",
    }),
    context,
  );
  assert.equal(forged.status, 400);
});

test("dismisses and snoozes through separate exact mutation endpoints", async () => {
  const deps = dependencies();
  const dismissedSuggestion = await seed(deps.service, "dismiss");
  const snoozedSuggestion = await seed(deps.service, "snooze");

  const dismissed = await createTaskSuggestionDismissPostHandler(deps)(
    new Request("https://orbit.local/dismiss", {
      body: JSON.stringify({ idempotencyKey: "dismiss:tanaka" }),
      method: "POST",
    }),
    { params: Promise.resolve({ id: dismissedSuggestion.id }) },
  );
  assert.equal((await json(dismissed)).data.suggestion.status, "dismissed");

  const snoozed = await createTaskSuggestionSnoozePostHandler(deps)(
    new Request("https://orbit.local/snooze", {
      body: JSON.stringify({
        idempotencyKey: "snooze:tanaka",
        nextVisibleAt: "2026-08-30T09:00:00.000Z",
      }),
      method: "POST",
    }),
    { params: Promise.resolve({ id: snoozedSuggestion.id }) },
  );
  assert.equal((await json(snoozed)).data.suggestion.status, "snoozed");
});

test("authenticates suggestion mutations before parsing JSON", async () => {
  const deps = dependencies(null);
  const response = await createTaskSuggestionAcceptPostHandler(deps)(
    new Request("https://orbit.local/accept", {
      body: "{broken",
      method: "POST",
    }),
    { params: Promise.resolve({ id: "task-suggestion:unknown" }) },
  );
  assert.equal(response.status, 401);
});

test("persists generated follow-up candidates as suggestions, never tasks", async () => {
  const deps = dependencies();
  const handler = createTaskSuggestionsGeneratePostHandler({
    ...deps,
    followupService: createMockFollowupTaskGenerationService(),
  });
  const request = () =>
    new Request("https://orbit.local/api/tasks/generate", {
      body: JSON.stringify({ triggerKinds: ["new_connection"] }),
      method: "POST",
    });

  const first = await handler(request());
  const replay = await handler(request());
  assert.equal(first.status, 200);
  assert.equal((await json(first)).data.suggestions.length, 1);
  assert.equal((await json(replay)).data.suggestions.length, 1);
  assert.equal((await deps.service.list({ actorId, now })).length, 1);
  assert.deepEqual(await deps.taskService.list({ actorId }), []);
});
