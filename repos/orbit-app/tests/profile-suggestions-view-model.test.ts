import assert from "node:assert/strict";
import test from "node:test";

import {
  applyProfileDocumentExtractionToDraft,
  applyProfileAcceptedPatchToDraft,
  buildProfileDocumentExtractionRequest,
  profileAcceptedPatchToView,
  profileDocumentExtractionToView,
  profileSummaryToEditDraft,
  profileUpdateSuggestionsToView
} from "../src/view-models/profile";

test("buildProfileDocumentExtractionRequest prepares review-only profile extraction calls", () => {
  assert.deepEqual(
    buildProfileDocumentExtractionRequest("business-card", {
      fileName: " orbit-card.txt ",
      mimeType: " text/plain ",
      scenario: " success ",
      text: " 小雨\nOrbit 创始人 "
    }),
    {
      body: {
        fileName: "orbit-card.txt",
        mimeType: "text/plain",
        scenario: "success",
        text: "小雨\nOrbit 创始人"
      },
      endpoint: "/api/profile/extractions/business-card"
    }
  );

  assert.deepEqual(
    buildProfileDocumentExtractionRequest("resume", {
      text: " Orbit 创始人，做企业 AI 导入。 "
    }),
    {
      body: {
        text: "Orbit 创始人，做企业 AI 导入。"
      },
      endpoint: "/api/profile/extractions/resume"
    }
  );

  assert.deepEqual(
    buildProfileDocumentExtractionRequest("business-card", {
      fileName: " xiaoyu-card.jpg ",
      mimeType: " image/jpeg "
    }),
    {
      body: {
        fileName: "xiaoyu-card.jpg",
        mimeType: "image/jpeg"
      },
      endpoint: "/api/profile/extractions/business-card"
    }
  );

  assert.equal(
    buildProfileDocumentExtractionRequest("resume", { text: "   " }),
    null
  );
});

test("profileDocumentExtractionToView maps business-card drafts into Chinese review cards", () => {
  const view = profileDocumentExtractionToView({
    success: true,
    data: {
      confidenceSummary:
        "Medium confidence because the mock business card fixture has clear identity fields but lighter relationship context.",
      draft: {
        confidence: "medium",
        displayName: "Mina Sato",
        email: "mina.sato@example.test",
        evidence: [
          {
            evidenceId: "evidence:business-card-front",
            excerpt: "Mina Sato, Partnerships Lead",
            field: "displayName",
            value: "Mina Sato"
          },
          {
            evidenceId: "evidence:business-card-contact-lines",
            excerpt: "mina.sato@example.test",
            field: "email",
            value: "mina.sato@example.test"
          }
        ],
        extractedAt: "2026-01-01T00:00:00.000Z",
        headline: "Partnerships lead for event-backed founder communities",
        homeMarket: "Tokyo",
        id: "profile-document-draft_business_card_mina_sato",
        kind: "business-card",
        organization: "Northstar Events",
        phone: "+81-3-5555-0184",
        preferredFollowUpWindow: "24 hours",
        preferredIntroChannels: ["event follow-up", "email"],
        relationshipGoal:
          "Follow up after events with clear source evidence and mutual context.",
        role: "Partnerships Lead",
        suggestedProfileFields: {
          homeMarket: "Tokyo",
          preferredIntroChannels: ["event follow-up", "email"]
        },
        targetRelationshipTypes: ["event hosts", "community partners"],
        website: "https://northstar.example.test"
      },
      kind: "business-card",
      nextAction:
        "Confirm the card owner and add context from the event before creating follow-up tasks.",
      provenance: {
        collectedAt: "2026-01-01T00:00:00.000Z",
        evidenceIds: ["evidence:business-card-front"],
        extractionMethod: "fixture",
        privacy: "demo-profile-document-only",
        source: "fixture:profile",
        sourceLabel: "Mock business-card extraction fixture"
      },
      state: "success"
    }
  });

  assert.deepEqual(view, {
    confidenceLabel: "中可信",
    draft: {
      contactLine: "mina.sato@example.test · +81-3-5555-0184",
      displayName: "Mina Sato",
      evidence: [
        {
          excerpt: "Mina Sato, Partnerships Lead",
          label: "姓名"
        },
        {
          excerpt: "mina.sato@example.test",
          label: "邮箱"
        }
      ],
      id: "profile-document-draft_business_card_mina_sato",
      kindLabel: "名片",
      metaLine: "Northstar Events · 合作负责人 · 东京",
      relationshipGoal: "活动后带着明确来源和双方上下文跟进。",
      suggestedFields: [
        {
          label: "主要市场",
          value: "东京"
        },
        {
          label: "介绍渠道",
          value: "活动后跟进、邮件"
        }
      ]
    },
    nextAction: "先确认这是不是你的名片，再挑需要写进对外资料的字段。",
    stateLabel: "待复核",
    summary: "身份和联系方式比较清楚，但关系目标仍需要你确认。",
    title: "名片提取结果"
  });
});

