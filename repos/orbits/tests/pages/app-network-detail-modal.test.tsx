/**
 * 联系人详情弹窗。W0060（D55）起断言新设计：五块顺序 头卡 → 为什么是 TA → 三栏 → 最近互动 → 折叠概览，
 * 底部只有「关闭」（RULES 5.3：旧的块顺序断言改为新设计，不保留两套）。
 */
import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";

import { NetworkDetailModal, formatNoteTime, type NetworkDetailInsight, type NetworkDetailPlanContext } from "../../app/(app)/app/contacts/network-0918/network-detail-modal";
import { NetworkInsightPanel } from "../../app/(app)/app/contacts/network-0918/network-insight-panel";
import { buildMemoPatch, tokyoToday } from "../../app/(app)/app/contacts/network-0918/network-follow-modal";
import { contactInsightView } from "../../features/contacts/insights/view";
import { contactInsightGoalHash, type ContactInsightRow } from "../../features/contacts/insights/repository";
import { OrbitLanguageProvider } from "../../app/(app)/app/orbit-language-context";
import { INSIGHT_POLL_INTERVAL_MS, INSIGHT_POLL_MAX } from "../../app/(app)/app/contacts/network-0918/network-insight-panel";

const contact = {
  id: "c1", displayName: "田中惠子", initial: "田", company: "Nexa AI", title: "合作伙伴负责人", industry: "科技与互联网", source: "event", stage: "Active", pipelineStatus: "in_progress", relationshipStatus: "active", location: "日本 东京", met: "东京 AI 峰会",
  lastInteraction: "昨天聊了知识库方案", editableInteraction: { channel: "manual_note", occurredAt: "2026-09-19T01:00:00Z", summary: "昨天聊了知识库方案" }, nextAction: { text: "下周约产品演示", reason: "对方对知识库方案有兴趣" }, valueTags: ["AI"], editableTags: [{ value: "ai", label: "AI" }],
  email: "", phone: "", wechat: "", lineId: "",
  notes: [
    { id: "n0", body: "较早的备注", createdAt: "2026-09-10T02:00:00Z" },
    { id: "n1", body: "讨论合作模式", createdAt: "2026-09-18T07:30:00Z" },
  ],
  encounters: [{ id: "e", eventId: "", createdAt: "", context: { metAt: "", reason: "", score: 0, tableNo: 1, publicProfile: { bio: "", intro: "", industry: "", topics: ["生成式 AI"], offering: ["企业级 AI 知识库"], seeking: ["日本市场 AI 方案"], conversationPrompts: [] } } }],
} as never;

const withProfile = (publicProfile: object, extra: object = {}) =>
  ({ ...(contact as object), ...extra, encounters: [{ id: "e", eventId: "", createdAt: "", context: { metAt: "", reason: "", score: 0, tableNo: 1, publicProfile: { bio: "", intro: "", industry: "", conversationPrompts: [], topics: [], offering: [], seeking: [], ...publicProfile } } }] }) as never;

const sectionOrder = (html: string) => [...html.matchAll(/data-network-detail-section="([a-z]+)"/g)].map((m) => m[1]);

/** react-test-renderer 挂载：带 window／document 桩、可选 fetch 与 App Router 桩。 */
async function mountModal(t: TestContext, element: ReactElement, options: { fetch?: (url: string, init?: RequestInit) => Response | Promise<Response>; navigator?: object; selection?: object } = {}) {
  const { act, create } = await import("react-test-renderer");
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const assigned: string[] = [];
  const calls: { url: string; method: string; body: unknown }[] = [];
  const windowListeners = new Map<string, Set<(event: unknown) => void>>();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      addEventListener(type: string, listener: (event: unknown) => void) { if (!windowListeners.has(type)) windowListeners.set(type, new Set()); windowListeners.get(type)!.add(listener); },
      removeEventListener(type: string, listener: (event: unknown) => void) { windowListeners.get(type)?.delete(listener); },
      getSelection: () => options.selection ?? null,
      history: { back() { assigned.push("back"); } },
      location: { assign: (href: string) => assigned.push(href), reload: () => assigned.push("reload"), origin: "https://orbit.example", pathname: "/app/contacts/c1", search: "" },
    },
  });
  Object.defineProperty(globalThis, "document", { configurable: true, value: { activeElement: null, addEventListener() {}, removeEventListener() {}, createRange: () => ({ selectNodeContents() {} }), documentElement: { lang: "zh" } } });
  if (options.navigator !== undefined) Object.defineProperty(globalThis, "navigator", { configurable: true, value: options.navigator });
  t.mock.method(globalThis, "fetch", async (url: string, init?: RequestInit) => {
    calls.push({ body: init?.body ? JSON.parse(String(init.body)) : null, method: init?.method ?? "GET", url: String(url) });
    return options.fetch ? options.fetch(String(url), init) : Response.json({ success: false }, { status: 404 });
  });
  let root: import("react-test-renderer").ReactTestRenderer | undefined;
  await act(async () => { root = create(element); });
  t.after(() => {
    act(() => root?.unmount());
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow); else delete (globalThis as { window?: unknown }).window;
    if (previousDocument) Object.defineProperty(globalThis, "document", previousDocument); else delete (globalThis as { document?: unknown }).document;
    if (previousNavigator) Object.defineProperty(globalThis, "navigator", previousNavigator);
  });
  const settle = async () => { await act(async () => { for (let i = 0; i < 8; i += 1) await Promise.resolve(); }); };
  const byData = (attribute: string) => root!.root.findAll((node) => node.props?.[attribute] !== undefined && typeof node.type === "string");
  const keydown = (key: string, target: object) => { for (const listener of [...(windowListeners.get("keydown") ?? [])]) listener({ key, target }); };
  const text = () => JSON.stringify(root!.toJSON());
  return { act, assigned, byData, calls, keydown, root: root!, settle, text };
}

/* ── SC-W0060-01：五块顺序与去留 ─────────────────────────────────────── */

