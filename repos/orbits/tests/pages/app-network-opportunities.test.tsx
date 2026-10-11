/**
 * W0050 组件层：「机会」标签（`NetworkAnalysis initialTab="opp"` → `NetworkOpportunities`）。
 *
 * - SC-01：覆盖度 = Σmin(a,t) ÷ Σt 的取整值、每行「已有 a／t · 还缺 b」；换成任意快照（含写着「覆盖度 90%」的句子）数字不变；
 *   无计划 → 覆盖区只给「去生成计划」（Task › プラン），其余四块照常；计划无需求 → 如实空态；
 * - SC-02：未满足的需求下 ≤2 场活动（计划点名／命中词）与「待确认 N」（R25 起链到 Task › プラン；旧的确认弹层已删除）；
 * - SC-03：本周行动链到 Task › プラン（R25 起不带行锚点）、拖期「已延后 N 周」、「N 位待确认」入口；
 * - SC-04：待唤醒 why + 依据链接、「起草邮件」返回可编辑模板草稿（POST reconnect-draft 一次，不发送）；
 * - SC-05：报告卡各状态与按钮（生成于／基于 N 人／新增 M 人未纳入、正在更新、明天更新、none、insufficient、
 *   手动用满／429 MANUAL_REFRESH_LIMIT、用户池用满／429 USER_DAILY_LIMIT）；「重新分析」调 recompute 一次；
 *   旧入口全部消失；整个标签渲染与交互不请求 needs-matches／opportunities/recompute／contacts-dashboard。
 */
import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import type React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";

import type { ContactsAnalysisView } from "../../app/(app)/app/contacts/analysis/contacts-analysis-view-model";
import { buildOpportunitiesTabView, type OpportunitiesTabView } from "../../app/(app)/app/contacts/analysis/opportunities-view-model";
import { NetworkAnalysis } from "../../app/(app)/app/contacts/network-0918/network-analysis";
import { OrbitLanguageProvider } from "../../app/(app)/app/orbit-language-context";
import type { OrbitContactsViewModel } from "../../app/(app)/app/orbit-contacts-route-view-model";
import type { NetworkSnapshotView } from "../../features/network-analysis/contract";
import { toOpportunityPlanView } from "../../features/plans/coverage";
import { networkSections } from "../fixtures/network-debug-payload";
import { loadOpportunitiesTab } from "../../app/(app)/app/contacts/analysis/opportunities-route-service";

const NOW = new Date("2026-10-03T03:00:00.000Z");
const empty = { connections: [], events: [], intros: [], pipelineStatuses: [] } as unknown as OrbitContactsViewModel;
const analysis: ContactsAnalysisView = {
  state: "ready", generatedAt: "2026-10-01T00:00:00Z", summary: "旧机会总结句", analysis: { state: "unavailable" }, activity: [],
  metrics: { contacts: 7, newContacts: 2, highValue: 3, pendingFollowups: 4, dormant: 5 },
  goal: { state: "ready", data: { id: "profile:1", text: "认识 SaaS 决策人", updatedAt: "2026-09-01T00:00:00Z", canEdit: true } },
  structure: { state: "ready", data: { summary: "", health: [], dimensions: { industry: [], location: [], role: [], relationship: [] } } },
  coverage: { state: "ready", data: { summary: "旧覆盖总结" } },
  opportunities: { state: "ready", data: { summary: "旧机会总结", actions: [{ id: "o1", title: "规则重排的旧动作", judgment: "近期有互动", contactName: "王敏", dueLabel: "今日", primary: { label: "查看联系人", href: "/app/contacts/c1" } }], dormant: [{ id: "d1", name: "旧沉睡李雷", reason: "90 天未联系", action: "发一条问候", href: "/app/contacts/c2" }] } },
} as ContactsAnalysisView;

function report(overrides: Partial<NetworkSnapshotView> = {}, quota: Partial<{ manual: number; user: number; background: number }> = {}): NetworkSnapshotView {
  return {
    blocks: [],
    contactCount: 42,
    freshness: { job: "none", newContactCount: 0, stale: false },
    generatedAt: "2026-09-28T05:00:00.000Z",
    quota: { background: { limit: 60, usedToday: quota.background ?? 0 }, manual: { limit: 3, usedToday: quota.manual ?? 0 }, user: { limit: 10, usedToday: quota.user ?? 0 } },
    state: "ready",
    ...overrides,
  };
}