test("profileDocumentExtractionToView handles empty document extraction states", () => {
  const view = profileDocumentExtractionToView({
    kind: "resume",
    state: "empty",
    draft: null,
    nextAction:
      "Add a resume document or paste profile text before extracting onboarding fields."
  });

  assert.equal(view.title, "简历提取结果");
  assert.equal(view.stateLabel, "暂无可提取信息");
  assert.equal(view.draft, null);
  assert.equal(view.nextAction, "换一段更完整的资料再试。");
});

test("profileUpdateSuggestionsToView maps sourced profile suggestions into Chinese cards", () => {
  const view = profileUpdateSuggestionsToView({
    success: true,
    data: {
      nextAction:
        "Review each suggestion before applying any change to the profile.",
      state: "success",
      suggestions: [
        {
          confidence: "high",
          currentValue: "Founder building a relationship operating system",
          evidence: [
            {
              evidenceId: "evidence:chat-follow-up-goal",
              excerpt:
                "Ari asks for follow-up copy that explains event-grounded relationship workflows.",
              sourceKind: "chat",
              sourceLabel: "Mock chat summary signal"
            }
          ],
          id: "demo-profile-suggestion-1",
          rationale:
            "The latest chat summary uses that phrase to explain what Ari wants Orbit to do for follow-up decisions.",
          sourceKind: "chat",
          sourceLabel: "Chat signal",
          status: "pending",
          suggestedValue:
            "Founder focused on event-grounded relationship workflows",
          targetProfileField: "headline"
        },
        {
          confidence: "medium",
          currentValue: "Tokyo",
          evidence: [
            {
              evidenceId: "evidence:contact-market-context",
              excerpt:
                "ZH: 最近联系人同时来自东京和新加坡，适合补充主要市场。 EN: Contact signal.",
              sourceKind: "contact",
              sourceLabel: "Contact signal"
            }
          ],
          id: "demo-profile-suggestion-3",
          rationale:
            "ZH: 这个建议来自最近新增联系人，不会自动修改你的档案。 EN: Source backed.",
          sourceKind: "contact",
          sourceLabel: "Contact signal",
          status: "pending",
          suggestedValue: "Tokyo and Singapore",
          targetProfileField: "homeMarket"
        }
      ],
      summary:
        "Three sourced profile suggestions are waiting for operator review."
    }
  });

  assert.deepEqual(view, {
    nextAction: "先逐条确认来源，再决定是否应用到个人资料。",
    stateLabel: "待复核",
    suggestions: [
      {
        confidenceLabel: "高可信",
        canAccept: true,
        currentValue: "围绕关系系统创业",
        evidenceExcerpt: "最近的聊天摘要提到活动场景下的人脉工作流。",
        fieldLabel: "标题",
        id: "demo-profile-suggestion-1",
        rationale: "这个建议来自最近的聊天摘要，不会自动修改你的档案。",
        sourceLabel: "聊天信号",
        statusLabel: "待确认",
        suggestedValue: "围绕活动场景做人脉关系工作流的创始人"
      },
      {
        confidenceLabel: "中可信",
        canAccept: true,
        currentValue: "Tokyo",
        evidenceExcerpt: "最近联系人同时来自东京和新加坡，适合补充主要市场。",
        fieldLabel: "主要市场",
        id: "demo-profile-suggestion-3",
        rationale: "这个建议来自最近新增联系人，不会自动修改你的档案。",
        sourceLabel: "联系人信号",
        statusLabel: "待确认",
        suggestedValue: "东京和新加坡"
      }
    ],
    title: "资料更新建议"
  });
});

