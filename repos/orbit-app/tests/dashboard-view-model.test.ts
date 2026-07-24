import assert from "node:assert/strict";
import test from "node:test";

import { dashboardToView } from "../src/view-models/dashboard";

test("dashboardToView maps live dashboard payloads into Chinese mobile cards", () => {
  const view = dashboardToView({
    aggregate: {
      highValueCount: 12,
      newContacts: { count: 8 },
      pendingFollowups: { count: 5 },
      recentActivity: [
        {
          activityId: "activity:dashboard:contact:contact_039",
          label: "西村 大地 added to the live relationship database",
          occurredAt: "2026-07-24T10:30:00+09:00",
          sourceLabel: "Confirmed offline meeting note for 西村 大地",
          type: "new_contact"
        }
      ],
      relationshipAssetTotals: {
        connections: 34,
        contacts: 18,
        evidenceBackedRelationships: 30,
        eventsRepresented: 4
      },
      summary:
        "Live dashboard aggregate was computed from shared remote relationship records.",
      nextAction:
        "Use the source-backed live dashboard aggregate for agent workflow testing."
    },
    distributions: {
      industryDistribution: [
        {
          bucketId: "industry:capital",
          contactCount: 8,
          label: "Capital and investors",
          percentage: 12,
          topOrganizations: ["Aoba Capital", "Ginza Capital"]
        },
        {
          bucketId: "industry:foods",
          contactCount: 18,
          label: "Food operators",
          percentage: 27,
          topOrganizations: ["Aoba Foods"]
        }
      ],
      relationshipStrengthDistribution: [
        {
          followupRisk: "high",
          percentage: 15,
          relationshipCount: 75,
          strength: "weak"
        }
      ],
      valueTypeDistribution: [
        {
          label: "Investor access",
          percentage: 22,
          relationshipCount: 14,
          valueType: "investor_access"
        }
      ]
    },
    gaps: {
      coverageScore: 78,
      gaps: [
        {
          currentCount: 8,
          gapId: "gap:capital",
          label: "Capital and investors coverage",
          recommendedAction:
            "Prioritize sourced introductions that expand this underrepresented relationship segment.",
          severity: "high",
          targetCount: 14
        }
      ],
      nextAction:
        "Use live gap recommendations to tune event goals and follow-up priorities.",
      summary:
        "Live network gap analysis compares generated relationship coverage against deterministic target thresholds."
    },
    opportunities: {
      currentGoalMatches: [
        {
          coverageScore: 92,
          label: "Follow up top live opportunities",
          missingContext:
            "Use source evidence before sending any external message or notification."
        }
      ],
      highPriorityOpportunities: [
        {
          contactId: "contact_039",
          contactName: "西村 大地",
          dueLabel: "Due today",
          organization: "Aoba Partners",
          priority: "high",
          priorityScore: 94,
          reason:
            "西村 大地 has a concrete current-user relationship record from Confirmed offline meeting note for 西村 大地.",
          suggestedAction:
            "Review live context and follow up about review evidence before follow-up.",
          title: "Review follow-up for contact_039"
        }
      ],
      nextAction:
        "Review the top live opportunity before creating tasks, messages, or notifications.",
      summary:
        "Live opportunity reminder analytics ranked open tasks and dormant high-value relationships from shared live storage."
    },
    summary: {
      metrics: [
        { id: "relationship-assets", label: "Relationship assets", value: 18 },
        { id: "pending-followups", label: "Pending followups", value: 5 },
        { id: "dormant-contacts", label: "Dormant contacts", value: 2 },
        { id: "high-value", label: "High-value relationships", value: 12 },
        { id: "new-contacts", label: "New contacts", value: 8 }
      ],
      summary: "Rule-based summary of the live dashboard aggregate."
    }
  });

  assert.equal(view.title, "关系仪表盘");
  assert.equal(view.summary, "先看关系覆盖，再处理最该推进的跟进。");
  assert.equal(view.nextAction, "先处理最高分的跟进，再补齐覆盖最弱的人脉。");
  assert.equal(view.coverageScore, 78);
  assert.equal(view.coverageScoreLabel, "覆盖度 78%");
  assert.deepEqual(view.metrics, [
    { id: "relationship-assets", label: "关系资产", value: "18" },
    { id: "pending-followups", label: "待跟进", value: "5" },
    { id: "dormant-contacts", label: "待唤醒", value: "2" },
    { id: "high-value", label: "高价值关系", value: "12" },
    { id: "new-contacts", label: "新增人脉", value: "8" }
  ]);
  assert.deepEqual(view.priority, {
    action: "先复核关系背景，再决定怎么跟进。",
    contactId: "contact_039",
    contactName: "西村 大地",
    detail: "西村 大地有可复核的关系背景。",
    dueLabel: "今日",
    organization: "Aoba Partners",
    scoreLabel: "94分",
    title: "跟进西村 大地"
  });
  assert.deepEqual(view.gaps, [
    {
      action: "优先补充这一类介绍或活动线索。",
      detail: "当前 8 / 目标 14",
      id: "gap:capital",
      label: "资本与投资人覆盖",
      severityLabel: "高"
    }
  ]);
  assert.deepEqual(view.industries, [
    {
      countLabel: "8 人",
      id: "industry:capital",
      label: "资本与投资人",
      organizations: "Aoba Capital、Ginza Capital",
      percentage: 12
    },
    {
      countLabel: "18 人",
      id: "industry:foods",
      label: "食品与餐饮",
      organizations: "Aoba Foods",
      percentage: 27
    }
  ]);
  assert.deepEqual(view.valueTypes, [
    {
      countLabel: "14 段",
      id: "investor_access",
      label: "投资人入口",
      percentage: 22
    }
  ]);
  assert.deepEqual(view.strengths, [
    {
      countLabel: "75 段",
      id: "weak",
      label: "弱关系",
      percentage: 15,
      riskLabel: "需要尽快处理"
    }
  ]);
  assert.deepEqual(view.recentActivity, [
    {
      detail: "线下会议记录",
      id: "activity:dashboard:contact:contact_039",
      label: "新增联系人 西村 大地",
      time: "7月24日 10:30",
      typeLabel: "新增人脉"
    }
  ]);
});

test("dashboardToView falls back to aggregate counts when summary metrics are missing", () => {
  const view = dashboardToView({
    aggregate: {
      highValueCount: 3,
      newContacts: { count: 4 },
      pendingFollowups: { count: 2 },
      relationshipAssetTotals: {
        connections: 9,
        contacts: 7,
        evidenceBackedRelationships: 6,
        eventsRepresented: 1
      }
    }
  });

  assert.deepEqual(view.metrics, [
    { id: "relationship-assets", label: "关系资产", value: "7" },
    { id: "pending-followups", label: "待跟进", value: "2" },
    { id: "dormant-contacts", label: "待唤醒", value: "0" },
    { id: "high-value", label: "高价值关系", value: "3" },
    { id: "new-contacts", label: "新增人脉", value: "4" }
  ]);
  assert.equal(view.summary, "关系数据还不完整，先从待跟进开始。");
});