test("SC-W0060-01: five blocks in order — head card → why this person → three columns → recent interactions → folded overview; only 关闭 at the bottom", () => {
  const html = renderToStaticMarkup(<NetworkDetailModal contact={contact} closeHref="/app/contacts" onFollow={() => {}} />);
  assert.match(html, /role="dialog"/);
  assert.match(html, /aria-modal="true"/);
  assert.match(html, /aria-label="联系人详情"/);
  assert.deepEqual(sectionOrder(html), ["head", "why", "profile", "recent", "overview"]);
  assert.match(html, /Nexa AI · 合作伙伴负责人/);
  assert.match(html, /data-network-detail-source[^>]*>· 来自 活动认识</);
  // 头卡右侧「写 memo」「约 TA」；底部只有「关闭」。
  const head = html.slice(html.indexOf('data-network-detail-section="head"'), html.indexOf('data-network-detail-section="why"'));
  assert.match(head, /class="btn nw-detail-follow"[^>]*>✎ 写 memo/);
  assert.match(head, /data-network-detail-schedule[^>]*>约 TA</);
  const foot = html.slice(html.indexOf('class="nw-detail-foot"'));
  assert.match(foot, /class="btn nw-detail-close" href="\/app\/contacts"[^>]*>关闭</);
  assert.doesNotMatch(foot, /写 memo|nw-detail-follow/);
  // 去掉的元素：独立「下一步建议」、「共同话题」、「我的计划」面板，旧标签「我能提供」「对方需求」。
  assert.doesNotMatch(html, /下一步建议|共同话题|我的计划|我能提供|对方需求|nw-step-n|nw-detail-cols/);
  // 三栏标签（D54）。
  assert.match(html, /TA 能给你的/);
  assert.match(html, /TA 需要的<span class="nw-dv-col-hint">你也许帮得上<\/span>/);
  assert.match(html, /可以聊的话题/);
  for (const s of ["企业级 AI 知识库", "日本市场 AI 方案", "生成式 AI", "讨论合作模式"]) assert.match(html, new RegExp(s));
  // 下一步只有一条（洞察不在时用 contact.nextAction）。
  assert.equal((html.match(/data-insight-next-step/g) ?? []).length, 1);
  assert.match(html, /data-insight-next-step="true">下周约产品演示</);
  // 折叠默认收起：按钮 aria-expanded=false，概览四格不渲染。
  assert.match(html, /class="btn nw-dv-fold-btn" aria-expanded="false"[^>]*><span class="nw-dv-fold-t">关系概览<\/span><span class="nw-dv-fold-s">展开 ▾/);
  assert.doesNotMatch(html, /class="nw-ov"/);
  // 时间线倒序：最新备注在前。
  assert.ok(html.indexOf("讨论合作模式") < html.indexOf("较早的备注"));
});

test("SC-W0060-01: the labels are in English too", () => {
  const html = renderToStaticMarkup(<OrbitLanguageProvider initialLanguage="en"><NetworkDetailModal contact={contact} closeHref="/app/contacts" onFollow={() => {}} /></OrbitLanguageProvider>);
  assert.match(html, /What they can offer you/);
  assert.match(html, /What they need<span class="nw-dv-col-hint">you may help<\/span>/);
  assert.match(html, /Topics to talk about/);
  assert.match(html, /Why this person/);
  assert.match(html, /Relationship overview/);
  assert.doesNotMatch(html, /What they offer<|Shared topics|Suggested next steps/);
});

test("SC-W0060-01: the fold opens the four overview cells and the card notes (without the review page's photo headings), aria-expanded follows", async (t) => {
  const withNotes = { ...(contact as object), cardNotes: "正面 · IMG_1.png\n传真: 03-6800-3712\n微信(Wechat): yoshikuni26" } as never;
  const html = renderToStaticMarkup(<NetworkDetailModal contact={withNotes} closeHref="/app/contacts" onFollow={() => {}} />);
  assert.match(html, /<span class="nw-dv-fold-t">关系概览 · 名片备注<\/span>/);
  assert.doesNotMatch(html, /data-network-detail-card-notes|传真/);
  const mounted = await mountModal(t, <NetworkDetailModal contact={withNotes} closeHref="/app/contacts" onFollow={() => {}} />);
  const fold = () => mounted.root.root.find((node) => node.type === "button" && node.props.className === "btn nw-dv-fold-btn");
  await mounted.act(async () => fold().props.onClick());
  assert.equal(fold().props["aria-expanded"], true);
  const open = mounted.text();
  for (const s of ["关系档位", "上次互动", "下次计划", "来源", "9月19日 01:00", "暂未评估"]) assert.ok(open.includes(s), s);
  assert.equal(mounted.root.root.findAll((node) => node.props?.className === "nw-ov").length, 4);
  assert.ok(open.includes("传真: 03-6800-3712\\n微信(Wechat): yoshikuni26"));
  assert.ok(!open.includes("IMG_1.png"));
  await mounted.act(async () => fold().props.onClick());
  assert.equal(fold().props["aria-expanded"], false);
  assert.equal(mounted.root.root.findAll((node) => node.props?.className === "nw-ov").length, 0);
});

test("the head card shows the contact channels as copy chips only when non-empty; extra renders at the top of 最近互动", () => {
  const withChannels = { ...(contact as object), email: "keiko@nexa.example", phone: "+81 90 0000 0000", wechat: "", lineId: "" } as never;
  const html = renderToStaticMarkup(<NetworkDetailModal contact={withChannels} closeHref="/app/contacts" onFollow={() => {}} extra={<p data-extra>memo</p>} />);
  const head = html.slice(html.indexOf('data-network-detail-section="head"'), html.indexOf('data-network-detail-section="why"'));
  assert.match(head, /data-network-detail-contacts/);
  assert.match(head, /data-network-channel="email"[^>]*>.*keiko@nexa\.example/);
  assert.match(head, /data-network-channel="phone"[^>]*>.*\+81 90 0000 0000/);
  assert.doesNotMatch(head, /data-network-channel="wechat"|data-network-channel="line"/);
  assert.match(head, /点击复制/);
  const recent = html.slice(html.indexOf('data-network-detail-section="recent"'));
  assert.ok(recent.indexOf("最近互动") < recent.indexOf("data-extra") && recent.indexOf("data-extra") < recent.indexOf("data-network-quick-memo"));
  const empty = renderToStaticMarkup(<NetworkDetailModal contact={{ ...(contact as object), email: "", phone: " ", wechat: "", lineId: "" } as never} closeHref="/app/contacts" onFollow={() => {}} />);
  assert.doesNotMatch(empty, /data-network-detail-contacts|点击复制/);
});

test("W0047: no manual 待设置关系 panel; the tier tag and 依据 toggle sit in the head card", () => {
  const pending = { ...(contact as object), pipelineStatus: "pending_initialization", stage: "待设置关系", nextAction: null } as never;
  const html = renderToStaticMarkup(<NetworkDetailModal contact={pending} closeHref="/app/contacts" onFollow={() => {}} />);
  assert.doesNotMatch(html, /我的关系设置|data-initialization-refresh|待设置关系|更新状态/);
});

/* ── SC-W0060-02：三栏真实值与推测样式 ───────────────────────────────── */

