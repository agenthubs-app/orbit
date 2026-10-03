import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { NetworkDetailModal, formatNoteTime } from "../../app/(app)/app/contacts/network-0918/network-detail-modal";

const contact = {
  id: "c1", displayName: "田中惠子", initial: "田", company: "Nexa AI", title: "合作伙伴负责人", industry: "科技与互联网", source: "event", stage: "Active", pipelineStatus: "in_progress", relationshipStatus: "active", location: "日本 东京", met: "东京 AI 峰会",
  lastInteraction: "昨天聊了知识库方案", editableInteraction: { channel: "manual_note", occurredAt: "2026-09-19T01:00:00Z", summary: "昨天聊了知识库方案" }, nextAction: { text: "下周约产品演示", reason: "对方对知识库方案有兴趣" }, valueTags: ["AI"], editableTags: [{ value: "ai", label: "AI" }],
  notes: [
    { id: "n0", body: "较早的备注", createdAt: "2026-09-10T02:00:00Z" },
    { id: "n1", body: "讨论合作模式", createdAt: "2026-09-18T07:30:00Z" },
  ],
  encounters: [{ id: "e", eventId: "", createdAt: "", context: { metAt: "", reason: "", score: 0, tableNo: 1, publicProfile: { bio: "", intro: "", industry: "", topics: ["生成式 AI"], offering: ["企业级 AI 知识库"], seeking: ["日本市场 AI 方案"], conversationPrompts: [] } } }],
} as never;

