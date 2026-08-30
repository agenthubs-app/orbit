import assert from "node:assert/strict";
import test from "node:test";

import { contactsAnalysisToView } from "../src/view-models/contacts-analysis";

test("contactsAnalysisToView turns relationship data into a goal-led decision view", () => {
  const view = contactsAnalysisToView(
    {
      aggregate: {
        highValueCount: 6,
        pendingFollowups: { count: 8 },
        dormantContacts: { count: 3 },
        relationshipAssetTotals: { contacts: 12 }
      },
      distributions: {
        industryDistribution: [
          {
            bucketId: "industry:technology",
            contactCount: 5,
            label: "Technology companies",
            percentage: 42,
            topOrganizations: ["Orbit", "红桥科技"]
          },
          {
            bucketId: "industry:food",
            contactCount: 4,
            label: "Food operators",
            percentage: 33,
            topOrganizations: ["北星餐饮"]
          },
          {
            bucketId: "industry:capital",
            contactCount: 3,
            label: "Capital and investors",
            percentage: 25,
            topOrganizations: ["关西创投"]
          }
        ],
        relationshipStrengthDistribution: [
          {
            followupRisk: "low",
            percentage: 42,
            relationshipCount: 5,
            strength: "strong"
          },
          {
            followupRisk: "moderate",
            percentage: 33,
            relationshipCount: 4,
            strength: "warm"
          },
          {
            followupRisk: "high",
            percentage: 25,
            relationshipCount: 3,
            strength: "weak"
          }
        ],
        valueTypeDistribution: [
          {
            label: "Referral paths",
            percentage: 17,
            relationshipCount: 2,
            valueType: "referral_path"
          }
        ]
      },
      gaps: {
        coverageScore: 72,
        gaps: [
          {
            currentCount: 2,
            gapId: "gap:retail",
            label: "Food operators coverage",
            recommendedAction: "Prioritize introductions for retail leaders.",
            severity: "high",
            targetCount: 5
          },
          {
            currentCount: 1,
            gapId: "gap:investor",
            label: "Investor access coverage",
            recommendedAction: "Add one investor introduction path.",
            severity: "medium",
            targetCount: 3
          }
        ],
        nextAction: "Strengthen decision-maker coverage."
      },
      opportunities: {
        highPriorityOpportunities: [
          {
            actionBrief: {
              evaluatedAt: "2026-08-25T08:00:00.000Z",
              evidence: [
                "今天需要处理",
                "关系价值评分为 91 分",
                "关西门店合作已有明确背景"
              ],
              evidenceIds: ["evidence:task", "evidence:connection"],
              judgment: "这项跟进今天到期，建议今天处理。",
              primaryAction: {
                contactId: "contact_001",
                kind: "open_contact",
                label: "开始联系"
              },
              priority: {
                dormantRisk: 10,
                evidenceCompleteness: 10,
                goalRelevance: 20,
                relationshipValue: 23,
                total: 93,
                urgency: 30
              },
              ruleVersion: "opportunity-brief-v1",
              secondaryAction: {
                contactId: "contact_001",
                kind: "open_contact",
                label: "查看联系人"
              },
              steps: ["查看最近记录", "确认本次目标", "联系佐藤健一"],
              title: "确认关西门店合作时间",
              type: "follow_up"
            },
            contactId: "contact_001",
            contactName: "佐藤健一",
            dueLabel: "Due today",
            organization: "北星餐饮",
            priorityScore: 91,
            reason: "佐藤健一 is a high-value nurture relationship.",
            suggestedAction: "Ask for an introduction to the Kansai lead.",
            title: "Review follow-up for contact_001"
          }
        ]
      },
      summary: {
        metrics: [
          { id: "relationship-assets", value: 12 },
          { id: "high-value", value: 6 },
          { id: "pending-followups", value: 8 },
          { id: "dormant-contacts", value: 3 }
        ]
      }
    },
    "拓展日本连锁零售合作",
    [
      {
        id: "contact_001",
        name: "佐藤健一",
        nextAction: "",
        organization: "北星餐饮",
        relationship: "",
        role: "创始人",
        status: "",
        valueLabels: [],
        valueScore: 89
      },
      {
        id: "contact_002",
        name: "林悦",
        nextAction: "",
        organization: "红桥科技",
        relationship: "",
        role: "市场负责人",
        status: "",
        valueLabels: [],
        valueScore: 78
      },
      {
        id: "contact_003",
        name: "程可欣",
        nextAction: "",
        organization: "竹林社群",
        relationship: "",
        role: "门店经营者",
        status: "",
        valueLabels: [],
        valueScore: 64
      }
    ],
    ["东京", "大阪", "东京"]
  );

  assert.equal(view.goal, "拓展日本连锁零售合作");
  assert.equal(view.goalConfigured, true);
  assert.equal(view.coverage.score, 72);
  assert.equal(view.coverage.scoreLabel, "72%");
  assert.equal(view.coverage.statusLabel, "目标具备基础");
  assert.deepEqual(view.coverage.signals, [
    { id: "high-value", label: "高价值关系", value: "6" },
    { id: "strong", label: "核心关系", value: "5" },
    { id: "referral", label: "引荐路径", value: "2" }
  ]);
  assert.equal(view.actions.length, 3);
  assert.equal(view.actions[0]?.contactId, "contact_001");
  assert.equal(view.actions[0]?.title, "联系佐藤健一");
  assert.equal(view.actions[0]?.brief?.ruleVersion, "opportunity-brief-v1");
  assert.equal(view.actions[0]?.brief?.judgment, "这项跟进今天到期，建议今天处理。");
  assert.deepEqual(view.actions[0]?.brief?.steps, [
    "查看最近记录",
    "确认本次目标",
    "联系佐藤健一"
  ]);
  assert.equal(view.actions[1]?.title, "补齐待补齐的人脉覆盖");
  assert.equal(JSON.stringify(view).includes("Review live context"), false);
  assert.equal(JSON.stringify(view.actions).includes(" coverage"), false);
  assert.equal(view.health.length, 3);
  assert.deepEqual(
    view.health.map((item) => item.value),
    ["5", "4", "3"]
  );
  assert.equal(view.diagnosis.scoreLabel, "72%");
  assert.equal(
    view.diagnosis.detail,
    "科技公司覆盖较强，但资本与投资人覆盖仍需补齐。"
  );
  assert.deepEqual(
    view.industries.map((item) => [item.label, item.countLabel, item.percentage]),
    [
      ["科技公司", "5 人", 42],
      ["食品与餐饮", "4 人", 33],
      ["资本与投资人", "3 人", 25]
    ]
  );
  assert.deepEqual(
    view.dimensions.map((item) => [item.label, item.value]),
    [
      ["领域分布", "3 个领域"],
      ["角色层级", "决策层 67%"],
      ["关系强度", "强关系 42%"]
    ]
  );
  assert.deepEqual(
    view.activity.map((item) => [item.label, item.value]),
    [
      ["新增人脉", "0"],
      ["核心关系", "5"],
      ["待唤醒", "3"]
    ]
  );
  assert.deepEqual(
    view.structureDimensions.map((dimension) => [
      dimension.id,
      dimension.label,
      dimension.summary
    ]),
    [
      ["industry", "行业", "3 个领域"],
      ["location", "地区", "2 个地区"],
      ["role", "角色", "3 类角色"],
      ["relationship", "关系", "强关系 42%"]
    ]
  );
  assert.deepEqual(
    view.structureDimensions[1]?.items.map((item) => [
      item.label,
      item.countLabel,
      item.percentage
    ]),
    [
      ["东京", "2 人", 67],
      ["大阪", "1 人", 33]
    ]
  );
  assert.deepEqual(
    view.structureDimensions[2]?.items.map((item) => item.label),
    ["创始人与决策者", "经营管理者", "专业角色"]
  );
});

