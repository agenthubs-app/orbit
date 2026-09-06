import assert from "node:assert/strict";
import test from "node:test";

import {
  parseAgentNaturalLanguageActionRequest,
  parseAgentNaturalLanguageActionRequests,
} from "../../features/agent/natural-language-actions/contract";
import { createAgentNaturalLanguageActionProposalService } from "../../features/agent/natural-language-actions/service";
import { createAgentCapabilityRegistry } from "../../features/agent/capabilities/registry";
import {
  createOrbitAgentRuntimeService,
  resetOrbitAgentRuntimeServicesForTests,
} from "../../features/agent/runtime/service-factory";
import {
  createAgentMemoryService,
  resetAgentMemoryServicesForTests,
} from "../../features/agent/memory/service-factory";
import { parseGeminiOrbitAgentPlannerOutput } from "../../features/orbit-ai/gemini-provider";

test("natural-language action request parser accepts only bounded confirmed allowlist payloads", () => {
  const reminder = parseAgentNaturalLanguageActionRequest({
    arguments: {
      dueAt: "2030-05-20T09:00:00+09:00",
      title: "跟进融资材料",
    },
    capabilityId: "notifications.createReminder",
    requiresUserConfirmation: true,
  });
  const memory = parseAgentNaturalLanguageActionRequest({
    arguments: {
      category: "preference",
      content: "回答保持简短中文。",
    },
    capabilityId: "memory.save",
    requiresUserConfirmation: true,
  });
  const calendar = parseAgentNaturalLanguageActionRequest({
    arguments: {
      provider: "google_calendar",
      title: "项目会议",
      startsAt: "2030-05-20T09:00:00+09:00",
      endsAt: "2030-05-20T10:00:00+09:00",
    },
    capabilityId: "calendar.syncEvent",
    requiresUserConfirmation: true,
  });

  assert.equal(reminder?.capabilityId, "notifications.createReminder");
  assert.equal(
    reminder?.arguments.dueAt,
    "2030-05-20T00:00:00.000Z",
  );
  assert.equal(memory?.capabilityId, "memory.save");
  assert.equal(calendar?.capabilityId, "calendar.syncEvent");
  assert.equal(
    calendar?.arguments.startsAt,
    "2030-05-20T00:00:00.000Z",
  );
  assert.equal(
    parseAgentNaturalLanguageActionRequest({
      arguments: { title: "绕过确认" },
      capabilityId: "followups.createTask",
      requiresUserConfirmation: false,
    }),
    null,
  );
  assert.equal(
    parseAgentNaturalLanguageActionRequest({
      arguments: { title: "发送邮件" },
      capabilityId: "gmail.send",
      requiresUserConfirmation: true,
    }),
    null,
  );
  assert.equal(
    parseAgentNaturalLanguageActionRequests(new Array(5).fill(memory)),
    null,
  );
});

test("external calendar proposals require provider authorization before reaching confirmation", async () => {
  resetOrbitAgentRuntimeServicesForTests();
  const runtime = createOrbitAgentRuntimeService("mock");
  const request = {
    arguments: {
      provider: "google_calendar" as const,
      title: "项目会议",
      startsAt: "2030-05-20T00:00:00.000Z",
    },
    capabilityId: "calendar.syncEvent" as const,
    requiresUserConfirmation: true as const,
  };

  await assert.rejects(
    createAgentNaturalLanguageActionProposalService({ runtime }).propose({
      conversationId: "conversation:calendar-without-permission",
      message: "在 Google Calendar 创建项目会议。",
      requests: [request],
    }),
    /must be connected with calendar\.events\.write/,
  );

  const permissionChecks: { permission: string; provider: string }[] = [];
  await assert.rejects(
    createAgentNaturalLanguageActionProposalService({
      externalCalendarWritesEnabled: false,
      permissionGuard: {
        async assertPermission() {
          throw new Error("Policy must reject before provider access.");
        },
      },
      runtime,
    }).propose({
      conversationId: "conversation:calendar-policy-disabled",
      message: "在 Google Calendar 创建项目会议。",
      requests: [request],
    }),
    /External calendar writes are disabled/,
  );
  const result = await createAgentNaturalLanguageActionProposalService({
    externalCalendarWritesEnabled: true,
    permissionGuard: {
      async assertPermission(input) {
        permissionChecks.push(input);
      },
    },
    runtime,
  }).propose({
    conversationId: "conversation:calendar-with-permission",
    message: "在 Google Calendar 创建项目会议。",
    requests: [request],
  });

  assert.deepEqual(permissionChecks, [
    {
      permission: "calendar.events.write",
      provider: "google_calendar",
    },
  ]);
  assert.equal(result.actions[0]?.riskLevel, "external");
  assert.equal(
    result.actions[0]?.operations[0]?.compensation.supported,
    true,
  );
});