test("detail modal renders overview rows, timeline from notes, and next steps", () => {
  const html = renderToStaticMarkup(<NetworkDetailModal contact={contact} closeHref="/app/contacts" onFollow={() => {}} />);
  assert.match(html, /role="dialog"/);
  assert.match(html, /aria-modal="true"/);
  assert.match(html, /联系人详情/);
  assert.match(html, /Nexa AI · 合作伙伴负责人/);
  assert.match(html, /◎ 日本 东京/);
  assert.match(html, /⇢ 来自 活动认识/);
  for (const s of ["关系档位", "上次互动", "下次计划", "来源", "生成式 AI", "企业级 AI 知识库", "日本市场 AI 方案", "讨论合作模式", "下周约产品演示", "对方对知识库方案有兴趣"]) assert.match(html, new RegExp(s));
  // 联系频率无数据源 → 不渲染；四条概览
  assert.doesNotMatch(html, /联系频率/);
  assert.equal((html.match(/class="nw-ov"/g) ?? []).length, 4);
  // 时间线倒序：最新备注在前，首点 #4B4FC7
  assert.ok(html.indexOf("讨论合作模式") < html.indexOf("较早的备注"));
  assert.match(html, /background:#4B4FC7[^>]*><\/span>[\s\S]*?9月18日 07:30/);
  assert.match(html, /备注/);
  // 按钮：关闭（链接）、写 memo（W0046 改名）；W0047 下线「更新状态」
  assert.match(html, /class="btn nw-detail-close" href="\/app\/contacts"/);
  assert.match(html, /class="btn nw-modal-close" href="\/app\/contacts"/);
  assert.match(html, /class="btn nw-detail-follow"[^>]*>▤ 写 memo/);
  assert.doesNotMatch(html, /nw-detail-status|更新状态/);
  // 没有强度缓存：档位显示「暂未评估」，不显示依据按钮。
  assert.match(html, /关系档位<\/span><strong class="nw-ov-v">暂未评估</);
  assert.doesNotMatch(html, /nw-basis-toggle|关系阶段/);
  assert.doesNotMatch(html, /平均 2–3 周一次|1 周后（9月25日）|编辑资料|约时间|查看全部/);
});

test("detail modal shows interaction time as 上次互动 and never repeats the summary outside the timeline", () => {
  const html = renderToStaticMarkup(<NetworkDetailModal contact={contact} closeHref="/app/contacts" onFollow={() => {}} />);
  // 上次互动值 = editableInteraction.occurredAt 的 M月D日 HH:mm，说明 = 互动摘要
  // 时间只用 UTC 分量（服务端 / 客户端一致）：2026-09-19T01:00:00Z → 9月19日 01:00
  assert.match(html, /上次互动<\/span><strong class="nw-ov-v">9月19日 01:00<\/strong><span class="nw-ov-d">昨天聊了知识库方案/);
  const outsideTimeline = html.replace(/<div class="nw-tl">[\s\S]*?<\/div>\s*<\/div>/, "");
  assert.ok((outsideTimeline.match(/昨天聊了知识库方案/g) ?? []).length <= 1);
  // reason 与互动摘要相同时不再重复
  const same = { ...(contact as object), nextAction: { text: "下周约产品演示", reason: "昨天聊了知识库方案" } } as never;
  const html2 = renderToStaticMarkup(<NetworkDetailModal contact={same} closeHref="/app/contacts" onFollow={() => {}} />);
  const outside2 = html2.replace(/<div class="nw-tl">[\s\S]*?<\/div>\s*<\/div>/, "");
  assert.equal((outside2.match(/昨天聊了知识库方案/g) ?? []).length, 1);
  assert.doesNotMatch(html2, /nw-step-reason/);
});

test("detail modal falls back to dashes and renders extra above the timeline", () => {
  const bare = { ...(contact as object), location: "", nextAction: null, lastInteraction: "", editableInteraction: undefined, notes: [], encounters: [] } as never;
  const html = renderToStaticMarkup(<NetworkDetailModal contact={bare} closeHref="/app/contacts" onFollow={() => {}} extra={<p data-extra>memo</p>} />);
  assert.doesNotMatch(html, /◎ /);
  assert.match(html, /nw-ov-v">—</);
  assert.ok(html.indexOf("data-extra") < html.indexOf("最近互动"));
  assert.match(html, /nw-tl-empty/);
});

test("formatNoteTime renders UTC M月D日 HH:mm (en: Mon D HH:mm) and dashes on garbage", () => {
  assert.equal(formatNoteTime("2026-09-18T07:30:00Z"), "9月18日 07:30");
  assert.equal(formatNoteTime("2026-09-21T08:00:00Z", (c) => c.en), "Sep 21 08:00");
  assert.equal(formatNoteTime("2026-12-31T23:59:00Z"), "12月31日 23:59");
  assert.equal(formatNoteTime("nope"), "—");
});

test("detail modal renders a 联系方式 block only for the non-empty channels, omitted when all four are empty", () => {
  const withChannels = { ...(contact as object), email: "keiko@nexa.example", phone: "+81 90 0000 0000", wechat: "", lineId: "" } as never;
  const html = renderToStaticMarkup(<NetworkDetailModal contact={withChannels} closeHref="/app/contacts" onFollow={() => {}} />);
  assert.match(html, /data-network-detail-contacts/);
  assert.match(html, /联系方式/);
  assert.match(html, /nw-ov-icon">✉<\/span><span class="nw-ov-copy"><span class="nw-ov-l">邮箱<\/span><strong class="nw-ov-v">keiko@nexa.example</);
  assert.match(html, /nw-ov-icon">☎<\/span><span class="nw-ov-copy"><span class="nw-ov-l">电话<\/span><strong class="nw-ov-v">\+81 90 0000 0000</);
  assert.doesNotMatch(html, /微信|LINE/);
  // 关系概览四行 + 联系方式两行
  assert.equal((html.match(/class="nw-ov"/g) ?? []).length, 6);
  // 联系方式在关系概览之后、最近互动之前
  assert.ok(html.indexOf("关系概览") < html.indexOf("联系方式") && html.indexOf("联系方式") < html.indexOf("最近互动"));
  const empty = { ...(contact as object), email: "", phone: " ", wechat: "", lineId: "" } as never;
  const html2 = renderToStaticMarkup(<NetworkDetailModal contact={empty} closeHref="/app/contacts" onFollow={() => {}} />);
  assert.doesNotMatch(html2, /data-network-detail-contacts|联系方式/);
  assert.equal((html2.match(/class="nw-ov"/g) ?? []).length, 4);
});

test("W0047: the detail modal no longer mounts the manual 待设置关系 panel (API and data stay)", () => {
  const pending = { ...(contact as object), pipelineStatus: "pending_initialization", stage: "待设置关系", nextAction: null } as never;
  const html = renderToStaticMarkup(<NetworkDetailModal contact={pending} closeHref="/app/contacts" onFollow={() => {}} extra={<p data-extra>memo</p>} />);
  assert.doesNotMatch(html, /我的关系设置|data-initialization-refresh|待设置关系|更新状态/);
  assert.ok(html.indexOf("data-extra") < html.indexOf("最近互动"));
});

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

test("SC-W0047-04: detail shows the tier tag and the basis panel lists each signal's date, source and timeline title (no score)", async (t) => {
  const { act, create } = await import("react-test-renderer");
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "window", { configurable: true, value: { addEventListener() {}, removeEventListener() {}, location: { assign() {} } } });
  Object.defineProperty(globalThis, "document", { configurable: true, value: { activeElement: null, addEventListener() {}, removeEventListener() {}, documentElement: { lang: "zh" } } });
  t.after(() => {
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow); else delete (globalThis as { window?: unknown }).window;
    if (previousDocument) Object.defineProperty(globalThis, "document", previousDocument); else delete (globalThis as { document?: unknown }).document;
  });
  const { OrbitLanguageProvider } = await import("../../app/(app)/app/orbit-language-context");
  const closed = renderToStaticMarkup(<NetworkDetailModal contact={strengthContact} closeHref="/app/contacts" onFollow={() => {}} />);
  assert.match(closed, /class="nw-detail-stage" data-network-tier="core"[^>]*>核心</);
  assert.match(closed, /关系档位<\/span><strong class="nw-ov-v">核心</);
  assert.match(closed, /class="btn nw-basis-toggle" aria-expanded="false"/);
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

test("detail modal shows the business-card notes without the review page's photo headings, and omits the panel when empty", () => {
  const withNotes = { ...(contact as object), cardNotes: "正面 · IMG_1.png\n传真: 03-6800-3712\n微信(Wechat): yoshikuni26" } as never;
  const html = renderToStaticMarkup(<NetworkDetailModal contact={withNotes} closeHref="/app/contacts" onFollow={() => {}} />);
  assert.match(html, /data-network-detail-card-notes/);
  assert.match(html, /名片备注/);
  assert.match(html, /传真: 03-6800-3712\n微信\(Wechat\): yoshikuni26/);
  assert.doesNotMatch(html, /IMG_1\.png/);
  const without = renderToStaticMarkup(<NetworkDetailModal contact={contact} closeHref="/app/contacts" onFollow={() => {}} />);
  assert.doesNotMatch(without, /data-network-detail-card-notes/);
});

test("W0010: the detail modal offers 关联到计划人脉需求 without reading the plan until clicked", () => {
  const html = renderToStaticMarkup(<NetworkDetailModal contact={contact} closeHref="/app/contacts" onFollow={() => {}} />);
  assert.match(html, /data-network-detail-plan-link/);
  assert.match(html, /data-plan-need-link="closed"/);
  assert.match(html, /data-plan-need-link-open[^>]*>关联到计划人脉需求</);
});

/* ── W0051 SC-W0051-04：hero 下方「和你目标的关系」 ───────────────────── */

import { NetworkInsightPanel } from "../../app/(app)/app/contacts/network-0918/network-insight-panel";
import { contactInsightView } from "../../features/contacts/insights/view";
import { contactInsightGoalHash, type ContactInsightRow } from "../../features/contacts/insights/repository";

const INSIGHT_NOW = new Date("2026-10-03T03:00:00.000Z");
const INSIGHT_GOAL = "认识 SaaS 决策人";
const readyRow: ContactInsightRow = {
  aiState: "done", attempts: 1, retryCount: 0, contactId: "c1", deferredUntil: null, dirtyAt: null, dirtyReasons: [],
  evidence: [{ id: "memo:note:live-contact-detail-update:abc", source: "memo" }, { id: "item:need-1", source: "plan_need" }],
  generatedAt: "2026-10-02T00:00:00.000Z", goalHash: contactInsightGoalHash(INSIGHT_GOAL),
  goalRelation: { en: "Keiko leads partnerships at an AI vendor.", zh: "惠子负责一家 AI 公司的合作。" }, lastErrorCode: null, leaseExpiresAt: null,
  model: "m", nextStep: { en: "Book the product demo.", zh: "约产品演示。" }, relevance: 72, sourceDataVersion: "v", status: "ready",
};

function panelHtml(row: ContactInsightRow | null, options: { goal?: string | null; quotaExhausted?: boolean; goalKnown?: boolean } = {}) {
  const view = contactInsightView(row, { contactId: "c1", goal: options.goal === undefined ? INSIGHT_GOAL : options.goal, goalKnown: options.goalKnown, now: INSIGHT_NOW });
  const insight = <NetworkInsightPanel view={view} quotaExhausted={options.quotaExhausted} contactHref="/app/contacts/c1" />;
  return renderToStaticMarkup(<NetworkDetailModal contact={contact} closeHref="/app/contacts" onFollow={() => {}} insight={insight} />);
}

test("W0051: the goal-relation panel sits between the hero and 关系概览, with relation, evidence links and next step; no regenerate when fresh", () => {
  const html = panelHtml(readyRow);
  const hero = html.indexOf("nw-detail-hero");
  const panel = html.indexOf("data-network-insight-panel");
  const overview = html.indexOf("关系概览");
  assert.ok(hero >= 0 && hero < panel && panel < overview, "hero < insight < overview");
  assert.match(html, /data-network-insight-panel="ready"[\s\S]*?和你目标的关系[\s\S]*?惠子负责一家 AI 公司的合作。[\s\S]*?href="\/app\/contacts\/c1#tl-memo_note_live-contact-detail-update_abc"[\s\S]*?href="\/app\/agent\/plan#plan-need-item%3Aneed-1"[\s\S]*?下一步：<\/strong>约产品演示。/);
  assert.doesNotMatch(html, /data-insight-regenerate/);
  // 旧「下一步建议」区块保留不动（读 contact.nextAction）。
  assert.match(html, /下周约产品演示/);
});

test("W0051: four states — pending / no goal / failed / none — each with real copy; regenerate only when stale or failed", () => {
  // W0057（SC-02）：详情面板的 pending =「正在生成，通常 1 分钟内」（名片确认后当场生成）。
  const pending = panelHtml({ ...readyRow, goalRelation: null, nextStep: null, status: "pending" });
  assert.match(pending, /data-network-insight-panel="pending"[\s\S]*?正在生成，通常 1 分钟内/);
  assert.doesNotMatch(pending, /data-insight-regenerate/);
  const deferred = panelHtml({ ...readyRow, deferredUntil: "2026-10-03T15:00:00.000Z", goalRelation: null, nextStep: null, status: "pending" });
  assert.match(deferred, /data-insight-deferred="true"[\s\S]*?明天更新/);
  const noGoal = panelHtml(readyRow, { goal: "" });
  assert.match(noGoal, /data-network-insight-panel="no_goal"[\s\S]*?设置关系目标后生成洞察。[\s\S]*?href="\/app\/contacts\/dashboard\?tab=insight"[^>]*data-insight-set-goal/);
  assert.doesNotMatch(noGoal, /惠子负责一家 AI 公司的合作/);
  const failed = panelHtml({ ...readyRow, lastErrorCode: "INVALID_OUTPUT", status: "failed" });
  assert.match(failed, /data-network-insight-panel="failed"[\s\S]*?洞察生成失败。[\s\S]*?data-insight-regenerate[^>]*>重新生成/);
  const none = panelHtml(null, { goalKnown: false });
  assert.match(none, /data-network-insight-panel="none"[\s\S]*?暂无洞察：写 memo、补全资料或在计划里关联 TA 后自动生成。/);
  // 过期：资料有更新／目标已更新角标 + 重新生成。
  const stale = panelHtml({ ...readyRow, dirtyAt: "2026-10-03T00:00:00.000Z" });
  assert.match(stale, /data-insight-badge="stale"[^>]*>资料有更新[\s\S]*?data-insight-regenerate/);
  const goalUpdated = panelHtml(readyRow, { goal: "新的目标" });
  assert.match(goalUpdated, /data-insight-badge="goal-updated"[^>]*>目标已更新[\s\S]*?data-insight-regenerate/);
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

/* ── W0057 SC-02：正在生成／失败自动重试／轮询替换 ───────────────────── */

import { INSIGHT_POLL_INTERVAL_MS, INSIGHT_POLL_MAX } from "../../app/(app)/app/contacts/network-0918/network-insight-panel";
import { OrbitLanguageProvider } from "../../app/(app)/app/orbit-language-context";

test("W0057: detail panel states — 正在生成，通常 1 分钟内 / 正在生成… / 生成失败，稍后自动重试 (no button) / 生成失败 + 重新生成 / no goal → set-goal link; zh and en", () => {
  const pending = panelHtml(null);
  assert.match(pending, /data-network-insight-panel="pending"[^>]*data-insight-polling="true"[\s\S]*?正在生成，通常 1 分钟内/);
  const leased = panelHtml({ ...readyRow, aiState: "started", goalRelation: null, leaseExpiresAt: "2026-10-03T03:04:00.000Z", nextStep: null, status: "pending" });
  assert.match(leased, /正在生成…/);
  const retrying = panelHtml({ ...readyRow, dirtyAt: INSIGHT_NOW.toISOString(), goalRelation: null, nextStep: null, retryCount: 1, status: "failed" });
  assert.match(retrying, /data-insight-auto-retry="true"[\s\S]*?生成失败，稍后自动重试/);
  assert.doesNotMatch(retrying, /data-insight-regenerate/);
  const exhausted = panelHtml({ ...readyRow, goalRelation: null, nextStep: null, retryCount: 3, status: "failed" });
  assert.match(exhausted, /洞察生成失败。[\s\S]*?data-insight-regenerate[^>]*>重新生成/);
  const noGoal = panelHtml(null, { goal: "" });
  assert.match(noGoal, /data-network-insight-panel="no_goal"[\s\S]*?href="\/app\/contacts\/dashboard\?tab=insight"[^>]*data-insight-set-goal/);
  assert.doesNotMatch(noGoal, /data-insight-polling/);
  const view = contactInsightView({ ...readyRow, dirtyAt: INSIGHT_NOW.toISOString(), goalRelation: null, nextStep: null, retryCount: 2, status: "failed" }, { contactId: "c1", goal: INSIGHT_GOAL, now: INSIGHT_NOW });
  const en = renderToStaticMarkup(<OrbitLanguageProvider initialLanguage="en"><NetworkInsightPanel view={view} /></OrbitLanguageProvider>);
  assert.match(en, /Generation failed\. It will retry automatically shortly\./);
  const enPending = renderToStaticMarkup(<OrbitLanguageProvider initialLanguage="en"><NetworkInsightPanel view={contactInsightView(null, { contactId: "c1", goal: INSIGHT_GOAL, now: INSIGHT_NOW })} /></OrbitLanguageProvider>);
  assert.match(enPending, /Generating — usually within a minute\./);
});

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
  const relation = panel.root().root.find((node) => node.props?.["data-insight-goal-relation"] !== undefined);
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
import type { TestContext } from "node:test";

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