test("contactsAnalysisToView prefers actor-scoped four-dimensional distributions", () => {
  const bucket = (bucketId: string, label: string, contactCount: number, percentage: number) => ({
    bucketId,
    contactCount,
    evidenceIds: [],
    label,
    missingData: false,
    percentage
  });
  const view = contactsAnalysisToView({
    distributions: {
      structureDistributions: {
        industry: [bucket("technology_internet", "科技与互联网", 6, 60), bucket("finance_investment", "金融与投资", 4, 40)],
        location: [bucket("tokyo", "东京", 7, 70), bucket("osaka", "大阪", 3, 30)],
        role: [bucket("decision_maker", "创始人与决策者", 5, 50), bucket("management", "经营管理者", 5, 50)],
        relationship: [bucket("strong", "强关系", 3, 30), bucket("warm", "熟悉关系", 5, 50), bucket("weak", "弱关系", 2, 20)]
      }
    }
  }, "");

  assert.deepEqual(view.structureDimensions.map((dimension) => dimension.id), [
    "industry",
    "location",
    "role",
    "relationship"
  ]);
  assert.deepEqual(
    view.structureDimensions[1]?.items.map((item) => item.id),
    ["tokyo", "osaka"]
  );
  assert.equal(view.structureDimensions[3]?.items[1]?.label, "熟悉关系");
});

test("contactsAnalysisToView stays honest when relationship evidence is sparse", () => {
  const view = contactsAnalysisToView({}, "");

  assert.equal(view.goal, "先补充你最近想认识的人或合作方向");
  assert.equal(view.coverage.score, 0);
  assert.equal(view.coverage.statusLabel, "先设置关系目标");
  assert.equal(view.goalConfigured, false);
  assert.equal(view.actions.length, 1);
  assert.equal(view.actions[0]?.title, "先完善关系目标");
  assert.equal(JSON.stringify(view).includes("72"), false);
  assert.equal(view.diagnosis.scoreLabel, "--");
  assert.equal(view.industries.length, 0);
  assert.equal(view.dimensions[0]?.value, "待完善");
  assert.equal(view.dimensions[1]?.value, "待完善");
  assert.equal(view.structureDimensions.length, 4);
  assert.equal(view.structureDimensions[1]?.summary, "待完善");
});

test("contactsAnalysisToView does not claim goal coverage before a goal is set", () => {
  const view = contactsAnalysisToView(
    {
      gaps: {
        coverageScore: 66,
        nextAction: "Strengthen decision-maker coverage."
      },
      opportunities: {
        highPriorityOpportunities: [
          {
            contactId: "contact_001",
            contactName: "程可欣",
            reason: "程可欣 is a high-value nurture relationship.",
            suggestedAction: "Review live context and follow up.",
            title: "Review follow-up for contact_001"
          }
        ]
      }
    },
    ""
  );

  assert.equal(view.coverage.score, 0);
  assert.equal(view.coverage.scoreLabel, "--");
  assert.equal(view.coverage.statusLabel, "先设置关系目标");
  assert.equal(view.actions[0]?.title, "联系程可欣");
  assert.equal(view.actions[0]?.brief, undefined);
  assert.equal(JSON.stringify(view).includes("Review live context"), false);
});
