import assert from "node:assert/strict";
import test from "node:test";

import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";
import { createOrbitAiTaskInteractionService } from "../../features/orbit-ai/task-interaction-service";
import { createTaskRepository } from "../../features/tasks/repository";
import { createTaskService } from "../../features/tasks/service";
import { createTaskSuggestionRepository } from "../../features/tasks/suggestion-repository";
import { createTaskSuggestionService } from "../../features/tasks/suggestion-service";

const actorId = "account:xiaoyu";
const conversationId = "conversation:task-chat";

function services() {
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  const taskService = createTaskService({
    repository: createTaskRepository({ store, workspaceId: "workspace:orbit-ai-task" }),
  });
  const suggestionService = createTaskSuggestionService({
    repository: createTaskSuggestionRepository({
      store,
      workspaceId: "workspace:orbit-ai-task",
    }),
    taskService,
  });
  return {
    interactionService: createOrbitAiTaskInteractionService({
      suggestionService,
      taskService,
    }),
    suggestionService,
    taskService,
  };
}

test("explicit task language creates one canonical task immediately", async () => {
  const { interactionService, taskService } = services();
  const input = {
    actorId,
    conversationId,
    message: "帮我创建一个待办：明天下午联系佐藤确认合同范围",
    now: "2026-08-29T02:00:00.000Z",
    proposedActionRequests: [
      {
        arguments: {
          dueAt: "2026-08-30T06:00:00.000Z",
          title: "联系佐藤确认合同范围",
        },
        capabilityId: "followups.createTask" as const,
        requiresUserConfirmation: true as const,
      },
    ],
  };

  const first = await interactionService.handle(input);
  const replay = await interactionService.handle(input);
  const tasks = await taskService.list({ actorId });

  assert.equal(first.interaction?.state, "created");
  assert.equal(first.interaction?.title, "联系佐藤确认合同范围");
  assert.equal(first.remainingActionRequests.length, 0);
  assert.equal(replay.interaction?.taskId, first.interaction?.taskId);
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0]?.source, "ai_confirmed");
  assert.equal(tasks[0]?.relatedConversationId, conversationId);
});

test("inferred commitment becomes a suggestion instead of a task", async () => {
  const { interactionService, suggestionService, taskService } = services();
  const result = await interactionService.handle({
    actorId,
    conversationId,
    message: "我下周要整理关西交流会的参会名单",
    now: "2026-08-29T02:00:00.000Z",
    proposedActionRequests: [],
  });

  assert.equal(result.interaction?.state, "suggested");
  assert.match(result.interaction?.title ?? "", /整理关西交流会的参会名单/u);
  assert.equal((await taskService.list({ actorId })).length, 0);
  assert.equal(
    (await suggestionService.list({ actorId, now: "2026-08-29T02:00:00.000Z" })).length,
    1,
  );
});

test("proactive suggestions are limited to one per six-hour bucket", async () => {
  const { interactionService } = services();
  const first = await interactionService.handle({
    actorId,
    conversationId,
    message: "我需要给田中发会后资料",
    now: "2026-08-29T02:00:00.000Z",
    proposedActionRequests: [],
  });
  const suppressed = await interactionService.handle({
    actorId,
    conversationId,
    message: "我还要整理明天的路演名单",
    now: "2026-08-29T04:30:00.000Z",
    proposedActionRequests: [],
  });
  const later = await interactionService.handle({
    actorId,
    conversationId,
    message: "我晚上要提交本周报价单",
    now: "2026-08-29T08:30:00.000Z",
    proposedActionRequests: [],
  });

  assert.equal(first.interaction?.state, "suggested");
  assert.equal(suppressed.interaction, undefined);
  assert.equal(later.interaction?.state, "suggested");
});

test("questions and vague discussion do not create task suggestions", async () => {
  const { interactionService } = services();
  const result = await interactionService.handle({
    actorId,
    conversationId,
    message: "我今天应该先联系谁？",
    now: "2026-08-29T02:00:00.000Z",
    proposedActionRequests: [],
  });

  assert.equal(result.interaction, undefined);
});
