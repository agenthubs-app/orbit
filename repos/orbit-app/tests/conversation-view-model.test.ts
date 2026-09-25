import assert from "node:assert/strict";
import test from "node:test";
import * as conversationViewModel from "../src/view-models/conversations";

test("conversation record links preserve native record identity and reject unsafe destinations", () => {
  const links = (conversationViewModel as unknown as { conversationRecordLinks?: (text: string, baseUrl: string) => Array<{ href: string; kind: string; id: string; external: boolean }> }).conversationRecordLinks;
  assert.equal(typeof links, "function");
  assert.deepEqual(links!("[交流会](https://orbit.test/app/events/event-one) orbit://contacts/person-one /tasks/task%3Aone /schedule/events/event-two", "https://orbit.test"), [
    { href: "/events/event-one", id: "event-one", kind: "活动", external: false },
    { href: "/contacts/person-one", id: "person-one", kind: "人脉", external: false },
    { href: "/tasks/task%3Aone", id: "task:one", kind: "待办", external: false },
    { href: "/schedule/events/event-two", id: "event-two", kind: "日历活动", external: false }
  ]);
  assert.deepEqual(links!("javascript:alert(1) https://elsewhere.test/app/events/x orbit://contacts/new orbit://tasks/ orbit://events/%2Fbad", "https://orbit.test"), []);
  assert.deepEqual(links!("orbit://events/e1 orbit://events/e1", "https://orbit.test").map((link) => link.href), ["/events/e1"]);
});

test("action references use the verified web entry route, never the unscoped native ledger", () => {
  const links = (conversationViewModel as unknown as { conversationRecordLinks?: (text: string, baseUrl: string) => Array<{ href: string; kind: string; id: string; external: boolean }> }).conversationRecordLinks;
  assert.equal(typeof links, "function");
  const href = "https://orbit.test/app/contacts/all-actions?entry=action%3Afollowup%3Aone";
  assert.deepEqual(links!(href, "https://orbit.test"), [
    { href, id: "action:followup:one", kind: "行动", external: true }
  ]);
  assert.deepEqual(links!("orbit://contacts/all-actions?entry=x https://orbit.test/app/contacts/all-actions", "https://orbit.test"), []);
});

test("task detail links encode the actual ID and reject fallback identities", () => {
  const href = (conversationViewModel as unknown as { conversationTaskDetailHref?: (id: string) => string | null }).conversationTaskDetailHref;
  assert.equal(typeof href, "function");
  assert.equal(href!("task:followup:one"), "/tasks/task%3Afollowup%3Aone");
  assert.equal(href!("task:one/two"), "/tasks/task%3Aone%2Ftwo");
  assert.equal(href!(""), null);
  assert.equal(href!("task"), null);
  assert.equal(href!(" task "), null);
});

test("record references never promote a path inside an unrelated token", () => {
  for (const value of ["docs/events/not-a-record", "api/tasks/not-a-record", "[/tmp/events/not-a-record]", "ftp://elsewhere/app/events/x", "//elsewhere/app/events/x", "javascript:https://orbit.test/app/events/x", "data:text/plain,https://orbit.test/app/events/x", "ftp://https://orbit.test/app/events/x", "mailto:https://orbit.test/app/events/x"]) {
    assert.deepEqual(conversationViewModel.conversationRecordLinks(value, "https://orbit.test"), [], value);
  }
});

test("absolute references can follow Chinese prose without a space", () => {
  for (const content of ["查看https://orbit.test/app/events/one", "活动：https://orbit.test/app/events/one", "打开orbit://events/one"]) {
    assert.equal(conversationViewModel.conversationRecordLinks(content, "https://orbit.test")[0]?.href, "/events/one");
  }
});

