import assert from "node:assert/strict";
import test from "node:test";
import type React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ContactsAnalysisView } from "../../app/(app)/app/contacts/analysis/contacts-analysis-view-model";
import { NetworkAnalysis } from "../../app/(app)/app/contacts/network-0918/network-analysis";
import { NetworkOverview } from "../../app/(app)/app/contacts/network-0918/network-overview";
import { contactsAnalysisToView } from "../../app/(app)/app/contacts/analysis/contacts-analysis-view-model";
import { OrbitLanguageProvider } from "../../app/(app)/app/orbit-language-context";
import type { OrbitLanguage } from "../../shared/contract/language";
import type { OrbitContactsViewModel } from "../../app/(app)/app/orbit-contacts-route-view-model";
import { forbiddenHits, networkDebugPayload, networkEmptyPayload, networkSectionFailurePayload, networkSections, networkUnavailablePayload } from "../fixtures/network-debug-payload";
import { buildNetworkOverviewData, type OverviewCockpitParts } from "../../app/(app)/app/contacts/network-0918/network-overview-cockpit-model";
import { ANALYSIS_35, SNAPSHOT_FAILED, SNAPSHOT_NONE, analysisWithHealth, parts } from "../fixtures/network-overview-cockpit";

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

/** W0052：概览的数据 = 分析 + 服务端组装的驾驶舱附加数据（`overview` prop）。 */
function overviewFor(analysis: ContactsAnalysisView, overrides: Partial<OverviewCockpitParts> = {}) {
  return buildNetworkOverviewData(parts(overrides), analysis);
}

