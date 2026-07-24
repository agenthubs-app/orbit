import assert from "node:assert/strict";
import test from "node:test";
import {
  conversationPayloadToChatView,
  conversationPayloadToThreadView,
  conversationInlinePanelsForThread,
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
      }
    ]
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
      }
    ]
  });
});

test("conversationPayloadToChatView uses safe defaults for empty payloads", () => {
  assert.deepEqual(conversationPayloadToChatView({}), {
    activeConversationId: null,
    assistantMessage: "",
    messages: [],
    proposedToolIntents: []
  });
});

test("orbitAiHomeChatWindow exposes a first-screen chat transcript", () => {
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

  assert.equal(view.messages.length, 1);
  assert.equal(
    view.messages[0]?.content,
    "把问题发过来。我会按人脉、活动和跟进记录来答。"
  );
  assert.doesNotMatch(view.messages[0]?.content ?? "", /直接问|已准备好|下一步/u);
  assert.equal(view.isEmpty, false);
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
    title: "正在处理"
  });
});

test("markdownBlocksFor converts common assistant markdown into native blocks", () => {
  assert.deepEqual(
    markdownBlocksFor(
      "根据工具返回，今天有 **5 个待跟进的人脉**。\n\n- **山崎 美穗** — 先跟进\n- `橋本 夏美` — 补资料"
    ),
    [
      {
        kind: "paragraph",
        segments: [
          { kind: "text", text: "根据工具返回，今天有 " },
          { kind: "strong", text: "5 个待跟进的人脉" },
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

test("conversationInlinePanelsForThread opens an events panel for event questions", () => {
  const thread = pendingConversationThreadView("我想参加一些商务活动，有什么推荐？");

  assert.deepEqual(conversationInlinePanelsForThread(thread), [
    {
      actionHref: "/events",
      actionLabel: "查看全部活动",
      detail: "根据你的问题，先把可参加和需要准备的活动放在对话里。",
      kind: "events",
      title: "相关活动"
    }
  ]);
});

test("conversationInlinePanelsForThread opens a people panel for relationship questions", () => {
  const thread = pendingConversationThreadView("今天我应该先见谁？有没有适合互相介绍的人？");

  assert.deepEqual(conversationInlinePanelsForThread(thread), [
    {
      actionHref: "/contacts",
      actionLabel: "查看全部人脉",
      detail: "根据你的问题，先把值得查看和适合推进的人放在对话里。",
      kind: "people",
      title: "相关人脉"
    }
  ]);
});

test("conversationInlinePanelsForThread opens a followups panel for follow-up questions", () => {
  const thread = pendingConversationThreadView("今天有哪些跟进要处理？帮我排一下优先级。");

  assert.deepEqual(conversationInlinePanelsForThread(thread), [
    {
      actionHref: "/followups",
      actionLabel: "查看全部跟进",
      detail: "根据你的问题，先把今天需要复核的跟进事项放在对话里。",
      kind: "followups",
      title: "待跟进"
    }
  ]);
});

test("conversationInlinePanelsForThread opens a schedule panel for calendar questions", () => {
  const thread = pendingConversationThreadView("今天有什么安排？我接下来几点要见人？");

  assert.deepEqual(conversationInlinePanelsForThread(thread), [
    {
      actionHref: "/schedule",
      actionLabel: "查看日程",
      detail: "根据你的问题，先把最近需要处理的时间和待办放在对话里。",
      kind: "schedule",
      title: "近日安排"
    }
  ]);
});

test("conversationInlinePanelsForThread opens a profile panel for public profile questions", () => {
  const thread = pendingConversationThreadView("别人看到我的个人主页时，我能提供什么应该怎么写？");

  assert.deepEqual(conversationInlinePanelsForThread(thread), [
    {
      actionHref: "/profile",
      actionLabel: "完善档案",
      detail: "根据你的问题，先把别人会看到的自我介绍和资源标签放在对话里。",
      kind: "profile",
      title: "个人档案"
    }
  ]);
});

test("conversationQuickRoutes keeps bottom AI shortcuts stable", () => {
  assert.deepEqual(
    conversationQuickRoutes().map((route) => [route.href, route.title]),
    [
      ["/events", "活动"],
      ["/contacts", "人脉"],
      ["/followups", "跟进"],
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
    "把问题发过来。我会按人脉、活动和跟进记录来答。"
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
        reason: "Suggested by Orbit AI.",
        requiresUserConfirmation: true
      }
    ]
  });
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
