import assert from "node:assert/strict";
import test from "node:test";

import {
  buildEventAdmissionDecisionBody,
  eventAdmissionApplicationToView,
  eventAdmissionReviewListToView
} from "../src/view-models/event-admission-review";

const answers = {
  desiredOutcome: "找到两位可共同验证采购路径的伙伴",
  energyStyle: "先倾听，再围绕案例深入讨论",
  experienceHighlight: "完成三个中日工业 AI 商业化项目",
  followUpPreference: "48 小时内邮件纪要",
  industry: "工业 AI 与气候科技",
  positioning: "跨境产品与生态合作负责人",
  targetAttendees: "制造业采购负责人和渠道伙伴",
  valueOffered: "市场进入经验、采购链洞察与产业引荐"
};

test("admission review maps the canonical pending queue", () => {
  const view = eventAdmissionReviewListToView({
    items: [{
      actorId: "actor:aiko",
      applicationVersion: 3,
      decidedAt: null,
      decisionActorId: null,
      displayName: "森爱子",
      status: "pending_review",
      submittedAt: "2026-08-05T09:05:00.000Z",
      updatedAt: "2026-08-05T09:05:00.000Z"
    }],
    nextCursor: "opaque-cursor",
    total: 1,
    view: "pending"
  });

  assert.equal(view.view, "pending");
  assert.equal(view.total, 1);
  assert.equal(view.nextCursor, "opaque-cursor");
  assert.equal(view.items[0]?.displayName, "森爱子");
  assert.equal(view.items[0]?.statusLabel, "待审核");
});

test("admission detail preserves all eight profile answers and the decision version", () => {
  const view = eventAdmissionApplicationToView({
    actorId: "actor:aiko",
    applicationVersion: 3,
    decidedAt: null,
    decisionActorId: null,
    eventId: "event:tokyo",
    policyVersion: 2,
    profilePayload: {
      answers,
      displayName: "森爱子",
      interviewResponses: [{
        answer: { displayText: "希望验证日本制造集团的采购决策路径" },
        answeredAt: "2026-08-05T09:00:00.000Z",
        field: "desiredOutcome",
        question: { prompt: "什么结果会让你觉得值得？" },
        responseId: "response:desired-outcome"
      }]
    },
    status: "pending_review",
    submittedAt: "2026-08-05T09:05:00.000Z",
    updatedAt: "2026-08-05T09:05:00.000Z"
  });

  assert.ok(view);
  assert.equal(view.profileFields.length, 8);
  assert.deepEqual(
    view.profileFields.map((field) => field.label),
    ["身份定位", "所在行业", "希望认识的人", "我能提供", "本次目标", "交流方式", "代表经历", "后续偏好"]
  );
  assert.equal(view.interviewResponses[0]?.answer, "希望验证日本制造集团的采购决策路径");
  assert.deepEqual(buildEventAdmissionDecisionBody(view, "approve"), {
    decision: "approve",
    expectedApplicationVersion: 3
  });
});

test("admission review drops malformed records instead of inventing applicants", () => {
  const view = eventAdmissionReviewListToView({
    items: [null, {}, { actorId: "actor:missing-fields" }],
    nextCursor: null,
    total: 3,
    view: "pending"
  });

  assert.deepEqual(view.items, []);
  assert.equal(view.total, 3);
  assert.equal(eventAdmissionApplicationToView({ actorId: "broken" }), null);
});
