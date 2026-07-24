import assert from "node:assert/strict";
import test from "node:test";

import { contactsPipelineToView } from "../src/view-models/contact-pipeline";

test("contactsPipelineToView maps contacts and connections into a Chinese pipeline", () => {
  const view = contactsPipelineToView({
    connectionsPayload: {
      connections: [
        {
          contactId: "contact_001",
          displayName: "Maya Chen",
          id: "connection_001",
          relationshipStage: "needs_follow_up",
          sourceLinks: [
            {
              label: "Warm referral for Maya Chen",
              type: "referral"
            }
          ],
          strengthScore: 86
        },
        {
          contactId: "contact_002",
          displayName: "佐藤 健",
          id: "connection_002",
          relationshipStage: "active",
          sourceLinks: [
            {
              label: "Direct QR scan for 佐藤 健",
              type: "qr_scan"
            }
          ],
          strengthScore: 58
        }
      ]
    },
    contactsPayload: {
      contacts: [
        {
          displayName: "Maya Chen",
          id: "contact_001",
          nextAction: "Review source evidence before agent use.",
          organization: "Northstar",
          profileSnippet:
            "ZH: 正在找日本市场合作伙伴，也能介绍税务顾问。 EN: Looking for Japan partners.",
          role: "Partner",
          status: "needs_follow_up",
          value: {
            score: 91,
            valueTypes: ["strategic_fit", "referral_path"]
          }
        },
        {
          displayName: "佐藤 健",
          id: "contact_002",
          nextAction: "安排一次 30 分钟交流。",
          organization: "Kansai Community",
          relationshipContext:
            "JA: 関西の運営者。 ZH: 关西创业社群的运营者，可帮忙连接本地服务商。 EN: Kansai community operator.",
          role: "Community Lead",
          status: "active",
          value: {
            score: 62,
            valueTypes: ["community_resource"]
          }
        },
        {
          displayName: "李娜",
          id: "contact_003",
          nextAction: "确认下一次合作主题。",
          organization: "Orbit",
          role: "Customer Success",
          status: "partnered",
          value: {
            score: 72,
            valueTypes: ["business_opportunity"]
          }
        }
      ]
    }
  });

  assert.equal(view.title, "跟进管线");
  assert.equal(view.summary, "3 位联系人，先处理待联系和可引荐的人。");
  assert.deepEqual(view.metrics, [
    { label: "联系人", value: "3" },
    { label: "待联系", value: "1" },
    { label: "在推进", value: "1" },
    { label: "可引荐", value: "1" }
  ]);
  assert.deepEqual(
    view.stages.map((stage) => ({
      count: stage.count,
      id: stage.id,
      label: stage.label
    })),
    [
      { count: 1, id: "to_contact", label: "待联系" },
      { count: 1, id: "in_progress", label: "在推进" },
      { count: 1, id: "partnered", label: "已合作" }
    ]
  );
  const firstStage = view.stages[0];
  assert.ok(firstStage);
  assert.deepEqual(firstStage.contacts[0], {
    detail: "Northstar · 合伙人",
    id: "contact_001",
    name: "Maya Chen",
    nextAction: "查看来源证据后再跟进 Maya Chen。",
    relationship: "正在找日本市场合作伙伴，也能介绍税务顾问。",
    stageAction: {
      connectionId: "connection_001",
      label: "开始推进",
      nextRelationshipStage: "active",
      pendingLabel: "推进中",
      successMessage: "已把 Maya Chen 放入在推进。"
    },
    valueLabels: ["战略契合", "引荐路径"],
    valueScoreLabel: "91分"
  });
  assert.deepEqual(view.introReadiness.candidates, [
    {
      contactId: "contact_001",
      detail: "Northstar · 合伙人",
      id: "contact_001",
      name: "Maya Chen",
      nextAction: "先确认双方需求，再写一段引荐词。",
      reason: "有明确的引荐路径，适合先整理双方需求。",
      sourceLabel: "朋友介绍",
      strengthLabel: "86分"
    }
  ]);
  assert.equal(view.introReadiness.apiGap, "引荐记录需要后端列表 API。");
});

test("contactsPipelineToView exposes safe stage actions for supported connections", () => {
  const view = contactsPipelineToView({
    connectionsPayload: {
      connections: [
        {
          contactId: "contact_001",
          id: "connection_001",
          relationshipStage: "needs_follow_up"
        },
        {
          contactId: "contact_002",
          id: "connection_002",
          relationshipStage: "active"
        },
        {
          contactId: "contact_003",
          id: "connection_003",
          relationshipStage: "archived"
        }
      ]
    },
    contactsPayload: {
      contacts: [
        {
          displayName: "Maya Chen",
          id: "contact_001",
          nextAction: "确认合作范围。",
          organization: "Northstar",
          role: "Partner",
          status: "needs_follow_up"
        },
        {
          displayName: "佐藤 健",
          id: "contact_002",
          nextAction: "下周约一次咖啡。",
          organization: "Kansai Community",
          role: "Community Lead",
          status: "active"
        },
        {
          displayName: "李娜",
          id: "contact_003",
          nextAction: "暂时不用跟进。",
          organization: "Orbit",
          role: "Customer Success",
          status: "partnered"
        }
      ]
    }
  });

  assert.deepEqual(view.stages[0]?.contacts[0]?.stageAction, {
    connectionId: "connection_001",
    label: "开始推进",
    nextRelationshipStage: "active",
    pendingLabel: "推进中",
    successMessage: "已把 Maya Chen 放入在推进。"
  });
  assert.deepEqual(view.stages[1]?.contacts[0]?.stageAction, {
    connectionId: "connection_002",
    label: "放回待联系",
    nextRelationshipStage: "needs_follow_up",
    pendingLabel: "更新中",
    successMessage: "已把 佐藤 健 放回待联系。"
  });
  assert.equal(view.stages[2]?.contacts[0]?.stageAction, null);
});

test("contactsPipelineToView keeps empty pipeline and intros explicit", () => {
  const view = contactsPipelineToView({
    connectionsPayload: { connections: [] },
    contactsPayload: { contacts: [] }
  });

  assert.equal(view.summary, "还没有联系人进入管线。");
  assert.deepEqual(view.metrics, [
    { label: "联系人", value: "0" },
    { label: "待联系", value: "0" },
    { label: "在推进", value: "0" },
    { label: "可引荐", value: "0" }
  ]);
  assert.deepEqual(
    view.stages.map((stage) => stage.count),
    [0, 0, 0]
  );
  assert.deepEqual(view.introReadiness.candidates, []);
  assert.equal(view.introReadiness.summary, "还没有适合发起引荐的候选。");
});