/** 计划：A（targetCount 2，已关联 2 位：1 linked + 1 established）、B（缺省 1，关联 1 位 → 但 B 再多一位超额不抵别人）、C（缺省 1，0 位）。 */
function planSnapshot() {
  const link = (contactId: string, state: "linked" | "established" = "linked") => ({ contactId, establishedAt: state === "established" ? "2026-09-20T00:00:00Z" : null, linkedAt: "2026-09-10T00:00:00Z", state });
  const need = (id: string, title: string, targetCount: number | undefined, links: ReturnType<typeof link>[], phaseKey = "p1") => ({
    contactLinks: links, criteria: { description: null, primaryIndustryId: "technology_internet", secondaryIndustryId: null, titleKeywords: ["CTO"], ...(targetCount ? { targetCount } : {}) },
    id, kind: "network_need" as const, linkedEventId: null, phaseKey, sortKey: 1, status: links.length ? "linked" : "open", suggestedWeek: null, title,
  });
  return {
    items: [
      need("need-a", "SaaS 决策人", 2, [link("ca1"), link("ca2", "established")]),
      need("need-b", "早期投资人", undefined, [link("cb1"), link("cb2")]),
      need("need-c", "渠道伙伴", undefined, []),
      { contactLinks: [], criteria: null, id: "act-1", kind: "action" as const, linkedEventId: null, phaseKey: "p1", sortKey: 2, status: "not_started", suggestedWeek: 1, title: "整理目标客户名单" },
      { contactLinks: [], criteria: null, id: "act-2", kind: "action" as const, linkedEventId: null, phaseKey: "p1", sortKey: 3, status: "in_progress", suggestedWeek: 3, title: "约佐藤喝咖啡" },
      { contactLinks: [], criteria: null, id: "act-3", kind: "action" as const, linkedEventId: null, phaseKey: "p1", sortKey: 4, status: "done", suggestedWeek: 1, title: "已完成的行动" },
    ],
    plan: { goalSnapshot: "拿到天使轮融资", id: "plan-1", phases: [{ endWeek: 8, key: "p1", startWeek: 1, title: "第一阶段" }], startsOn: "2026-09-14" },
  };
}

function candidate(id: string, needId: string, contactName: string, contactId = `contact:${id}`) {
  return { aiReason: null, contactId, contactName, contactSubtitle: "Cloudline · CTO", id, industry: { en: "Technology", zh: "科技与互联网" }, needId, needTitle: needId, strength: "strong" as const, tier: "rule" as const };
}

function fullView(overrides: Partial<Parameters<typeof buildOpportunitiesTabView>[0]> = {}, language: "zh" | "en" = "zh"): OpportunitiesTabView {
  return buildOpportunitiesTabView({
    bookable: [
      { description: "SaaS CTO 交流会", endsAt: "2026-10-10T12:00:00.000Z", eventId: "ev-1", publicCode: "saas-night", startsAt: "2026-10-10T10:00:00.000Z", title: "SaaS Night Tokyo", venue: "Shibuya" },
    ],
    dormant: [{ contactId: "d-1", dormant: true, lastSignal: { occurredAt: "2026-07-01T03:00:00.000Z", recordId: "memo:1", source: "memo" }, linkId: "d-1", name: "周杰", organization: "北辰资本", primaryIndustryId: "finance_investment", role: "Partner" }],
    gapNames: new Map(),
    goal: null,
    pending: { candidates: [candidate("m1", "need-c", "高桥"), candidate("m2", "need-c", "伊藤"), candidate("m3", "need-a", "佐藤")], contactCount: 3 },
    plan: toOpportunityPlanView(planSnapshot() as never, NOW),
    report: report(),
    ...overrides,
  }, { language, now: NOW });
}

function withoutStyles(html: string) { return html.replace(/<style[\s\S]*?<\/style>/g, ""); }
function render(view: OpportunitiesTabView | undefined, language: "zh" | "en" = "zh") {
  return withoutStyles(renderToStaticMarkup(<OrbitLanguageProvider initialLanguage={language}><NetworkAnalysis viewModel={empty} analysis={analysis} initialTab="opp" opportunities={view} /></OrbitLanguageProvider>));
}

async function mount(t: TestContext, node: React.ReactElement): Promise<ReactTestRenderer> {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "document", { configurable: true, value: { cookie: "", documentElement: { lang: "zh" }, addEventListener() {}, removeEventListener() {}, activeElement: null } });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, "document", previous);
    else delete (globalThis as { document?: unknown }).document;
  });
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(<OrbitLanguageProvider initialLanguage="zh">{node}</OrbitLanguageProvider>); });
  return renderer;
}

