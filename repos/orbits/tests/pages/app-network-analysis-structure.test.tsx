/**
 * W0049 SC-01（主证据）／SC-03／SC-04 组件层：「结构」标签。
 *
 * - 快照诊断 + 3 条洞察显示 `blocks` 的文字；点开依据只列出本人范围内解析到的联系人（他人、已删除的不出现），
 *   链接 `/app/contacts/{id}`；诊断旁「基于 N 位联系人」= contactCount；zh 中文、en 英文；
 * - 无快照 → ①④不渲染、②③正常；快照读失败 → ①④「来源暂时不可用」、②③正常；
 * - 环形图中心 = 全量 35（名单只给 30 条）；四个维度按钮切换；行业一级高亮 + 二级展开；图例「与计划人脉需求相关」；
 * - 关系健康四档 + 「较 30 天前」变化（数据不足时写「数据不足」）。
 */
import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import type React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";

import type { ContactsAnalysisView } from "../../app/(app)/app/contacts/analysis/contacts-analysis-view-model";
import { structureSnapshotView, type StructureTabExtras } from "../../app/(app)/app/contacts/analysis/structure-tab-model";
import { NetworkAnalysis } from "../../app/(app)/app/contacts/network-0918/network-analysis";
import { OrbitLanguageProvider } from "../../app/(app)/app/orbit-language-context";
import type { OrbitContactsViewModel } from "../../app/(app)/app/orbit-contacts-route-view-model";
import { networkSections } from "../fixtures/network-debug-payload";
import { analysisView, snapshotFixture } from "../support/structure-tab-fixture";

/** 名单只有 30 条（与真实 `loadAppContactsRouteViewModel` 默认分页一致），结构标签不得用它计数。 */
const list30 = { connections: Array.from({ length: 30 }, (_, index) => ({ id: `c${index}`, displayName: `联系人 ${index}` })), events: [], intros: [], pipelineStatuses: [] } as unknown as OrbitContactsViewModel;
const NAMES = new Map([["c00", "王敏"], ["c15", "李雷"], ["c01", "佐藤"], ["c02", "Ana"], ["c03", "Émile"]]);
const HISTORY = { tierCountsAt30d: { asOf: "2026-09-02T03:00:00.000Z", counts: { new: 14, active: 10, core: 4, dormant: 5 }, contactCount: 33 }, earliestCaptureAt: "2026-01-01T00:00:00.000Z" };

function extras(overrides: Partial<StructureTabExtras> = {}): StructureTabExtras {
  return { highlights: { primary: ["technology_internet"], secondary: ["technology_internet.ai_data"] }, snapshot: structureSnapshotView(snapshotFixture(), NAMES), tierHistory: HISTORY, ...overrides };
}

function withoutStyles(html: string) { return html.replace(/<style[\s\S]*?<\/style>/g, ""); }
function render(language: "zh" | "en", view: ContactsAnalysisView, structureExtras?: StructureTabExtras) {
  return withoutStyles(renderToStaticMarkup(<OrbitLanguageProvider initialLanguage={language}><NetworkAnalysis viewModel={list30} analysis={view} initialTab="struct" structureExtras={structureExtras} /></OrbitLanguageProvider>));
}

async function mount(t: TestContext, node: React.ReactElement): Promise<ReactTestRenderer> {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "document", { configurable: true, value: { cookie: "", documentElement: { lang: "zh" } } });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, "document", previous);
    else delete (globalThis as { document?: unknown }).document;
  });
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(node); });
  return renderer;
}

const textOf = (node: ReactTestInstance | string): string => typeof node === "string" ? node : node.children.map(textOf).join("");
const buttons = (root: ReactTestInstance, pattern: RegExp) => root.findAll((node) => node.type === "button" && pattern.test(textOf(node)));