test("SC-W0060-02: fallback values never fill the columns — they show the write-a-memo empty state", () => {
  const html = renderToStaticMarkup(<NetworkDetailModal contact={withProfile({ offering: ["投资判断（回退）"], seeking: ["约个电话（建议动作）"], topics: ["SaaS（共同话题）"], fallbackFields: ["offering", "seeking", "topics"] })} closeHref="/app/contacts" onFollow={() => {}} />);
  const profile = html.slice(html.indexOf('data-network-detail-section="profile"'), html.indexOf('data-network-detail-section="recent"'));
  assert.equal((profile.match(/data-network-profile-empty/g) ?? []).length, 3);
  assert.equal((profile.match(/写一条 memo，AI 会帮你整理/g) ?? []).length, 3);
  assert.doesNotMatch(profile, /回退|建议动作|共同话题/);
  const en = renderToStaticMarkup(<OrbitLanguageProvider initialLanguage="en"><NetworkDetailModal contact={withProfile({})} closeHref="/app/contacts" onFollow={() => {}} /></OrbitLanguageProvider>);
  assert.equal((en.match(/Write a memo and AI will organise this\./g) ?? []).length, 3);
});

test("SC-W0060-02: card_inference items are dimmed with 据名片推测 (topics as a dashed · 推测 chip); memo-extracted values look normal", () => {
  const html = renderToStaticMarkup(<NetworkDetailModal contact={withProfile(
    { offering: ["被投公司资源"], seeking: ["早期项目来源"], topics: ["跨境 SaaS 定价"], fieldSources: { offering: "card_inference", seeking: "memo_extraction", topics: "card_inference" } },
  )} closeHref="/app/contacts" onFollow={() => {}} />);
  assert.match(html, /class="nw-li nw-li-guess" data-profile-guess=""><span class="nw-li-dot">•<\/span><span>被投公司资源<span class="nw-guess">据名片推测<\/span>/);
  assert.match(html, /class="nw-topic nw-topic-guess" data-profile-guess="true">跨境 SaaS 定价 · 推测</);
  assert.match(html, /class="nw-li"><span class="nw-li-dot">•<\/span><span>早期项目来源<\/span>/);
  assert.equal((html.match(/据名片推测/g) ?? []).length, 1);
});

/* ── SC-W0060-03：为什么是 TA ─────────────────────────────────────────── */

const INSIGHT_NOW = new Date("2026-10-03T03:00:00.000Z");
const INSIGHT_GOAL = "认识 SaaS 决策人";
const readyRow: ContactInsightRow = {
  aiState: "done", attempts: 1, retryCount: 0, contactId: "c1", deferredUntil: null, dirtyAt: null, dirtyReasons: [],
  evidence: [{ id: "memo:note:live-contact-detail-update:abc", source: "memo" }, { id: "need-1", source: "plan_need" }],
  generatedAt: "2026-10-02T00:00:00.000Z", goalHash: contactInsightGoalHash(INSIGHT_GOAL),
  goalRelation: { en: "Keiko leads partnerships at an AI vendor.", zh: "惠子负责一家 AI 公司的合作。" }, lastErrorCode: null, leaseExpiresAt: null,
  model: "m", nextStep: { en: "Book the product demo.", zh: "约产品演示。" }, relevance: 72, sourceDataVersion: "v", status: "ready",
};
const PLAN: NetworkDetailPlanContext = {
  linkedNeeds: [{ needId: "need-1", phaseNo: 1, phaseTitle: "盘点", title: "认识能引荐目标客户的投资人" }],
  weekAction: { detail: "你已经认识 TA，是离目标最近的一步。", id: "a1", phaseNo: 1, phaseTitle: "盘点", title: "约 田中" },
};

function insightOf(row: ContactInsightRow | null, options: { goal?: string | null; quotaExhausted?: boolean; goalKnown?: boolean } = {}): NetworkDetailInsight {
  const goal = options.goal === undefined ? INSIGHT_GOAL : options.goal;
  return { goal, quotaExhausted: options.quotaExhausted ?? false, view: contactInsightView(row, { contactId: "c1", goal, goalKnown: options.goalKnown, now: INSIGHT_NOW }) };
}

/** W0061：详情依据从已读到的时间线解析（memo 的东京日期、capture 的采集方式）。 */
const contactWithTimeline = {
  ...(contact as object),
  timeline: {
    items: [
      { contactId: "c1", id: "memo:note:live-contact-detail-update:abc", occurredAt: "2026-09-27T15:00:00.000Z", occurredAtPrecision: "day", ref: { recordId: "contact-detail:u:c1", store: "contact_detail_states", subId: "note:live-contact-detail-update:abc" }, source: "memo", title: { en: "Wrote a memo", zh: "写了 memo" } },
      { contactId: "c1", detail: { captureMethod: "business_card" }, id: "capture:c1", occurredAt: "2026-09-01T00:00:00.000Z", occurredAtPrecision: "instant", ref: { recordId: "c1", store: "contacts" }, source: "capture", title: { en: "Added from a business card", zh: "扫描名片，建立联系" } },
    ],
    unavailableSources: [],
  },
} as never;

function panelHtml(row: ContactInsightRow | null, options: { goal?: string | null; quotaExhausted?: boolean; goalKnown?: boolean; plan?: NetworkDetailPlanContext | null; contact?: unknown } = {}) {
  return renderToStaticMarkup(<NetworkDetailModal contact={(options.contact ?? contact) as never} closeHref="/app/contacts" onFollow={() => {}} insight={insightOf(row, options)} planContext={options.plan === undefined ? PLAN : options.plan} />);
}