/** 记录全部 fetch；按 URL 返回给定响应。 */
function stubFetch(t: TestContext, respond: (url: string, init?: RequestInit) => { status?: number; body: unknown }) {
  const original = globalThis.fetch;
  const calls: { url: string; method: string; body: string | null }[] = [];
  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    calls.push({ body: typeof init?.body === "string" ? init.body : null, method: init?.method ?? "GET", url });
    const { status = 200, body } = respond(url, init);
    return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" }, status });
  }) as typeof fetch;
  t.after(() => { globalThis.fetch = original; });
  return calls;
}

const textOf = (node: ReactTestInstance | string): string => typeof node === "string" ? node : node.children.map(textOf).join("");
const byData = (root: ReactTestInstance, attribute: string) => root.findAll((node) => typeof node.type === "string" && node.props[attribute] !== undefined);

// ---- SC-01 ----

test("SC-01: coverage = round(Σmin(a,t)/Σt) and each need shows have/target and how many are missing", () => {
  const html = render(fullView());
  const coverage = networkSections(html).coverage ?? "";
  // A: min(2,2)=2/2；B: min(2,1)=1/1（超额不抵别人）；C: 0/1 → 3/4 = 75%
  assert.match(coverage, /data-network-coverage-percent="75"/);
  assert.match(coverage, />75%</);
  assert.match(coverage, /SaaS 决策人[\s\S]*?已有 2／2[\s\S]*?已满足/);
  assert.match(coverage, /早期投资人[\s\S]*?已有 2／1[\s\S]*?已满足/);
  assert.match(coverage, /渠道伙伴[\s\S]*?已有 0／1[\s\S]*?还缺 1/);
  assert.match(coverage, /关系目标：认识 SaaS 决策人/);
});

test("SC-01: replacing the snapshot (even one that says “覆盖度 90%”) never changes a coverage number", () => {
  const plain = networkSections(render(fullView())).coverage;
  const loud = report({ blocks: [
    { evidence: { contactIds: ["x"], recordIds: [] }, key: "d", kind: "diagnosis", text: "覆盖度 90%，已经很好" },
    { evidence: { contactIds: ["x"], recordIds: [] }, key: "g", kind: "gap", needId: "need-c", text: "覆盖度 90%" },
  ] as NetworkSnapshotView["blocks"], contactCount: 999 });
  const withSnapshot = networkSections(render(fullView({ report: loud }))).coverage;
  assert.equal(withSnapshot, plain);
  assert.doesNotMatch(withSnapshot ?? "", /90%/);
  // 依据读不到（names 为空表）→ gap 句子也不显示（处处有据）
  assert.doesNotMatch(networkSections(render(fullView({ report: loud }))).gaps ?? "", /覆盖度 90%/);
});

test("SC-01: with no plan only the coverage block changes to a plan entry; the other four blocks still render", () => {
  const html = render(fullView({ goal: "拿到天使轮融资", pending: null, plan: null }));
  const sections = networkSections(html);
  assert.match(sections.coverage ?? "", /href="\/app\/tasks\?tab=plan"[^>]*>✦ 去生成计划/);
  assert.doesNotMatch(sections.coverage ?? "", /data-network-coverage-percent/);
  for (const key of ["gaps", "actions", "dormant", "report"]) assert.ok(sections[key], key);
  assert.match(sections.dormant ?? "", /周杰/);
  assert.match(sections.report ?? "", /生成于 9\/28 · 基于 42 人/);
  assert.match(sections.actions ?? "", /本周没有待办的计划行动/);
});

test("SC-01: a plan without network needs shows an honest empty state", () => {
  const snapshot = planSnapshot();
  snapshot.items = snapshot.items.filter((item) => item.kind !== "network_need");
  const html = render(fullView({ plan: toOpportunityPlanView(snapshot as never, NOW) }));
  assert.match(networkSections(html).coverage ?? "", /计划里还没有人脉需求/);
  assert.match(networkSections(html).gaps ?? "", /计划里还没有人脉需求/);
});

// ---- SC-02 ----

