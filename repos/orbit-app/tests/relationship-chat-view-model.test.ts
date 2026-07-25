import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRelationshipChatMessageRequest,
  relationshipChatExtractionToView,
  relationshipChatMessageSendToView,
  relationshipChatSummaryToView,
  relationshipChatListToView,
  relationshipChatThreadToView
} from "../src/view-models/relationship-chat";

test("relationshipChatListToView maps legacy chat conversations into Chinese cards", () => {
  const view = relationshipChatListToView({
    conversations: [
      {
        conversationId: "demo-conversation-1",
        lastMessageAt: "2026-06-25T10:35:00+09:00",
        lastMessagePreview:
          "Let's compare pilot windows after the operator breakfast.",
        oneToOneContext: {
          latestContext:
            "Maya asked for a pilot timing comparison after the breakfast conversation.",
          recommendedFollowup:
            "Send the two-window pilot comparison and ask which operator questions matter most.",
          relationshipReason:
            "Met at the Tokyo climate operator breakfast and discussed grid storage pilot readiness.",
          relationshipStage: "needs_followup"
        },
        organization: "Kumo Grid",
        participantContactId: "demo-contact-maya",
        participantName: "Maya Chen",
        source: {
          label: "Pilot timing follow-up",
          type: "chat_summary"
        },
        status: "needs_followup",
        title: "Pilot timing follow-up",
        unreadCount: 1
      }
    ],
    nextAction: "Open the first chat thread and review the local preview.",
    state: "success",
    summary: "2 mock chat conversations are ready."
  });

  assert.equal(view.title, "关系对话");
  assert.equal(view.summary, "1 段关系对话，先看需要跟进的人。");
  assert.deepEqual(view.metrics, [
    { label: "对话", value: "1" },
    { label: "待跟进", value: "1" },
    { label: "未读", value: "1" }
  ]);
  assert.deepEqual(view.conversations[0], {
    contactId: "demo-contact-maya",
    detail: "Kumo Grid · 待跟进",
    id: "demo-conversation-1",
    lastAt: "6月25日 10:35",
    name: "Maya Chen",
    nextAction: "先写一版草稿，确认后再发。",
    preview: "对方在等一版具体回复。",
    sourceLabel: "对话摘要",
    title: "试点时间跟进",
    unreadLabel: "1 条未读"
  });
});

test("relationshipChatThreadToView keeps message delivery as review-only", () => {
  const view = relationshipChatThreadToView({
    conversation: {
      conversationId: "demo-conversation-1",
      organization: "Kumo Grid",
      participantContactId: "demo-contact-maya",
      participantName: "Maya Chen",
      title: "Pilot timing follow-up"
    },
    messages: [
      {
        body:
          "The breakfast discussion was useful. Can you send the pilot timing comparison?",
        createdAt: "2026-06-25T10:20:00+09:00",
        deliveryState: "mock_received",
        messageId: "demo-message-1",
        senderName: "Maya Chen",
        senderRole: "contact"
      },
      {
        body:
          "Yes. I will compare the two pilot timing windows and keep the notes tied to the operator questions.",
        createdAt: "2026-06-25T10:35:00+09:00",
        deliveryState: "mock_recorded_locally",
        messageId: "demo-message-2",
        senderName: "Alex Tan",
        senderRole: "orbit_user"
      }
    ],
    nextAction: "Review the local message preview before live delivery.",
    oneToOneContext: {
      latestContext:
        "Maya asked for a pilot timing comparison after the breakfast conversation.",
      recommendedFollowup:
        "Send the two-window pilot comparison and ask which operator questions matter most.",
      relationshipReason:
        "Met at the Tokyo climate operator breakfast and discussed grid storage pilot readiness.",
      relationshipStage: "needs_followup"
    },
    sendMessageState: {
      canSendInMock: true,
      confirmationRequiredBeforeLiveSend: true,
      reason:
        "The mock can record a local message preview, but live delivery still requires explicit confirmation.",
      status: "ready"
    },
    state: "success",
    summary: "The current thread has 2 messages."
  });

  assert.equal(view.title, "试点时间跟进");
  assert.equal(view.participant, "Maya Chen · Kumo Grid");
  assert.equal(view.context, "对方在等一版具体回复。");
  assert.equal(view.sendBoundary, "可以写草稿；真正发出前还要确认。");
  assert.deepEqual(view.messages, [
    {
      body: "对方询问试点时间对比，希望拿到一版具体回复。",
      deliveryLabel: "收到",
      fromMe: false,
      id: "demo-message-1",
      sender: "Maya Chen",
      time: "6月25日 10:20"
    },
    {
      body: "我会准备两个时间窗口的对比，并围绕对方的问题整理。",
      deliveryLabel: "本地草稿",
      fromMe: true,
      id: "demo-message-2",
      sender: "我",
      time: "6月25日 10:35"
    }
  ]);
});

