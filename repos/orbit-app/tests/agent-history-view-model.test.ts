import assert from "node:assert/strict";
import test from "node:test";
import {
  agentChatSessionPayloadToThreadView,
  agentHistorySessionsToSummaries,
  agentSessionUpdateRequestFromThread
} from "../src/view-models/agent-history";

test("agentHistorySessionsToSummaries maps web Orbit Agent sessions into mobile history rows", () => {
  const rows = agentHistorySessionsToSummaries({
    sessions: [
      {
        createdAt: "2026-07-21T09:00:00.000Z",
        id: "agent-session-older",
        messages: [
          {
            role: "user",
            text: "我想参加大阪的商务活动，有什么推荐？"
          }
        ],
        pinned: false,
        title: "Orbit Agent live conversation",
        updatedAt: "2026-07-21T09:10:00.000Z"
      },
      {
        createdAt: "2026-07-23T10:00:00.000Z",
        customTitle: "  关西活动准备  ",
        id: "agent-session-pinned",
        messages: [
          {
            role: "user",
            text: "帮我找下一场活动"
          },
          {
            items: [],
            kind: "events",
            panelTitle: "相关活动",
            role: "assistant",
            text: "可以先看关西跨境商务交流会。"
          }
        ],
        pinned: true,
        title: "Pinned session",
        updatedAt: "2026-07-23T10:30:00.000Z"
      }
    ]
  });

  assert.deepEqual(rows, [
    {
      id: "agent-session-pinned",
      pinned: true,
      preview: "帮我找下一场活动",
      routeParams: {
        id: "agent-session-pinned",
        source: "session"
      },
      title: "关西活动准备",
      updatedAt: "2026-07-23T10:30:00.000Z",
      when: "07月23日"
    },
    {
      id: "agent-session-older",
      pinned: false,
      preview: "我想参加大阪的商务活动，有什么推荐？",
      routeParams: {
        id: "agent-session-older",
        source: "session"
      },
      title: "我想参加大阪的商务活动，有什么推荐",
      updatedAt: "2026-07-21T09:10:00.000Z",
      when: "07月21日"
    }
  ]);

  assert.doesNotMatch(rows.map((row) => row.title).join(" "), /live|Agent/u);
});

test("agentChatSessionPayloadToThreadView maps a stored web session into an iOS conversation thread", () => {
  const thread = agentChatSessionPayloadToThreadView({
    session: {
      createdAt: "2026-07-23T10:00:00.000Z",
      customTitle: "关西活动准备",
      id: "agent-session-pinned",
      messages: [
        {
          role: "user",
          text: "帮我找下一场活动"
        },
        {
          items: [],
          kind: "events",
          panelTitle: "相关活动",
          role: "assistant",
          text: "可以先看关西跨境商务交流会。"
        }
      ],
      pinned: true,
      title: "Pinned session",
      updatedAt: "2026-07-23T10:30:00.000Z"
    }
  });

  assert.deepEqual(thread, {
    activeConversationId: "agent-session-pinned",
    assistantMessage: "可以先看关西跨境商务交流会。",
    messages: [
      {
        content: "帮我找下一场活动",
        createdAt: "2026-07-23T10:00:00.000Z",
        id: "agent-session-pinned:message:0",
        role: "user"
      },
      {
        content: "可以先看关西跨境商务交流会。",
        createdAt: "2026-07-23T10:30:00.000Z",
        id: "agent-session-pinned:message:1",
        role: "assistant"
      }
    ],
    nextAction: "继续问一个具体问题，Orbit AI 会先整理上下文，再给出下一步。",
    proposedToolIntents: [],
    title: "关西活动准备"
  });
});

test("agentSessionUpdateRequestFromThread builds a web session snapshot after an iOS continuation", () => {
  const request = agentSessionUpdateRequestFromThread({
    previousSession: {
      session: {
        createdAt: "2026-07-23T10:00:00.000Z",
        customTitle: "关西活动准备",
        id: "agent-session-pinned",
        messages: [
          {
            role: "user",
            text: "帮我找下一场活动"
          },
          {
            items: [],
            kind: "events",
            panelTitle: "相关活动",
            role: "assistant",
            text: "可以先看关西跨境商务交流会。"
          }
        ],
        pinned: true,
        title: "Pinned session",
        updatedAt: "2026-07-23T10:30:00.000Z"
      }
    },
    thread: {
      activeConversationId: "conversation-new",
      assistantMessage: "也可以准备报名时的自我介绍。",
      messages: [
        {
          content: "还需要准备什么？",
          createdAt: "2026-07-24T09:00:00.000Z",
          id: "message-user-new",
          role: "user"
        },
        {
          content: "也可以准备报名时的自我介绍。",
          createdAt: "2026-07-24T09:00:05.000Z",
          id: "message-assistant-new",
          role: "assistant"
        }
      ],
      nextAction: "继续问一个具体问题，Orbit AI 会先整理上下文，再给出下一步。",
      proposedToolIntents: [],
      title: "Orbit AI 对话"
    }
  });

  assert.deepEqual(request, {
    session: {
      createdAt: "2026-07-23T10:00:00.000Z",
      customTitle: "关西活动准备",
      id: "agent-session-pinned",
      messages: [
        {
          role: "user",
          text: "帮我找下一场活动"
        },
        {
          items: [],
          kind: "events",
          panelTitle: "相关活动",
          role: "assistant",
          text: "可以先看关西跨境商务交流会。"
        },
        {
          role: "user",
          text: "还需要准备什么？"
        },
        {
          items: [],
          kind: "people",
          panelTitle: "",
          role: "assistant",
          text: "也可以准备报名时的自我介绍。"
        }
      ],
      pinned: true,
      title: "关西活动准备",
      updatedAt: "2026-07-24T09:00:05.000Z"
    }
  });
});