test("SC-02: an unmet need lists ≤2 events with their reason and “待确认 N”, which links to Task › プラン", async (t) => {
  const calls = stubFetch(t, () => ({ body: { success: true } }));
  const renderer = await mount(t, <NetworkAnalysis viewModel={empty} analysis={analysis} initialTab="opp" opportunities={fullView()} />);
  const gaps = byData(renderer.root, "data-network-gap");
  assert.deepEqual(gaps.map((node) => node.props["data-network-gap"]), ["need-c"], "only unmet needs");
  const gapText = textOf(gaps[0]!);
  assert.match(gapText, /「渠道伙伴」还缺 1 位/);
  assert.match(gapText, /SaaS Night Tokyo[\s\S]*命中：cto/);
  const pending = byData(renderer.root, "data-network-gap-pending");
  assert.equal(pending[0]!.props["data-network-gap-pending"], 2);
  assert.equal(pending[0]!.props.href, "/app/tasks?tab=plan");
  assert.equal(calls.length, 0, "rendering does not fetch");
});

test("review P3: the English goal line uses an ASCII separator", () => {
  const en = render(fullView({}, "en"), "en");
  assert.match(en, /Relationship goal: 认识 SaaS 决策人/);
  assert.doesNotMatch(en, /Relationship goal：/);
});

// ---- SC-03 ----

test("SC-03: week actions link to Task › プラン, overdue ones say “已延后 N 周”, and “N 位待确认” links there too", async (t) => {
  const html = render(fullView());
  const actions = networkSections(html).actions ?? "";
  assert.match(actions, /href="\/app\/tasks\?tab=plan"[^>]*data-network-week-action="act-1"[\s\S]*?整理目标客户名单[\s\S]*?已延后 2 周/);
  assert.match(actions, /href="\/app\/tasks\?tab=plan"[^>]*data-network-week-action="act-2"[\s\S]*?约佐藤喝咖啡[\s\S]*?本周/);
  assert.doesNotMatch(actions, /已完成的行动/);
  assert.match(actions, /3 位待确认/);
  stubFetch(t, () => ({ body: { success: true } }));
  const renderer = await mount(t, <NetworkAnalysis viewModel={empty} analysis={analysis} initialTab="opp" opportunities={fullView()} />);
  assert.equal(byData(renderer.root, "data-network-pending-matches")[0]!.props.href, "/app/tasks?tab=plan");
});

// ---- SC-04 ----

test("SC-04: dormant rows show the rule sentence with an evidence link; “起草邮件” returns an editable template draft without sending", async (t) => {
  const html = render(fullView());
  const dormant = networkSections(html).dormant ?? "";
  assert.match(dormant, /周杰/);
  assert.match(dormant, /上次往来：2026\/7\/1 备忘；与目标相关：同属金融与投资/);
  assert.match(dormant, /href="\/app\/contacts\/d-1"[^>]*data-network-dormant-evidence="memo:1"/);
  const calls = stubFetch(t, (url) => url.includes("/reconnect-draft")
    ? { body: { data: { draft: { body: "周杰您好：\n好久没联系了", provider: "template", subject: "好久不见，想约您聊聊" } }, success: true } }
    : { body: {}, status: 500 });
  const renderer = await mount(t, <NetworkAnalysis viewModel={empty} analysis={analysis} initialTab="opp" opportunities={fullView()} />);
  await act(async () => { byData(renderer.root, "data-network-dormant-draft-button")[0]!.props.onClick(); });
  assert.deepEqual(calls.map((call) => [call.method, call.url]), [["POST", "/api/contacts/d-1/reconnect-draft"]]);
  const textarea = renderer.root.find((node) => node.type === "textarea");
  assert.match(textarea.props.value, /好久没联系了/);
  await act(async () => { textarea.props.onChange({ target: { value: "改过的草稿" } }); });
  assert.equal(renderer.root.find((node) => node.type === "textarea").props.value, "改过的草稿");
  assert.match(textOf(renderer.root), /只是草稿，Orbit 不会替你发送。/);
  assert.equal(calls.length, 1, "editing does not save or send");
});

test("SC-04: no dormant contact → “暂无待唤醒关系”", () => {
  assert.match(networkSections(render(fullView({ dormant: [] }))).dormant ?? "", /暂无待唤醒关系/);
});

// ---- SC-05 报告卡 ----

