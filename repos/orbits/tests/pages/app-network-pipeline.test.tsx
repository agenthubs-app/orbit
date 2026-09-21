import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import type { OrbitContactsViewModel } from "../../app/(app)/app/orbit-contacts-route-view-model";
import type { ContactsAnalysisView } from "../../app/(app)/app/contacts/analysis/contacts-analysis-view-model";
import { NetworkPipeline } from "../../app/(app)/app/contacts/network-0918/network-pipeline";

const base = { company: "X", encounters: [], email: "", g: "g-violet", industry: "", initial: "A", lineId: "", location: "", lastEventId: "", met: "", note: "", notes: [], offering: "", phone: "", seeking: "", title: "", wechat: "", strength: "medium" as const, valueTags: [], nextAction: null, lastInteraction: "", dormant: false, stage: "" };
const vm: OrbitContactsViewModel = {
  connections: [
    { ...base, id: "a", displayName: "A", pipelineStatus: "to_contact", relationshipStatus: "needs_follow_up", source: "event" },
    { ...base, id: "b", displayName: "B", pipelineStatus: "in_progress", relationshipStatus: "nurture", source: "event" },
    { ...base, id: "c", displayName: "C", pipelineStatus: "in_progress", relationshipStatus: "active", source: "event" },
    { ...base, id: "d", displayName: "D", pipelineStatus: "archived", relationshipStatus: "archived", source: "event" },
  ],
  events: [], intros: [], pipelineStatuses: [],
};

const action = (id: string) => ({ id, title: `T${id}`, judgment: `J${id}`, contactName: "", dueLabel: `D${id}`, evidence: [], steps: [], primary: { label: "go", href: `/app/contacts/${id}` } });
const ready: ContactsAnalysisView = {
  state: "ready", generatedAt: "2026-09-21T00:00:00Z", summary: "", activity: [], analysis: { state: "unavailable" },
  metrics: { contacts: 78, newContacts: 6, highValue: 12, pendingFollowups: 9, dormant: 8 },
  goal: { state: "empty", data: { id: null, text: "", updatedAt: "", canEdit: true } },
  structure: { state: "unavailable" }, coverage: { state: "unavailable" },
  opportunities: { state: "ready", data: { summary: "", dormant: [], actions: [action("1"), action("2"), action("3"), action("4")] } },
};
const pending: ContactsAnalysisView = { state: "pending" };

test("pipeline renders four stage columns with real counts and real stats", () => {
  const html = renderToStaticMarkup(<NetworkPipeline viewModel={vm} analysis={ready} />);
  assert.match(html, /data-network-screen="pipeline"/);
  assert.equal((html.match(/class="nw-kanban-col"/g) ?? []).length, 4);
  for (const label of ["待了解", "保持联系", "正在推进", "已归档"]) assert.match(html, new RegExp(label));
  assert.doesNotMatch(html, /已建立合作/);
  // 五个统计块：总数 4，各阶段 1
  assert.match(html, /nw-pstat-n">4</);
  assert.equal((html.match(/nw-pstat-n">1</g) ?? []).length, 4);
  // 最近新增取 analysis.metrics.newContacts；无 +25% 假数据
  assert.match(html, /最近新增 6 位/);
  assert.doesNotMatch(html, /\+25%/);
  // AI 建议：前 3 条，第 4 条留给「换一批」
  assert.equal((html.match(/class="btn nw-suggest"/g) ?? []).length, 3);
  assert.match(html, /T1/);
  assert.doesNotMatch(html, /T4/);
  // 四张看板卡片链到详情
  assert.equal((html.match(/class="nw-kanban-card"/g) ?? []).length, 4);
  assert.match(html, /href="\/app\/contacts\/a"/);
  assert.doesNotMatch(html, /97|128/);
});

test("pipeline renders the AI suggestions empty state when analysis is not ready", () => {
  const html = renderToStaticMarkup(<NetworkPipeline viewModel={vm} analysis={pending} />);
  assert.match(html, /最近新增 — 位/);
  assert.equal((html.match(/class="btn nw-suggest"/g) ?? []).length, 0);
  assert.match(html, /nw-empty">暂无建议</);
  assert.match(html, /class="btn nw-shuffle"[^>]*disabled/);
});
