import assert from "node:assert/strict";
import test from "node:test";

import {
  buildConnectionProfilePreviewRequest,
  buildConnectionEvidenceAddRequest,
  connectionEvidenceDetailToView,
  connectionGraphToView,
  connectionProfileToView
} from "../src/view-models/connections-graph";

test("connectionGraphToView maps live connection payloads into Chinese graph cards", () => {
  const view = connectionGraphToView({
    connections: [
      {
        contactId: "contact_012",
        connectionReason:
          "山田 千尋 matches ai_saas through AI workflow PoC buyer in Japanese SMB manufacturing.",
        displayName: "山田 千尋",
        evidenceTimeline: [
          {
            title: "Live evidence for connection_0001"
          }
        ],
        id: "connection_0001",
        lastTouchedAt: "2026-06-30T23:14:00+09:00",
        nextAction: "Mandarin Japanese community marketing channel",
        organization: "Morning Light Foods",
        relationshipStage: "active",
        role: "DX Consultant",
        sourceLinks: [
          {
            label: "Generated relationship graph edge",
            type: "manual"
          }
        ],
        strengthScore: 36
      },
      {
        contactId: "contact_078",
        connectionReason:
          "曾伟 matches legal_accounting through D2C brand overseas-expansion partner.",
        displayName: "曾伟",
        evidenceTimeline: [
          {
            title: "Live evidence for connection_0007"
          }
        ],
        id: "connection_0007",
        lastTouchedAt: "2026-06-30T23:14:00+09:00",
        nextAction: "hands-on D2C cross-border logistics and payments",
        organization: "Kansai Community",
        relationshipStage: "needs_follow_up",
        role: "Product Manager",
        sourceLinks: [
          {
            label: "Direct QR scan for 曾伟",
            type: "event_import"
          }
        ],
        strengthScore: 88
      },
      {
        contactId: "contact_003",
        connectionReason:
          "高橋 智子 has a concrete current-user relationship record from Confirmed offline meeting note for 高橋 智子.",
        displayName: "高橋 智子",
        evidenceTimeline: [],
        id: "connection_0003",
        lastTouchedAt: "2026-06-29T09:00:00+09:00",
        nextAction: "Review the next follow-up for 高橋 智子.",
        organization: "Aoba Foods",
        relationshipStage: "captured",
        role: "Investor Partner",
        sourceLinks: [
          {
            label: "Confirmed offline meeting note for 高橋 智子",
            type: "manual"
          }
        ],
        strengthScore: 72
      }
    ],
    nextAction: "Review live connection evidence before relationship actions.",
    summary: "510 connections were loaded from the live connection store."
  });

  assert.equal(view.title, "人脉图谱");
  assert.equal(view.summary, "3 段关系连接，先看需要跟进和强度最高的人。");
  assert.equal(view.nextAction, "先复核关系证据，再推进下一步。");
  assert.deepEqual(view.metrics, [
    { label: "总连接", value: "3" },
    { label: "待跟进", value: "1" },
    { label: "强关系", value: "2" },
    { label: "有证据", value: "3" }
  ]);
  assert.deepEqual(view.stages, [
    { count: 1, id: "active", label: "推进中" },
    { count: 1, id: "captured", label: "已记录" },
    { count: 1, id: "needs_follow_up", label: "待跟进" }
  ]);
  assert.deepEqual(view.priorityConnections[0], {
    contactId: "contact_078",
    detail: "曾伟和当前目标有匹配。",
    id: "connection_0007",
    lastTouchedAt: "6月30日 23:14",
    name: "曾伟",
    nextAction: "先整理关系背景，再安排一次具体跟进。",
    organization: "Kansai Community",
    role: "Product Manager",
    scoreLabel: "88分",
    sourceLabel: "二维码记录",
    stageLabel: "待跟进"
  });
  assert.deepEqual(view.priorityConnections[1], {
    contactId: "contact_003",
    detail: "高橋 智子有可复核的关系背景。",
    id: "connection_0003",
    lastTouchedAt: "6月29日 09:00",
    name: "高橋 智子",
    nextAction: "跟进高橋 智子 的关系进展。",
    organization: "Aoba Foods",
    role: "Investor Partner",
    scoreLabel: "72分",
    sourceLabel: "线下会议记录",
    stageLabel: "已记录"
  });
});

