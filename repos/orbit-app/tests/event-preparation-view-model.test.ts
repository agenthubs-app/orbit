import assert from "node:assert/strict";
import test from "node:test";

import {
  eventGoalRequestFromReadiness,
  eventOpeningLineToView,
  eventPostEventConfirmRequestFromReview,
  eventPostEventConfirmToView,
  eventPostEventReviewToView,
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
    canConfirmGoal: true,
    goal: "会前锁定两位能聊 AI 降本试点的企业负责人。",
    nextAction: "先确认会后跟进负责人，再带着目标入场。",
    scoreLabel: "75%",
    selectedSuggestionId: "",
    stateLabel: "准备中",
    suggestedGoals: []
  });
});

test("eventReadinessToView exposes selectable Chinese goal suggestions", () => {
  const view = eventReadinessToView({
    data: {
      goal: {
        intent: "ZH: 会前锁定两位企业 AI 试点负责人。",
        selectedSuggestionId: "goal:demo-event-1:ai-operators"
      },
      preparationState: {
        readinessScore: 70
      },
      readinessChecklist: [],
      suggestedGoals: [
        {
          goalId: "goal:demo-event-1:ai-operators",
          intent:
            "EN: Meet AI operators. ZH: 会前锁定两位企业 AI 试点负责人。",
          label: "EN: Operator intros ZH: 企业 AI 试点",
          rationale:
            "EN: Event roster has operators. ZH: 参会名单里有能聊 AI 试点的企业负责人。"
        },
        {
          goalId: "goal:demo-event-1:provider-copy",
          intent: "provider fixture goal should not appear",
          label: "provider fixture label",
          rationale: "provider generated rationale"
        }
      ]
    },
    success: true
  });

  assert.deepEqual(view.suggestedGoals, [
    {
      detail: "参会名单里有能聊 AI 试点的企业负责人。",
      goalText: "会前锁定两位企业 AI 试点负责人。",
      id: "goal:demo-event-1:ai-operators",
      selected: true,
      title: "企业 AI 试点"
    }
  ]);
  assert.equal(view.selectedSuggestionId, "goal:demo-event-1:ai-operators");
});

test("eventGoalRequestFromReadiness builds the web goal update body", () => {
  const readiness = eventReadinessToView({
    data: {
      goal: {
        intent:
          "EN: Meet two operators. ZH: 会前锁定两位能聊 AI 降本试点的企业负责人。"
      },
      preparationState: {
        readinessScore: 60
      },
      readinessChecklist: []
    },
    success: true
  });

  assert.deepEqual(eventGoalRequestFromReadiness(readiness), {
    goalText: "会前锁定两位能聊 AI 降本试点的企业负责人。"
  });
});

test("eventGoalRequestFromReadiness can submit a selected suggestion or custom text", () => {
  const readiness = eventReadinessToView({
    data: {
      goal: {
        intent: "ZH: 会前锁定两位企业 AI 试点负责人。",
        selectedSuggestionId: "goal:demo-event-1:ai-operators"
      },
      preparationState: {
        readinessScore: 60
      },
      readinessChecklist: [],
      suggestedGoals: [
        {
          goalId: "goal:demo-event-1:ai-operators",
          intent: "ZH: 会前锁定两位企业 AI 试点负责人。",
          label: "ZH: 企业 AI 试点",
          rationale: "ZH: 适合这场活动的参会名单。"
        }
      ]
    },
    success: true
  });

  assert.deepEqual(
    eventGoalRequestFromReadiness(readiness, {
      goalText: "确认三位能介绍制造业客户的人。",
      selectedSuggestionId: "goal:demo-event-1:ai-operators"
    }),
    {
      goalText: "确认三位能介绍制造业客户的人。",
      selectedSuggestionId: "goal:demo-event-1:ai-operators"
    }
  );
  assert.equal(
    eventGoalRequestFromReadiness(readiness, {
      goalText: "   ",
      selectedSuggestionId: "goal:demo-event-1:ai-operators"
    }),
    null
  );
});

