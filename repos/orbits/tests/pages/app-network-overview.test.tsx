import assert from "node:assert/strict";
import test from "node:test";
import type React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ContactsAnalysisView } from "../../app/(app)/app/contacts/analysis/contacts-analysis-view-model";
import { NetworkAnalysis } from "../../app/(app)/app/contacts/network-0918/network-analysis";
import { NetworkOverview } from "../../app/(app)/app/contacts/network-0918/network-overview";
import { contactsAnalysisToView } from "../../app/(app)/app/contacts/analysis/contacts-analysis-view-model";
import { OrbitLanguageProvider } from "../../app/(app)/app/orbit-language-context";
import type { OrbitContactsViewModel } from "../../app/(app)/app/orbit-contacts-route-view-model";
import { forbiddenHits, networkDebugPayload, networkEmptyPayload, networkSectionFailurePayload, networkSections, networkUnavailablePayload } from "../fixtures/network-debug-payload";

const empty = { connections: [], events: [], intros: [], pipelineStatuses: [] };
const ready: ContactsAnalysisView = {
  state: "ready", generatedAt: "2026-09-21T00:00:00Z", summary: "结构总结句", analysis: { state: "unavailable" },
  activity: [
    { id: "a1", label: "新增联系人", contactName: "王敏", occurredAt: "2026-09-18T03:00:00Z", source: "名片导入" },
    { id: "a2", label: "李雷 confirmed", occurredAt: "2026-09-17T03:00:00Z", source: "Business card · confirmed by qa@example.invalid" },
  ],
  metrics: { contacts: 7, newContacts: 2, highValue: 3, pendingFollowups: 4, dormant: 5 },
  goal: { state: "ready", data: { id: "profile:1", text: "认识供应链负责人", updatedAt: "2026-09-01T00:00:00Z", canEdit: true } },
  structure: { state: "ready", data: { summary: "维度小结", health: [{ id: "core", count: 3, percentage: 43 }, { id: "active", count: 2, percentage: 29 }, { id: "new", count: 2, percentage: 28 }], dimensions: { industry: [{ id: "tech", label: "科技与互联网", count: 5, percentage: 71, missingData: false, href: "/app/contacts/analysis/industry/tech" }, { id: "fin", label: "金融与投资", count: 2, percentage: 29, missingData: false, href: "" }], location: [], role: [], relationship: [] } } },
  coverage: { state: "ready", data: { summary: "覆盖总结" } },
  opportunities: { state: "ready", data: { summary: "机会总结", actions: [{ id: "o1", title: "跟进王敏", judgment: "近期有互动", contactName: "王敏", dueLabel: "今日", primary: { label: "查看联系人", href: "/app/contacts/c1" } }], dormant: [{ id: "d1", name: "李雷", reason: "90 天未联系", action: "发一条问候", href: "/app/contacts/c2" }] } },
};

