import assert from "node:assert/strict";
import test from "node:test";

import {
  eventReadinessToView,
  eventRecommendationsToView
} from "../src/view-models/events";

test("eventReadinessToView maps readiness payloads into Chinese preparation cards", () => {
  const view = eventReadinessToView({
    success: true,
    data: {
      goal: {
        intent:
          "Meet two operators. / 会前锁定两位能聊 AI 降本试点的企业负责人。 / 事前に担当者を確認する。"
      },
      nextAction:
        "Confirm the follow-up owner before using this goal in product event prep.",
      preparationState: {
        nextPreparationStep:
          "JA: 確認してください。 ZH: 先确认会后跟进负责人，再带着目标入场。 EN: Confirm owner.",
        readinessScore: 75
      },
      readinessChecklist: [
        {
          itemId: "readiness:relationship-brief",
          label:
            "Relationship brief reviewed / 已看过重点关系背景 / 関係メモを確認",
          owner: "operator",
          rationale:
            "Local evidence includes the operator context needed before new introductions.",
          status: "ready"
        },
        {
          itemId: "readiness:follow-up-owner",
          label: "Follow-up owner confirmed",
          owner: "operator",
          rationale:
            "provider generated fixture text should not appear in mobile UI",
          status: "pending"
        }
      ],
      state: "success",
      summary: "source-backed readiness fixture should stay internal"
    }
  });

  assert.deepEqual(view, {
    checklist: [
      {
        detail: "准备项已完成。",
        id: "readiness:relationship-brief",
        ownerLabel: "我来确认",
        statusLabel: "已准备",
        title: "已看过重点关系背景"
      },
      {
        detail: "需要会前再确认。",
        id: "readiness:follow-up-owner",
        ownerLabel: "我来确认",
        statusLabel: "待确认",
        title: "确认会后跟进负责人"
      }
    ],
    goal: "会前锁定两位能聊 AI 降本试点的企业负责人。",
    nextAction: "先确认会后跟进负责人，再带着目标入场。",
    scoreLabel: "75%",
    stateLabel: "准备中"
  });
});

test("eventRecommendationsToView maps recommended attendees and opening lines", () => {
  const view = eventRecommendationsToView({
    data: {
      nextAction:
        "Ask Mina about one rollout blocker, then capture source notes before any follow-up.",
      recommendations: [
        {
          attendee: {
            attendeeId: "attendee:mina-park",
            displayName: "Mina Park",
            organization: "Grid Harbor",
            relationshipContext:
              "Mina is evaluating storage pilot rollout blockers for climate operators.",
            role: "Head of operator partnerships"
          },
          openingLine: {
            text:
              "Mina, your storage pilot work came up in the climate dinner context. I would like to compare notes on operator rollout blockers."
          },
          rank: 1,
          reasons: [
            "Storage pilot work overlaps with the event goal.",
            "fixture provider detail should be hidden"
          ],
          recommendationId: "event-rec:demo-event-1:mina-park",
          recommendedAction:
            "Ask Mina about one rollout blocker, then capture source notes before any follow-up.",
          score: 94,
          scoreBand: "high"
        },
        {
          attendee: {
            attendeeId: "attendee:li-wei",
            displayName: "李伟",
            organization: "Osaka Retail Lab",
            relationshipContext:
              "ZH: 对日本零售自动化和 AI 降本试点感兴趣。 EN: Interested in retail automation.",
            role: "运营负责人"
          },
          openingLine: {
            text:
              "ZH: 可以从日本零售门店的 AI 降本试点聊起，先交换一个最具体的流程痛点。 EN: Start with AI workflow."
          },
          rank: 2,
          reasons: ["ZH: 需求和你能提供的企业 AI 试点路径匹配。 EN: Fit."],
          recommendationId: "event-rec:demo-event-1:li-wei",
          recommendedAction:
            "ZH: 现场先约 10 分钟，确认是否适合后续引荐。 EN: Talk on site.",
          score: 86,
          scoreBand: "high"
        }
      ],
      state: "success",
      summary: "Event recommendations"
    },
    success: true
  });

  assert.deepEqual(view, {
    nextAction: "先挑 1-2 个最值得见的人，现场确认后再继续跟进。",
    people: [
      {
        id: "event-rec:demo-event-1:mina-park",
        name: "Mina Park",
        opener:
          "可以从对方的业务背景切入，先问一个具体问题，再判断是否适合继续聊。",
        organizationRole: "Grid Harbor · Head of operator partnerships",
        rankLabel: "第 1 位",
        reason: "对方背景和这场活动目标匹配。",
        scoreLabel: "94%",
        suggestedAction: "现场先约 10 分钟，确认是否适合后续引荐。"
      },
      {
        id: "event-rec:demo-event-1:li-wei",
        name: "李伟",
        opener: "可以从日本零售门店的 AI 降本试点聊起，先交换一个最具体的流程痛点。",
        organizationRole: "Osaka Retail Lab · 运营负责人",
        rankLabel: "第 2 位",
        reason: "需求和你能提供的企业 AI 试点路径匹配。",
        scoreLabel: "86%",
        suggestedAction: "现场先约 10 分钟，确认是否适合后续引荐。"
      }
    ],
    title: "推荐认识的人"
  });
});
