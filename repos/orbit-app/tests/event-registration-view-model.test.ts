import assert from "node:assert/strict";
import test from "node:test";
import {
  eventRegistrationCancelPath,
  eventAdmissionApplicationPath,
  eventRegistrationInterviewPath,
  eventRegistrationPersonaPath,
  eventRegistrationPath
} from "../src/api/endpoints";
import {
  buildEventRegistrationAdaptiveBody,
  buildEventRegistrationAnswers,
  eventAdmissionApplicationMatches,
  eventAdmissionApplicationResponses,
  eventRegistrationAdaptiveStepToView,
  eventAdmissionWithdrawalMatches,
  eventRegistrationAuthorityKey,
  eventRegistrationPersonaToView,
  eventRegistrationQuestionKey,
  eventRegistrationReceiptMatches,
  eventRegistrationToView
} from "../src/view-models/event-registration";

test("registration eligibility maps every server state without using the device clock", () => {
  const rows = [
    ["not_open", [], "报名尚未开放", false, "等待开放"],
    ["registration_closed", [], "报名已截止", false, "报名已截止"],
    ["event_ended", [], "活动已结束", false, "活动已结束"],
    ["event_cancelled", [], "活动已取消", false, "活动已取消"],
    ["full", [], "名额已满", false, "名额已满"],
    ["open", ["apply"], "尚未申请", false, "提交审核申请"],
    ["pending_review", ["withdraw"], "待审核", true, "等待审核"],
    ["waitlisted", ["withdraw"], "候补中", true, "当前候补"],
    ["registered", ["cancel"], "已报名", true, "报名资料不可修改"],
    ["registration_cancelled", ["reactivate"], "已取消", false, "重新报名"],
    ["unavailable", [], "资格暂不可用", false, "暂不可操作"],
  ] as const;

  for (const [state, allowedActions, label, canCancel, actionLabel] of rows) {
    const view = eventRegistrationToView({
      eligibility: {
        allowedActions,
        applicationVersion: state === "pending_review" ? 2 : null,
        evaluatedAt: "2038-01-19T03:14:07.000Z",
        policyVersion: null,
        reason: state,
        registrationVersion: "2026-09-15T00:00:00.000Z",
        state,
      },
      questionSet: { questions: [] },
      registration: null,
    });
    assert.equal(view.statusLabel, label);
    assert.equal(view.canCancel, canCancel);
    assert.equal(view.confirmLabel, actionLabel);
    assert.deepEqual(view.allowedActions, allowedActions);
    assert.equal(view.eligibilityEvaluatedAt, "2038-01-19T03:14:07.000Z");
  }
});

test("registration authority identity changes with permissions and server versions", () => {
  const view = eventRegistrationToView({
    eligibility: {
      allowedActions: ["update", "cancel"],
      applicationVersion: null,
      evaluatedAt: "2026-09-15T00:00:00.000Z",
      policyVersion: null,
      reason: "registered",
      registrationVersion: "version:1",
      state: "registered",
    },
    questionSet: { questions: [] },
    registration: { status: "rsvped" },
  });
  assert.notEqual(
    eventRegistrationAuthorityKey(view),
    eventRegistrationAuthorityKey({
      ...view,
      allowedActions: ["cancel"],
      registrationVersion: "version:2",
    }),
  );
});

test("registration question identity excludes answers but tracks published and legacy question changes", () => {
  const view = eventRegistrationToView({ questionSet: { questionSetHash: "a".repeat(64), questionSetVersion: 1, questions: [{ id: "target_attendees", participantProfileField: "targetAttendees", prompt: "Who?", required: true, options: ["Founders"] }] } });
  assert.equal(eventRegistrationQuestionKey(view), eventRegistrationQuestionKey({ ...view, questions: view.questions.map(question => ({ ...question, answer: "Different saved answer" })) }));
  for (const patch of [{ questionSetHash: "b".repeat(64) }, { questionSetVersion: 2 }, { questions: view.questions.map(question => ({ ...question, prompt: "What?" })) }, { questions: [] }]) {
    assert.notEqual(eventRegistrationQuestionKey(view), eventRegistrationQuestionKey({ ...view, ...patch }));
  }
});