test("connectionGraphToView handles empty connection payloads", () => {
  const view = connectionGraphToView({ connections: [] });

  assert.equal(view.summary, "还没有关系连接。先从联系人或活动记录开始。");
  assert.equal(view.nextAction, "先补一条联系人来源，再建立关系连接。");
  assert.deepEqual(view.metrics, [
    { label: "总连接", value: "0" },
    { label: "待跟进", value: "0" },
    { label: "强关系", value: "0" },
    { label: "有证据", value: "0" }
  ]);
  assert.deepEqual(view.priorityConnections, []);
});

test("connectionGraphToView labels live-only relationship stages distinctly", () => {
  const view = connectionGraphToView({
    connections: [
      {
        id: "connection_nurture",
        relationshipStage: "nurture"
      },
      {
        id: "connection_reviewing",
        relationshipStage: "reviewing"
      }
    ]
  });

  assert.deepEqual(view.stages, [
    { count: 1, id: "nurture", label: "长期维护" },
    { count: 1, id: "reviewing", label: "待复核" }
  ]);
});

test("connectionEvidenceDetailToView maps connection detail evidence into a review card", () => {
  const view = connectionEvidenceDetailToView({
    connection: {
      displayName: "曾伟",
      organization: "Kansai Community",
      role: "Product Manager",
      strengthScore: 88
    },
    evidenceTimeline: [
      {
        contribution: "origin",
        evidenceId: "evidence:001",
        excerpt: "在关西跨境商务交流会上交换名片，并提到需要日本落地税务顾问。",
        occurredAt: "2026-06-30T23:14:00+09:00",
        sourceLink: {
          label: "Direct QR scan for 曾伟",
          type: "event_import"
        },
        title: "Live evidence for connection_0007"
      },
      {
        contribution: "follow_up_signal",
        evidenceId: "evidence:002",
        excerpt: "Review source evidence before agent use.",
        occurredAt: "bad-date",
        title: "Manual follow-up note"
      }
    ],
    nextAction: "Review live connection evidence before relationship actions.",
    sourceLinks: [
      {
        capturedAt: "2026-06-30T23:14:00+09:00",
        evidenceId: "evidence:001",
        label: "Direct QR scan for 曾伟",
        type: "event_import"
      }
    ],
    state: "success",
    summary: "Connection evidence loaded from fixtures."
  });

  assert.equal(view.kind, "ready");
  assert.equal(view.title, "曾伟的证据链");
  assert.equal(view.connectionLine, "Kansai Community · Product Manager · 88分");
  assert.equal(view.summary, "已整理 2 条证据和 1 个来源。");
  assert.equal(view.nextAction, "先复核关系证据，再推进下一步。");
  assert.equal(view.safetyText, "只读取关系证据，不会外发消息或写入日历。");
  assert.deepEqual(view.sourceLinks, [
    {
      detail: "6月30日 23:14",
      id: "evidence:001",
      label: "二维码记录"
    }
  ]);
  assert.deepEqual(view.timeline, [
    {
      detail: "来源 · 6月30日 23:14",
      excerpt: "在关西跨境商务交流会上交换名片，并提到需要日本落地税务顾问。",
      id: "evidence:001",
      title: "关系来源"
    },
    {
      detail: "跟进信号 · bad-date",
      excerpt: "这条证据需要打开原记录复核。",
      id: "evidence:002",
      title: "跟进记录"
    }
  ]);
});

test("connectionEvidenceDetailToView handles empty evidence states", () => {
  const view = connectionEvidenceDetailToView({
    connection: null,
    evidenceTimeline: [],
    nextAction: "Add a connection first.",
    sourceLinks: [],
    state: "empty",
    summary: "No connection evidence is selected."
  });

  assert.equal(view.kind, "empty");
  assert.equal(view.title, "暂无证据链");
  assert.equal(view.summary, "这条关系还没有可复核的来源。");
  assert.equal(view.nextAction, "先补一条联系人来源，再建立关系连接。");
});

test("buildConnectionEvidenceAddRequest prepares a manual evidence add preview", () => {
  assert.deepEqual(
    buildConnectionEvidenceAddRequest({
      connectionId: " connection_001 ",
      excerpt: " 已确认曾伟可以介绍关西跨境服务商。 ",
      occurredAt: " 2026-07-24T09:30:00.000Z ",
      title: " 后续可引荐 "
    }),
    {
      request: {
        body: {
          contribution: "user_note",
          excerpt: "已确认曾伟可以介绍关西跨境服务商。",
          occurredAt: "2026-07-24T09:30:00.000Z",
          sourceLabel: "iOS 手动补充",
          sourceType: "manual",
          title: "后续可引荐"
        },
        endpoint: "/api/connections/connection_001/evidence"
      },
      success: true
    }
  );
  assert.deepEqual(
    buildConnectionEvidenceAddRequest({
      connectionId: "connection_001",
      excerpt: "   ",
      title: "后续可引荐"
    }),
    {
      error: "需要写清楚证据内容，才能补充到关系里。",
      success: false
    }
  );
});