test("eventReadinessToView does not allow confirming a placeholder goal", () => {
  const readiness = eventReadinessToView({
    data: {
      goal: null,
      preparationState: {
        readinessScore: 20
      },
      readinessChecklist: []
    },
    success: true
  });

  assert.equal(readiness.canConfirmGoal, false);
  assert.equal(eventGoalRequestFromReadiness(readiness), null);
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
        attendeeId: "attendee:mina-park",
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
        attendeeId: "attendee:li-wei",
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

test("eventOpeningLineToView maps refreshed opening-line payloads into Chinese copy", () => {
  const view = eventOpeningLineToView({
    data: {
      nextAction:
        "Review the refreshed opener before using it in an on-site conversation.",
      openingLine: {
        text:
          "EN: Ask about rollout blockers. ZH: 可以从关西渠道落地聊起，先问对方最近最想验证的客户场景。 JA: 確認する。"
      },
      state: "success",
      summary: "provider generated opening-line details should stay internal"
    },
    success: true
  });

  assert.deepEqual(view, {
    opener: "可以从关西渠道落地聊起，先问对方最近最想验证的客户场景。",
    statusLabel: "开场白已更新"
  });
});

test("eventPostEventReviewToView maps post-event contacts into Chinese review cards", () => {
  const view = eventPostEventReviewToView({
    data: {
      contacts: [
        {
          contactDraftId: "draft:post-event:priya",
          displayName: "Priya Shah",
          followUpSuggestion: {
            messageDraft:
              "Priya, good meeting you at the dinner. I can make the storage pilot introduction.",
            urgency: "today"
          },
          organization: "Solace Battery",
          role: "CEO",
          summary: {
            context:
              "The encounter note says Priya asked for a storage pilot introduction.",
            headline: "Priya needs a storage pilot founder introduction.",
            whyNow: "The request came directly after the dinner."
          },
          tags: [
            { label: "storage pilot" },
            { label: "founder intro" }
          ]
        },
        {
          contactDraftId: "draft:post-event:li-wei",
          displayName: "李伟",
          followUpSuggestion: {
            messageDraft:
              "EN: Follow up later. ZH: 李伟，刚才聊到日本零售门店的 AI 试点，我可以先帮你对接一位懂落地流程的人。",
            urgency: "this_week"
          },
          organization: "Osaka Retail Lab",
          role: "运营负责人",
          summary: {
            context:
              "EN: Retail automation. ZH: 现场聊到了日本零售门店的 AI 降本试点。",
            headline:
              "EN: Retail AI pilot. ZH: 李伟适合进入活动后的重点复核。",
            whyNow:
              "EN: Follow up soon. ZH: 趁活动背景还清楚，先确认是否值得继续引荐。"
          },
          tags: [
            { label: "ZH: 零售自动化 EN: retail" },
            { label: "AI 试点" }
          ]
        }
      ],
      event: {
        title: "Climate founders dinner"
      },
      nextAction:
        "Review each new contact, confirm useful records, then draft follow-up copy.",
      state: "success",
      summary:
        "Two new contacts are ready for post-event review with summaries and follow-up suggestions."
    },
    success: true
  });

  assert.deepEqual(view, {
    contactCountLabel: "2 位待复核",
    contacts: [
      {
        followUpDraft: "先写一段简短跟进，确认对方是否愿意继续聊。",
        headline: "活动后有一位新联系人需要复核。",
        id: "draft:post-event:priya",
        name: "Priya Shah",
        organizationRole: "Solace Battery · CEO",
        tags: ["活动后", "待复核"],
        urgencyLabel: "今天处理",
        whyNow: "趁活动背景还清楚，先判断是否值得继续跟进。"
      },
      {
        followUpDraft:
          "李伟，刚才聊到日本零售门店的 AI 试点，我可以先帮你对接一位懂落地流程的人。",
        headline: "李伟适合进入活动后的重点复核。",
        id: "draft:post-event:li-wei",
        name: "李伟",
        organizationRole: "Osaka Retail Lab · 运营负责人",
        tags: ["零售自动化", "AI 试点"],
        urgencyLabel: "本周处理",
        whyNow: "趁活动背景还清楚，先确认是否值得继续引荐。"
      }
    ],
    nextAction: "先复核这些联系人，再决定是否保留记录或写跟进草稿。",
    stateLabel: "会后待复核",
    title: "会后复核"
  });
});

test("eventPostEventReviewToView keeps empty post-event review quiet", () => {
  const view = eventPostEventReviewToView({
    data: {
      contacts: [],
      state: "empty",
      summary: "No imported or encountered contacts are ready for review."
    },
    success: true
  });

  assert.deepEqual(view, {
    contactCountLabel: "暂无联系人",
    contacts: [],
    nextAction: "这场活动暂时没有需要复核的新联系人。",
    stateLabel: "暂无复核",
    title: "会后复核"
  });
});

test("eventPostEventConfirmRequestFromReview builds the web confirmation body", () => {
  const review = eventPostEventReviewToView({
    data: {
      contacts: [
        {
          contactDraftId: "draft:post-event:priya",
          displayName: "Priya Shah"
        },
        {
          contactDraftId: "draft:post-event:li-wei",
          displayName: "李伟"
        }
      ],
      state: "success"
    },
    success: true
  });

  assert.deepEqual(eventPostEventConfirmRequestFromReview(review), {
    contactDraftIds: ["draft:post-event:priya", "draft:post-event:li-wei"]
  });
  assert.equal(
    eventPostEventConfirmRequestFromReview({
      ...review,
      contacts: []
    }),
    null
  );
});

test("eventPostEventConfirmToView maps confirmation payloads into guarded Chinese feedback", () => {
  const view = eventPostEventConfirmToView({
    data: {
      confirmedContacts: [
        {
          contactDraftId: "draft:post-event:priya",
          contactId: "contact:priya-shah",
          displayName: "Priya Shah"
        },
        {
          contactDraftId: "draft:post-event:li-wei",
          contactId: "contact:li-wei",
          displayName: "李伟"
        }
      ],
      nextAction:
        "Route any follow-up send through a separate confirmation guard before external action execution.",
      state: "confirmed",
      summary:
        "The selected post-event contacts were confirmed inside the mock boundary without batch persistence."
    },
    success: true
  });

  assert.deepEqual(view, {
    confirmedCountLabel: "2 位已确认",
    feedback: "已确认 2 位候选。跟进发送仍需另外确认。",
    reviewQueueHref: "/contacts/new",
    reviewQueueLabel: "去复核联系人",
    nextAction: "先检查确认记录，再决定是否写入联系人或发送跟进。",
    title: "会后复核已确认"
  });
});
