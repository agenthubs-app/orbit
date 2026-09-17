import assert from "node:assert/strict";
import test from "node:test";

import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";
import { createNoteRepository } from "../../features/notes/repository";
import { createNoteService } from "../../features/notes/service";
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
  const noteService = createNoteService({
    repository: createNoteRepository({ store, workspaceId: "workspace:orbit-ai-task" }),
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
      noteService,
      suggestionService,
      taskService,
    }),
    noteService,
    suggestionService,
    taskService,
  };
}

test("a note source always creates a confirmable suggestion with immutable provenance", async () => {
  const { interactionService, noteService, suggestionService, taskService } = services();
  const note = await noteService.create({
    actorId,
    body: "2026-09-20 前联系佐藤确认合同范围",
    contactIds: ["contact:sato", "contact:li"],
    idempotencyKey: "note:contract",
    now: "2026-09-15T01:00:00.000Z",
  });

  const result = await interactionService.handle({
    actorId,
    conversationId,
    message: "请从这篇笔记创建待办",
    now: "2026-09-15T01:05:00.000Z",
    proposedActionRequests: [{
      arguments: { dueAt: "2026-09-20T09:00:00.000Z", title: "联系佐藤确认合同范围" },
      capabilityId: "followups.createTask",
      requiresUserConfirmation: true,
    }],
    sourceNote: { id: note.id, version: note.version },
  });

  assert.equal(result.interaction?.state, "suggested");
  assert.equal(result.interaction?.sourceNoteId, note.id);
  assert.equal(result.interaction?.sourceNoteVersion, 1);
  assert.deepEqual(result.interaction?.relatedContactIds, ["contact:li", "contact:sato"]);
  assert.equal((await taskService.list({ actorId })).length, 0);
  const suggestions = await suggestionService.list({ actorId, now: "2026-09-15T01:05:00.000Z" });
  assert.equal(suggestions.length, 1);
  assert.equal(suggestions[0]?.sourceNoteId, note.id);
  assert.deepEqual(suggestions[0]?.relatedContactIds, ["contact:li", "contact:sato"]);
});

test("a note source with an ambiguous date asks for confirmation without persisting", async () => {
  const { interactionService, noteService, suggestionService, taskService } = services();
  const note = await noteService.create({
    actorId,
    body: "下周联系佐藤确认合同范围",
    idempotencyKey: "note:ambiguous-date",
    now: "2026-09-15T01:00:00.000Z",
  });

  const result = await interactionService.handle({
    actorId,
    conversationId,
    message: "请从这篇笔记整理待办",
    now: "2026-09-15T01:05:00.000Z",
    proposedActionRequests: [],
    sourceNote: { id: note.id, version: note.version },
  });

  assert.equal(result.interaction?.state, "needs_date_confirmation");
  assert.match(result.interaction?.reason ?? "", /明确日期/u);
  assert.deepEqual(await taskService.list({ actorId }), []);
  assert.deepEqual(await suggestionService.list({ actorId, now: "2026-09-15T01:05:00.000Z" }), []);
});

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
  assert.equal(first.interaction?.dueAt, "2026-08-30T06:00:00.000Z");
  assert.equal(first.remainingActionRequests.length, 0);
  assert.equal(replay.interaction?.taskId, first.interaction?.taskId);
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0]?.source, "ai_confirmed");
  assert.equal(tasks[0]?.relatedConversationId, conversationId);
  assert.equal(tasks[0]?.dueAt, "2026-08-30T06:00:00.000Z");
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

