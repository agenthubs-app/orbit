import assert from "node:assert/strict";
import test from "node:test";

import { connectionGraphToView } from "../src/view-models/connections-graph";

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