test("buildRelationshipChatMessageRequest prepares review-only draft requests", () => {
  const request = buildRelationshipChatMessageRequest(
    "conversation/demo 1",
    "  下周我先整理两个试点时间窗口，再发你确认。  "
  );

  assert.deepEqual(request, {
    request: {
      endpoint: "/api/chat/conversations/conversation%2Fdemo%201/messages",
      options: {
        body: {
          body: "下周我先整理两个试点时间窗口，再发你确认。"
        }
      },
    },
    success: true
  });

  assert.deepEqual(buildRelationshipChatMessageRequest("", "hello"), {
    error: "缺少对话 ID，暂时不能保存草稿。",
    success: false
  });
  assert.deepEqual(buildRelationshipChatMessageRequest("conversation_001", " "), {
    error: "先写一版回复草稿。",
    success: false
  });
});

test("relationshipChatMessageSendToView maps saved drafts without live-send wording", () => {
  const view = relationshipChatMessageSendToView({
    conversationId: "demo-conversation-1",
    message: {
      body: "下周我先整理两个试点时间窗口，再发你确认。",
      createdAt: "2026-06-25T23:55:00.000Z",
      deliveryState: "mock_recorded_locally",
      messageId: "demo-message-local-demo-conversation-1",
      senderName: "Alex Tan",
      senderRole: "orbit_user"
    },
    messages: [
      {
        body: "Can you send the pilot timing comparison?",
        createdAt: "2026-06-25T10:20:00+09:00",
        deliveryState: "mock_received",
        messageId: "demo-message-1",
        senderName: "Maya Chen",
        senderRole: "contact"
      },
      {
        body: "下周我先整理两个试点时间窗口，再发你确认。",
        createdAt: "2026-06-25T23:55:00.000Z",
        deliveryState: "mock_recorded_locally",
        messageId: "demo-message-local-demo-conversation-1",
        senderName: "Alex Tan",
        senderRole: "orbit_user"
      }
    ],
    oneToOneContext: {
      latestContext:
        "Maya asked for a pilot timing comparison after the breakfast conversation.",
      recommendedFollowup:
        "Send the two-window pilot comparison and ask which operator questions matter most."
    },
    sendMessageState: {
      confirmationRequiredBeforeLiveSend: true,
      externalSendRequested: false,
      status: "ready"
    },
    state: "success"
  });

  assert.equal(view.title, "回复草稿已保存");
  assert.equal(view.summary, "已记录为本地草稿，尚未真正发出。");
  assert.equal(view.nextAction, "先复核草稿和上下文，再决定是否确认发送。");
  assert.equal(view.thread.sendBoundary, "可以写草稿；真正发出前还要确认。");
  assert.equal(view.thread.messages.at(-1)?.deliveryLabel, "本地草稿");
  assert.equal(view.thread.messages.at(-1)?.fromMe, true);
});

test("relationship chat view models clean live generated chat wording", () => {
  const listView = relationshipChatListToView({
    conversations: [
      {
        conversationId: "conversation_001",
        lastMessageAt: "2026-06-26T13:00:00+09:00",
        lastMessagePreview:
          "Follow up about trusted tax and incorporation advisor for Japan entry with a concrete next step.",
        oneToOneContext: {
          latestContext:
            "山田 千尋 matches ai_saas through AI workflow PoC buyer in Japanese SMB manufacturing.",
          recommendedFollowup: "Mandarin Japanese community marketing channel",
          relationshipReason:
            "山田 千尋 matches ai_saas through AI workflow PoC buyer in Japanese SMB manufacturing.",
          relationshipStage: "active"
        },
        organization: "Morning Light Foods",
        participantContactId: "contact_012",
        participantName: "山田 千尋",
        source: {
          label: "Generated relationship conversation",
          type: "chat_summary"
        },
        status: "active",
        title: "山田 千尋 conversation",
        unreadCount: 0
      }
    ]
  });

  assert.deepEqual(listView.conversations[0], {
    contactId: "contact_012",
    detail: "Morning Light Foods · 进行中",
    id: "conversation_001",
    lastAt: "6月26日 13:00",
    name: "山田 千尋",
    nextAction: "先围绕「中日双语社群营销渠道」写一版草稿。",
    preview: "这段对话和日本中小制造业 AI 工作流 PoC 买方有关。",
    sourceLabel: "对话摘要",
    title: "山田 千尋 的关系对话",
    unreadLabel: "已读"
  });

  const threadView = relationshipChatThreadToView({
    conversation: {
      conversationId: "conversation_001",
      organization: "Morning Light Foods",
      participantContactId: "contact_012",
      participantName: "山田 千尋",
      title: "山田 千尋 conversation"
    },
    messages: [
      {
        body:
          "Follow up about AI workflow PoC buyer in Japanese SMB manufacturing with a concrete next step.",
        createdAt: "2026-06-02T13:00:00+09:00",
        deliveryState: "mock_recorded_locally",
        messageId: "message_0001",
        senderName: "Orbit operator",
        senderRole: "orbit_user"
      }
    ],
    oneToOneContext: {
      latestContext:
        "山田 千尋 matches ai_saas through AI workflow PoC buyer in Japanese SMB manufacturing.",
      recommendedFollowup: "Mandarin Japanese community marketing channel"
    },
    sendMessageState: {
      status: "ready"
    }
  });

  assert.equal(
    threadView.context,
    "这段对话和日本中小制造业 AI 工作流 PoC 买方有关。"
  );
  assert.equal(
    threadView.messages[0]?.body,
    "围绕「日本中小制造业 AI 工作流 PoC 买方」准备一版具体跟进。"
  );
});