test("acceptance retains only the canonical task identity returned by the server", () => {
  const accepted = (conversationViewModel as unknown as { conversationAcceptedTaskId: (data: unknown) => string | null }).conversationAcceptedTaskId;
  assert.equal(typeof accepted, "function");
  assert.equal(accepted({ task: { id: "task:one/two" } }), "task:one/two");
  assert.equal(accepted({ suggestionId: "suggestion-one" }), null);
  assert.equal(accepted({ task: { id: "task" } }), null);
});
import {
  aiRunDetailToView,
  buildAiRunDetailRequest,
  conversationAiRunReferencesFor,
  conversationPayloadToChatView,
  conversationPayloadToThreadView,
  conversationQuickRoutes,
  conversationsToSummaries,
  markdownBlocksFor,
  shouldSubmitInitialPrompt,
  orbitAiHomeChatWindow,
  pendingConversationThreadView,
  proactiveTurnPayloadToChatView
} from "../src/view-models/conversations";


test("conversationPayloadToChatView maps assistant reply messages and proposed tool intents", () => {
  const view = conversationPayloadToChatView({
    activeConversationId: "conversation-1",
    assistantMessage: "You should prepare three warm intros.",
    messages: [
      {
        content: "Who should I meet tomorrow?",
        createdAt: "2026-07-03T10:00:00.000Z",
        messageId: "message-1",
        role: "user"
      },
      {
        content: "You should prepare three warm intros.",
        createdAt: "2026-07-03T10:01:00.000Z",
        messageId: "message-2",
        role: "assistant"
      }
    ],
    proposedToolIntents: [
      {
        intentId: "intent-1",
        label: "Find relevant people",
        reason: "The event has attendees in your target market.",
        requiresUserConfirmation: true
      },
      {
        intentId: "intent-2"
      }
    ],
    taskInteraction: null
  });

  assert.deepEqual(view, {
    activeConversationId: "conversation-1",
    assistantMessage: "You should prepare three warm intros.",
    messages: [
      {
        content: "Who should I meet tomorrow?",
        createdAt: "2026-07-03T10:00:00.000Z",
        id: "message-1",
        role: "user"
      },
      {
        content: "You should prepare three warm intros.",
        createdAt: "2026-07-03T10:01:00.000Z",
        id: "message-2",
        role: "assistant"
      }
    ],
    proposedToolIntents: [
      {
        id: "intent-1",
        label: "Find relevant people",
        reason: "The event has attendees in your target market.",
        requiresUserConfirmation: true
      },
      {
        id: "intent-2",
        label: "建议动作",
        reason: "",
        requiresUserConfirmation: true
      }
    ],
    entityDraft: null,
    taskInteraction: null
  });
  assert.doesNotMatch(JSON.stringify(view), /Suggested action/u);
});

test("conversationPayloadToChatView uses safe defaults for empty payloads", () => {
  assert.deepEqual(conversationPayloadToChatView({}), {
    activeConversationId: null,
    assistantMessage: "",
    messages: [],
    proposedToolIntents: [],
    entityDraft: null,
    taskInteraction: null
  });
});

test("conversationPayloadToChatView exposes a confirmable task suggestion", () => {
  const view = conversationPayloadToChatView({
    taskInteraction: {
      category: "work",
      reason: "你在对话中提到了一项明确的后续行动。",
      state: "suggested",
      suggestionId: "task-suggestion:one",
      title: "整理关西交流会的参会名单"
    }
  });

  assert.deepEqual(view.taskInteraction, {
    category: "work",
    reason: "你在对话中提到了一项明确的后续行动。",
    state: "suggested",
    suggestionId: "task-suggestion:one",
    taskId: "",
    title: "整理关西交流会的参会名单"
  });
});

test("conversationPayloadToChatView preserves note provenance and date confirmation state", () => {
  const view = conversationPayloadToChatView({ taskInteraction: {
    category: "relationship",
    reason: "请补充明确日期后再发送，当前没有创建建议或待办。",
    relatedContactIds: ["contact:li", "contact:sato"],
    sourceNoteId: "note:one",
    sourceNoteVersion: 3,
    state: "needs_date_confirmation",
    title: "联系佐藤",
  } });
  assert.deepEqual(view.taskInteraction, {
    category: "relationship",
    reason: "请补充明确日期后再发送，当前没有创建建议或待办。",
    relatedContactIds: ["contact:li", "contact:sato"],
    sourceNoteId: "note:one",
    sourceNoteVersion: 3,
    state: "needs_date_confirmation",
    suggestionId: "",
    taskId: "",
    title: "联系佐藤",
  });
});