test("SC-01 main: diagnosis and 3 insights come from snapshot blocks; each evidence opens to only the actor's resolved contacts, linked to /app/contacts/{id}", async (t) => {
  const { view } = await analysisView("zh");
  const renderer = await mount(t, <NetworkAnalysis viewModel={list30} analysis={view} initialTab="struct" structureExtras={extras()} />);
  const root = renderer.root;
  const all = textOf(root);
  assert.match(all, /科技行业占比高，金融决策层偏少。/);
  assert.match(all, /基于 35 位联系人/);
  for (const text of ["东京联系人集中在科技行业。", "金融行业缺少决策层。", "新认识的人还没有往来。"]) assert.ok(all.includes(text), text);
  assert.doesNotMatch(all, /缺口块不在结构标签|第四条洞察不显示/);
  // 依据默认收起；逐个点开。
  assert.equal(root.findAll((node) => node.props.className === "nw-evidence-link").length, 0);
  const toggles = buttons(root, /依据/);
  assert.deepEqual(toggles.map((button) => textOf(button).trim()), ["ⓘ 依据 2 位", "ⓘ 依据 2 位", "ⓘ 依据 1 位", "ⓘ 依据 2 位"]);
  for (const toggle of toggles) await act(async () => { toggle.props.onClick(); });
  const links = root.findAll((node) => node.type === "a" && node.props.className === "nw-evidence-link");
  assert.deepEqual(links.map((link) => [textOf(link), link.props.href]), [
    ["王敏", "/app/contacts/c00"], ["李雷", "/app/contacts/c15"],
    ["王敏", "/app/contacts/c00"], ["佐藤", "/app/contacts/c01"],
    ["李雷", "/app/contacts/c15"],
    ["Ana", "/app/contacts/c02"], ["Émile", "/app/contacts/c03"],
  ]);
  assert.doesNotMatch(JSON.stringify(renderer.toJSON()), /bob:c99|deleted:c50/);
});

test("SC-01: zh shows the Chinese block text and template; en (and ja, which requests en) shows English", async () => {
  const zh = render("zh", (await analysisView("zh")).view, extras());
  assert.match(zh, /结构诊断/);
  assert.match(zh, /基于 35 位联系人/);
  const enSnapshot = snapshotFixture();
  enSnapshot.blocks = enSnapshot.blocks.map((block) => ({ ...block, text: `EN ${block.key}` }));
  const en = render("en", (await analysisView("en")).view, extras({ snapshot: structureSnapshotView(enSnapshot, NAMES) }));
  assert.match(en, /Structure diagnosis/);
  assert.match(en, /EN diagnosis/);
  assert.match(en, /Based on 35 contacts/);
  assert.match(en, /Structure insights/);
  assert.doesNotMatch(en, /结构诊断|基于 35 位|结构洞察|依据 /);
});

