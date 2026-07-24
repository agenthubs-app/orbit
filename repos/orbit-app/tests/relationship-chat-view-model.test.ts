import assert from "node:assert/strict";
import test from "node:test";

import {
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
