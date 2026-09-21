import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { ContactsAnalysisView } from "../../app/(app)/app/contacts/analysis/contacts-analysis-view-model";
import { NetworkAnalysis } from "../../app/(app)/app/contacts/network-0918/network-analysis";
import { NetworkOverview } from "../../app/(app)/app/contacts/network-0918/network-overview";

const empty = { connections: [], events: [], intros: [], pipelineStatuses: [] };
const ready: ContactsAnalysisView = {
  state: "ready", generatedAt: "2026-09-21T00:00:00Z", summary: "结构总结句", analysis: { state: "unavailable" },
  activity: [{ id: "a1", label: "王敏 added to the live relationship database", occurredAt: "2026-09-18T03:00:00Z", source: "名片导入" }],
  metrics: { contacts: 7, newContacts: 2, highValue: 3, pendingFollowups: 4, dormant: 5 },
  goal: { state: "ready", data: { id: "profile:1", text: "认识供应链负责人", updatedAt: "2026-09-01T00:00:00Z", canEdit: true } },
  structure: { state: "ready", data: { summary: "维度小结", health: [{ id: "strong", count: 3, percentage: 43, risk: "low" }, { id: "warm", count: 2, percentage: 29, risk: "moderate" }, { id: "weak", count: 2, percentage: 28, risk: "high" }], dimensions: { industry: [{ id: "tech", label: "科技与互联网", count: 5, percentage: 71, missingData: false, href: "/app/contacts/analysis/industry/tech" }, { id: "fin", label: "金融与投资", count: 2, percentage: 29, missingData: false, href: "" }], location: [], role: [], relationship: [] } } },
  coverage: { state: "ready", data: { score: 40, summary: "覆盖总结", gaps: [{ id: "g1", label: "制造与供应链", severity: "high", current: 1, target: 5, action: "拓展制造业联系人" }] } },
  opportunities: { state: "ready", data: { summary: "机会总结", actions: [{ id: "o1", title: "跟进王敏", judgment: "近期有互动", contactName: "王敏", dueLabel: "今日", evidence: [], steps: [], primary: { label: "查看联系人", href: "/app/contacts/c1" } }], dormant: [{ id: "d1", name: "李雷", reason: "90 天未联系", action: "发一条问候", href: "/app/contacts/c2" }] } },
};

test("overview renders donut, cockpit, stage bar and recent list from real data", () => {
  const html = renderToStaticMarkup(<NetworkOverview viewModel={empty} analysis={{ state: "pending" }} />);
  assert.match(html, /data-network-screen="overview"/);
  assert.match(html, /人脉分布/);
  assert.match(html, /AI 人脉驾驶舱/);
  assert.equal((html.match(/class="btn nw-cockpit-card"/g) ?? []).length, 4);
  assert.match(html, /nw-cockpit-n">—</); // 非 ready → —
  assert.match(html, /最近动态/);
  assert.match(html, /还没有互动记录/);
  assert.match(html, /本周没有正在推进的关系/);
  assert.equal((html.match(/class="btn nw-stage-seg"/g) ?? []).length, 4);
  assert.doesNotMatch(html, /428|128|85%/);
});

test("overview renders real activity rows and cockpit counts when ready", () => {
  const html = renderToStaticMarkup(<NetworkOverview viewModel={empty} analysis={ready} />);
  assert.match(html, /nw-cockpit-n">3</);
  assert.match(html, /王敏 added to the live relationship database/);
  assert.match(html, /9月18日/);
  assert.match(html, /最近新增 2 位/);
  assert.doesNotMatch(html, /\+25%/);
});

test("analysis sub-page renders structure and opportunities tabs from real sections", () => {
  const struct = renderToStaticMarkup(<NetworkAnalysis viewModel={empty} analysis={ready} initialTab="struct" />);
  assert.match(struct, /data-network-screen="analysis"/);
  assert.match(struct, /AI 人脉分析/);
  assert.match(struct, /结构总结句/);
  assert.match(struct, /维度小结/);
  assert.match(struct, /覆盖总结/);
  assert.equal((struct.match(/class="nw-health-item"/g) ?? []).length, 3);
  assert.doesNotMatch(struct, /决策层占比|62%|37%|3\.2 次/);
  assert.match(struct, /强关系占比[\s\S]*?43%/);
  const opp = renderToStaticMarkup(<NetworkAnalysis viewModel={empty} analysis={ready} initialTab="opp" />);
  assert.match(opp, /机会总结/);
  assert.match(opp, /认识供应链负责人/);
  assert.match(opp, /nw-goal-score">40</);
  assert.match(opp, /制造与供应链/);
  assert.match(opp, /优先拓展/);
  assert.match(opp, /王敏 · 近期有互动/);
  assert.match(opp, /待唤醒关系[\s\S]*?李雷/);
  assert.match(opp, /尚未生成/);
});

test("analysis sub-page renders empty states when analysis is pending", () => {
  const html = renderToStaticMarkup(<NetworkAnalysis viewModel={empty} analysis={{ state: "pending" }} initialTab="struct" />);
  assert.match(html, /分析生成中/);
  assert.doesNotMatch(html, /核心人脉/);
});