test("SC-W0060-03: a ready insight — goal line, 「TA 能帮你」, evidence, linked need chip with its phase, + 关联到其他需求, next step from the insight, why now from the week action, 约 TA／起草邮件", () => {
  const html = panelHtml(readyRow, { contact: contactWithTimeline });
  const why = html.slice(html.indexOf('data-network-detail-section="why"'), html.indexOf('data-network-detail-section="profile"'));
  assert.match(why, /data-network-insight-panel="ready"/);
  assert.match(why, /为什么是 TA[\s\S]*?data-network-why-goal[^>]*>对照目标：认识 SaaS 决策人/);
  // W0061：首行是三处共用的 ContactValueLine。
  assert.match(why, /TA 能帮你：<\/span><span data-value-line-relation="true">惠子负责一家 AI 公司的合作。/);
  assert.match(why, /依据[\s\S]*?href="\/app\/contacts\/c1#tl-memo_note_live-contact-detail-update_abc"[^>]*>memo 9\/28<[\s\S]*?href="\/app\/agent\/plan#plan-need-need-1"[^>]*>计划需求『认识能引荐目标客户的投资人』</);
  assert.match(why, /对应计划需求[\s\S]*?data-plan-linked-need="need-1">阶段 1 · 认识能引荐目标客户的投资人 ✓/);
  assert.match(why, /data-plan-need-link-open[^>]*>\+ 关联到其他需求</);
  assert.match(why, /data-insight-next-step="true">约产品演示。</);
  assert.doesNotMatch(why, /下周约产品演示/, "the insight's next step wins over contact.nextAction");
  assert.match(why, /data-network-why-now[^>]*>为什么现在：阶段 1 · 盘点：你已经认识 TA，是离目标最近的一步。/);
  assert.match(why, /href="\/app\/tasks\/personal"[^>]*data-network-detail-schedule[^>]*>约 TA/);
  assert.match(why, /data-network-detail-draft[^>]*>起草邮件/);
  assert.doesNotMatch(why, /data-insight-regenerate/);
});

test("SC-W0060-03: no insight next step → contact.nextAction; no week action → no why-now line; no linked needs → + 关联到计划需求", () => {
  const html = panelHtml({ ...readyRow, goalRelation: null, nextStep: null, status: "pending" }, { plan: null });
  assert.match(html, /data-insight-next-step="true">下周约产品演示</);
  assert.doesNotMatch(html, /data-network-why-now|为什么现在/);
  assert.match(html, /data-plan-need-link-open[^>]*>\+ 关联到计划需求</);
  assert.doesNotMatch(html, /data-plan-linked-need/);
  const noNext = renderToStaticMarkup(<NetworkDetailModal contact={{ ...(contact as object), nextAction: null } as never} closeHref="/app/contacts" onFollow={() => {}} insight={insightOf(null, { goal: "" })} planContext={PLAN} />);
  assert.doesNotMatch(noNext, /data-insight-next-step|为什么现在/);
  assert.match(noNext, /data-network-detail-schedule/, "the actions stay even without a next step");
});

test("SC-W0060-03 / W0057: pending, failed, retrying and no-goal states show in ② while the plan strip and both buttons stay usable", () => {
  const states: [string, string, RegExp][] = [
    ["pending", panelHtml(null), /data-network-insight-panel="pending"[^>]*data-insight-polling="true"[\s\S]*?正在生成，通常 1 分钟内/],
    ["leased", panelHtml({ ...readyRow, aiState: "started", goalRelation: null, leaseExpiresAt: "2026-10-03T03:04:00.000Z", nextStep: null, status: "pending" }), /正在生成…/],
    ["retrying", panelHtml({ ...readyRow, dirtyAt: INSIGHT_NOW.toISOString(), goalRelation: null, nextStep: null, retryCount: 1, status: "failed" }), /data-insight-auto-retry="true"[\s\S]*?生成失败，稍后自动重试/],
    ["failed", panelHtml({ ...readyRow, goalRelation: null, nextStep: null, retryCount: 3, status: "failed" }), /洞察生成失败。[\s\S]*?data-insight-regenerate[^>]*>重新生成/],
    ["no goal", panelHtml(null, { goal: "" }), /data-network-insight-panel="no_goal"[\s\S]*?设置关系目标后生成洞察。[\s\S]*?href="\/app\/contacts\/dashboard\?tab=insight"[^>]*data-insight-set-goal/],
    ["deferred", panelHtml({ ...readyRow, deferredUntil: "2026-10-03T15:00:00.000Z", goalRelation: null, nextStep: null, status: "pending" }), /data-insight-deferred="true"[\s\S]*?明天更新/],
    ["none", panelHtml(null, { goalKnown: false }), /data-network-insight-panel="none"[\s\S]*?暂无洞察：写 memo、补全资料或在计划里关联 TA 后自动生成。/],
  ];
  for (const [name, html, pattern] of states) {
    assert.match(html, pattern, name);
    assert.match(html, /data-plan-need-link-open/, `${name}: plan link usable`);
    assert.match(html, /data-network-detail-schedule[^>]*>约 TA/, `${name}: 约 TA usable`);
    assert.match(html, /data-network-detail-draft[^>]*>起草邮件/, `${name}: 起草邮件 usable`);
    assert.doesNotMatch(html, /惠子负责一家 AI 公司的合作/, `${name}: no stale relation`);
  }
  assert.doesNotMatch(panelHtml(null, { goal: "" }), /data-insight-polling|对照目标/);
  // 过期：资料有更新／目标已更新角标 + 重新生成。
  assert.match(panelHtml({ ...readyRow, dirtyAt: "2026-10-03T00:00:00.000Z" }), /data-insight-badge="stale"[^>]*>资料有更新[\s\S]*?data-insight-regenerate/);
  assert.match(panelHtml(readyRow, { goal: "新的目标" }), /data-insight-badge="goal-updated"[^>]*>目标已更新[\s\S]*?data-insight-regenerate/);
  const en = renderToStaticMarkup(<OrbitLanguageProvider initialLanguage="en"><NetworkInsightPanel view={contactInsightView({ ...readyRow, dirtyAt: INSIGHT_NOW.toISOString(), goalRelation: null, nextStep: null, retryCount: 2, status: "failed" }, { contactId: "c1", goal: INSIGHT_GOAL, now: INSIGHT_NOW })} /></OrbitLanguageProvider>);
  assert.match(en, /Generation failed\. It will retry automatically shortly\./);
  const enPending = renderToStaticMarkup(<OrbitLanguageProvider initialLanguage="en"><NetworkInsightPanel view={contactInsightView(null, { contactId: "c1", goal: INSIGHT_GOAL, now: INSIGHT_NOW })} /></OrbitLanguageProvider>);
  assert.match(enPending, /Generating — usually within a minute\./);
});

