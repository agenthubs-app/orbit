/**
 * W0051 SC-W0051-03：「AI 人脉分析」第三个标签「洞察」（`/app/contacts/dashboard?tab=insight`）。
 *
 * - 第三个标签按人列出洞察：关系一句、依据（可点开）、下一步、强度档；服务端分页 30 条（上一页／下一页）；
 * - 排序 相关度／强度档／最近往来，筛选 行业／地区（W0045 region）／强度档：URL 驱动的 GET 表单；
 * - 状态 待生成／明天更新／未设目标／失败各有真实文案（中英）；
 * - 加载器只读一页（0 次模型调用、0 次配额）；URL 里的未知值回到默认。
 */
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import type { ContactsAnalysisView } from "../../app/(app)/app/contacts/analysis/contacts-analysis-view-model";
import { buildInsightsTabView, loadInsightsTab, parseInsightsTabQuery } from "../../app/(app)/app/contacts/analysis/insights-tab";
import { ANALYSIS_TAB_HREF, NetworkAnalysis } from "../../app/(app)/app/contacts/network-0918/network-analysis";
import { OrbitLanguageProvider } from "../../app/(app)/app/orbit-language-context";
import type { OrbitContactsViewModel } from "../../app/(app)/app/orbit-contacts-route-view-model";
import { contactInsightGoalHash, type ContactInsightRow } from "../../features/contacts/insights/repository";
import type { ContactInsightsTabPage, ContactInsightsTabQuery } from "../../features/contacts/insights/tab-reader";

const NOW = new Date("2026-10-03T03:00:00.000Z");
const GOAL = "认识 SaaS 决策人";
const empty = { connections: [], events: [], intros: [], pipelineStatuses: [] } as unknown as OrbitContactsViewModel;
const analysis = {
  activity: [], analysis: { state: "unavailable" },
  coverage: { data: { summary: "" }, state: "ready" },
  generatedAt: "2026-10-01T00:00:00Z",
  goal: { data: { canEdit: true, id: "profile:1", text: GOAL, updatedAt: "2026-09-01T00:00:00Z" }, state: "ready" },
  metrics: { contacts: 7, dormant: 0, highValue: 0, newContacts: 0, pendingFollowups: 0 },
  opportunities: { data: { actions: [], dormant: [], summary: "" }, state: "ready" },
  state: "ready",
  structure: { data: { dimensions: { industry: [], location: [], relationship: [], role: [] }, health: [], summary: "" }, state: "ready" },
  summary: "",
} as unknown as ContactsAnalysisView;

function row(contactId: string, overrides: Partial<ContactInsightRow> = {}): ContactInsightRow {
  return {
    aiState: "done", attempts: 1, retryCount: 0, contactId, deferredUntil: null, dirtyAt: null, dirtyReasons: [],
    evidence: [{ id: "memo:note:live-contact-detail-update:abc", source: "memo" }, { id: "item:need-1", source: "plan_need" }],
    generatedAt: "2026-10-02T00:00:00.000Z", goalHash: contactInsightGoalHash(GOAL),
    goalRelation: { en: "Runs procurement at a SaaS buyer.", zh: "负责一家 SaaS 买方的采购。" }, lastErrorCode: null, leaseExpiresAt: null,
    model: "m", nextStep: { en: "Ask for a 20-minute call.", zh: "约一次 20 分钟通话。" }, relevance: 72, sourceDataVersion: "v", status: "ready", ...overrides,
  };
}

const QUERY: ContactInsightsTabQuery = { country: null, industry: null, page: 1, sort: "relevance", tier: null };

function page(): ContactInsightsTabPage {
  const entry = (contactId: string, name: string, tier: "core" | "active" | "new" | "dormant" | null, insight: ContactInsightRow) => ({
    city: null, countryCode: "JP", industryId: "technology_internet", lastSignalAt: null, name, organization: "Acme", role: "CTO", row: insight, tier,
  });
  return {
    entries: [
      entry("c-ready", "王敏", "core", row("c-ready")),
      entry("c-pending", "李雷", "active", row("c-pending", { goalRelation: null, nextStep: null, status: "pending" })),
      entry("c-deferred", "韩梅", "new", row("c-deferred", { deferredUntil: "2026-10-03T15:00:00.000Z", goalRelation: null, nextStep: null, status: "pending" })),
      entry("c-failed", "赵六", "dormant", row("c-failed", { goalRelation: null, lastErrorCode: "INVALID_OUTPUT", nextStep: null, status: "failed" })),
      entry("c-unscored", "孙七", null, row("c-unscored", { goalHash: contactInsightGoalHash("旧目标") })),
    ],
    hasNext: true,
    total: 45,
  };
}