test("buildConnectionProfilePreviewRequest prepares a review-only relationship profile patch", () => {
  assert.deepEqual(
    buildConnectionProfilePreviewRequest({
      contactId: "contact_078",
      detail: "曾伟和当前目标有匹配。",
      id: " connection_0007 ",
      lastTouchedAt: "6月30日 23:14",
      name: "曾伟",
      nextAction: "先整理关系背景，再安排一次具体跟进。",
      organization: "Kansai Community",
      role: "Product Manager",
      scoreLabel: "88分",
      sourceLabel: "二维码记录",
      stageLabel: "待跟进"
    }),
    {
      request: {
        body: {
          context: "曾伟目前适合从关系背景、互惠价值和下一步动作三个维度复核。",
          mutualValue: {
            contactReceives: "曾伟可以获得有明确上下文的资源、介绍或业务线索。",
            orbitUserReceives:
              "小雨可以通过曾伟的经验、渠道或需求判断下一步合作机会。",
            valueTypes: ["commercial_opportunity", "knowledge_exchange"]
          },
          nextAction: {
            label: "复核曾伟的下一步跟进",
            rationale: "先确认双方各自能获得什么，再决定是否发送消息或安排会面。"
          },
          relationshipType: "partner_candidate"
        },
        endpoint: "/api/connections/connection_0007/profile"
      },
      success: true
    }
  );

  assert.deepEqual(
    buildConnectionProfilePreviewRequest({
      contactId: "",
      detail: "",
      id: "   ",
      lastTouchedAt: "",
      name: "联系人",
      nextAction: "",
      organization: "",
      role: "",
      scoreLabel: "",
      sourceLabel: "",
      stageLabel: ""
    }),
    {
      error: "这条关系缺少编号，暂时不能生成画像。",
      success: false
    }
  );
});

test("connectionProfileToView maps relationship profile previews into Chinese review cards", () => {
  const view = connectionProfileToView({
    nextAction:
      "Review this live relationship profile preview before enabling persistence or automation.",
    profile: {
      context: "曾伟正在寻找日本落地可信赖的税务与设立顾问。",
      displayName: "曾伟",
      mutualValue: {
        contactReceives: "获得关西可信赖的落地服务商介绍。",
        orbitUserReceives: "补强跨境 D2C 客户在日本落地的服务资源。",
        valueTypes: ["commercial_opportunity", "knowledge_exchange"]
      },
      nextAction: {
        dueAt: "2026-07-24T09:00:00+09:00",
        label: "确认税务顾问需求",
        rationale: "先确认预算和时间线，再决定是否介绍服务商。"
      },
      relationshipStage: "needs_follow_up",
      relationshipType: "partner_candidate"
    },
    state: "success",
    summary: "Live relationship profile preview was loaded from shared relationship storage.",
    updateSummary:
      "Live preview changed relationship profile for 曾伟 to partner_candidate."
  });

  assert.equal(view.kind, "ready");
  assert.equal(view.title, "曾伟的关系画像");
  assert.equal(view.profileLine, "合作伙伴 · 待跟进");
  assert.equal(view.summary, "已生成关系画像预览，复核后再使用。");
  assert.equal(view.context, "曾伟正在寻找日本落地可信赖的税务与设立顾问。");
  assert.deepEqual(view.mutualValues, [
    { label: "对方获得", value: "获得关西可信赖的落地服务商介绍。" },
    {
      label: "小雨获得",
      value: "补强跨境 D2C 客户在日本落地的服务资源。"
    },
    { label: "价值类型", value: "商业机会、知识交换" }
  ]);
  assert.equal(view.nextActionTitle, "确认税务顾问需求");
  assert.equal(view.nextActionDetail, "先确认预算和时间线，再决定是否介绍服务商。");
  assert.equal(view.nextActionDue, "7月24日 09:00");
  assert.equal(
    view.safetyText,
    "只生成关系画像预览，不会外发消息、写入日历或通知。"
  );
});