test("SC-01: no snapshot hides ①④ while ②③ render; a failed snapshot read shows 「来源暂时不可用」 only in ①④", async () => {
  const { view } = await analysisView("zh");
  const none = networkSections(render("zh", view, extras({ snapshot: { state: "none" } })));
  assert.equal(none.diagnosis, undefined);
  assert.equal(none.insights, undefined);
  assert.match(none.structure!, /nw-dim-donut-n">35</);
  assert.match(none.health!, /新认识/);
  for (const language of ["zh", "en"] as const) {
    const failed = networkSections(render(language, (await analysisView(language)).view, extras({ snapshot: { state: "unavailable" } })));
    assert.match(failed.diagnosis!, /来源暂时不可用|Source temporarily unavailable/);
    assert.match(failed.insights!, /来源暂时不可用|Source temporarily unavailable/);
    for (const healthy of ["structure", "top", "health"]) assert.doesNotMatch(failed[healthy]!, /来源暂时不可用|Source temporarily unavailable/, healthy);
  }
});

test("SC-02: the donut centre and percentages use the full distribution (35), not the 30-row list; dimension buttons switch the four new dimensions", async (t) => {
  const { view } = await analysisView("zh");
  const renderer = await mount(t, <NetworkAnalysis viewModel={list30} analysis={view} initialTab="struct" structureExtras={extras()} />);
  const root = renderer.root;
  const centre = () => textOf(root.find((node) => node.props.className === "nw-dim-donut-n"));
  assert.equal(centre(), "35");
  const dims = root.findAll((node) => node.type === "button" && String(node.props.className).includes("nw-dim-btn"));
  assert.deepEqual(dims.map((button) => textOf(button)), ["行业", "地区", "角色层级", "关系强度"]);
  assert.doesNotMatch(textOf(root), /经营决策者|保持联系/); // 旧 role／relationship 两维不在结构标签（W49-4）
  const expectations: Array<[string, string[]]> = [
    ["地区", ["日本 · 东京", "地区待完善", "日本 · 大阪", "新加坡"]],
    ["角色层级", ["决策层", "管理层", "执行层", "其他"]],
    ["关系强度", ["新认识", "有往来", "核心", "待唤醒"]],
  ];
  for (const [label, rows] of expectations) {
    await act(async () => { dims.find((button) => textOf(button) === label)!.props.onClick(); });
    assert.equal(centre(), "35", label);
    const top = root.findAll((node) => node.type === "a" && node.props.className === "nw-top-row");
    assert.deepEqual(top.map((row) => textOf(row.children[1] as ReactTestInstance)), rows, label);
  }
});

test("SC-03: related industry groups are highlighted with the legend; the selected primary expands its secondary Top 5; no plan → no highlight", async (t) => {
  const { view } = await analysisView("zh");
  const html = render("zh", view, extras());
  assert.match(html, /与计划人脉需求相关/);
  assert.match(html, /data-network-bucket="technology_internet" data-network-highlight=""/);
  assert.doesNotMatch(html, /data-network-bucket="finance_investment" data-network-highlight/);
  assert.match(html, /data-network-secondary="technology_internet"[\s\S]*?企业软件与 SaaS[\s\S]*?人工智能与数据[\s\S]*?未细分/);
  assert.match(html, /href="\/app\/contacts\/analysis\/industry_secondary\/technology_internet.ai_data" data-network-bucket="technology_internet.ai_data" data-network-highlight=""/);
  const plain = render("zh", view, extras({ highlights: null }));
  assert.doesNotMatch(plain, /data-network-highlight|与计划人脉需求相关/);
  assert.match(plain, /nw-dim-donut-n">35</);
  // 选中另一个一级：在图例下展开它的二级。
  const renderer = await mount(t, <NetworkAnalysis viewModel={list30} analysis={view} initialTab="struct" structureExtras={extras()} />);
  const finance = renderer.root.find((node) => node.type === "button" && node.props["data-network-bucket"] === "finance_investment");
  await act(async () => { finance.props.onClick(); });
  assert.equal(renderer.root.find((node) => node.props["data-network-secondary"] !== undefined).props["data-network-secondary"], "finance_investment");
});

test("SC-04: relationship health shows four tiers with the change vs 30 days ago; 「数据不足」 when there were no contacts 30 days ago", async () => {
  const { view } = await analysisView("zh");
  const health = networkSections(render("zh", view, extras())).health!;
  // 当前 15/10/5/5，30 天前 14/10/4/5。
  assert.deepEqual([...health.matchAll(/data-network-tier="(\w+)"[\s\S]*?nw-health-n">(\d+)<[\s\S]*?较 30 天前 ([^<]+)</g)].map((match) => [match[1], match[2], match[3]]), [
    ["new", "15", "+1"], ["active", "10", "持平"], ["core", "5", "+1"], ["dormant", "5", "持平"],
  ]);
  const insufficient = networkSections(render("en", (await analysisView("en")).view, extras({ tierHistory: { ...HISTORY, earliestCaptureAt: "2026-09-20T00:00:00.000Z" } }))).health!;
  assert.equal((insufficient.match(/vs 30 days ago Not enough data/g) ?? []).length, 4);
  assert.doesNotMatch(insufficient, /vs 30 days ago [+−]?0</);
});