test("overview renders donut, cockpit, tier bar and recent activity; a pending analysis shows dashes, not fake numbers", () => {
  const html = renderToStaticMarkup(<NetworkOverview analysis={{ state: "pending" }} overview={overviewFor({ state: "pending" }, { snapshot: SNAPSHOT_NONE })} />);
  assert.match(html, /data-network-screen="overview"/);
  assert.match(html, /人脉分布/);
  assert.match(html, /AI 人脉驾驶舱/);
  assert.equal((html.match(/class="btn nw-cockpit-card"/g) ?? []).length, 4);
  assert.match(html, /data-overview-card="structure"[\s\S]*?nw-cockpit-n">—</);
  assert.match(html, /nw-donut-n">—</);
  assert.match(html, /nw-cockpit-meta">分析生成中</);
  assert.equal((html.match(/class="btn nw-stage-seg"/g) ?? []).length, 4);
  assert.match(html, /nw-stage-n">—</);
  assert.match(html, /最近动态/);
  assert.doesNotMatch(html, /428|128|85%/);
});

test("SC-W0052-01/02/03 (zh): cards, tier bar, highlights and activity from the overview data", () => {
  const html = withoutStyles(renderToStaticMarkup(<NetworkOverview analysis={ANALYSIS_35} overview={overviewFor(ANALYSIS_35)} />));
  const cockpit = networkSections(html).cockpit ?? "";
  // ① 结构
  assert.match(cockpit, /href="\/app\/contacts\/dashboard\?tab=structure" data-overview-card="structure"[\s\S]*?人脉结构[\s\S]*?35 位联系人[\s\S]*?nw-cockpit-sentence">人脉集中在科技行业，制造业还很少。</);
  // ② 目标缺口 → 机会标签
  assert.match(cockpit, /href="\/app\/contacts\/dashboard\?tab=opportunities" data-overview-card="gap"[\s\S]*?已有 3／共 5[\s\S]*?还缺能引荐制造业采购的人。/);
  // ③ 本周行动 → 计划页
  assert.match(cockpit, /href="\/app\/agent\/plan" data-overview-card="week"[\s\S]*?3 项建议动作[\s\S]*?本周先约王敏聊试用。/);
  // ④ 待唤醒 → 机会标签
  assert.match(cockpit, /href="\/app\/contacts\/dashboard\?tab=opportunities" data-overview-card="dormant"[\s\S]*?5 位待唤醒[\s\S]*?5 位曾有往来、60 天没有新记录/);
  assert.match(html, /nw-cockpit-meta">生成于10月1日 · 基于 33 人</);
  // 旧卡（高价值／新增人脉）与「来自关系评估」类标签下线。
  assert.doesNotMatch(html, /高价值关系|新增人脉|来自关系评估|来自导入记录/);
  // 关系档位：全量 12／10／8／5，各段链到按档位名单。
  const tiers = networkSections(html).tiers ?? "";
  assert.match(tiers, /关系档位/);
  for (const [id, label, n] of [["new", "新认识", 12], ["active", "有往来", 10], ["core", "核心", 8], ["dormant", "待唤醒", 5]] as const) {
    assert.match(tiers, new RegExp(`href="/app/contacts/analysis/tier/${id}" data-network-tier="${id}"[^>]*><span class="nw-stage-label">${label}</span><strong class="nw-stage-n">${n}<`), id);
  }
  // 重点联系人：核心档最近信号最新的两位，带档位标。
  assert.match(tiers, /href="\/app\/contacts\/core-new" data-network-highlight="core"[\s\S]*?核心甲[\s\S]*?最近往来 9月29日[\s\S]*?nw-hl-stage[^>]*>核心</);
  assert.match(tiers, /href="\/app\/contacts\/core-old" data-network-highlight="core"/);
  // 手动阶段文字不再出现在概览。
  assert.doesNotMatch(html, /待了解|推进中|保持联系|归档|关系推进管线/);
  // 最近动态：5 条，按时间倒序，姓名链接 + 来源徽标 + 摘要 + 时间（东京时间）。
  const activity = networkSections(html).activity ?? "";
  assert.equal((activity.match(/class="nw-recent-row"/g) ?? []).length, 5);
  assert.match(activity, /data-timeline-source="memo"[\s\S]*?href="\/app\/contacts\/c1">王敏<\/a>[\s\S]*?nw-recent-badge">memo<[\s\S]*?nw-recent-org">聊了试用，下周再约<[\s\S]*?nw-recent-last">9月30日 18:00</);
  assert.match(activity, /data-timeline-source="encounter"[\s\S]*?nw-recent-badge">见面<[\s\S]*?nw-recent-org">在活动上见面</);
  assert.match(activity, /data-timeline-source="schedule"[\s\S]*?nw-recent-org">会面</);
  // 白名单：夹具里每条后端 title 都是英文调试句，页面 0 命中（review P2）。
  assert.doesNotMatch(html, /DEBUG|backend title|confirmed by|example\.invalid/);
  assert.ok(activity.indexOf("王敏") < activity.indexOf("佐々木 健") && activity.indexOf("佐々木 健") < activity.indexOf("Lin Zhi"), "newest first");
  // 名单之外的人名也照常显示（姓名不经 localizeOrbitTree）。
  assert.match(activity, /佐々木 健/);
});

for (const language of ["en", "ja"] as const) {
  test(`SC-W0052-01/03 (${language}): cards, meta, badges and system summaries are English; memo text is the user's own`, () => {
    const html = inLanguage(language, <NetworkOverview analysis={ANALYSIS_35} overview={overviewFor(ANALYSIS_35)} />);
    assert.match(html, /Network structure[\s\S]*?35 contacts/);
    assert.match(html, /Goal gaps[\s\S]*?3 of 5 covered/);
    assert.match(html, /This week[\s\S]*?3 suggested actions/);
    assert.match(html, /5 to re-engage[\s\S]*?5 contacts you were in touch with have had no new records for 60 days/);
    assert.match(html, /nw-cockpit-meta">Generated 10\/1 · based on 33 contacts</);
    assert.match(html, /Relationship tiers/);
    assert.match(html, /nw-recent-badge">Memo<[\s\S]*?nw-recent-org">聊了试用，下周再约</);
    assert.match(html, /nw-recent-badge">Met<[\s\S]*?nw-recent-org">Met at an event</);
    assert.match(html, /nw-recent-last">Sep 30 18:00</);
    assert.doesNotMatch(html, /人脉结构|位联系人|在活动上见面|关系档位|最近动态/);
  });
}

test("SC-W0052-01: no snapshot → no sentence containers or placeholder; meta uses the full count", () => {
  const html = withoutStyles(renderToStaticMarkup(<NetworkOverview analysis={ANALYSIS_35} overview={overviewFor(ANALYSIS_35, { snapshot: SNAPSHOT_NONE })} />));
  assert.doesNotMatch(html, /nw-cockpit-sentence/);
  assert.match(html, /nw-cockpit-meta">依据 35 位联系人</);
  assert.match(html, /35 位联系人[\s\S]*?已有 3／共 5[\s\S]*?3 项建议动作[\s\S]*?5 位待唤醒/);
  assert.doesNotMatch(html, /暂无|占位|分析生成中|暂时不可用/);
});

test("SC-W0052-01: snapshot read failure → numbers as usual, no sentences, meta says AI analysis is unavailable and nothing else errors", () => {
  for (const language of ["zh", "en"] as const) {
    const html = inLanguage(language, <NetworkOverview analysis={ANALYSIS_35} overview={overviewFor(ANALYSIS_35, { snapshot: SNAPSHOT_FAILED })} />);
    assert.doesNotMatch(html, /nw-cockpit-sentence/);
    assert.match(html, language === "zh" ? /nw-cockpit-meta">AI 分析暂时不可用</ : /nw-cockpit-meta">AI analysis temporarily unavailable</);
    assert.doesNotMatch(html, UNAVAILABLE, "no other error text");
    assert.match(html, language === "zh" ? /35 位联系人/ : /35 contacts/);
  }
});

test("SC-W0052-01: no plan → card ② is the 「生成计划」 entry linking to the plan page", () => {
  const html = withoutStyles(renderToStaticMarkup(<NetworkOverview analysis={ANALYSIS_35} overview={overviewFor(ANALYSIS_35, { pendingMatches: 0, plan: null })} />));
  assert.match(html, /href="\/app\/agent\/plan" data-overview-card="gap"[\s\S]*?nw-cockpit-plan-cta">生成计划 →</);
  assert.match(html, /data-overview-card="week"[\s\S]*?0 项建议动作/);
});

test("SC-W0052-03: empty timeline → 「还没有互动记录」; timeline failure → only this block says unavailable", () => {
  const empty = withoutStyles(renderToStaticMarkup(<NetworkOverview analysis={ANALYSIS_35} overview={overviewFor(ANALYSIS_35, { timeline: { items: [], unavailable: false } })} />));
  assert.match(networkSections(empty).activity ?? "", /还没有互动记录/);
  const failed = withoutStyles(renderToStaticMarkup(<NetworkOverview analysis={ANALYSIS_35} overview={overviewFor(ANALYSIS_35, { timeline: null })} />));
  const sections = networkSections(failed);
  assert.match(sections.activity ?? "", /来源暂时不可用/);
  assert.doesNotMatch(sections.cockpit ?? "", UNAVAILABLE);
  assert.doesNotMatch(sections.tiers ?? "", UNAVAILABLE);
  assert.match(sections.cockpit ?? "", /35 位联系人/);
  assert.match(sections.tiers ?? "", /nw-stage-n">12</);
});

test("SC-W0052-02 (review P2): an incomplete tier cache shows 「N 人待统计」 under the bar instead of zeros", () => {
  const partial = analysisWithHealth([{ count: 8, id: "core" }]);
  const zh = withoutStyles(renderToStaticMarkup(<NetworkOverview analysis={partial} overview={overviewFor(partial)} />));
  assert.match(networkSections(zh).tiers ?? "", /nw-tier-pending" role="status">27 人待统计（档位统计更新中）</);
  const en = inLanguage("en", <NetworkOverview analysis={partial} overview={overviewFor(partial)} />);
  assert.match(en, /27 contacts not yet tiered \(tiers updating\)/);
  const complete = withoutStyles(renderToStaticMarkup(<NetworkOverview analysis={ANALYSIS_35} overview={overviewFor(ANALYSIS_35)} />));
  assert.doesNotMatch(complete, /nw-tier-pending/);
});

test("SC-W0052-04: donut centre is the full count (35), not a 30-row list page; industry/region rows come from the full distribution", () => {
  const html = withoutStyles(renderToStaticMarkup(<NetworkOverview analysis={ANALYSIS_35} overview={overviewFor(ANALYSIS_35)} />));
  assert.match(html, /nw-donut-n">35</);
  assert.match(html, /nw-dist-label">科技与互联网<\/span><strong class="nw-dist-n">20</);
  assert.match(html, /nw-dist-label">未分类<\/span><strong class="nw-dist-n">15</);
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
  // W0051：第三个标签「洞察」；结构／机会两个链接与语义照旧。
  assert.match(struct, /href="\/app\/contacts\/dashboard\?tab=structure"[\s\S]*?href="\/app\/contacts\/dashboard\?tab=opportunities"[\s\S]*?href="\/app\/contacts\/dashboard\?tab=insight"/);
  const insight = withoutStyles(renderToStaticMarkup(<NetworkAnalysis viewModel={empty} analysis={ready} initialTab="insight" />));
  assert.match(insight, /洞察暂时读不到/);
  assert.doesNotMatch(insight, /计划暂时读不到|核心关系占比/);
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
function inLanguage(language: OrbitLanguage, node: React.ReactElement) {
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
      overview: inLanguage(language, <NetworkOverview analysis={view} overview={overviewFor(view, { snapshot: SNAPSHOT_NONE })} />),
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

test("SC-W0043-03 / SC-W0052-03: the overview no longer renders the backend activity list; group names stay bilingual", () => {
  const zh = contactsAnalysisToView(networkDebugPayload(), "zh");
  const en = contactsAnalysisToView(networkDebugPayload(), "en");
  // W0052：最近动态改读关系时间线；分析视图里的 activity（含「新增联系人」模板与任务标题）不再进入概览。
  const zhOverview = inLanguage("zh", <NetworkOverview analysis={zh} overview={overviewFor(zh, { snapshot: SNAPSHOT_NONE, timeline: { items: [], unavailable: false } })} />);
  assert.doesNotMatch(zhOverview, /新增联系人|给王敏发提案资料|live relationship database|Live contact source|Live task source/);
  assert.match(networkSections(zhOverview).activity ?? "", /还没有互动记录/);
  const enStruct = inLanguage("en", <NetworkAnalysis viewModel={withWang} analysis={en} initialTab="struct" />);
  assert.match(enStruct, /Manufacturing &amp; Supply Chain/);
  assert.match(enStruct, /Unclassified/);
  assert.doesNotMatch(enStruct, /未分类/);
});

// ---- W0043 review：整页 error、逐区块失败 ----
for (const language of ["zh", "en"] as const) {
  test(`review P1 (${language}): overview with a failed analysis says "unavailable" in the meta and shows dashes, not "in progress"`, () => {
    const html = inLanguage(language, <NetworkOverview analysis={{ state: "error" }} overview={overviewFor({ state: "error" }, { snapshot: SNAPSHOT_NONE })} />);
    assert.match(html, language === "zh" ? /nw-cockpit-meta">来源暂时不可用</ : /nw-cockpit-meta">Source temporarily unavailable</);
    assert.match(html, /nw-donut-n">—</);
    assert.match(html, /nw-stage-n">—</);
    assert.doesNotMatch(html, /分析生成中|Analysis in progress/);
    // W0052：最近动态来自时间线，不受分析失败影响。
    assert.doesNotMatch(networkSections(html).activity ?? "", UNAVAILABLE);
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