test("orbitAiHomeChatWindow leaves the bootstrap welcome to home question starters", () => {
  const view = orbitAiHomeChatWindow({
    activeConversationId: "live-orbit-agent-conversation",
    assistantMessage: "Orbit Agent is ready for a natural-language request.",
    messages: [
      {
        content: "Orbit Agent is ready for a natural-language request.",
        createdAt: "2026-06-27T00:00:00.000Z",
        messageId: "orbit-agent-live-ready",
        role: "assistant"
      }
    ],
    proposedToolIntents: []
  });

  assert.deepEqual(view.messages, []);
  assert.equal(view.isEmpty, true);
});

test("home suppresses the exact bootstrap fallback but retains a genuine assistant-only response", () => {
  const welcome = orbitAiHomeChatWindow({ assistantMessage: "Orbit Agent is ready for a natural-language request." });
  assert.equal(welcome.isEmpty, true);
  const reply = orbitAiHomeChatWindow({ assistantMessage: "可以先整理会前提纲。" });
  assert.equal(reply.messages[0]?.content, "可以先整理会前提纲。");
  assert.equal(reply.isEmpty, false);
});

test("pendingConversationThreadView shows the user prompt before the model returns", () => {
  const thread = pendingConversationThreadView("今天先跟进谁？");

  assert.deepEqual(thread, {
    activeConversationId: null,
    assistantMessage: "",
    messages: [
      {
        content: "今天先跟进谁？",
        createdAt: "",
        id: "pending-user-message",
        role: "user"
      },
      {
        content: "正在整理相关上下文。",
        createdAt: "",
        id: "pending-assistant-message",
        role: "assistant"
      }
    ],
    nextAction: "正在处理你的问题。",
    proposedToolIntents: [],
    taskInteraction: null,
    title: "正在处理"
  });
});

test("markdownBlocksFor converts common assistant markdown into native blocks", () => {
  assert.deepEqual(
    markdownBlocksFor(
      "根据工具返回，今天有 **5 个待联系的人脉**。\n\n- **山崎 美穗** — 先跟进\n- `橋本 夏美` — 补资料"
    ),
    [
      {
        kind: "paragraph",
        segments: [
          { kind: "text", text: "根据工具返回，今天有 " },
          { kind: "strong", text: "5 个待联系的人脉" },
          { kind: "text", text: "。" }
        ]
      },
      {
        kind: "listItem",
        segments: [
          { kind: "strong", text: "山崎 美穗" },
          { kind: "text", text: " — 先跟进" }
        ]
      },
      {
        kind: "listItem",
        segments: [
          { kind: "code", text: "橋本 夏美" },
          { kind: "text", text: " — 补资料" }
        ]
      }
    ]
  );
});

test("markdownBlocksFor preserves AI numbered tasks and quoted evidence", () => {
  assert.deepEqual(
    markdownBlocksFor(
      "下一步：\n1. **报名** 活动\n2) 准备 `名片`\n- [ ] 联系主办方\n- [x] 更新档案\n> 来自网页历史"
    ),
    [
      {
        kind: "paragraph",
        segments: [{ kind: "text", text: "下一步：" }]
      },
      {
        kind: "listItem",
        marker: "1.",
        segments: [
          { kind: "strong", text: "报名" },
          { kind: "text", text: " 活动" }
        ]
      },
      {
        kind: "listItem",
        marker: "2.",
        segments: [
          { kind: "text", text: "准备 " },
          { kind: "code", text: "名片" }
        ]
      },
      {
        kind: "listItem",
        marker: "☐",
        segments: [{ kind: "text", text: "联系主办方" }]
      },
      {
        kind: "listItem",
        marker: "✓",
        segments: [{ kind: "text", text: "更新档案" }]
      },
      {
        kind: "paragraph",
        quote: true,
        segments: [{ kind: "text", text: "来自网页历史" }]
      }
    ]
  );
});


