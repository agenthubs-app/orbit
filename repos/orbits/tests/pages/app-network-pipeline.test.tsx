import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import type { OrbitContactsViewModel } from "../../app/(app)/app/orbit-contacts-route-view-model";
import type { ContactsAnalysisView } from "../../app/(app)/app/contacts/analysis/contacts-analysis-view-model";
import { NetworkPipeline } from "../../app/(app)/app/contacts/network-0918/network-pipeline";
import { contactsAnalysisToView } from "../../app/(app)/app/contacts/analysis/contacts-analysis-view-model";
import { OrbitLanguageProvider } from "../../app/(app)/app/orbit-language-context";
import { forbiddenHits, networkDebugPayload } from "../fixtures/network-debug-payload";
import type { NetworkTierBoardView } from "../../app/(app)/app/contacts/network-0918/network-model";

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

// W0047：看板 = 档位读模型。列头人数统计全部联系人（这里 41 位，远多于读到资料的 4 张卡），卡片按最近往来倒序。
const board: NetworkTierBoardView = {
  counts: { new: 20, active: 9, core: 5, dormant: 7 },
  columns: { new: ["b", "a"], active: ["c"], core: [], dormant: ["d", "missing-profile"] },
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

test("SC-W0047-04: pipeline renders the four automatic tiers; column counts cover every contact, cards follow the board order", () => {
  const html = renderToStaticMarkup(<NetworkPipeline viewModel={vm} analysis={ready} board={board} />).replace(/<style[\s\S]*?<\/style>/g, "");
  assert.match(html, /data-network-screen="pipeline"/);
  assert.equal((html.match(/class="nw-kanban-col"/g) ?? []).length, 4);
  const columns = html.split('class="nw-kanban-col"').slice(1);
  assert.deepEqual(columns.map((col) => /data-network-tier="(\w+)"/.exec(col)?.[1]), ["new", "active", "core", "dormant"]);
  for (const label of ["新认识", "有往来", "核心", "待唤醒"]) assert.match(html, new RegExp(`nw-kanban-label">${label}<`));
  // 手动阶段与「待设置关系」下线。
  for (const label of ["待了解", "保持联系", "正在推进", "已归档", "已建立合作", "待设置关系"]) assert.doesNotMatch(html, new RegExp(label));
  // 列头人数 = 看板人数（全部联系人），不是读到资料的卡片数。
  assert.deepEqual(columns.map((col) => /nw-kanban-n"[^>]*>(\d+)</.exec(col)?.[1]), ["20", "9", "5", "7"]);
  // 卡片顺序 = 看板顺序（最近往来倒序）；读不到资料的 id 不渲染空卡；超出部分说明「显示最近往来的 N 位」。
  assert.deepEqual([...columns[0]!.matchAll(/href="\/app\/contacts\/(\w+)"/g)].map((m) => m[1]).filter((id, i, all) => all.indexOf(id) === i), ["b", "a"]);
  assert.equal((columns[3]!.match(/class="nw-kanban-card"/g) ?? []).length, 1);
  assert.match(columns[0]!, /显示最近往来的 2 位，共 20 位/);
  // 无拖拽、无假筛选 chip（阶段／来源／提醒／排序），只留搜索；不显示分数。
  assert.doesNotMatch(html, /draggable|nw-pipe-filter[" ]|全部阶段|全部来源|全部提醒/);
  assert.match(html, /class="nw-pipe-search"/);
  // 五个统计块：总数 41，各档人数
  assert.match(html, /nw-pstat-n">41</);
  for (const n of ["20", "9", "5", "7"]) assert.match(html, new RegExp(`nw-pstat-n">${n}<`));
  // 最近新增取 analysis.metrics.newContacts；无 +25% 假数据
  assert.match(html, /最近新增 6 位/);
  assert.doesNotMatch(html, /\+25%/);
  // AI 建议：前 3 条，第 4 条留给「换一批」
  assert.equal((html.match(/class="btn nw-suggest"/g) ?? []).length, 3);
  assert.match(html, /T1/);
  assert.doesNotMatch(html, /T4/);
  // 四张看板卡片链到详情
  assert.equal((html.match(/class="nw-kanban-card"/g) ?? []).length, 4);
  // 英文
  const en = renderToStaticMarkup(<OrbitLanguageProvider initialLanguage="en"><NetworkPipeline viewModel={vm} analysis={ready} board={board} /></OrbitLanguageProvider>);
  for (const label of ["New", "Active", "Core", "To re-engage"]) assert.match(en, new RegExp(`nw-kanban-label">${label}<`));
  assert.match(en, /Showing the 2 most recent of 20/);
  assert.match(html, /href="\/app\/contacts\/a"/);
  assert.doesNotMatch(html, /97|128/);
});

test("pipeline shows \"in progress\" (not a real empty state) while analysis is pending", () => {
  const html = renderToStaticMarkup(<NetworkPipeline viewModel={vm} analysis={pending} board={board} />);
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
      const html = renderToStaticMarkup(<OrbitLanguageProvider initialLanguage={language}><NetworkPipeline viewModel={vm} analysis={analysis} board={board} /></OrbitLanguageProvider>);
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
    const html = renderToStaticMarkup(<OrbitLanguageProvider initialLanguage={language}><NetworkPipeline viewModel={vm} analysis={analysis} board={board} /></OrbitLanguageProvider>).replace(/<style[\s\S]*?<\/style>/g, "");
    assert.deepEqual(forbiddenHits(html), []);
    assert.match(html, /nw-suggest-title">给王敏发提案资料<\/strong><span class="nw-suggest-desc">王敏</);
    assert.match(html, language === "zh" ? /nw-suggest-tag[^>]*>今天到期或已逾期</ : /nw-suggest-tag[^>]*>Today or overdue</);
  });
}