test("profileAcceptedPatchToView maps accepted suggestions into pending save copy", () => {
  const view = profileAcceptedPatchToView({
    acceptedAt: "2026-01-01T00:00:00.000Z",
    acceptedSuggestion: {
      id: "demo-profile-suggestion-1",
      sourceKind: "chat",
      status: "accepted",
      targetProfileField: "headline"
    },
    appliedFields: ["headline"],
    nextAction:
      "Apply this patch only after the operator confirms the profile save.",
    profilePatch: {
      headline: "Founder focused on event-grounded relationship workflows"
    },
    state: "accepted"
  });

  assert.deepEqual(view, {
    fields: [
      {
        label: "标题",
        value: "围绕活动场景做人脉关系工作流的创始人"
      }
    ],
    nextAction: "检查编辑表单，没问题就保存资料。",
    summary: "保存资料后才会写进个人资料。",
    title: "待保存改动"
  });
});

test("applyProfileAcceptedPatchToDraft seeds supported profile fields into the editor", () => {
  const draft = profileSummaryToEditDraft({
    bio: "旧简介",
    displayName: "小雨",
    headline: "旧标题",
    industry: "AI",
    offering: ["企业 AI 导入"],
    organization: "Orbit",
    relationshipGoal: "旧目标",
    role: "创始人",
    seeking: ["合作伙伴"],
    timezone: "Tokyo",
    topics: ["AI"]
  });

  assert.deepEqual(
    applyProfileAcceptedPatchToDraft(draft, {
      profilePatch: {
        headline: "Founder focused on event-grounded relationship workflows",
        homeMarket: "Tokyo and Singapore",
        relationshipGoal:
          "Follow up after events with clear source evidence and mutual context."
      }
    }),
    {
      ...draft,
      headline: "围绕活动场景做人脉关系工作流的创始人",
      relationshipGoal: "活动后带着明确来源和双方上下文跟进。",
      timezone: "东京和新加坡"
    }
  );
});

test("applyProfileDocumentExtractionToDraft seeds extracted profile fields into the editor", () => {
  const draft = profileSummaryToEditDraft({
    bio: "旧简介",
    displayName: "小雨",
    headline: "旧标题",
    industry: "AI",
    offering: ["企业 AI 导入"],
    organization: "Orbit",
    relationshipGoal: "旧目标",
    role: "创始人",
    seeking: ["合作伙伴"],
    timezone: "Tokyo",
    topics: ["AI"]
  });

  assert.deepEqual(
    applyProfileDocumentExtractionToDraft(draft, {
      success: true,
      data: {
        draft: {
          displayName: "赵翔",
          headline: "Orbit founder helping companies adopt practical AI",
          homeMarket: "Tokyo",
          organization: "Orbit",
          relationshipGoal:
            "Turn event context into source-backed follow-up decisions.",
          role: "Founder",
          suggestedProfileFields: {
            targetRelationshipTypes: ["founders", "BD partners"]
          }
        },
        kind: "resume",
        state: "success"
      }
    }),
    {
      ...draft,
      displayName: "赵翔",
      headline: "Orbit founder helping companies adopt practical AI",
      relationshipGoal: "把活动上下文变成有来源依据的跟进决策。",
      seekingText: "创始人、商务合作伙伴"
    }
  );
});

test("profileUpdateSuggestionsToView does not offer actions for resolved suggestions", () => {
  const view = profileUpdateSuggestionsToView({
    state: "success",
    suggestions: [
      {
        confidence: "high",
        currentValue: "Tokyo",
        id: "resolved-suggestion",
        sourceKind: "activity",
        status: "accepted",
        suggestedValue: "Tokyo and Singapore",
        targetProfileField: "homeMarket"
      }
    ]
  });

  assert.equal(view.suggestions[0]?.statusLabel, "已接受");
  assert.equal(view.suggestions[0]?.canAccept, false);
});

test("profileUpdateSuggestionsToView handles empty queues", () => {
  const view = profileUpdateSuggestionsToView({
    state: "empty",
    suggestions: [],
    nextAction:
      "Keep the profile unchanged until a sourced signal creates a suggestion."
  });

  assert.equal(view.stateLabel, "暂无建议");
  assert.deepEqual(view.suggestions, []);
  assert.equal(view.nextAction, "资料暂时不需要更新。");
});