const unauthorizedMessages = [
  "只查询我自己的联系人 Naoki Sato，告诉我他的机构、职务和信息来源。不要创建任务或发送消息。",
  "不要创建任务：联系佐藤",
  "请别帮我添加一个待办：发送资料",
  "我不需要创建任务：联系佐藤",
  "先创建任务：联系佐藤，但暂时不要执行",
  "只读分析：创建任务：联系佐藤",
  "只查询标题包含创建任务的记录",
  "他说创建任务：联系佐藤",
  "“创建任务：联系佐藤”",
  "> 创建任务：联系佐藤",
  "```\n创建任务：联系佐藤\n```",
  "解释一下‘创建任务：联系佐藤’的含义",
  "创建任务：联系佐藤？",
  "创建任务会发送通知吗",
  "能不能创建任务联系佐藤",
  "如果创建任务联系佐藤会怎样",
  "我明天要联系佐藤吗？",
  "我不打算联系佐藤，但系统建议创建任务",
  "Do not create a task: contact Sato",
  "Please don't add a todo: send the files",
  "Create a task: contact Sato?",
  "Can you create a task: contact Sato?",
  "He said create a task: contact Sato",
  '"Create a task: contact Sato"',
  "Only query my contacts; create a task is an example",
  "Create a task: contact Sato, but do not execute this yet",
  "只查询我的联系人 Naoki Sato 的机构和职务",
  "创建任务：",
  "创建任务：   ",
  "创建任务的方法",
  "创建任务：联系佐藤（这是引用的例子）",
  "我需要联系谁",
  "我需要解释‘创建任务：联系佐藤’这段引用",
  "Create a task: ",
  "Create a task",
  "创建任务",
  "Create a task is an example",
];

for (const message of unauthorizedMessages) {
  for (const withProposal of [false, true]) {
    test(`no task write authorization, even with planner proposal=${withProposal}: ${message}`, async (t) => {
      const { interactionService, taskService, suggestionService } = services();
      const create = t.mock.method(taskService, "create");
      const suggest = t.mock.method(suggestionService, "suggest");
      const now = "2026-09-17T01:00:00.000Z";
      const result = await interactionService.handle({
        actorId, conversationId, message, now,
        proposedActionRequests: withProposal ? [{
          capabilityId: "followups.createTask",
          arguments: { title: "或发送消息" },
          requiresUserConfirmation: true,
        }] : [],
      });
      assert.equal(result.interaction, undefined);
      assert.deepEqual(result.remainingActionRequests, []);
      assert.deepEqual(await taskService.list({ actorId }), []);
      assert.deepEqual(await suggestionService.list({ actorId, now }), []);
      assert.equal(create.mock.callCount(), 0);
      assert.equal(suggest.mock.callCount(), 0);
    });
  }
}

test("read-only or negated requests with a valid source note cannot persist suggestions", async (t) => {
  const { interactionService, noteService, taskService, suggestionService } = services();
  const now = "2026-09-17T01:00:00.000Z";
  const note = await noteService.create({ actorId, body: "联系佐藤", idempotencyKey: "readonly-note", now });
  const create = t.mock.method(taskService, "create");
  const suggest = t.mock.method(suggestionService, "suggest");
  for (const message of ["只查询这篇笔记，不创建待办", "不要从这篇笔记创建任务", "这篇笔记是否值得创建任务？"]) {
    const result = await interactionService.handle({
      actorId, conversationId, message, now, sourceNote: { id: note.id, version: note.version },
      proposedActionRequests: [{ capabilityId: "followups.createTask", arguments: { title: "联系佐藤" }, requiresUserConfirmation: true }],
    });
    assert.equal(result.interaction, undefined);
    assert.deepEqual(result.remainingActionRequests, []);
  }
  assert.equal(create.mock.callCount(), 0);
  assert.equal(suggest.mock.callCount(), 0);
});

