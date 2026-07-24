import assert from "node:assert/strict";
import test from "node:test";
import {
  eventRegistrationCancelPath,
  eventRegistrationPath
} from "../src/api/endpoints";
import {
  buildEventRegistrationAnswers,
  eventRegistrationToView
} from "../src/view-models/event-registration";

test("event registration endpoint helpers URL-encode ids", () => {
  assert.equal(
    eventRegistrationPath("event/with space"),
    "/api/events/event%2Fwith%20space/registration"
  );
  assert.equal(
    eventRegistrationCancelPath("event/with space"),
    "/api/events/event%2Fwith%20space/registration/cancel"
  );
});

test("eventRegistrationToView maps empty registration and questions", () => {
  const view = eventRegistrationToView({
    questionSet: {
      provenance: {
        aiProviderRequested: true,
        externalNetworkRequested: false,
        fallbackReason: null,
        generationMethod: "orbit-agent-model-customized",
        model: "internal-model",
        provider: "provider"
      },
      questions: [
        {
          id: "target_attendees",
          intent: "target_attendees",
          optional: true,
          options: ["投资人", "日本本地 SaaS 买方", "跨境渠道方"],
          participantProfileField: "targetAttendees",
          prompt: "这场活动里，你最想认识哪类人？"
        },
        {
          id: "value_offered",
          intent: "value_offered",
          optional: true,
          options: ["AI 落地经验", "企业客户介绍"],
          participantProfileField: "valueOffered",
          prompt: "你可以为别人提供什么？"
        }
      ]
    },
    registration: null
  });

  assert.deepEqual(view, {
    canCancel: false,
    confirmLabel: "确认报名",
    questions: [
      {
        answer: "",
        field: "targetAttendees",
        id: "target_attendees",
        options: ["投资人", "日本本地 SaaS 买方", "跨境渠道方"],
        prompt: "这场活动里，你最想认识哪类人？"
      },
      {
        answer: "",
        field: "valueOffered",
        id: "value_offered",
        options: ["AI 落地经验", "企业客户介绍"],
        prompt: "你可以为别人提供什么？"
      }
    ],
    statusDetail: "确认后只保存这场活动的参与资料。",
    statusLabel: "尚未报名"
  });
});

test("eventRegistrationToView maps existing registration answers", () => {
  const view = eventRegistrationToView({
    questionSet: {
      questions: [
        {
          id: "desired_outcome",
          options: ["找到日本客户"],
          participantProfileField: "desiredOutcome",
          prompt: "这次参加活动，希望拿到什么结果？"
        }
      ]
    },
    registration: {
      participantProfile: {
        answers: {
          desiredOutcome: "找到 2 个可以继续聊的日本客户"
        }
      },
      sideEffects: {
        calendarUpdateExecuted: false,
        emailSent: false,
        globalProfileWriteExecuted: false,
        notificationDelivered: false,
        organizerMessageSent: false,
        refundRequested: false
      },
      status: "rsvped"
    }
  });

  assert.equal(view.statusLabel, "已报名");
  assert.equal(view.statusDetail, "不会写入个人主页，也不会自动发消息。");
  assert.equal(view.confirmLabel, "更新报名资料");
  assert.equal(view.canCancel, true);
  assert.equal(view.questions[0]?.answer, "找到 2 个可以继续聊的日本客户");
});

test("eventRegistrationToView shortens mixed-language event-title prompts", () => {
  const view = eventRegistrationToView({
    questionSet: {
      questions: [
        {
          id: "current_work",
          options: ["正在探索"],
          participantProfileField: "currentWork",
          prompt:
            "参加「日中投资家・创业者申込サロン / Japan-China Investor Founder Signup Salon」时，你希望其他参与者如何理解你目前正在做的事？"
        },
        {
          id: "target_attendees",
          options: ["创业者"],
          participantProfileField: "targetAttendees",
          prompt:
            "在「日中投资家・创业者申込サロン / Japan-China Investor Founder Signup Salon」中遇见哪类人，会让这次参加对你最有价值？"
        },
        {
          id: "value_offered",
          options: ["相关引荐"],
          participantProfileField: "valueOffered",
          prompt:
            "在「日中投资家・创业者申込サロン / Japan-China Investor Founder Signup Salon」认识新朋友时，你最适合为对方提供什么？"
        }
      ]
    },
    registration: null
  });

  assert.equal(
    view.questions[0]?.prompt,
    "参加这场活动时，你希望其他参与者如何理解你目前正在做的事？"
  );
  assert.equal(
    view.questions[1]?.prompt,
    "在这场活动中遇见哪类人，会让这次参加对你最有价值？"
  );
  assert.equal(
    view.questions[2]?.prompt,
    "在这场活动认识新朋友时，你最适合为对方提供什么？"
  );
});

test("buildEventRegistrationAnswers trims answers and keeps known fields", () => {
  assert.deepEqual(
    buildEventRegistrationAnswers(
      [
        {
          field: "targetAttendees",
          id: "target_attendees",
          options: [],
          prompt: "想认识谁？",
          answer: ""
        },
        {
          field: "valueOffered",
          id: "value_offered",
          options: [],
          prompt: "能提供什么？",
          answer: ""
        }
      ],
      {
        ignored: "should not ship",
        targetAttendees: "  日本市场客户  ",
        valueOffered: ""
      }
    ),
    {
      targetAttendees: "日本市场客户"
    }
  );
});