test("W0051 R-11: when today's 10 user-pool actions are used the button is disabled with 今天次数已用完，明天可用; a click posts once and a 429 disables it", async (t) => {
  const exhausted = panelHtml({ ...readyRow, status: "failed" }, { quotaExhausted: true });
  assert.match(exhausted, /data-insight-regenerate="true" disabled=""[^>]*aria-disabled="true"|data-insight-regenerate=""[^>]*disabled=""/);
  assert.match(exhausted, /data-insight-quota-used[^>]*>今天次数已用完，明天可用/);

  const { act, create } = await import("react-test-renderer");
  const previousFetch = globalThis.fetch;
  const posts: string[] = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    posts.push(`${init.method} ${url}`);
    return new Response(JSON.stringify({ error: { context: { reason: "USER_DAILY_LIMIT" } }, success: false }), { status: 429 });
  }) as typeof fetch;
  t.after(() => { globalThis.fetch = previousFetch; });
  const view = contactInsightView({ ...readyRow, status: "failed" }, { contactId: "c1", goal: INSIGHT_GOAL, now: INSIGHT_NOW });
  let root: ReturnType<typeof create> | undefined;
  await act(async () => { root = create(<NetworkInsightPanel view={view} />); });
  const button = () => root!.root.find((node) => node.type === "button" && node.props?.["data-insight-regenerate"] !== undefined);
  await act(async () => { await button().props.onClick(); });
  assert.deepEqual(posts, ["POST /api/contacts/c1/insight/regenerate"]);
  assert.equal(button().props.disabled, true);
  assert.ok(root!.root.findAll((node) => node.props?.["data-insight-quota-used"] !== undefined).length === 1);
  await act(async () => { await button().props.onClick(); });
  assert.equal(posts.length, 1, "a disabled button never posts again");
  await act(async () => { root!.unmount(); });
});

test("SC-W0060-03: a successful 关联 refreshes the server view (router.refresh, no history entry); 起草邮件 posts the template draft once and shows it editable", async (t) => {
  const { AppRouterContext } = await import("next/dist/shared/lib/app-router-context.shared-runtime");
  let refreshed = 0;
  const router = { back() {}, forward() {}, prefetch() {}, push() {}, refresh() { refreshed += 1; }, replace() {} } as never;
  const mounted = await mountModal(t, <AppRouterContext.Provider value={router}><NetworkDetailModal contact={contact} closeHref="/app/contacts" onFollow={() => {}} insight={insightOf(readyRow)} planContext={PLAN} /></AppRouterContext.Provider>, {
    fetch: (url) => url === "/api/contacts/c1/reconnect-draft"
      ? Response.json({ data: { draft: { body: "田中さん\n…", provider: "template", subject: "ご無沙汰しています" } }, success: true })
      : Response.json({ success: false }, { status: 404 }),
  });
  const link = mounted.root.root.find((node) => typeof node.type === "function" && (node.type as { name?: string }).name === "PlanNeedLinkPanel");
  await mounted.act(async () => link.props.onLinked());
  assert.equal(refreshed, 1);
  assert.deepEqual(mounted.assigned, []);
  const draft = () => mounted.byData("data-network-detail-draft")[0]!;
  await mounted.act(async () => { draft().props.onClick(); draft().props.onClick(); });
  await mounted.settle();
  assert.deepEqual(mounted.calls.map((call) => `${call.method} ${call.url}`), ["POST /api/contacts/c1/reconnect-draft"]);
  assert.deepEqual(mounted.calls[0]!.body, { language: "zh" });
  const subject = mounted.root.root.find((node) => node.type === "input" && node.props.className === "nw-op-draft-subject");
  assert.equal(subject.props.value, "ご無沙汰しています");
  assert.ok(mounted.text().includes("只是草稿，Orbit 不会替你发送。"));
});

/* ── SC-W0060-04：快速 memo 与复制 ───────────────────────────────────── */

test("SC-W0060-04: quick memo — empty is disabled; save sends the same PATCH as the full memo dialog once (double submit), then reloads the page", async (t) => {
  let release: (response: Response) => void = () => {};
  const mounted = await mountModal(t, <NetworkDetailModal contact={contact} closeHref="/app/contacts" onFollow={() => {}} />, {
    fetch: () => new Promise<Response>((resolve) => { release = resolve; }),
  });
  const save = () => mounted.byData("data-network-quick-memo-save")[0]!;
  const input = () => mounted.root.root.find((node) => node.type === "input" && node.props.className === "nw-qm-input");
  const form = () => mounted.root.root.find((node) => node.type === "form");
  assert.equal(save().props.disabled, true, "empty text cannot be saved");
  await mounted.act(async () => input().props.onChange({ target: { value: "  聊了试点，TA 需要制造业客户  " } }));
  assert.equal(save().props.disabled, false);
  await mounted.act(async () => { form().props.onSubmit({ preventDefault() {} }); form().props.onSubmit({ preventDefault() {} }); });
  assert.equal(mounted.calls.length, 1, "double submit sends one request");
  assert.equal(save().props.disabled, true, "saving disables the button");
  assert.deepEqual(mounted.calls[0], { body: buildMemoPatch({ body: "聊了试点，TA 需要制造业客户", date: tokyoToday() }), method: "PATCH", url: "/api/contacts/c1" });
  await mounted.act(async () => { release(Response.json({ success: true })); });
  await mounted.settle();
  assert.deepEqual(mounted.assigned, ["reload"]);
  // Esc 在快速 memo 输入框里不关闭弹窗（W0059 例外保持）。
  mounted.keydown("Escape", { tagName: "INPUT", isContentEditable: false });
  assert.deepEqual(mounted.assigned, ["reload"]);
});

test("SC-W0060-04: a failed quick memo keeps the text and shows an error", async (t) => {
  const mounted = await mountModal(t, <NetworkDetailModal contact={contact} closeHref="/app/contacts" onFollow={() => {}} />, { fetch: () => Response.json({ success: false }, { status: 500 }) });
  const input = () => mounted.root.root.find((node) => node.type === "input" && node.props.className === "nw-qm-input");
  await mounted.act(async () => input().props.onChange({ target: { value: "要保留的话" } }));
  await mounted.act(async () => mounted.root.root.find((node) => node.type === "form").props.onSubmit({ preventDefault() {} }));
  await mounted.settle();
  assert.equal(input().props.value, "要保留的话");
  assert.ok(mounted.text().includes("没能保存，文字还在，请重试。"));
  assert.deepEqual(mounted.assigned, []);
  assert.equal(mounted.byData("data-network-quick-memo-save")[0]!.props.disabled, false, "can retry");
});