test("registration receipt must belong to the current actor and event with the intended status", () => {
  const receipt = { id: "registration:1", eventId: "event:1", userId: "actor:1", status: "rsvped", participantProfileId: "profile:1", participantProfile: { id: "profile:1", eventId: "event:1", userId: "actor:1", answers: { targetAttendees: "Founders" } } };
  assert.equal(eventRegistrationReceiptMatches(receipt, "event:1", "actor:1", "rsvped"), true);
  assert.equal(eventRegistrationReceiptMatches({ ...receipt, status: "cancelled" }, "event:1", "actor:1", "cancelled"), true);
  for (const patch of [{ id: "" }, { eventId: "other" }, { userId: "other" }, { status: "cancelled" }, { participantProfile: null }, { participantProfile: { ...receipt.participantProfile, userId: "other" } }, { participantProfileId: "other" }, { participantProfile: { ...receipt.participantProfile, answers: null } }]) {
    assert.equal(eventRegistrationReceiptMatches({ ...receipt, ...patch }, "event:1", "actor:1", "rsvped"), false);
  }
  for (const data of [null, [], {}, "success"]) assert.equal(eventRegistrationReceiptMatches(data, "event:1", "actor:1", "rsvped"), false);
});

test("registration mutation receipts and admission withdrawals must match the current action version", () => {
  const receipt = {
    eventId: "event:1",
    id: "registration:1",
    mutationReceipt: {
      action: "update",
      actorId: "actor:1",
      eventId: "event:1",
      recordId: "registration:1",
      registrationVersion: "version:2"
    },
    participantProfile: {
      answers: {}, eventId: "event:1", id: "profile:1", userId: "actor:1"
    },
    participantProfileId: "profile:1",
    status: "rsvped",
    updatedAt: "version:2",
    userId: "actor:1"
  };
  assert.equal(eventRegistrationReceiptMatches(receipt, "event:1", "actor:1", "rsvped", "update"), true);
  assert.equal(eventRegistrationReceiptMatches(receipt, "event:1", "actor:1", "rsvped", "reactivate"), false);
  assert.equal(eventAdmissionWithdrawalMatches({ actorId: "actor:1", eventId: "event:1", status: "withdrawn", applicationVersion: 3 }, "event:1", "actor:1", 2), true);
  assert.equal(eventAdmissionWithdrawalMatches({ actorId: "actor:1", eventId: "event:1", status: "withdrawn", applicationVersion: 2 }, "event:1", "actor:1", 2), false);
});

test("admission application receipts and signed responses stay actor/event scoped", () => {
  const turns = [
    {
      answer: "  日本产业伙伴  ",
      field: "targetAttendees",
      prompt: "想认识谁？",
      questionToken: "signed-target"
    },
    {
      answer: "产品工程经验",
      field: "valueOffered",
      prompt: "能提供什么？",
      questionToken: "signed-value"
    },
    {
      answer: "unsigned",
      field: "desiredOutcome",
      prompt: "结果？"
    }
  ];
  assert.deepEqual(eventAdmissionApplicationResponses(turns), [
    { answer: "日本产业伙伴", questionToken: "signed-target" },
    { answer: "产品工程经验", questionToken: "signed-value" }
  ]);
  const receipt = {
    actorId: "actor:1",
    applicationVersion: 1,
    eventId: "event:1",
    status: "pending_review"
  };
  assert.equal(eventAdmissionApplicationMatches(receipt, "event:1", "actor:1"), true);
  assert.equal(eventAdmissionApplicationMatches({ ...receipt, actorId: "other" }, "event:1", "actor:1"), false);
  assert.equal(eventAdmissionApplicationMatches({ ...receipt, eventId: "other" }, "event:1", "actor:1"), false);
  assert.equal(eventAdmissionApplicationMatches({ ...receipt, applicationVersion: 0 }, "event:1", "actor:1"), false);
  assert.equal(eventAdmissionApplicationMatches({ ...receipt, status: "withdrawn" }, "event:1", "actor:1"), false);
});