function render(view = buildInsightsTabView({ goal: GOAL, now: NOW, page: page(), query: QUERY }), language: "zh" | "en" = "zh") {
  return renderToStaticMarkup(<OrbitLanguageProvider initialLanguage={language}><NetworkAnalysis viewModel={empty} analysis={analysis} initialTab="insight" insights={view} /></OrbitLanguageProvider>);
}

test("the third tab lists one insight per person: relation, evidence links, next step and tier; the tab is the active third link", () => {
  assert.equal(ANALYSIS_TAB_HREF.insight, "/app/contacts/dashboard?tab=insight");
  const html = render();
  assert.match(html, /data-network-analysis-tab="struct"[\s\S]*data-network-analysis-tab="opp"[\s\S]*data-network-analysis-tab="insight"/);
  assert.match(html, /aria-current="page"[^>]*data-network-analysis-tab="insight"|data-network-analysis-tab="insight"[^>]*aria-current="page"|href="\/app\/contacts\/dashboard\?tab=insight" aria-current="page"/);
  assert.match(html, /data-network-insight-row="c-ready"[\s\S]*?负责一家 SaaS 买方的采购。[\s\S]*?data-insight-evidence="memo"[\s\S]*?data-insight-evidence="plan_need"[\s\S]*?约一次 20 分钟通话。/);
  assert.match(html, /href="\/app\/contacts\/c-ready#tl-memo_note_live-contact-detail-update_abc"/);
  assert.match(html, /href="\/app\/tasks\?tab=plan"/);
  assert.match(html, /data-network-insight-row="c-ready"[\s\S]*?data-network-tier="core"[\s\S]*?核心/);
  assert.match(html, /data-network-insight-row="c-unscored"[\s\S]*?data-network-tier="unscored"[\s\S]*?未评估[\s\S]*?目标已更新/);
  assert.match(html, /共 45 位 · 第 1 页/);
  assert.match(html, /data-insights-next[^>]*>|href="\/app\/contacts\/dashboard\?tab=insight&amp;page=2"/);
});