test("SC-W0060-04: clicking the email chip copies it (已复制邮箱); without a clipboard, or when it is refused, the text is selected instead (已选中，可手动复制); no request either way", async (t) => {
  const withEmail = { ...(contact as object), email: "keiko@nexa.example" } as never;
  const writes: string[] = [];
  await t.test("clipboard", async (st) => {
    const mounted = await mountModal(st, <NetworkDetailModal contact={withEmail} closeHref="/app/contacts" onFollow={() => {}} />, { navigator: { clipboard: { writeText: async (value: string) => { writes.push(value); } } } });
    const chip = mounted.byData("data-network-channel")[0]!;
    await mounted.act(async () => chip.props.onClick({ currentTarget: { querySelector: () => null } }));
    await mounted.settle();
    assert.deepEqual(writes, ["keiko@nexa.example"]);
    assert.equal(mounted.byData("data-network-copy-status")[0]!.props["data-network-copy-status"], "copied");
    assert.ok(mounted.text().includes("已复制邮箱"));
    assert.deepEqual(mounted.calls, []);
  });
  for (const [name, navigatorValue] of [["no clipboard", {}], ["refused", { clipboard: { writeText: async () => { throw new Error("NotAllowedError"); } } }]] as const) {
    await t.test(name, async (st) => {
      const selected: string[] = [];
      const selection = { addRange: () => selected.push("range"), removeAllRanges() {} };
      const mounted = await mountModal(st, <NetworkDetailModal contact={withEmail} closeHref="/app/contacts" onFollow={() => {}} />, { navigator: navigatorValue, selection });
      const chip = mounted.byData("data-network-channel")[0]!;
      await mounted.act(async () => chip.props.onClick({ currentTarget: { querySelector: () => ({}) } }));
      await mounted.settle();
      assert.deepEqual(selected, ["range"]);
      assert.equal(mounted.byData("data-network-copy-status")[0]!.props["data-network-copy-status"], "selected");
      assert.ok(mounted.text().includes("已选中，可手动复制"));
      assert.deepEqual(mounted.calls, []);
    });
  }
});

test("formatNoteTime renders UTC M月D日 HH:mm (en: Mon D HH:mm) and dashes on garbage", () => {
  assert.equal(formatNoteTime("2026-09-18T07:30:00Z"), "9月18日 07:30");
  assert.equal(formatNoteTime("2026-09-21T08:00:00Z", (c) => c.en), "Sep 21 08:00");
  assert.equal(formatNoteTime("2026-12-31T23:59:00Z"), "12月31日 23:59");
  assert.equal(formatNoteTime("nope"), "—");
});

/* ── W0047：档位与依据（头卡） ───────────────────────────────────────── */

const strengthContact = {
  ...(contact as object),
  timeline: {
    items: [
      { id: "schedule:s1", source: "schedule", contactId: "c1", occurredAt: "2026-09-25T01:00:00.000Z", occurredAtPrecision: "instant", title: { zh: "会面：产品演示", en: "Meeting: product demo" }, ref: { store: "personal_schedule_items", recordId: "s1" } },
      { id: "memo:m1", source: "memo", contactId: "c1", occurredAt: "2026-09-19T15:00:00.000Z", occurredAtPrecision: "day", title: { zh: "写了 memo", en: "Wrote a memo" }, ref: { store: "contact_detail_states", recordId: "d", subId: "m1" } },
    ],
    unavailableSources: [],
  },
  relationshipStrength: {
    contactId: "c1", tier: "core", dormant: false, score: 83, peakScore: 83, lastSignalAt: "2026-09-25T01:00:00.000Z",
    signals: [
      { timelineItemId: "schedule:s1", source: "schedule", occurredAt: "2026-09-25T01:00:00.000Z", basePoints: 25, points: 24.4 },
      { timelineItemId: "memo:m1", source: "memo", occurredAt: "2026-09-19T15:00:00.000Z", basePoints: 15, points: 14.3 },
      // 不在最近 20 条时间线里的信号：详情页按 id 读回的条目给出真实标题（review P2-6）。
      { timelineItemId: "encounter:old", source: "encounter", occurredAt: "2026-06-01T03:00:00.000Z", basePoints: 20, points: 9.1 },
      // 读回也找不到（来源已删除）：退回来源名。
      { timelineItemId: "followup_done:gone", source: "followup_done", occurredAt: "2026-05-01T03:00:00.000Z", basePoints: 10, points: 3.2 },
    ],
    computedAt: "2026-10-02T03:00:00.000Z", rulesVersion: "rs-2026-10-v1",
  },
  relationshipSignalItems: [
    { id: "encounter:old", source: "encounter", contactId: "c1", occurredAt: "2026-06-01T03:00:00.000Z", occurredAtPrecision: "instant", title: { zh: "在活动上见面", en: "Met at an event" }, ref: { store: "human_encounters", recordId: "old" } },
  ],
} as never;

test("SC-W0047-04: the head card shows the tier tag and the basis panel lists each signal's date, source and timeline title (no score)", async (t) => {
  const { act, create } = await import("react-test-renderer");
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "window", { configurable: true, value: { addEventListener() {}, removeEventListener() {}, location: { assign() {} } } });
  Object.defineProperty(globalThis, "document", { configurable: true, value: { activeElement: null, addEventListener() {}, removeEventListener() {}, documentElement: { lang: "zh" } } });
  t.after(() => {
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow); else delete (globalThis as { window?: unknown }).window;
    if (previousDocument) Object.defineProperty(globalThis, "document", previousDocument); else delete (globalThis as { document?: unknown }).document;
  });
  const closed = renderToStaticMarkup(<NetworkDetailModal contact={strengthContact} closeHref="/app/contacts" onFollow={() => {}} />);
  const head = closed.slice(closed.indexOf('data-network-detail-section="head"'), closed.indexOf('data-network-detail-section="why"'));
  assert.match(head, /class="nw-detail-stage" data-network-tier="core"[^>]*>核心</);
  assert.match(head, /class="btn nw-basis-toggle" aria-expanded="false"/);
  assert.doesNotMatch(closed, /data-network-basis/);

  for (const language of ["zh", "en"] as const) {
    let root: ReturnType<typeof create> | undefined;
    await act(async () => {
      root = create(<OrbitLanguageProvider initialLanguage={language}><NetworkDetailModal contact={strengthContact} closeHref="/app/contacts" onFollow={() => {}} /></OrbitLanguageProvider>);
    });
    const toggle = root!.root.find((node) => node.props?.className === "btn nw-basis-toggle");
    await act(async () => { toggle.props.onClick(); });
    const basis = root!.root.find((node) => node.props?.["data-network-basis"] !== undefined);
    const rows = basis.findAll((node) => node.props?.className === "nw-basis-row");
    const text = (node: { children: unknown[] }): string => node.children.map((child) => (typeof child === "string" ? child : text(child as { children: unknown[] }))).join("");
    const lines = rows.map((row) => text(row as never));
    if (language === "zh") {
      assert.deepEqual(lines, ["9月25日 10:00日程会面：产品演示", "9月20日memo写了 memo", "6月1日 12:00见面在活动上见面", "5月1日 12:00跟进跟进"]);
    } else {
      assert.deepEqual(lines, ["Sep 25 10:00ScheduleMeeting: product demo", "Sep 20MemoWrote a memo", "Jun 1 12:00MetMet at an event", "May 1 12:00Follow-upFollow-up"]);
    }
    // 不显示分数（W47-6）。
    assert.doesNotMatch(text(basis as never), /83|24\.4|14\.3|9\.1|3\.2|分/);
    await act(async () => { root!.unmount(); });
  }
});