const cards: Array<[string, NetworkSnapshotView, RegExp[], { disabled: boolean } | null]> = [
  ["ready", report(), [/生成于 9\/28 · 基于 42 人/, /重新分析（今天还剩 3 次）/], { disabled: false }],
  ["new contacts", report({ freshness: { job: "none", newContactCount: 4, stale: true } }), [/生成于 9\/28 · 基于 42 人 · 新增 4 人未纳入/], { disabled: false }],
  ["updating", report({ freshness: { job: "running", newContactCount: 4, stale: true } }), [/正在更新/], { disabled: false }],
  ["background exhausted", report({ freshness: { job: "deferred", newContactCount: 4, retryOn: "2026-10-03T15:00:00.000Z", stale: true } }, { background: 60 }), [/今日自动更新次数已用完，明天更新/, /重新分析（今天还剩 3 次）/], { disabled: false }],
  ["none", report({ generatedAt: null, state: "none" }), [/尚未生成分析/, /生成分析/], { disabled: false }],
  ["insufficient", report({ state: "insufficient" }), [/至少有 3 位联系人后才能生成人脉分析/], null],
  ["manual used up", report({}, { manual: 3, user: 3 }), [/今天已重新分析 3 次/], { disabled: true }],
  ["user pool used up", report({}, { manual: 1, user: 10 }), [/今天次数已用完，明天可用/], { disabled: true }],
  ["two left", report({}, { manual: 1, user: 1 }), [/今天还剩 2 次/], { disabled: false }],
];
for (const [name, value, patterns, button] of cards) {
  test(`SC-05: report card (${name}) follows NetworkSnapshotView`, () => {
    const section = networkSections(render(fullView({ report: value }))).report ?? "";
    for (const pattern of patterns) assert.match(section, pattern);
    if (!button) assert.doesNotMatch(section, /data-network-report-button/);
    else assert.match(section, button.disabled ? /data-network-report-button=""[^>]*disabled=""/ : /data-network-report-button=""(?![^>]*disabled)/);
  });
}

test("SC-05: “重新分析” calls recompute once and the card follows the returned view; 429 MANUAL_REFRESH_LIMIT greys it out", async (t) => {
  let call = 0;
  const calls = stubFetch(t, (url) => {
    call += 1;
    if (!url.startsWith("/api/network/snapshot/recompute")) return { body: {}, status: 500 };
    return call === 1
      ? { body: { data: report({ contactCount: 50, generatedAt: "2026-10-03T02:00:00.000Z" }, { manual: 1, user: 1 }), success: true } }
      : { body: { error: { code: "CONFLICT", context: { reason: "MANUAL_REFRESH_LIMIT" }, message: "limit" }, success: false }, status: 429 };
  });
  const renderer = await mount(t, <NetworkAnalysis viewModel={empty} analysis={analysis} initialTab="opp" opportunities={fullView()} />);
  const click = async () => { await act(async () => { byData(renderer.root, "data-network-report-button")[0]!.props.onClick(); }); };
  await click();
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.method, "POST");
  assert.match(calls[0]!.url, /^\/api\/network\/snapshot\/recompute\?lang=zh$/);
  assert.match(textOf(byData(renderer.root, "data-network-report-status")[0]!), /生成于 10\/3 · 基于 50 人/);
  assert.match(textOf(renderer.root), /今天还剩 2 次/);
  await click();
  assert.equal(calls.length, 2);
  const button = byData(renderer.root, "data-network-report-button")[0]!;
  assert.equal(button.props.disabled, true);
  assert.match(textOf(button), /今天已重新分析 3 次/);
});

test("SC-05: 429 USER_DAILY_LIMIT greys the button and says “今天次数已用完，明天可用”", async (t) => {
  stubFetch(t, () => ({ body: { error: { code: "CONFLICT", context: { reason: "USER_DAILY_LIMIT" }, message: "limit" }, success: false }, status: 429 }));
  const renderer = await mount(t, <NetworkAnalysis viewModel={empty} analysis={analysis} initialTab="opp" opportunities={fullView()} />);
  await act(async () => { byData(renderer.root, "data-network-report-button")[0]!.props.onClick(); });
  assert.equal(byData(renderer.root, "data-network-report-button")[0]!.props.disabled, true);
  assert.match(textOf(renderer.root), /今天次数已用完，明天可用/);
});

