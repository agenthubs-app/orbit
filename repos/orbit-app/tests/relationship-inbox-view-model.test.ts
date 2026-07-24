import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRelationshipThreadDraftRequest,
  createdRelationshipThreadToView,
  relationshipAlertsToView,
  relationshipInboxToView
} from "../src/view-models/relationship-inbox";

test("relationshipInboxToView localizes async inbox payloads for mobile", () => {
  const view = relationshipInboxToView({
    selectedThread: {
      conversationId: "conversation_demo_aoba",
      messages: [
        {
          messageId: "message_demo_aoba_1",
          senderName: "Aoba Mori",
          senderRole: "contact",
          body:
            "The Yoyogi climate founder breakfast was useful. Could you send the two-point recap before I speak with the venue team?",
          occurredAt: "2026-07-07T08:42:00+09:00",
          sourceContextLabel: "Yoyogi climate founder breakfast"
        },
        {
          messageId: "message_demo_aoba_2",
          senderName: "Alex Tan",
          senderRole: "orbit_user",
          body:
            "Yes. I will keep it short and tie it back to the venue team's follow-up questions.",
          occurredAt: "2026-07-07T09:06:00+09:00",
          sourceContextLabel: "Aoba follow-up task"
        }
      ],
      sourceContextLabels: [
        "Yoyogi climate founder breakfast",
        "Aoba follow-up task"
      ],
      subject: "Founder breakfast recap",
      summary:
        "Aoba asked for a short recap from the Yoyogi climate founder breakfast before a venue-team conversation."
    },
    draftReply: {
      body:
        "Aoba, here is the short recap from breakfast: the venue team cared most about founder fit and a clear follow-up owner. I can send the two bullets before your venue conversation and keep Thu 10:00 JST open if a quick calibration helps.",
      externalSendStatus: "not_requested",
      tone: "warm, specific, relationship-aware"
    },
    currentUser: {
      displayName: "Alex Tan"
    },
    inbox: {
      title: "Relationship inbox",
      conversations: [
        {
          contactId: "contact_demo_aoba",
          conversationId: "conversation_demo_aoba",
          lastCorrespondenceAt: "2026-07-07T09:06:00+09:00",
          nextActionLabel: "Prepare a local reply preview",
          organization: "Yoyogi Climate Founders",
          participantName: "Aoba Mori",
          preview:
            "Yes. I will keep it short and tie it back to the venue team's follow-up questions.",
          sourceContextLabels: [
            "Yoyogi climate founder breakfast",
            "Aoba follow-up task"
          ],
          subject: "Founder breakfast recap",
          unreadCount: 1
        },
        {
          contactId: "contact_demo_lina",
          conversationId: "conversation_demo_lina",
          lastCorrespondenceAt: "2026-07-06T17:10:00+09:00",
          nextActionLabel: "Stage the intro-angle reply",
          organization: "Kita Robotics",
          participantName: "Lina Park",
          preview:
            "If the robotics investor intro still makes sense, can you remind me which angle is most relevant?",
          sourceContextLabels: ["Robotics investor intro note"],
          subject: "Investor intro context",
          unreadCount: 1
        }
      ]
    },
    sideEffects: {
      calendarEntryCreated: false,
      externalMessageSent: false,
      networkRequestMade: false,
      notificationDelivered: false,
      savedRecordCreated: false
    }
  });

  assert.equal(view.title, "关系收件箱");
  assert.equal(view.summary, "2 段对话 · 2 条新消息");
  assert.deepEqual(view.conversations[0], {
    contactId: "contact_demo_aoba",
    id: "conversation_demo_aoba",
    lastAt: "7月7日 09:06",
    name: "Aoba Mori",
    nextAction: "先准备一版回复，确认后再发送。",
    organization: "Yoyogi Climate Founders",
    preview: "我会把内容压短，并对齐场地方的问题。",
    sourceLabels: ["代代木气候创业者早餐会", "Aoba 跟进任务"],
    subject: "代代木早餐会跟进",
    unreadLabel: "1 条新消息"
  });
  assert.equal(view.selected?.currentUserName, "我");
  assert.equal(view.selected?.subject, "代代木早餐会跟进");
  assert.equal(
    view.selected?.summary,
    "Aoba 想在和场地方沟通前，先拿到早餐会的两点复盘。"
  );
  assert.equal(
    view.selected?.draftReply,
    "Aoba，我把早餐会的复盘压成两点：场地方最关心创始人匹配度，以及后续谁来负责推进。我可以在你和他们沟通前先发过去；如果需要快速对齐，我周四 10:00 可以留 25 分钟。"
  );
  assert.equal(view.selected?.safetyText, "这里先写草稿。未经确认，不会发送消息或创建日程。");
  assert.deepEqual(view.selected?.messages, [
    {
      body: "代代木那场气候创业者早餐会很有用。你能在我和场地方沟通前，把两点复盘发给我吗？",
      fromMe: false,
      id: "message_demo_aoba_1",
      sender: "Aoba Mori",
      time: "7月7日 08:42"
    },
    {
      body: "可以。我会写短一点，并对齐场地方后续最关心的问题。",
      fromMe: true,
      id: "message_demo_aoba_2",
      sender: "我",
      time: "7月7日 09:06"
    }
  ]);
});

