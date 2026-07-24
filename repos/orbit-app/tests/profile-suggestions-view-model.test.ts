import assert from "node:assert/strict";
import test from "node:test";

import { profileUpdateSuggestionsToView } from "../src/view-models/profile";

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