for (const [message, title] of [
  ["请创建一个任务：联系佐藤", "联系佐藤"],
  ["帮我新建待办：整理资料。", "整理资料"],
  ["添加一条任务：准备会议", "准备会议"],
  ["Please create a task: contact Sato", "contact Sato"],
  ["Add a todo: prepare the meeting", "prepare the meeting"],
]) {
  test(`affirmative command with no planner proposal creates exactly once: ${message}`, async () => {
    const { interactionService, taskService } = services();
    const input = { actorId, conversationId, message, now: "2026-09-17T01:00:00.000Z", proposedActionRequests: [] };
    const first = await interactionService.handle(input);
    const replay = await interactionService.handle(input);
    assert.equal(first.interaction?.state, "created");
    assert.equal(first.interaction?.title, title);
    assert.equal(replay.interaction?.taskId, first.interaction?.taskId);
    assert.equal((await taskService.list({ actorId })).length, 1);
  });
}

test("a conversational suggestion still requires explicit acceptance and replays once", async () => {
  const { interactionService, taskService, suggestionService } = services();
  const now = "2026-09-17T01:00:00.000Z";
  const result = await interactionService.handle({
    actorId, conversationId, now, message: "我明天要联系佐藤", proposedActionRequests: [],
  });
  assert.equal(result.interaction?.state, "suggested");
  assert.deepEqual(await taskService.list({ actorId }), []);
  assert.ok(result.interaction?.suggestionId);
  const accept = { actorId, now, suggestionId: result.interaction.suggestionId, idempotencyKey: "explicit-accept" };
  const first = await suggestionService.accept(accept);
  const replay = await suggestionService.accept(accept);
  assert.equal(first.task.id, replay.task.id);
  assert.equal((await taskService.list({ actorId })).length, 1);
});

test("a planner cannot replace the authorized task title or attach its unrelated deadline", async () => {
  const { interactionService, taskService } = services();
  const result = await interactionService.handle({
    actorId, conversationId, now: "2026-09-17T01:00:00.000Z", message: "创建任务：联系佐藤",
    proposedActionRequests: [{ capabilityId: "followups.createTask", requiresUserConfirmation: true,
      arguments: { title: "发送机密资料", dueAt: "2026-09-18T01:00:00.000Z" } }],
  });
  assert.equal(result.interaction?.title, "联系佐藤");
  const [task] = await taskService.list({ actorId });
  assert.equal(task.title, "联系佐藤");
  assert.equal(task.dueAt, undefined);
});

test("rejecting an unrelated plan preserves the user's original time words", async () => {
  const { interactionService, taskService } = services();
  const result = await interactionService.handle({
    actorId, conversationId, now: "2026-09-17T01:00:00.000Z",
    message: "创建任务：明天下午联系佐藤",
    proposedActionRequests: [{ capabilityId: "followups.createTask", requiresUserConfirmation: true,
      arguments: { title: "发送机密资料", dueAt: "2026-10-01T01:00:00.000Z" } }],
  });
  assert.equal(result.interaction?.title, "明天下午联系佐藤");
  assert.equal(result.interaction?.dueAt, undefined);
  const [task] = await taskService.list({ actorId });
  assert.equal(task.title, "明天下午联系佐藤");
  assert.equal(task.dueAt, undefined);
});

test("authorized note extraction still rejects a changed source version before any write", async (t) => {
  const { interactionService, noteService, taskService, suggestionService } = services();
  const now = "2026-09-17T01:00:00.000Z";
  const note = await noteService.create({ actorId, body: "联系佐藤", idempotencyKey: "stale-note", now });
  const create = t.mock.method(taskService, "create");
  const suggest = t.mock.method(suggestionService, "suggest");
  const result = await interactionService.handle({
    actorId, conversationId, now, message: "请从这篇笔记整理待办",
    sourceNote: { id: note.id, version: note.version + 1 },
    proposedActionRequests: [{ capabilityId: "followups.createTask", requiresUserConfirmation: true, arguments: { title: "联系佐藤" } }],
  });
  assert.equal(result.interaction?.state, "failed");
  assert.deepEqual(result.remainingActionRequests, []);
  assert.equal(create.mock.callCount(), 0);
  assert.equal(suggest.mock.callCount(), 0);
});
