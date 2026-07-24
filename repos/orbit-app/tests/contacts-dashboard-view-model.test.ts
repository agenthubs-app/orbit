import assert from "node:assert/strict";
import test from "node:test";

import { contactsDashboardToView } from "../src/view-models/contacts-dashboard";

test("contactsDashboardToView turns dashboard payloads into a contacts-focused Chinese view", () => {
  const view = contactsDashboardToView({
    aggregate: {
      highValueCount: 34,
      newContacts: { count: 12 },
      pendingFollowups: { count: 24 },
      dormantContacts: { count: 9 },
      recentActivity: [
        {
          activityId: "activity:contact:chen-wei",
          label: "陈伟 added to the live relationship database",
          occurredAt: "2026-07-24T09:00:00+09:00",
          sourceLabel: "Direct QR scan for 陈伟",
          type: "new_contact"
        }
      ],
      relationshipAssetTotals: {
        contacts: 128
      },
      summary:
        "Live dashboard aggregate was computed from shared remote relationship records."
    },
    distributions: {
      industryDistribution: [
        {
          bucketId: "industry:tech",
          contactCount: 32,
          label: "Technology companies",
          percentage: 25,
          topOrganizations: ["Orbit Labs", "Kansai AI"]
        },
        {
          bucketId: "industry:food",
          contactCount: 9,
          label: "Food operators",
          percentage: 7,
          topOrganizations: ["Aoba Foods"]
        }
      ],
      relationshipStrengthDistribution: [
        {
          followupRisk: "low",
          percentage: 36,
          relationshipCount: 46,
          strength: "strong"
        },
        {
          followupRisk: "moderate",
          percentage: 31,
          relationshipCount: 39,
          strength: "warm"
        },
        {
          followupRisk: "high",
          percentage: 27,
          relationshipCount: 34,
          strength: "weak"
        }
      ],
      valueTypeDistribution: [
        {
          label: "Investor access",
          percentage: 18,
          relationshipCount: 23,
          valueType: "investor_access"
        }
      ]
    },
    gaps: {
      coverageScore: 72,
      gaps: [
        {
          currentCount: 9,
          gapId: "gap:fnb",
          label: "Food operators coverage",
          recommendedAction:
            "Prioritize source-backed introductions from the live relationship database.",
          severity: "high",
          targetCount: 18
        }
      ],
      nextAction:
        "Use live gap recommendations to tune event goals and follow-up priorities."
    },
    opportunities: {
      highPriorityOpportunities: [
        {
          contactId: "contact_wei",
          contactName: "陈伟",
          dueLabel: "Due today",
          organization: "Aoba Foods",
          priorityScore: 88,
          reason:
            "陈伟 has a concrete current-user relationship record from Direct QR scan for 陈伟.",
          suggestedAction:
            "Review live context and follow up about review evidence before follow-up.",
          title: "Review follow-up for contact_wei"
        }
      ]
    },
    summary: {
      metrics: [
        { id: "relationship-assets", label: "Relationship assets", value: 128 },
        { id: "pending-followups", label: "Pending followups", value: 24 },
        { id: "dormant-contacts", label: "Dormant contacts", value: 9 },
        { id: "high-value", label: "High-value relationships", value: 34 },
        { id: "new-contacts", label: "New contacts", value: 12 }
      ],
      summary: "Rule-based summary from live storage."
    }
  });

  assert.equal(view.title, "人脉表盘");
  assert.equal(view.subtitle, "你的关系资产 · 今天更新");
  assert.deepEqual(view.overview, [
    { detail: "已确认联系人", id: "relationship-assets", label: "总人脉", value: "128" },
    { detail: "可优先推进", id: "high-value", label: "高价值", value: "34" },
    { detail: "需要复核下一步", id: "pending-followups", label: "待跟进", value: "24" },
    { detail: "超过一段时间没互动", id: "dormant-contacts", label: "沉睡关系", value: "9" }
  ]);
  assert.equal(view.map.centerValue, "128");
  assert.equal(view.map.centerLabel, "已分类");
  assert.deepEqual(view.map.rings, [
    {
      countLabel: "46 段",
      id: "strong",
      label: "核心圈 · 强",
      percentage: 36,
      riskLabel: "风险较低"
    },
    {
      countLabel: "39 段",
      id: "warm",
      label: "进行圈 · 中",
      percentage: 31,
      riskLabel: "需要留意"
    },
    {
      countLabel: "34 段",
      id: "weak",
      label: "外圈 · 弱/待确认",
      percentage: 27,
      riskLabel: "需要尽快处理"
    }
  ]);
  assert.equal(view.diagnosis.detail, "先处理最高分的跟进，再补齐覆盖最弱的人脉。");
  assert.equal(view.priority?.contactName, "陈伟");
  assert.equal(view.priority?.detail, "陈伟有可复核的关系背景。");
  assert.equal(view.gaps[0]?.label, "待补齐的人脉覆盖");
  assert.equal(view.gaps[0]?.action, "优先补充这一类介绍或活动线索。");
  assert.equal(view.industries[0]?.label, "科技公司");
  assert.equal(view.valueTypes[0]?.label, "投资人入口");
  assert.equal(view.recentActivity[0]?.detail, "二维码记录");
});

test("contactsDashboardToView avoids exposing implementation labels", () => {
  const view = contactsDashboardToView({
    aggregate: {
      highValueCount: 0,
      relationshipAssetTotals: { contacts: 0 },
      summary:
        "Provider generated this source-backed analytics payload from live storage."
    },
    gaps: {
      nextAction:
        "Use the source-backed live dashboard aggregate for workflow testing."
    }
  });

  const serialized = JSON.stringify(view).toLowerCase();

  assert.equal(serialized.includes("provider"), false);
  assert.equal(serialized.includes("source-backed"), false);
  assert.equal(serialized.includes("live storage"), false);
  assert.equal(serialized.includes("workflow testing"), false);
  assert.equal(view.summary, "关系数据还不完整，先从待跟进开始。");
  assert.equal(view.diagnosis.detail, "先补一条联系人或跟进记录。");
});