test("model planner accepts action proposals but rejects mixed read/write plans", () => {
  const valid = parseGeminiOrbitAgentPlannerOutput(
    JSON.stringify({
      actionRequests: [
        {
          arguments: {
            category: "goal",
            content: "今年建立日本气候科技投资人网络。",
          },
          capabilityId: "memory.save",
          requiresUserConfirmation: true,
        },
      ],
      assistantMessage:
        "我准备了一条 Memory 写入建议，确认前不会保存。",
      intent: "action_proposal",
      toolRequests: [],
    }),
  );
  const mixed = parseGeminiOrbitAgentPlannerOutput(
    JSON.stringify({
      actionRequests: [
        {
          arguments: { title: "跟进活动名单" },
          capabilityId: "followups.createTask",
          requiresUserConfirmation: true,
        },
      ],
      assistantMessage: "我准备了任务并会检索联系人。",
      intent: "action_proposal",
      toolRequests: [
        {
          arguments: {},
          requiresUserConfirmation: true,
          toolName: "contacts.recommend",
        },
      ],
    }),
  );

  assert.equal(valid?.intent, "action_proposal");
  assert.equal(valid?.actionRequests[0]?.capabilityId, "memory.save");
  assert.equal(mixed, null);
});

test("natural-language writes stay inert until confirmation, then execute and undo through runtime", async () => {
  resetOrbitAgentRuntimeServicesForTests();
  resetAgentMemoryServicesForTests();
  const runtime = createOrbitAgentRuntimeService("mock");
  const memory = createAgentMemoryService({
    actorId: "mock-agent-runtime",
    mode: "mock",
  });
  const result = await createAgentNaturalLanguageActionProposalService({
    runtime,
  }).propose({
    conversationId: "conversation:natural-language-test",
    message: "记住我偏好简短中文，并创建任务整理会议资料。",
    requests: [
      {
        arguments: {
          category: "preference",
          content: "回答保持简短中文。",
        },
        capabilityId: "memory.save",
        requiresUserConfirmation: true,
      },
      {
        arguments: {
          title: "整理会议资料",
        },
        capabilityId: "followups.createTask",
        requiresUserConfirmation: true,
      },
    ],
  });

  assert.equal(result.actions.length, 2);
  assert.equal(result.actions[0]?.status, "awaiting_confirmation");
  assert.equal((await memory.list()).length, 0);
  assert.equal((await runtime.processOutbox()).processed, 0);

  const memoryAction = result.actions.find(
    (action) => action.operations[0]?.executorKey === "memory.save",
  );
  assert.ok(memoryAction);
  await runtime.approveAction({
    actionId: memoryAction.actionId,
    actorLabel: "Orbit user",
  });
  const processed = await runtime.processOutbox({
    actionId: memoryAction.actionId,
    workerId: "natural-language-test-worker",
  });

  assert.equal(processed.completed, 1);
  assert.equal((await memory.list())[0]?.content, "回答保持简短中文。");
  await runtime.undoAction(memoryAction.actionId);
  assert.equal((await memory.list()).length, 0);

  const capability =
    createAgentCapabilityRegistry().getByExecutorKey("memory.save");
  assert.equal(capability?.confirmationPolicy, "per_operation");
  assert.equal(capability?.riskLevel, "write");
  assert.equal(capability?.compensationSupported, true);
});