test("overview renders donut, cockpit, stage bar and recent list from real data", () => {
  const html = renderToStaticMarkup(<NetworkOverview viewModel={empty} analysis={{ state: "pending" }} />);
  assert.match(html, /data-network-screen="overview"/);
  assert.match(html, /人脉分布/);
  assert.match(html, /AI 人脉驾驶舱/);
  assert.equal((html.match(/class="btn nw-cockpit-card"/g) ?? []).length, 4);
  assert.match(html, /nw-cockpit-n">—</); // 非 ready → —
  assert.match(html, /最近动态/);
  // pending 不显示真实空态（review P1）
  assert.match(html, /data-network-section="activity"[\s\S]*分析生成中/);
  assert.doesNotMatch(html, /还没有互动记录/);
  assert.match(html, /没有正在推进的关系/);
  assert.doesNotMatch(html, /本周/);
  assert.equal((html.match(/class="btn nw-stage-seg"/g) ?? []).length, 4);
  assert.doesNotMatch(html, /428|128|85%/);
});

test("overview renders real activity rows and cockpit counts when ready", () => {
  const html = renderToStaticMarkup(<NetworkOverview viewModel={empty} analysis={ready} />);
  assert.match(html, /nw-cockpit-n">3</);
  assert.match(html, /王敏 · 新增联系人/);
  assert.match(html, /9月18日/);
  assert.match(html, /最近新增 2 位/);
  assert.doesNotMatch(html, /\+25%/);
  // 最近动态来源经 metSummary 清洗：账号邮箱 / 「confirmed by」句不渲染
  assert.match(html, /nw-recent-org">名片导入</);
  assert.doesNotMatch(html, /example\.invalid/);
  assert.doesNotMatch(html, /confirmed by/i);
});

test("analysis sub-page renders structure and opportunities tabs from real sections", () => {
  const struct = renderToStaticMarkup(<NetworkAnalysis viewModel={empty} analysis={ready} initialTab="struct" />);
  assert.match(struct, /data-network-screen="analysis"/);
  assert.match(struct, /AI 人脉分析/);
  // W0049：结构诊断与洞察只来自快照（structureExtras）；视图里的 summary／coverage.summary 不再在结构标签渲染。
  assert.doesNotMatch(struct, /结构总结句|维度小结|覆盖总结/);
  // 关系健康固定四档（没有人的「待唤醒」显示 0），数字来自全量档位分布。
  assert.equal((struct.match(/class="nw-health-item"/g) ?? []).length, 4);
  assert.doesNotMatch(struct, /决策层占比|62%|37%|3\.2 次/);
  assert.match(struct, /核心关系占比[\s\S]*?43%/);
  // 环形图中心 = 分布全量（5 + 2），不是名单条数（empty 名单为 0）。
  assert.match(struct, /nw-dim-donut-n">7</);
  // W0050：机会标签不再读 ContactsAnalysisView 的机会／覆盖区块（数据来自 loadOpportunitiesTab，见 app-network-opportunities.test.tsx）；
  // 未加载时各块如实「暂时读不到」，旧的机会总结、规则重排动作、旧沉睡名单都不渲染，关系目标文字仍在。
  const opp = withoutStyles(renderToStaticMarkup(<NetworkAnalysis viewModel={empty} analysis={ready} initialTab="opp" />));
  assert.match(opp, /关系目标：认识供应链负责人/);
  assert.doesNotMatch(opp, /机会总结|覆盖总结|跟进王敏|李雷|刷新机会|去 iOrbit|nw-goal-score/);
  assert.match(opp, /计划暂时读不到/);
});

test("analysis sub-page renders empty states when analysis is pending", () => {
  const html = renderToStaticMarkup(<NetworkAnalysis viewModel={empty} analysis={{ state: "pending" }} initialTab="struct" />);
  assert.match(html, /分析生成中/);
  assert.doesNotMatch(html, /核心人脉/);
});

// ---- W0043：空态与失败分开、不出调试英文、双语 ----

const contactBase = { company: "东方制造", encounters: [], email: "", g: "g-violet", industry: "", initial: "王", lineId: "", location: "", lastEventId: "", met: "", note: "", notes: [], offering: "", phone: "", seeking: "", title: "", wechat: "", strength: "medium" as const, valueTags: [], nextAction: null, lastInteraction: "", dormant: false, stage: "" };
const withWang: OrbitContactsViewModel = {
  connections: [{ ...contactBase, id: "contact:wang-min", displayName: "王敏", pipelineStatus: "in_progress", relationshipStatus: "active", source: "event" }],
  events: [], intros: [], pipelineStatuses: [],
} as OrbitContactsViewModel;
/** NetworkShell 内联整页 CSS；类名断言只看 DOM，去掉 <style>。 */
function withoutStyles(html: string) { return html.replace(/<style[\s\S]*?<\/style>/g, ""); }
const UNAVAILABLE = /来源暂时不可用|Source temporarily unavailable/;
function inLanguage(language: "zh" | "en", node: React.ReactElement) {
  return withoutStyles(renderToStaticMarkup(<OrbitLanguageProvider initialLanguage={language}>{node}</OrbitLanguageProvider>));
}

for (const language of ["zh", "en"] as const) {
  test(`SC-W0043-01 (${language}): empty sections show their own empty states, never "unavailable"`, () => {
    const view = contactsAnalysisToView(networkEmptyPayload(), language);
    const struct = inLanguage(language, <NetworkAnalysis viewModel={withWang} analysis={view} initialTab="struct" />);
    assert.doesNotMatch(struct, UNAVAILABLE);
    if (language === "zh") {
      assert.match(struct, /当前维度暂无数据/);
      assert.match(struct, /暂无关系健康数据/);
    } else {
      assert.match(struct, /No data in this dimension/);
      assert.match(struct, /No relationship health data yet/);
    }
    assert.doesNotMatch(struct, /nw-an-hero"|nw-insight"|nw-dim-sum"|暂无总结|No summary yet/);
  });

  test(`SC-W0043-01 (${language}): failed sections (null + unavailableSections) show "unavailable"`, () => {
    const view = contactsAnalysisToView(networkUnavailablePayload(), language);
    const struct = inLanguage(language, <NetworkAnalysis viewModel={withWang} analysis={view} initialTab="struct" />);
    assert.match(struct, UNAVAILABLE);
    assert.doesNotMatch(struct, /当前维度暂无数据|No data in this dimension/);
  });

  test(`SC-W0043-02 (${language}): debug payload renders no backend debug sentence or fabricated number`, () => {
    const view = contactsAnalysisToView(networkDebugPayload(), language);
    const pages = {
      overview: inLanguage(language, <NetworkOverview viewModel={withWang} analysis={view} />),
      structure: inLanguage(language, <NetworkAnalysis viewModel={withWang} analysis={view} initialTab="struct" />),
      opportunities: inLanguage(language, <NetworkAnalysis viewModel={withWang} analysis={view} initialTab="opp" />),
    };
    for (const [page, html] of Object.entries(pages)) assert.deepEqual(forbiddenHits(html), [], `${page} (${language})`);
    // W43-3：没有真实句子的 hero 与洞察卡整块不渲染，不放占位句
    assert.doesNotMatch(pages.structure, /nw-an-hero"|nw-insight"|nw-dim-sum"|暂无总结|No summary yet/);
    assert.doesNotMatch(pages.opportunities, /nw-an-hero-opp|暂无总结|No summary yet/);
    // 图表保留；W0050 起机会标签不再渲染后端的机会／沉睡名单（数据改来自计划与快照）
    assert.match(pages.structure, /nw-dim-donut/);
    assert.doesNotMatch(pages.opportunities, /给王敏发提案资料|北辰资本/);
  });
}

test("SC-W0043-03: recent activity, action tags and group names are bilingual and built from real data", () => {
  const zh = contactsAnalysisToView(networkDebugPayload(), "zh");
  const en = contactsAnalysisToView(networkDebugPayload(), "en");
  const zhOverview = inLanguage("zh", <NetworkOverview viewModel={withWang} analysis={zh} />);
  const enOverview = inLanguage("en", <NetworkOverview viewModel={withWang} analysis={en} />);
  assert.match(zhOverview, /nw-recent-name">新增联系人 · 王敏</);
  assert.match(enOverview, /nw-recent-name">New contact · 王敏</);
  // 名单里找不到的联系人只写模板，不从后端句子解析名字
  assert.match(zhOverview, /nw-recent-name">新增联系人</);
  assert.doesNotMatch(enOverview, /Hidden Person/);
  assert.match(zhOverview, /nw-recent-name">给王敏发提案资料</);
  assert.match(zhOverview, /nw-recent-org">联系人</);
  assert.match(zhOverview, /nw-recent-org">跟进</);
  assert.match(enOverview, /nw-recent-org">Contact</);
  assert.match(enOverview, /nw-recent-org">Follow-up</);
  const enStruct = inLanguage("en", <NetworkAnalysis viewModel={withWang} analysis={en} initialTab="struct" />);
  assert.match(enStruct, /Manufacturing &amp; Supply Chain/);
  assert.match(enStruct, /Unclassified/);
  assert.doesNotMatch(enStruct, /未分类/);
});

// ---- W0043 review：整页 error、逐区块失败 ----
for (const language of ["zh", "en"] as const) {
  test(`review P1 (${language}): overview with a failed analysis says "unavailable", not "in progress" or a real empty state`, () => {
    const html = inLanguage(language, <NetworkOverview viewModel={withWang} analysis={{ state: "error" }} />);
    const activity = networkSections(html).activity ?? "";
    assert.match(activity, UNAVAILABLE);
    assert.doesNotMatch(activity, /还没有互动记录|No activity yet|分析生成中|Analysis in progress/);
    assert.match(html, language === "zh" ? /来源暂时不可用 · 依据 1 位联系人/ : /Source temporarily unavailable · based on 1 contacts/);
    assert.doesNotMatch(html, /分析生成中|Analysis in progress/);
  });

  test(`review P1 (${language}): each failed section shows "unavailable" in its own area only`, () => {
    // W0050：机会标签不再读这些区块（gaps／opportunities／profile 的失败只影响概览与结构），只留结构的分布区块。
    const expect: Record<"distributions", { tab: "struct" | "opp"; failed: string[]; healthy: string[] }> = {
      distributions: { tab: "struct", failed: ["structure", "top", "health"], healthy: [] },
    };
    for (const [section, { tab, failed, healthy }] of Object.entries(expect) as Array<[keyof typeof expect, (typeof expect)[keyof typeof expect]]>) {
      const view = contactsAnalysisToView(networkSectionFailurePayload(section), language);
      const sections = networkSections(inLanguage(language, <NetworkAnalysis viewModel={withWang} analysis={view} initialTab={tab} />));
      for (const key of failed) assert.match(sections[key] ?? "", UNAVAILABLE, `${section} → ${key} should be unavailable`);
      for (const key of healthy) assert.doesNotMatch(sections[key] ?? "", UNAVAILABLE, `${section} → ${key} should stay available`);
    }
  });
}