test("relationshipChatSummaryToView maps source-backed summaries for mobile review", () => {
  const view = relationshipChatSummaryToView({
    conversationId: "demo-conversation-1",
    organization: "Kumo Grid",
    participantName: "Maya Chen",
    provenance: {
      evidenceIds: ["evidence:chat:maya:breakfast"],
      sourceLabel: "Mock chat summary and extraction fixture"
    },
    state: "success",
    summary: {
      evidenceIds: [
        "evidence:chat:maya:breakfast",
        "evidence:chat:maya:pilot-timing"
      ],
      narrative:
        "Maya Chen asked for a pilot timing comparison tied to operator readiness questions from the Tokyo climate breakfast. The sensible follow-up is to send two pilot windows and ask which operator concern Kumo Grid wants resolved first."
    },
    nextAction:
      "Review extracted needs, tasks, and profile suggestions before any profile confirmation or follow-up action."
  });

  assert.deepEqual(view, {
    evidenceLabel: "2 条证据",
    narrative:
      "Maya 想比较两个试点时间窗口，重点是运营方准备度。先发一版对比，再问 Kumo Grid 最想先解决哪个问题。",
    nextAction: "先复核需求、任务和资料建议，再决定是否写入关系资料。",
    sourceLabel: "对话摘要提取",
    title: "对话摘要"
  });
});

test("relationshipChatExtractionToView maps extracted relationship signals without profile writes", () => {
  const view = relationshipChatExtractionToView({
    confirmationRequiredProfileSuggestions: [
      {
        field: "priorityTopic",
        proposedValue: "Operator readiness pilot timing",
        reason:
          "Updating a relationship profile from chat extraction requires human review.",
        suggestionId: "profile-suggestion:chat:maya:priority-topic"
      }
    ],
    extractedNeeds: [
      {
        needId: "need:chat:maya:pilot-window",
        priority: "high",
        statement:
          "Maya needs an operator readiness comparison for two pilot timing windows before deciding the next review step."
      }
    ],
    extractedTasks: [
      {
        dueHint: "After the Tokyo climate operator breakfast follow-up",
        rationale:
          "The chat evidence asks for a concrete comparison before Kumo Grid reviews operator readiness.",
        taskId: "task:chat:maya:send-pilot-comparison",
        title: "Send Maya the pilot timing comparison"
      }
    ],
    provenance: {
      sourceLabel: "Mock chat extraction fixture"
    },
    relationshipProfileUpdates: [
      {
        field: "latestContext",
        proposedValue:
          "Maya is comparing pilot timing windows through the lens of operator readiness.",
        updateId: "profile-update:chat:maya:operator-readiness"
      }
    ],
    state: "success"
  });

  assert.deepEqual(view, {
    emptyText: "",
    needs: [
      {
        detail: "高优先级",
        id: "need:chat:maya:pilot-window",
        title: "Maya 需要一版运营方准备度和两个试点时间窗口的对比。"
      }
    ],
    nextAction: "这些只是提取结果。写入资料或创建任务前，还要你确认。",
    profileSuggestions: [
      {
        detail: "需要确认后才能写入",
        id: "profile-suggestion:chat:maya:priority-topic",
        title: "priorityTopic：运营方准备度和试点时间"
      }
    ],
    profileUpdates: [
      {
        detail: "暂未写入关系资料",
        id: "profile-update:chat:maya:operator-readiness",
        title: "latestContext：Maya 正在按运营方准备度比较试点时间窗口。"
      }
    ],
    sourceLabel: "关系信号提取",
    tasks: [
      {
        detail: "东京气候运营者早餐会后",
        id: "task:chat:maya:send-pilot-comparison",
        title: "给 Maya 发送试点时间对比"
      }
    ],
    title: "提取结果"
  });
});
