import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import type { OrbitContactsViewModel } from "../../app/(app)/app/orbit-contacts-route-view-model";
import type { ContactsAnalysisView } from "../../app/(app)/app/contacts/analysis/contacts-analysis-view-model";
import { NetworkPipeline } from "../../app/(app)/app/contacts/network-0918/network-pipeline";
import { contactsAnalysisToView } from "../../app/(app)/app/contacts/analysis/contacts-analysis-view-model";
import { OrbitLanguageProvider } from "../../app/(app)/app/orbit-language-context";
import { forbiddenHits, networkDebugPayload } from "../fixtures/network-debug-payload";

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

const action = (id: string) => ({ id, title: `T${id}`, judgment: `J${id}`, contactName: "", dueLabel: `D${id}`, primary: { label: "go", href: `/app/contacts/${id}` } });
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

test("pipeline shows \"in progress\" (not a real empty state) while analysis is pending", () => {
  const html = renderToStaticMarkup(<NetworkPipeline viewModel={vm} analysis={pending} />);
  assert.match(html, /最近新增 — 位/);
  assert.equal((html.match(/class="btn nw-suggest"/g) ?? []).length, 0);
  assert.match(html, /nw-empty">分析生成中</);
  assert.doesNotMatch(html, /暂无建议/);
  assert.match(html, /class="btn nw-shuffle"[^>]*disabled/);
});

// review P1：AI 建议区按状态渲染（zh／en 矩阵）。
const withOpportunities = (opportunities: Extract<ContactsAnalysisView, { state: "ready" }>["opportunities"]): ContactsAnalysisView => ({ ...(ready as Extract<ContactsAnalysisView, { state: "ready" }>), opportunities });
const MATRIX: Array<[string, ContactsAnalysisView, { zh: string; en: string }]> = [
  ["empty", withOpportunities({ state: "empty", data: { summary: "", actions: [], dormant: [] } }), { zh: "暂无建议", en: "No suggestions yet" }],
  ["pending section", withOpportunities({ state: "pending" }), { zh: "分析生成中", en: "Analysis in progress" }],
  ["unavailable section", withOpportunities({ state: "unavailable" }), { zh: "来源暂时不可用", en: "Source temporarily unavailable" }],
  ["page pending", { state: "pending" }, { zh: "分析生成中", en: "Analysis in progress" }],
  ["page error", { state: "error" }, { zh: "来源暂时不可用", en: "Source temporarily unavailable" }],
];
for (const language of ["zh", "en"] as const) {
  for (const [name, analysis, copy] of MATRIX) {
    test(`review P1 (${language}): pipeline suggestions for ${name}`, () => {
      const html = renderToStaticMarkup(<OrbitLanguageProvider initialLanguage={language}><NetworkPipeline viewModel={vm} analysis={analysis} /></OrbitLanguageProvider>);
      const others = Object.values(MATRIX.reduce<Record<string, string>>((acc, [, , c]) => ({ ...acc, [c[language]]: c[language] }), {})).filter((text) => text !== copy[language]);
      const area = html.replace(/<style[\s\S]*?<\/style>/g, "").split('data-network-section="suggestions"')[1]?.split('class="nw-pipe-filters"')[0] ?? "";
      assert.match(area, new RegExp(`nw-empty">${copy[language]}<`));
      for (const other of others) assert.equal(area.includes(other), false, `${name} must not show ${other}`);
    });
  }
}

for (const language of ["zh", "en"] as const) {
  test(`SC-W0043-02 (${language}): pipeline suggestions show task titles, contact names and bilingual due tags, no backend sentences`, () => {
    const analysis = contactsAnalysisToView(networkDebugPayload(), language);
    const html = renderToStaticMarkup(<OrbitLanguageProvider initialLanguage={language}><NetworkPipeline viewModel={vm} analysis={analysis} /></OrbitLanguageProvider>).replace(/<style[\s\S]*?<\/style>/g, "");
    assert.deepEqual(forbiddenHits(html), []);
    assert.match(html, /nw-suggest-title">给王敏发提案资料<\/strong><span class="nw-suggest-desc">王敏</);
    assert.match(html, language === "zh" ? /nw-suggest-tag[^>]*>今天到期或已逾期</ : /nw-suggest-tag[^>]*>Today or overdue</);
  });
}