/* ── W0057 SC-02：轮询替换（「为什么是 TA」内） ─────────────────────────── */

async function mountPolling(t: import("node:test").TestContext, respond: (count: number) => Response) {
  const { act, create } = await import("react-test-renderer");
  const previousFetch = globalThis.fetch;
  const gets: string[] = [];
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    gets.push(`${init?.method ?? "GET"} ${url}`);
    return respond(gets.length);
  }) as typeof fetch;
  t.mock.timers.enable({ apis: ["setInterval"] });
  t.after(() => { globalThis.fetch = previousFetch; t.mock.timers.reset(); });
  const view = contactInsightView(null, { contactId: "c1", goal: INSIGHT_GOAL, now: INSIGHT_NOW });
  let root: ReturnType<typeof create> | undefined;
  await act(async () => { root = create(<NetworkInsightPanel view={view} />); });
  const tick = async () => {
    await act(async () => {
      t.mock.timers.tick(INSIGHT_POLL_INTERVAL_MS);
      for (let i = 0; i < 5; i += 1) await Promise.resolve();
    });
  };
  return { gets, root: () => root!, tick, act };
}

const statusResponse = (view: unknown) => new Response(JSON.stringify({ data: { quotaExhausted: false, view }, success: true }), { status: 200 });

test("W0057: while generating the panel polls the read-only status every 5 s and swaps in the ready insight without a page reload, then stops", async (t) => {
  const pendingView = contactInsightView(null, { contactId: "c1", goal: INSIGHT_GOAL, now: INSIGHT_NOW });
  const readyView = contactInsightView(readyRow, { contactId: "c1", goal: INSIGHT_GOAL, now: INSIGHT_NOW });
  const panel = await mountPolling(t, (count) => statusResponse(count < 2 ? pendingView : readyView));
  assert.equal(panel.gets.length, 0, "no request before the first interval");
  await panel.tick();
  assert.deepEqual(panel.gets, ["GET /api/contacts/c1/insight"]);
  assert.equal(panel.root().root.findAll((node) => node.props?.["data-insight-goal-relation"] !== undefined).length, 0);
  await panel.tick();
  assert.equal(panel.gets.length, 2);
  const relation = panel.root().root.find((node) => node.props?.["data-value-line-relation"] !== undefined);
  assert.equal(relation.children.join(""), "惠子负责一家 AI 公司的合作。");
  await panel.tick();
  await panel.tick();
  assert.equal(panel.gets.length, 2, "polling stops once ready");
  await panel.act(async () => { panel.root().unmount(); });
});

test("W0057: polling stops after 24 attempts (2 minutes) and asks to refresh", async (t) => {
  const pendingView = contactInsightView(null, { contactId: "c1", goal: INSIGHT_GOAL, now: INSIGHT_NOW });
  const panel = await mountPolling(t, () => statusResponse(pendingView));
  for (let index = 0; index < INSIGHT_POLL_MAX + 3; index += 1) await panel.tick();
  assert.equal(panel.gets.length, INSIGHT_POLL_MAX);
  assert.equal(panel.root().root.findAll((node) => node.props?.["data-insight-poll-stopped"] !== undefined).length, 1);
  await panel.act(async () => { panel.root().unmount(); });
});

/* ── W0059 SC-W0059-01／02／03：四种关闭方式 + 「‹ 返回 {来源}」统一走 close() ─────────────── */

import { AppRouterContext, type AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { DETAIL_RETURN_STORAGE_KEY } from "../../app/(app)/app/contacts/network-0918/detail-return";

type CloseWay = "×" | "bottom" | "Escape" | "overlay" | "back";

interface CloseHarness {
  assigned: string[];
  backs: { router: number; history: number };
  storage: Map<string, string>;
  root: import("react-test-renderer").ReactTestRenderer;
  keydown: (key: string, target?: object) => void;
  close: (way: CloseWay, event?: Partial<{ button: number; metaKey: boolean }>) => Promise<{ defaultPrevented: boolean }>;
  backLabel: () => string;
}

async function mountClose(
  t: TestContext,
  options: { intent?: object | null; path?: string; closeHref?: string; withRouter?: boolean; storageThrows?: boolean; language?: "zh" | "en"; navigationType?: string },
): Promise<CloseHarness> {
  const { act, create } = await import("react-test-renderer");
  const { OrbitLanguageProvider } = await import("../../app/(app)/app/orbit-language-context");
  const path = options.path ?? "/app/contacts/c1";
  const assigned: string[] = [];
  const backs = { router: 0, history: 0 };
  const storage = new Map<string, string>();
  if (options.intent) storage.set(DETAIL_RETURN_STORAGE_KEY, JSON.stringify(options.intent));
  const sessionStorage = options.storageThrows
    ? { getItem() { throw new Error("SecurityError"); }, setItem() { throw new Error("x"); }, removeItem() { throw new Error("x"); } }
    : { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => void storage.set(k, v), removeItem: (k: string) => void storage.delete(k) };
  const windowListeners = new Map<string, Set<(event: unknown) => void>>();
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      addEventListener(type: string, listener: (event: unknown) => void) {
        if (!windowListeners.has(type)) windowListeners.set(type, new Set());
        windowListeners.get(type)!.add(listener);
      },
      removeEventListener(type: string, listener: (event: unknown) => void) { windowListeners.get(type)?.delete(listener); },
      history: { back: () => { backs.history += 1; } },
      location: { assign: (href: string) => assigned.push(href), origin: "https://orbit.example", pathname: path.split("?")[0], search: path.includes("?") ? `?${path.split("?")[1]}` : "" },
      sessionStorage,
    },
  });
  Object.defineProperty(globalThis, "document", { configurable: true, value: { activeElement: null, addEventListener() {}, removeEventListener() {}, documentElement: { lang: "zh" } } });
  if (options.navigationType) {
    t.mock.method(performance, "getEntriesByType", () => [{ name: `https://orbit.example${path}`, type: options.navigationType }]);
  }
  const router = { back: () => { backs.router += 1; }, forward() {}, prefetch() {}, push() {}, refresh() {}, replace() {} } as unknown as AppRouterInstance;
  const modal = <NetworkDetailModal contact={contact} closeHref={options.closeHref ?? "/app/contacts"} onFollow={() => {}} />;
  const tree = <OrbitLanguageProvider initialLanguage={options.language ?? "zh"}>{options.withRouter === false ? modal : <AppRouterContext.Provider value={router}>{modal}</AppRouterContext.Provider>}</OrbitLanguageProvider>;
  let root: import("react-test-renderer").ReactTestRenderer | undefined;
  await act(async () => { root = create(tree); });
  t.after(() => {
    act(() => root?.unmount());
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow); else delete (globalThis as { window?: unknown }).window;
    if (previousDocument) Object.defineProperty(globalThis, "document", previousDocument); else delete (globalThis as { document?: unknown }).document;
  });
  const mounted = root!;
  const keydown = (key: string, target: object = { tagName: "BODY", isContentEditable: false }) => {
    for (const listener of [...(windowListeners.get("keydown") ?? [])]) listener({ key, target });
  };
  const findAnchor = (className: string) => mounted.root.find((node) => node.type === "a" && node.props.className === className);
  const close = async (way: CloseWay, extra: Partial<{ button: number; metaKey: boolean }> = {}) => {
    const event = { altKey: false, button: 0, ctrlKey: false, defaultPrevented: false, metaKey: false, shiftKey: false, preventDefault() { event.defaultPrevented = true; }, ...extra } as { defaultPrevented: boolean; target?: unknown; currentTarget?: unknown; preventDefault: () => void };
    await act(async () => {
      if (way === "×") findAnchor("btn nw-modal-close").props.onClick(event);
      else if (way === "bottom") findAnchor("btn nw-detail-close").props.onClick(event);
      else if (way === "back") findAnchor("btn nw-detail-back").props.onClick(event);
      else if (way === "Escape") keydown("Escape");
      else {
        const overlay = mounted.root.find((node) => node.props?.["data-network-modal"] === "detail");
        const self = {};
        overlay.props.onClick({ ...event, target: self, currentTarget: self });
      }
    });
    return event;
  };
  const backLabel = () => {
    const node = findAnchor("btn nw-detail-back");
    return (node.children as unknown[]).map((c) => (typeof c === "string" ? c : "")).join("");
  };
  return { assigned, backs, storage, root: mounted, keydown, close, backLabel };
}