test("conversationAiRunReferencesFor extracts unique AI run ids for audit lookup", () => {
  const references = conversationAiRunReferencesFor({
    aiRuns: [{ runId: "demo-ai-run-1" }],
    messages: [
      {
        content: "已生成回复。runId: demo-ai-run-1",
        role: "assistant"
      }
    ],
    provenance: {
      runId: "demo-ai-run-2"
    }
  });

  assert.deepEqual(references, [
    {
      actionLabel: "查看依据",
      detail: "查看 demo-ai-run-1 的来源、证据和安全边界。",
      id: "demo-ai-run-1",
      title: "AI 运行依据"
    },
    {
      actionLabel: "查看依据",
      detail: "查看 demo-ai-run-2 的来源、证据和安全边界。",
      id: "demo-ai-run-2",
      title: "AI 运行依据"
    }
  ]);
});

test("AI run detail helpers prepare lookup requests and Chinese audit cards", () => {
  assert.deepEqual(buildAiRunDetailRequest(" demo-ai-run-1 "), {
    request: {
      path: "/api/ai/runs/demo-ai-run-1"
    },
    success: true
  });
  assert.deepEqual(buildAiRunDetailRequest("   "), {
    error: "这次 AI 运行缺少编号，暂时不能查看依据。",
    success: false
  });

  const view = aiRunDetailToView({
    nextAction:
      "Review source evidence, prompt template id, input hash, output, and fallback behavior before wiring a live provider.",
    provenance: {
      evidenceIds: ["evidence:1", "evidence:2"],
      sourceLabel: "Maya pilot timing relationship evidence"
    },
    run: {
      calendarProviderRequested: false,
      deviceRequested: false,
      emailProviderRequested: false,
      evidenceIds: ["evidence:1", "evidence:2"],
      externalNetworkRequested: false,
      liveDatabaseWriteExecuted: false,
      modelCallExecuted: false,
      notificationProviderRequested: false,
      output: {
        kind: "message_draft",
        text: "Hi Maya Chen, following up from breakfast."
      },
      promptTemplateId: "orbit.message-draft.followup.v1",
      runId: "demo-ai-run-1",
      state: "success"
    },
    state: "success",
    summary:
      "Local rules prepared one AI-shaped message draft with prompt template id, input hash, output, fallback behavior, and run provenance."
  });

  assert.deepEqual(view, {
    metrics: [
      "运行 demo-ai-run-1",
      "模板 orbit.message-draft.followup.v1",
      "证据 2 条"
    ],
    nextAction: "先核对证据和输出，再决定是否继续。",
    outputPreview: "Hi Maya Chen, following up from breakfast.",
    safetyText: "不会自动发送消息、写日历、改联系人或触发通知。",
    summary: "这次回复有可复核的运行记录。",
    title: "AI 运行依据"
  });
  assert.doesNotMatch(JSON.stringify(view), /\bmock|fixture|provider|database\b/iu);
});

test("conversationQuickRoutes keeps bottom AI shortcuts stable", () => {
  assert.deepEqual(
    conversationQuickRoutes().map((route) => [route.href, route.title]),
    [
      ["/events", "活动"],
      ["/contacts", "人脉"],
      ["/tasks", "待办"],
      ["/schedule", "日程"],
      ["/profile", "档案"]
    ]
  );
});

test("shouldSubmitInitialPrompt allows a new prompt on the same draft route", () => {
  assert.equal(
    shouldSubmitInitialPrompt({
      initialPrompt: "今天先见谁？",
      isDraftConversation: true,
      submittedPrompt: null
    }),
    true
  );
  assert.equal(
    shouldSubmitInitialPrompt({
      initialPrompt: "今天先见谁？",
      isDraftConversation: true,
      submittedPrompt: "今天先见谁？"
    }),
    false
  );
  assert.equal(
    shouldSubmitInitialPrompt({
      initialPrompt: "今天有哪些跟进？",
      isDraftConversation: true,
      submittedPrompt: "今天先见谁？"
    }),
    true
  );
  assert.equal(
    shouldSubmitInitialPrompt({
      initialPrompt: "今天有哪些跟进？",
      isDraftConversation: false,
      submittedPrompt: null
    }),
    false
  );
});

