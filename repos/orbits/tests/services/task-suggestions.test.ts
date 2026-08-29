import assert from "node:assert/strict";
import test from "node:test";

import { createTaskRepository } from "../../features/tasks/repository";
import { createTaskService } from "../../features/tasks/service";
import { createTaskSuggestionRepository } from "../../features/tasks/suggestion-repository";
import { createTaskSuggestionService } from "../../features/tasks/suggestion-service";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";

const workspaceId = "workspace:task-suggestions";
const actorId = "account:xiaoyu";
const now = "2026-08-29T08:00:00.000Z";

function services() {
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  const taskService = createTaskService({
    repository: createTaskRepository({ store, workspaceId }),
  });
  const suggestionService = createTaskSuggestionService({
    repository: createTaskSuggestionRepository({ store, workspaceId }),
    taskService,
  });
  return { store, suggestionService, taskService };
}

function suggestionInput(overrides: Record<string, unknown> = {}) {
  return {
    actorId,
    title: "活动前确认三位重点联系人",
    reason: "明晚参会，提前确认更容易见到",
    category: "event" as const,
    suggestedPlannedDate: "2026-08-29",
    relatedEventId: "event:kansai-business",
    evidenceIds: ["evidence:event-registration"],
    confidence: 0.91,
    deduplicationKey: "event:kansai-business:confirm-key-contacts",
    now,
    ...overrides,
  };
}

test("persists suggestions separately without increasing task counts", async () => {
  const { suggestionService, taskService } = services();
  const created = await suggestionService.suggest(suggestionInput());

  assert.equal(created.status, "pending");
  assert.equal((await suggestionService.list({ actorId, now })).length, 1);
  assert.deepEqual(await taskService.list({ actorId }), []);
});

test("accepts one suggestion into exactly one task and replays idempotently", async () => {
  const { store, suggestionService, taskService } = services();
  const suggestion = await suggestionService.suggest(suggestionInput());
  const accepted = await suggestionService.accept({
    actorId,
    suggestionId: suggestion.id,
    overrides: {
      title: "确认活动重点联系人",
      category: "relationship",
    },
    idempotencyKey: "accept:kansai-contacts",
    now: "2026-08-29T08:10:00.000Z",
  });
  const replay = await suggestionService.accept({
    actorId,
    suggestionId: suggestion.id,
    overrides: {
      title: "确认活动重点联系人",
      category: "relationship",
    },
    idempotencyKey: "accept:kansai-contacts",
    now: "2026-08-29T08:10:00.000Z",
  });

  assert.equal(accepted.suggestion.status, "accepted");
  assert.equal(accepted.task.suggestionId, suggestion.id);
  assert.equal(accepted.task.title, "确认活动重点联系人");
  assert.deepEqual(replay, accepted);
  assert.equal((await taskService.list({ actorId })).length, 1);
  assert.equal(
    store.listRecords({ workspaceId, collectionName: "tasks" }).length,
    1,
  );
  assert.deepEqual(await suggestionService.list({ actorId, now }), []);
});

test("keeps dismissed suggestions hidden during cooldown and reactivates later", async () => {
  const { suggestionService } = services();
  const suggestion = await suggestionService.suggest(suggestionInput());
  const dismissed = await suggestionService.dismiss({
    actorId,
    suggestionId: suggestion.id,
    idempotencyKey: "dismiss:kansai-contacts",
    now,
  });

  assert.equal(dismissed.status, "dismissed");
  assert.deepEqual(await suggestionService.list({ actorId, now }), []);
  assert.equal(
    (await suggestionService.suggest(
      suggestionInput({ now: "2026-09-01T08:00:00.000Z" }),
    )).status,
    "dismissed",
  );
  assert.equal(
    (await suggestionService.suggest(
      suggestionInput({ now: "2026-09-06T08:00:00.000Z" }),
    )).status,
    "pending",
  );
});

test("hides and persists expired suggestions", async () => {
  const { suggestionService } = services();
  const suggestion = await suggestionService.suggest(
    suggestionInput({ expiresAt: "2026-08-29T07:59:00.000Z" }),
  );

  assert.deepEqual(await suggestionService.list({ actorId, now }), []);
  assert.equal(
    (await suggestionService.get({ actorId, suggestionId: suggestion.id }))
      ?.status,
    "expired",
  );
});

test("isolates suggestion reads and mutations by actor", async () => {
  const { suggestionService } = services();
  const suggestion = await suggestionService.suggest(suggestionInput());

  assert.deepEqual(
    await suggestionService.list({ actorId: "account:other", now }),
    [],
  );
  await assert.rejects(
    suggestionService.accept({
      actorId: "account:other",
      suggestionId: suggestion.id,
      idempotencyKey: "accept:forged",
      now,
    }),
    /not found/i,
  );
});