const WAYS: CloseWay[] = ["×", "bottom", "Escape", "overlay", "back"];
const freshIntent = (from: string, to = "/app/contacts/c1") => ({ from, to, at: Date.now() - 500, nonce: "n" });

test("SC-W0059-01: with an in-app source, ×／底部关闭／Esc／遮罩／返回 each call router.back() once and never location.assign", async (t) => {
  for (const way of WAYS) {
    await t.test(way, async (st) => {
      const h = await mountClose(st, { intent: freshIntent("/app/agent/plan") });
      assert.equal(h.storage.has(DETAIL_RETURN_STORAGE_KEY), false, "intent consumed on mount");
      assert.equal(h.backLabel(), "‹ 返回我的计划");
      const event = await h.close(way);
      assert.deepEqual(h.backs, { router: 1, history: 0 });
      assert.deepEqual(h.assigned, []);
      if (way !== "Escape" && way !== "overlay") assert.equal(event.defaultPrevented, true, "link click handled in-page");
    });
  }
});

test("SC-W0059-01: labels follow the source (zh/en); without an App Router the same close falls back to history.back()", async (t) => {
  await t.test("iOrbit", async (st) => {
    const iorbit = await mountClose(st, { intent: freshIntent("/app/agent") });
    assert.equal(iorbit.backLabel(), "‹ 返回 iOrbit");
  });
  await t.test("en", async (st) => {
    const en = await mountClose(st, { intent: freshIntent("/app/contacts/dashboard"), language: "en" });
    assert.equal(en.backLabel(), "‹ Back to Network analysis");
  });
  await t.test("no App Router", async (st) => {
    const bare = await mountClose(st, { intent: freshIntent("/app/events/e1"), withRouter: false });
    assert.equal(bare.backLabel(), "‹ 返回活动");
    await bare.close("×");
    assert.deepEqual(bare.backs, { router: 0, history: 1 });
    assert.deepEqual(bare.assigned, []);
  });
});

test("SC-W0059-02: no usable source → every way goes to /app/contacts (or the validated returnTo) and shows 返回人脉", async (t) => {
  const scenarios: { name: string; options: Parameters<typeof mountClose>[1]; href: string; label: string }[] = [
    { name: "direct open / new tab", options: {}, href: "/app/contacts", label: "‹ 返回人脉" },
    { name: "intent expired", options: { intent: { from: "/app/agent", to: "/app/contacts/c1", at: Date.now() - 31_000, nonce: "n" } }, href: "/app/contacts", label: "‹ 返回人脉" },
    { name: "intent for another contact", options: { intent: freshIntent("/app/agent", "/app/contacts/c2") }, href: "/app/contacts", label: "‹ 返回人脉" },
    { name: "refresh of this detail", options: { intent: freshIntent("/app/agent"), navigationType: "reload" }, href: "/app/contacts", label: "‹ 返回人脉" },
    { name: "sessionStorage throws", options: { storageThrows: true }, href: "/app/contacts", label: "‹ 返回人脉" },
    { name: "valid returnTo from the page", options: { closeHref: "/app/agent/plan" }, href: "/app/agent/plan", label: "‹ 返回我的计划" },
  ];
  for (const scenario of scenarios) {
    for (const way of WAYS) {
      await t.test(`${scenario.name} · ${way}`, async (st) => {
        const h = await mountClose(st, scenario.options);
        assert.equal(h.backLabel(), scenario.label);
        await h.close(way);
        assert.deepEqual(h.assigned, [scenario.href]);
        assert.deepEqual(h.backs, { router: 0, history: 0 });
      });
    }
  }
});

test("SC-W0059-03: Esc inside an input／textarea／contentEditable does not close; modifier or middle clicks keep the link's native behaviour", async (t) => {
  const h = await mountClose(t, { intent: freshIntent("/app/contacts") });
  h.keydown("Escape", { tagName: "INPUT", isContentEditable: false });
  h.keydown("Escape", { tagName: "TEXTAREA", isContentEditable: false });
  h.keydown("Escape", { tagName: "DIV", isContentEditable: true });
  assert.deepEqual(h.backs, { router: 0, history: 0 });
  const meta = await h.close("×", { metaKey: true });
  const middle = await h.close("bottom", { button: 1 });
  assert.equal(meta.defaultPrevented, false);
  assert.equal(middle.defaultPrevented, false);
  assert.deepEqual(h.backs, { router: 0, history: 0 });
  assert.deepEqual(h.assigned, []);
});