test("createdRelationshipThreadToView maps a confirmed draft without implementation copy", () => {
  const view = createdRelationshipThreadToView({
    state: "staged_created",
    thread: {
      conversationId: "conversation:new:new",
      messages: [
        {
          messageId: "message:new:new:1",
          senderName: "Alex Tan",
          senderRole: "orbit_user",
          body: "李明您好，我想继续聊关西渠道合作。",
          occurredAt: "2026-07-09T09:00:00+09:00",
          sourceContextLabel: "Staged from a reviewed message draft"
        }
      ],
      sourceContextLabels: ["Staged from a reviewed message draft"],
      subject: "关于关西合作的跟进",
      summary: "New relationship thread staged from a reviewed draft to 李明."
    },
    inboxItem: {
      contactId: "contact:new",
      conversationId: "conversation:new:new",
      lastCorrespondenceAt: "2026-07-09T09:00:00+09:00",
      nextActionLabel: "Review the staged draft before any send",
      organization: "红桥科技",
      participantName: "李明",
      preview: "李明您好，我想继续聊关西渠道合作。",
      sourceContextLabels: ["Staged from a reviewed message draft"],
      subject: "关于关西合作的跟进",
      unreadCount: 0
    },
    sideEffects: {
      calendarEntryCreated: false,
      externalMessageSent: false,
      networkRequestMade: false,
      notificationDelivered: false,
      savedRecordCreated: false
    }
  });

  assert.equal(view.conversation.subject, "关于关西合作的跟进");
  assert.equal(view.conversation.unreadLabel, "");
  assert.equal(view.detail.summary, "已生成一段待复核的关系对话，收件人是李明。");
  assert.equal(view.detail.safetyText, "这里先写草稿。未经确认，不会发送消息或创建日程。");
  assert.deepEqual(view.detail.sourceLabels, ["待复核草稿"]);
});

test("buildRelationshipThreadDraftRequest validates contact draft inputs", () => {
  assert.deepEqual(
    buildRelationshipThreadDraftRequest({
      body: "",
      contactId: "contact_001",
      organization: "",
      participantName: "",
      subject: ""
    }),
    {
      error: "先写收件人。",
      success: false
    }
  );

  assert.deepEqual(
    buildRelationshipThreadDraftRequest({
      body: " 李明您好，我想继续聊关西渠道合作。 ",
      contactId: "contact_001",
      organization: " 红桥科技 ",
      participantName: " 李明 ",
      subject: " 关于关西合作的跟进 "
    }),
    {
      request: {
        body: {
          body: "李明您好，我想继续聊关西渠道合作。",
          contactId: "contact_001",
          organization: "红桥科技",
          participantName: "李明",
          sourceLabel: "移动端关系草稿",
          subject: "关于关西合作的跟进"
        },
        endpoint: "/api/chat/relationship-inbox"
      },
      success: true
    }
  );
});

test("relationshipAlertsToView maps reminders and proactive turns without provider copy", () => {
  const view = relationshipAlertsToView(
    {
      reminders: [
        {
          reminderId: "notification_001",
          contactName: "山崎 美穂",
          organization: "Aoba Technologies",
          title: "Review follow-up for contact_021",
          dueAt: "2026-07-02T09:00:00+09:00",
          priority: "high",
          recommendedWindow: "Review before the scheduled in-app reminder",
          source: {
            label: "Generated relationship mockdata fixture"
          }
        }
      ],
      summary: "Live storage generated reminder queue entries."
    },
    {
      message: {
        content:
          "你明天 10:00 要见 Sarah。我把它放在 Orbit AI 里提醒你，是因为这次会面和关系经营有关：Sarah wants to discuss climate fintech partnerships. 建议你先准备关系上下文，再决定是否起草后续消息。",
        messageId: "proactive-message:signal:calendar:sarah-breakfast"
      },
      signal: {
        body: "Sarah wants to discuss climate fintech partnerships.",
        occursAt: "2026-07-02T10:00:00.000Z",
        title: "Breakfast with Sarah tomorrow"
      },
      suggestedActions: [
        {
          label: "Prepare relationship context",
          targetSurface: "contacts"
        }
      ]
    }
  );

  assert.deepEqual(view, {
    alerts: [
      {
        detail: "Aoba Technologies",
        dueLabel: "7月2日 周四 09:00",
        id: "notification_001",
        kind: "reminder",
        priorityLabel: "高优先级",
        title: "跟进山崎 美穂"
      },
      {
        detail:
          "你明天 10:00 要见 Sarah。我把它放在 Orbit AI 里提醒你，是因为这次会面和关系经营有关：Sarah wants to discuss climate fintech partnerships. 建议你先准备关系上下文，再决定是否起草后续消息。",
        dueLabel: "7月2日 周四 10:00",
        id: "proactive-message:signal:calendar:sarah-breakfast",
        kind: "proactive",
        priorityLabel: "需要准备",
        title: "明天 10:00 见 Sarah"
      }
    ],
    safetyText: "这些只是提醒，不会发送推送、邮件或短信。",
    summary: "2 条提醒"
  });
});