test("statuses have real copy in both languages: pending / updates tomorrow / no goal / failed", () => {
  const zh = render();
  assert.match(zh, /data-insight-row-status="pending"[^>]*>等待生成：下一轮后台任务会生成。/);
  assert.match(zh, /data-insight-row-status="deferred"[^>]*>明天更新：今天的后台 AI 次数已用完。/);
  assert.match(zh, /data-insight-row-status="failed"[^>]*>洞察生成失败。/);
  const en = render(undefined, "en");
  assert.match(en, /Waiting to be generated in the next background run\./);
  assert.match(en, /Updates tomorrow — today&#x27;s background AI quota is used up\./);
  assert.match(en, /The insight could not be generated\./);
  const noGoal = render(buildInsightsTabView({ goal: null, now: NOW, page: page(), query: QUERY }));
  assert.match(noGoal, /data-insights-no-goal[^>]*>设置关系目标后生成洞察。/);
  assert.match(noGoal, /data-insight-row-status="no_goal"/);
  assert.doesNotMatch(noGoal, /负责一家 SaaS 买方的采购/);
  const enNoGoal = render(buildInsightsTabView({ goal: "", now: NOW, page: page(), query: QUERY }), "en");
  assert.match(enNoGoal, /Set a relationship goal to generate insights\./);
  const unavailable = render(buildInsightsTabView({ goal: GOAL, now: NOW, page: null, query: QUERY }));
  assert.match(unavailable, /洞察暂时读不到/);
});

test("sort and filters are a GET form that keeps tab=insight: relevance / tier / recent; industry / region / tier", () => {
  const html = render(buildInsightsTabView({ goal: GOAL, now: NOW, page: page(), query: { ...QUERY, country: "JP", industry: "technology_internet", page: 2, sort: "tier", tier: "core" } }));
  assert.match(html, /<form[^>]*action="\/app\/contacts\/dashboard"[^>]*method="get"[^>]*data-insights-filters/);
  assert.match(html, /<input type="hidden" name="tab" value="insight"\/>/);
  for (const sort of ["relevance", "tier", "recent"]) assert.match(html, new RegExp(`<option value="${sort}"`));
  assert.match(html, /<option value="tier" selected="">强度档<\/option>/);
  assert.match(html, /<option value="technology_internet" selected="">/);
  assert.match(html, /<option value="JP" selected="">/);
  assert.match(html, /<select name="tier"[\s\S]*?<option value="core" selected="">核心<\/option>/);
  // 翻页链接保留排序与筛选。
  assert.match(html, /href="\/app\/contacts\/dashboard\?tab=insight&amp;country=JP&amp;industry=technology_internet&amp;sort=tier&amp;tier=core"/);
  assert.match(html, /href="\/app\/contacts\/dashboard\?tab=insight&amp;country=JP&amp;industry=technology_internet&amp;sort=tier&amp;tier=core&amp;page=3"/);
});

test("URL parsing falls back to defaults for unknown values; the loader reads exactly one page and nothing else", async () => {
  assert.deepEqual(parseInsightsTabQuery({ country: "zz9", industry: "nope", page: "-3", sort: "drop table", tier: "vip" }), QUERY);
  assert.deepEqual(parseInsightsTabQuery({ country: "jp", industry: "technology_internet", page: "2", sort: "recent", tier: "dormant" }), { country: "JP", industry: "technology_internet", page: 2, sort: "recent", tier: "dormant" });
  const reads: ContactInsightsTabQuery[] = [];
  const view = await loadInsightsTab({ actorId: "a", goal: Promise.resolve(GOAL), now: NOW, search: { sort: "tier", tab: "insight" } }, {
    readPage: async (actorId, query) => { assert.equal(actorId, "a"); reads.push(query); return page(); },
  });
  assert.deepEqual(reads, [{ ...QUERY, sort: "tier" }]);
  assert.equal(view.state, "ready");
  assert.equal(view.rows.length, 5);
  // 读取失败：如实「暂时读不到」，不抛错。
  const failed = await loadInsightsTab({ actorId: "a", goal: GOAL, now: NOW, search: {} }, { readPage: async () => { throw new Error("boom"); } });
  assert.equal(failed.state, "unavailable");
  assert.equal((await loadInsightsTab({ actorId: "a", goal: GOAL, now: NOW, search: {} }, { readPage: null })).state, "unavailable");
});

test("R25: the plan-need evidence link goes to Task › プラン; relationship evidence keeps the contact timeline anchor", async () => {
  // 原「review P2」用例断言依据链接与旧计划页的需求锚点一致；旧计划页（含锚点）已删除，依据改落 Task › プラン、不带锚点。
  const { insightEvidenceHref } = await import("../../app/(app)/app/contacts/network-0918/network-insight-copy");
  assert.equal(insightEvidenceHref({ id: "n-connector", source: "plan_need" }, "/app/contacts/c1"), "/app/tasks?tab=plan");
  assert.equal(insightEvidenceHref({ id: "memo:1", source: "memo" } as never, "/app/contacts/c1"), "/app/contacts/c1#tl-memo_1");
});

test("review P3: an out-of-range page is re-read as the last page by the real total", async () => {
  const reads: number[] = [];
  const view = await loadInsightsTab({ actorId: "a", goal: GOAL, now: NOW, search: { page: "9" } }, {
    readPage: async (_actorId, query) => {
      reads.push(query.page);
      return query.page === 9 ? { entries: [], hasNext: false, total: 45 } : { ...page(), hasNext: false, total: 45 };
    },
  });
  assert.deepEqual(reads, [9, 2]);
  assert.equal(view.page, 2);
  assert.equal(view.total, 45);
  assert.equal(view.rows.length, 5);
});

/* ── W0054（W54-3）：门槛卡 ─────────────────────────────────────── */

test("W0054 SC-03: below the threshold the whole insight tab is one threshold card (no rows, no filters)", () => {
  const html = renderToStaticMarkup(<OrbitLanguageProvider initialLanguage="zh"><NetworkAnalysis viewModel={empty} analysis={analysis} initialTab="insight" insightGate={{ kind: "threshold", missing: 3 }} /></OrbitLanguageProvider>);
  assert.equal((html.match(/data-network-analysis-gate=/g) ?? []).length, 1);
  assert.match(html, /再添加 3 位联系人即可更新分析/);
  assert.doesNotMatch(html, /data-network-insight-row|data-insights-filters|洞察暂时读不到/);
  assert.match(html, /data-network-analysis-tab="insight"[^>]*aria-current="page"|aria-current="page"[^>]*data-network-analysis-tab="insight"/);
});