test("conversationPayloadToThreadView maps live default copy into Chinese", () => {
  const view = conversationPayloadToThreadView({
    activeConversationId: "live-orbit-agent-conversation",
    assistantMessage: "Orbit Agent is ready for a natural-language request.",
    conversations: [
      {
        conversationId: "live-orbit-agent-conversation",
        lastMessagePreview: "Orbit Agent is ready for a natural-language request.",
        title: "Orbit Agent live conversation"
      }
    ],
    messages: [
      {
        content: "Orbit Agent is ready for a natural-language request.",
        createdAt: "2026-06-27T00:00:00.000Z",
        messageId: "orbit-agent-live-ready",
        role: "assistant"
      }
    ],
    nextAction:
      "Send a natural-language prompt; Orbit will ask the configured model provider to plan before any internal tool is considered.",
    proposedToolIntents: []
  });

  assert.equal(view.title, "Orbit AI 对话");
  assert.equal(
    view.nextAction,
    "继续问一个具体问题，Orbit AI 会先整理上下文，再给出下一步。"
  );
  assert.equal(
    view.messages[0]?.content,
    "有什么需要我做的吗？找活动、准备会面、整理人脉，我可以先帮您梳理下一步。"
  );
});

test("proactiveTurnPayloadToChatView maps in-chat proactive turns", () => {
  const view = proactiveTurnPayloadToChatView({
    message: {
      content:
        "Orbit needs attention: Daniel follow-up is due. The sourced draft is ready for review.",
      conversationId: "live-orbit-ai-proactive-conversation",
      createdAt: "2026-07-02T09:00:00.000Z",
      deliverySurface: "orbit_ai_chat",
      messageId: "proactive-live-message:signal-followup-daniel",
      role: "assistant",
      sourceSignalId: "signal-followup-daniel",
      turnKind: "proactive"
    },
    provenance: {
      generationMethod: "live-policy-proactive-turn"
    },
    suggestedActions: [
      {
        actionId: "review-followup",
        label: "Review follow-up",
        requiresConfirmation: true,
        targetSurface: "orbit_ai_chat"
      }
    ]
  });

  assert.deepEqual(view, {
    activeConversationId: "live-orbit-ai-proactive-conversation",
    assistantMessage:
      "Orbit needs attention: Daniel follow-up is due. The sourced draft is ready for review.",
    messages: [
      {
        content:
          "Orbit needs attention: Daniel follow-up is due. The sourced draft is ready for review.",
        createdAt: "2026-07-02T09:00:00.000Z",
        id: "proactive-live-message:signal-followup-daniel",
        role: "assistant"
      }
    ],
    proposedToolIntents: [
      {
        id: "review-followup",
        label: "Review follow-up",
        reason: "Orbit AI 建议先处理这一步。",
        requiresUserConfirmation: true
      }
    ],
    taskInteraction: null
  });
});

test("proactiveTurnPayloadToChatView avoids English fallback action reasons", () => {
  const view = proactiveTurnPayloadToChatView({
    message: {
      content: "今天有一条跟进需要处理。",
      conversationId: "conversation-proactive",
      messageId: "message-proactive",
      role: "assistant"
    },
    suggestedActions: [
      {
        actionId: "review-followup",
        label: "查看待办"
      },
      {
        actionId: "open-schedule"
      }
    ]
  });

  assert.equal(view.proposedToolIntents[1]?.label, "建议动作");
  assert.equal(
    view.proposedToolIntents[0]?.reason,
    "Orbit AI 建议先处理这一步。"
  );
  assert.doesNotMatch(JSON.stringify(view), /Suggested by Orbit AI|Suggested action/u);
});

test("conversationsToSummaries hides implementation labels in titles", () => {
  const summaries = conversationsToSummaries({
    conversations: [
      {
        conversationId: "conversation-1",
        lastMessagePreview:
          "Orbit Agent is ready for a natural-language request.",
        title: "Orbit Agent live conversation"
      }
    ]
  });

  assert.deepEqual(summaries, [
    {
      id: "conversation-1",
      preview: "问一个具体问题，Orbit AI 会把相关人脉和下一步整理出来。",
      title: "Orbit AI 对话"
    }
  ]);
});