test("SC-05: the old entries are gone and rendering never reads the old opportunity sources", async (t) => {
  const html = render(fullView());
  for (const old of [/刷新机会/, /去 iOrbit/, /高价值关系/, /核心关系/, /规则重排的旧动作/, /旧沉睡李雷/, /旧机会总结/, /旧覆盖总结/, /nw-dial/, /nw-goal-score/]) assert.doesNotMatch(html, old);
  const en = render(fullView({}, "en"), "en");
  assert.match(en, /Plan coverage/);
  assert.match(en, /Generated 9\/28 · based on 42 contacts/);
  assert.match(en, /Last contact: Jul 1, 2026 memo; relevant to your goal: same industry \(Financ/);
  const calls = stubFetch(t, () => ({ body: { success: true } }));
  await mount(t, <NetworkAnalysis viewModel={empty} analysis={analysis} initialTab="opp" opportunities={fullView()} />);
  assert.deepEqual(calls, [], "mounting the tab issues no request");
});

test("W50-5: the tabs are plain links (?tab=structure / ?tab=opportunities); without loaded data every block says unavailable", () => {
  const html = render(undefined);
  assert.match(html, /<a[^>]*href="\/app\/contacts\/dashboard\?tab=structure"[^>]*data-network-analysis-tab="struct"/);
  assert.match(html, /<a[^>]*href="\/app\/contacts\/dashboard\?tab=opportunities"[^>]*aria-current="page"[^>]*data-network-analysis-tab="opp"/);
  const sections = networkSections(html);
  assert.match(sections.coverage ?? "", /计划暂时读不到/);
  assert.match(sections.actions ?? "", /来源暂时不可用/);
  assert.match(sections.dormant ?? "", /来源暂时不可用/);
  assert.match(sections.report ?? "", /分析报告暂时读不到/);
});

test("W0051 R-8: a dormant row whose why came from the insight renders that next step (marked insight); rule rows stay marked rule", () => {
  const view = buildOpportunitiesTabView({ bookable: [], dormant: [], gapNames: new Map(), goal: null, pending: null, plan: null, report: report() }, { language: "zh", now: NOW });
  const html = render({ ...view, dormant: [
    { contactId: "d1", draftAvailable: true, evidence: { href: "/app/contacts/d1", recordId: "memo:1" }, name: "李雷", why: "问问新基金的进展。", whySource: "insight" },
    { contactId: "d2", draftAvailable: true, evidence: { href: "/app/contacts/d2", recordId: "memo:2" }, name: "韩梅", why: "上次往来：2026年7月1日 备忘；与目标相关：同属金融与投资", whySource: "rule" },
  ] });
  assert.match(html, /data-network-dormant-why="insight"[^>]*>问问新基金的进展。/);
  assert.match(html, /data-network-dormant-why="rule"[^>]*>上次往来：/);
});

/* ── W0054（W54-3）：门槛卡 ─────────────────────────────────────── */

test("W0054 SC-03: below the threshold the report card becomes one threshold card; coverage numbers, gaps, week actions and dormant still render", () => {
  const html = render({ ...fullView({ report: report({ blocks: [], state: "insufficient" }) }), gate: { kind: "threshold", missing: 1 } });
  assert.equal((html.match(/data-network-analysis-gate=/g) ?? []).length, 1);
  assert.match(html, /再添加 1 位联系人即可更新分析/);
  assert.doesNotMatch(html, /data-network-section="report"/);
  for (const section of ["coverage", "gaps", "actions", "dormant"]) assert.match(html, new RegExp(`data-network-section="${section}"`), section);
});

test("W0054 SC-03: the opportunities loader below the threshold reads no snapshot and no dormant insight text (rule sentence stays)", async () => {
  const calls: string[] = [];
  const view = await loadOpportunitiesTab({ actorId: "actor:a", goal: null, language: "zh", now: NOW, threshold: { confirmed: 2, met: false, missing: 1 } }, {
    readBookableEvents: async () => [],
    readContactNames: async () => { calls.push("names"); return new Map(); },
    readDormant: async () => [{ contactId: "d-1", dormant: true, lastSignal: { occurredAt: "2026-07-01T03:00:00.000Z", recordId: "memo:1", source: "memo" }, linkId: "d-1", name: "周杰", organization: "北辰资本", primaryIndustryId: "finance_investment", role: "Partner" }],
    readInsights: async () => { calls.push("insights"); return new Map([["d-1", { nextStep: { en: "OLD INSIGHT", zh: "旧洞察下一步" }, state: "ready" as const }]]); },
    readPending: null,
    readPlan: async () => planSnapshot() as never,
    readSnapshot: async () => { calls.push("snapshot"); throw new Error("must not read"); },
  });
  assert.deepEqual(calls, []);
  assert.equal(view.report.state, "insufficient");
  assert.deepEqual(view.gate, { kind: "threshold", missing: 1 });
  assert.doesNotMatch(JSON.stringify(view), /旧洞察下一步|OLD INSIGHT/);
  assert.equal(view.coverage.state, "ready");
});