test("event registration endpoint helpers URL-encode ids", () => {
  assert.equal(
    eventAdmissionApplicationPath("event/with space"),
    "/api/events/event%2Fwith%20space/admission/application"
  );
  assert.equal(
    eventRegistrationPath("event/with space"),
    "/api/events/event%2Fwith%20space/registration"
  );
  assert.equal(
    eventRegistrationCancelPath("event/with space"),
    "/api/events/event%2Fwith%20space/registration/cancel"
  );
  assert.equal(
    eventRegistrationInterviewPath("event/with space"),
    "/api/events/event%2Fwith%20space/registration/interview"
  );
  assert.equal(
    eventRegistrationPersonaPath("event/with space"),
    "/api/events/event%2Fwith%20space/registration/persona"
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
    questionSetHash: null,
    questionSetVersion: null,
    questions: [
      {
        answer: "",
        field: "targetAttendees",
        id: "target_attendees",
        options: ["投资人", "日本本地 SaaS 买方", "跨境渠道方"],
        prompt: "这场活动里，你最想认识哪类人？",
        required: false
      },
      {
        answer: "",
        field: "valueOffered",
        id: "value_offered",
        options: ["AI 落地经验", "企业客户介绍"],
        prompt: "你可以为别人提供什么？",
        required: false
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

test("buildEventRegistrationAdaptiveBody keeps answered registration fields as transcript", () => {
  assert.deepEqual(
    buildEventRegistrationAdaptiveBody(
      [
        {
          answer: "",
          field: "targetAttendees",
          id: "target_attendees",
          options: [],
          prompt: "想认识谁？"
        },
        {
          answer: "",
          field: "valueOffered",
          id: "value_offered",
          options: [],
          prompt: "能提供什么？"
        }
      ],
      {
        ignored: "should not ship",
        targetAttendees: "  日本企业客户  ",
        valueOffered: ""
      },
      [
        {
          answer: "我能介绍企业 AI 落地案例",
          field: "valueOffered",
          prompt: "你能给别人带来什么？"
        }
      ]
    ),
    {
      language: "zh",
      transcript: [
        {
          answer: "日本企业客户",
          field: "targetAttendees",
          prompt: "想认识谁？"
        },
        {
          answer: "我能介绍企业 AI 落地案例",
          field: "valueOffered",
          prompt: "你能给别人带来什么？"
        }
      ]
    }
  );
});

test("eventRegistrationAdaptiveStepToView maps the web interview step", () => {
  assert.deepEqual(
    eventRegistrationAdaptiveStepToView({
      done: false,
      signedQuestion: {
        questionToken: "signed-question-token",
        question: {
          acknowledgment: "明白，你更关心日本企业买方。",
          field: "desiredOutcome",
          options: ["约到会后电话", "找到试点客户"],
          prompt: "这场活动结束时，你希望拿到什么具体结果？",
          provenance: {
            fallbackReason: null,
            generationMethod: "orbit-agent-model-adaptive",
            model: "gemini",
            provider: "google"
          }
        }
      }
    }),
    {
      done: false,
      question: {
        acknowledgment: "明白，你更关心日本企业买方。",
        field: "desiredOutcome",
        options: ["约到会后电话", "找到试点客户"],
        prompt: "这场活动结束时，你希望拿到什么具体结果？",
        questionToken: "signed-question-token"
      },
      statusText: "继续补充画像"
    }
  );
});

test("eventRegistrationPersonaToView maps a generated attendee persona", () => {
  const view = eventRegistrationPersonaToView({
    persona: {
      energyStyle: "小圈子深聊型",
      industryTags: ["AI", "企业服务"],
      offering: "可以分享企业 AI 落地和日本市场连接。",
      openers: [
        "你现在最想把 AI 用在哪个业务环节？",
        "这次活动后，你希望继续聊哪类合作？"
      ],
      provenance: {
        fallbackReason: null,
        generationMethod: "orbit-agent-model-adaptive",
        model: "gemini",
        provider: "google"
      },
      seeking: "想认识正在做 AI 试点的日本企业和本地合作伙伴。",
      tagline: "帮企业把 AI 接进真实业务的人",
      tags: ["企业 AI", "日本市场", "B2B 合作"]
    }
  });

  assert.deepEqual(view, {
    energyStyle: "小圈子深聊型",
    industryTags: ["AI", "企业服务"],
    nextAction: "检查这段介绍。确认报名后，它只服务这场活动的匹配。",
    offering: "可以分享企业 AI 落地和日本市场连接。",
    openers: [
      "你现在最想把 AI 用在哪个业务环节？",
      "这次活动后，你希望继续聊哪类合作？"
    ],
    safetyText: "不会写入个人主页，也不会自动发消息。",
    seeking: "想认识正在做 AI 试点的日本企业和本地合作伙伴。",
    tagline: "帮企业把 AI 接进真实业务的人",
    tags: ["企业 AI", "日本市场", "B2B 合作"],
    title: "活动画像"
  });
});
