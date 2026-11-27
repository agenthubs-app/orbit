// 2026-11-27 手机端硬规则扫描：视口 <768 永远不出现电脑版表格，页面不横向溢出，最后一块内容不被底部胶囊盖住。
// 用户侧每个页面 × 空状态 / 有数据 × 312 / 339 / 375 / 390 / 430（312、339 = iPhone Safari 页面缩放 125% / 115%）。
// 真外壳 + 真页面组件（tests/ui/support/phone-sweep-pages.tsx），接口在页面里按 handlers 假装；Chromium。
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import test from "node:test";
import { chromium, type Browser, type Page } from "playwright";

import { journeyAfter, journeyDiscover, journeyOverview, journeyPrep } from "../../shared/mock/demo-world/events-journey";
import { demoAccountProfiles } from "../../shared/mock/demo-world/account";
import { demoCalendarExternalEvents, demoTodoPage } from "../../shared/mock/demo-world/todo";
import { demoAccountExport, demoEventAssessment, demoHomeLayout, demoPlanSummary } from "../../shared/mock/demo-world/fixtures";
import { createPlanV2Handlers } from "../../features/plans/v2/handlers";
import { resetPlansV2MockRepositoryForTests } from "../../features/plans/v2/service-factory";
import { bundle, errorsOf, open } from "./support/orbit-2026-harness";
import { SHELL_STUBS } from "./support/orbit-2026-shell-harness";

type Handler = [method: string, url: string, data: unknown];
type State = "empty" | "data";
type PageCase = { path: string; ready?: string; handlers: Record<State, Handler[]> };

const WIDTHS = process.env.PHONE_SWEEP_WIDTHS ? process.env.PHONE_SWEEP_WIDTHS.split(",").map(Number) : [312, 339, 375, 390, 430];
const SHOTS = process.env.PHONE_SWEEP_SHOTS_DIR;
const ONLY = process.env.PHONE_SWEEP_ONLY?.split(",");
const NOW = "2026-11-27T03:00:00.000Z";

// ── fixtures ─────────────────────────────────────────────────────────────────────────────────────
const contact = (id: string, name: string, org: string, role: string, extra: Record<string, unknown> = {}) => ({ id, displayName: name, organization: org, role, sourceType: "business_card_ocr", status: "active", pendingInitialization: false, nextActionPreview: "", valueTypes: [], updatedAt: "2026-10-10T00:00:00.000Z", ...extra });
const CONTACTS = [
  contact("c-ito", "伊藤 直子", "株式会社ハルモニア・グローバルパートナーズ", "CFO（最高財務責任者）", { density: 3, sourceChip: "meishi", lastInteractionAt: "2026-11-18T01:00:00.000Z", goalRelated: true }),
  contact("c-mori", "森 恭平", "東雲キャピタル", "プリンシパル", { density: 1, sourceChip: "linkedin", addedAt: "2024-03-10T03:00:00.000Z" }),
  contact("c-matsui", "松井 遥", "株式会社ソラノテ", "取締役 COO", { density: 3, sourceChip: "self" }),
];
const summary = (total: number) => ({ total, sources: {}, statuses: { active: total, nurture: 0 }, values: {}, tags: [], hasMoreTags: false, asOf: NOW,
  densityCounts: { 1: total ? 1 : 0, 2: 0, 3: total ? 2 : 0 }, addedThisMonth: total, tabCounts: { goalRelated: total ? 1 : 0, needsFollowUp: 0 },
  sourceChips: total ? { meishi: 1, linkedin: 1, self: 1 } : {}, industries: {}, regions: {}, metKinds: {} });
const myEvent = (id: string, startsAt: string, status: string) => ({ eventId: id, title: `CFO Night Tokyo vol.${id.slice(-2)} 資金調達と組織づくりを語る夜`, startsAt, venue: "東京都渋谷区渋谷 3-21-3 渋谷ストリーム 4F ホール", emoji: "🥂", status, href: `/app/events/${id}` });
const mine = (range: "upcoming" | "past", items: unknown[]) => ({ range, items, upcomingCount: range === "upcoming" ? items.length : 0, asOf: NOW });
const task = (id: string, title: string, status: "open" | "completed") => ({ id, titlePreview: title, locationPreview: null, status, category: "relationship", priority: "normal", plannedDate: "2026-11-27", dueAt: "2026-11-27T09:00:00.000Z", updatedAt: NOW, completedAt: status === "completed" ? NOW : null, relatedContact: { id: "c-ito", namePreview: "伊藤 直子", organizationPreview: "株式会社ハルモニア・グローバルパートナーズ" }, relationship: true });
const taskPage = (status: "open" | "completed", items: unknown[]) => ({ actorId: "u1", status, scope: "all", query: "", items, counts: { open: status === "open" ? items.length : 0, completed: status === "completed" ? items.length : 0 }, total: items.length, hasMore: false, nextCursor: null, asOf: NOW });
const note = (id: string, title: string) => ({ id, accountId: "u1", ownerUserId: "u1", title, body: "DD の資料リストを受領。次の面談で資本政策の比較表を見せてもらう約束をした。", manualContactIds: [], mentions: [], contactIds: [], eventIds: [], noteKind: "free", version: 1, createdAt: NOW, updatedAt: NOW });
const emptyTodoPage = { ...demoTodoPage, date: "2026-11-27", counts: { decisions: 0, nextMoves: 0, followups: 0, overdue: 0 }, decisions: { next: {}, items: [] }, nextMoves: { next: {}, items: [] }, followups: { next: {}, items: [] } };

let planData: { detail: unknown; type: unknown; itemId: string } | null = null;

function cases(): Record<string, PageCase> {
  const events = (variant: "empty" | "many"): Handler[] => [
    ["GET", "^/api/events/discover\\?", journeyDiscover(variant)],
    ["GET", "^/api/profile$", { profile: { relationshipGoal: "" } }],
    ["GET", "^/api/events/assessments$", variant === "empty" ? [] : [demoEventAssessment]],
    ["GET", "^/api/events/assessments/availability$", { aiReadAvailable: false }],
    ["GET", "^/api/events/mine\\?range=upcoming", mine("upcoming", variant === "empty" ? [] : [myEvent("e-18", "2026-12-05T10:00:00.000Z", "registered"), myEvent("e-19", "2026-12-19T10:00:00.000Z", "pending_review")])],
    ["GET", "^/api/events/mine\\?range=past", mine("past", variant === "empty" ? [] : [myEvent("e-17", "2026-10-27T10:00:00.000Z", "attended")])],
  ];
  const overview = (variant: "empty" | "many"): Handler[] => [["GET", "^/api/events/e1/overview", journeyOverview(variant, "web")],
    ["GET", "^/api/events/e1/join/current$", { status: "none", blocked: null, answers: [], ask: [], selfIntro: null }]];
  const network = (total: number): Handler[] => [
    ["GET", "^/api/contacts/summary", summary(total)],
    ["GET", "^/api/contacts/page\\?", { items: total ? CONTACTS : [], nextCursor: null, hasMore: false, asOf: NOW }],
    ["GET", "^/api/contacts/goal-related-ids$", { ids: total ? ["c-ito"] : [], truncated: false, asOf: NOW, links: total ? [{ contactId: "c-ito", label: "CFO 経験者", talked: true }] : [] }],
    ["GET", "^/api/contacts/completion-question$", null],
  ];
  const tasks = (data: boolean): Handler[] => [
    ["GET", "^/api/todo/page\\?", data ? { ...demoTodoPage, date: "2026-11-27" } : emptyTodoPage],
    ["GET", "^/api/tasks/page\\?status=open", taskPage("open", data ? [task("t1", "伊藤さんに資本政策の比較表のお礼と、次回面談の候補日を 3 つ送る", "open"), task("t2", "森さんに資料を送る", "open")] : [])],
    ["GET", "^/api/tasks/page\\?status=completed", taskPage("completed", data ? [task("t3", "松井さんと PoC の日程を確定した（オンライン 30 分）", "completed"), task("t4", "SaaS Summit の参加を決めた", "completed")] : [])],
    ["GET", "^/api/schedule-items", { scheduleItems: data ? [{ id: "personal:1", sourceId: "personal:1", accountId: "u1", ownerUserId: "u1", kind: "personal", category: "personal", state: "upcoming", title: "伊藤さんと資本政策の打ち合わせ（オンライン）", startsAt: "2026-11-27T05:00:00.000Z", endsAt: "2026-11-27T06:00:00.000Z", createdAt: NOW, updatedAt: NOW }] : [] }],
    ["GET", "^/api/home/layout$", demoHomeLayout],
    ["GET", "^/api/agent/plans/v2/summary$", data ? demoPlanSummary : null],
    ...network(data ? 3 : 0),
    ["GET", "^/api/calendar/external-events", data ? demoCalendarExternalEvents : { connection: "not_connected", provider: "google_calendar", asOf: NOW, events: [] }],
    ["GET", "^/api/notes\\?", { notes: data ? [note("n1", "伊藤さんとの面談メモ（資本政策）"), note("n2", "CFO Night のメモ")] : [], total: data ? 2 : 0 }],
    ["GET", "^/api/ai/conversations/sessions", { sessions: [] }],
  ];
  const profile = (data: boolean): Handler[] => [
    ["GET", "^/api/profile$", data ? demoAccountProfiles.complete : demoAccountProfiles.new],
    ["GET", "^/api/events/mine\\?range=upcoming", mine("upcoming", [])],
    ["GET", "^/api/events/center\\?summary=1$", { hosted: data ? 2 : 0, active: data ? 1 : 0, attending: data ? 2 : 0 }],
  ];
  const same = (handlers: Handler[]) => ({ empty: handlers, data: handlers });
  const conversation = (id: string, name: string, preview: string) => ({ conversationId: id, contactId: `c-${id}`, participantAccountIds: ["u1", `peer-${id}`], participantDisplayNames: { u1: "Hana Yamada", [`peer-${id}`]: name },
    qualificationVersion: "q1", status: "active", createdAt: NOW, updatedAt: NOW, unreadCount: 1, lastMessage: { messageId: `m-${id}`, senderAccountId: `peer-${id}`, sentAt: NOW, bodyPreview: preview } });
  const inbox = (items: unknown[]): Handler[] => [["GET", "^/api/account/me$", { account: { id: "u1" } }],
    ["GET", "^/api/relationship-communication/conversation-summaries\\?", { actorId: "u1", items, nextCursor: null, hasMore: false, asOf: NOW }]];
  return {
    home: { path: "/app/home", handlers: { empty: tasks(false), data: tasks(true) } },
    network: { path: "/app/contacts", ready: "[data-network-empty],[data-network-list]", handlers: { empty: network(0), data: network(3) } },
    discover: { path: "/app/events?tab=discover", handlers: { empty: events("empty"), data: events("many") } },
    going: { path: "/app/events?tab=going", handlers: { empty: events("empty"), data: events("many") } },
    assess: { path: "/app/events?tab=assess", handlers: { empty: events("empty"), data: events("many") } },
    eventDetail: { path: "/app/events/e1", handlers: { empty: overview("empty"), data: overview("many") } },
    register: { path: "/app/events/e1/register", handlers: { empty: overview("empty"), data: overview("many") } },
    people: { path: "/app/events/e1/people", handlers: { empty: overview("empty"), data: overview("many") } },
    prep: { path: "/app/events/e1/prep", handlers: same([["GET", "^/api/events/e1/prep$", journeyPrep()]]) },
    after: { path: "/app/events/e1/after", handlers: { empty: [["GET", "^/api/events/e1/after$", journeyAfter("empty")]], data: [["GET", "^/api/events/e1/after$", journeyAfter("many")]] } },
    profile: { path: "/app/profile", handlers: { empty: profile(false), data: profile(true) } },
    settings: { path: "/app/settings", handlers: { empty: profile(false), data: profile(true) } },
    settingsAccount: { path: "/app/settings/account", handlers: same(profile(true)) },
    settingsExports: { path: "/app/settings/exports", handlers: { empty: [["GET", "^/api/account/exports$", []]], data: [["GET", "^/api/account/exports$", [demoAccountExport, { ...demoAccountExport, id: "demo-export-2", scope: ["all"], status: "expired" }]]] } },
    settingsNotifications: { path: "/app/settings/notifications", handlers: same([]) },
    settingsTasks: { path: "/app/settings/tasks", handlers: same([]) },
    settingsSchedule: { path: "/app/settings/schedule", handlers: same([]) },
    settingsAppearance: { path: "/app/settings/appearance", handlers: same(profile(true)) },
    settingsIntegrations: { path: "/app/settings/integrations", handlers: same([]) },
    settingsIorbit: { path: "/app/settings/iorbit", handlers: same(profile(true)) },
    settingsAgentConnections: { path: "/app/settings/agent-connections", handlers: same([]) },
    settingsHelp: { path: "/app/settings/help", handlers: same([]) },
    inbox: { path: "/app/inbox", handlers: { empty: inbox([]), data: inbox([conversation("cv1", "伊藤 直子", "資本政策の比較表、ありがとうございました。来週の面談候補を 3 つお送りします。"), conversation("cv2", "森 恭平", "資料拝受しました")]) } },
    todo: { path: "/app/tasks?tab=todo", handlers: { empty: tasks(false), data: tasks(true) } },
    taskList: { path: "/app/tasks?tab=todo&view=all", handlers: { empty: tasks(false), data: tasks(true) } },
    taskListDone: { path: "/app/tasks?tab=todo&view=completed", handlers: { empty: tasks(false), data: tasks(true) } },
    calendar: { path: "/app/tasks?tab=calendar", handlers: { empty: tasks(false), data: tasks(true) } },
    memo: { path: "/app/tasks?tab=memo", handlers: { empty: tasks(false), data: tasks(true) } },
    planType: { path: "/app/plans/p1/types/i1", handlers: same(planData ? [["GET", "^/api/agent/plans/v2/p1/types/i1$", planData.type], ["GET", "^/api/agent/plans/v2/p1$", planData.detail]] : []) },
  };
}

// ── page ─────────────────────────────────────────────────────────────────────────────────────────
// The fixture page is served without a charset: keep the inline JSON ASCII.
const ascii = (json: string) => json.replace(/[\u0080-￿]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);

let code: { js: string; css: string };
test.before(async () => {
  resetPlansV2MockRepositoryForTests();
  const v2 = createPlanV2Handlers({ resolveActor: async () => null, resolveMode: () => "mock" });
  type RouteHandler = (request: Request, context?: { params?: Promise<Record<string, string>> }) => Promise<Response>;
  const call = async (handler: RouteHandler, params: Record<string, string>) => ((await (await handler(new Request("http://localhost/x", { headers: { "x-orbit-lang": "zh" } }), { params: Promise.resolve(params) })).json()) as { data: any }).data;
  const PLAN = "demo-plan-series-a";
  const detail = await call(v2.detail as RouteHandler, { planId: PLAN });
  const itemId = detail.content.personTypes.find((type: { itemId: string }) => type.itemId.endsWith("vc_partner")).itemId as string;
  const type = await call(v2.typeDetail as RouteHandler, { itemId, planId: PLAN });
  planData = { detail: { ...detail, id: "p1" }, type: { ...type, planId: "p1", itemId: "i1" }, itemId };
  resetPlansV2MockRepositoryForTests();
  code = await bundle(`
    import React from "react";
    import { createRoot } from "react-dom/client";
    import { Orbit2026Shell } from "./app/(app)/app/orbit-2026/shell/Orbit2026Shell";
    import { OrbitAskProvider } from "./app/(app)/app/orbit-global-ask/orbit-ask-context";
    import { SWEEP_PAGES } from "./tests/ui/support/phone-sweep-pages";
    const f = window.shellFixture;
    window.fetch = async (url, init = {}) => {
      const method = (init.method || "GET").toUpperCase();
      const u = new URL(String(url), location.href);
      const key = u.pathname + u.search;
      f.fetches.push(method + " " + key);
      const h = f.handlers.find(([m, re]) => m === method && new RegExp(re).test(key));
      if (!h) f.missed.push(method + " " + key);
      if (!h) return new Response(JSON.stringify({ success: false, error: { code: "NOT_FOUND", message: "no stub" } }), { status: 404, headers: { "content-type": "application/json" } });
      return new Response(JSON.stringify({ success: true, data: h[2] }), { status: 200, headers: { "content-type": "application/json" } });
    };
    const Page = SWEEP_PAGES[f.page];
    createRoot(document.getElementById("root")).render(<OrbitAskProvider><Orbit2026Shell language="zh" signedIn><Page /></Orbit2026Shell></OrbitAskProvider>);
  `, { ...SHELL_STUBS, "^next-auth/react$": `${SHELL_STUBS["^next-auth/react$"]}\nexport const signIn = () => {}; export const getSession = async () => null;` });
});

async function openCase(browser: Browser, key: string, item: PageCase, state: State, width: number): Promise<Page> {
  const fixture = { page: key, lang: "zh", signedIn: true, unread: false, calls: [], fetches: [], missed: [], path: item.path.split("?")[0], handlers: item.handlers[state] };
  const page = await open(browser, code, { width, origin: `https://orbit.test${item.path}`, html: `<div id="root"></div><script>window.shellFixture=${ascii(JSON.stringify(fixture))};</script>` });
  if (item.ready) await page.locator(item.ready).first().waitFor({ state: "attached", timeout: 10_000 });
  // Every read is answered at once; let the pages settle (reads → render → effects that read again).
  await page.waitForTimeout(700);
  return page;
}

type Facts = { scrollWidth: number; innerWidth: number; tables: string[]; squeezed: string[]; wide: string[]; lastBottom: number; navTop: number; last: string; text: string };

// Measured in the page: sideways overflow (and the widest offenders), visible tables, table cells squeezed to about one
// character per line, and — scrolled to the end — the lowest piece of content against the top of the bottom capsule.
// Plain JS (tsx would add its __name helper to named arrows, which does not exist in the page).
const MEASURE = `(() => {
  const visible = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none" && Number(s.opacity) > 0.01; };
  const name = (el) => el.tagName.toLowerCase() + [...el.attributes].filter((a) => a.name.startsWith("data-")).map((a) => "[" + a.name + "]").join("") + (typeof el.className === "string" && el.className ? "." + el.className.split(" ")[0] : "");
  // A table restyled into list rows below 768 (display: block / grid — b8「表格 → 卡片列表」) is a phone list, not the desktop table.
  const tables = [...document.querySelectorAll("table")].filter((el) => visible(el) && /table/.test(getComputedStyle(el).display)).map(name);
  const squeezed = [...document.querySelectorAll("td, th")].filter(visible).filter((cell) => {
    const text = (cell.textContent || "").trim();
    const size = parseFloat(getComputedStyle(cell).fontSize) || 14;
    const r = cell.getBoundingClientRect();
    return text.length >= 4 && r.width < size * 2.2 && r.height > size * 3;
  }).map((cell) => (cell.textContent || "").trim().slice(0, 20));
  const clipped = (el) => { for (let p = el.parentElement; p; p = p.parentElement) { if (/(auto|scroll|hidden|clip)/.test(getComputedStyle(p).overflowX)) return true; } return false; };
  const wide = [...document.querySelectorAll("body *")].filter((el) => el.getBoundingClientRect().right > window.innerWidth + 0.5 && visible(el) && !clipped(el))
    .slice(0, 6).map((el) => name(el) + " right=" + Math.round(el.getBoundingClientRect().right));
  window.scrollTo(0, document.documentElement.scrollHeight);
  const floating = (el) => { for (let p = el; p; p = p.parentElement) { if (p.tagName === "NAV" || p.getAttribute("role") === "dialog") return true; const pos = getComputedStyle(p).position; if (pos === "fixed" || pos === "sticky") return true; } return false; };
  const nav = [...document.querySelectorAll("nav")].map((el) => el.getBoundingClientRect()).find((r) => r.height > 0 && r.bottom > window.innerHeight - 40);
  let lastBottom = 0; let last = "";
  for (const el of document.querySelectorAll("#root *")) {
    if (el.children.length || !visible(el) || floating(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.bottom > lastBottom) { lastBottom = r.bottom; last = name(el) + ' "' + (el.textContent || "").trim().slice(0, 16) + '"'; }
  }
  return { scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth, tables, squeezed, wide, lastBottom, navTop: nav ? nav.top : window.innerHeight, last, text: document.body.innerText.replace(/\\s+/g, " ").slice(0, 240) };
})()`;
const measure = (page: Page): Promise<Facts> => page.evaluate(MEASURE) as Promise<Facts>;

test("phone widths: no desktop table, no sideways scroll, nothing under the bottom capsule — every user page, empty and with data", async () => {
  const browser = await chromium.launch({ headless: true });
  const failures: string[] = [];
  try {
    for (const [key, item] of Object.entries(cases())) {
      if (ONLY && !ONLY.includes(key)) continue;
      for (const state of ["empty", "data"] as const) {
        for (const width of WIDTHS) {
          const page = await openCase(browser, key, item, state, width);
          const facts = await measure(page);
          const tag = `${key} ${state} ${width}`;
          if (process.env.PHONE_SWEEP_DEBUG && width === 390) console.log(tag, JSON.stringify({ ...facts, missed: await page.evaluate(() => (window as unknown as { shellFixture: { missed: string[] } }).shellFixture.missed) }));
          if (facts.scrollWidth > facts.innerWidth) failures.push(`${tag}: page ${facts.scrollWidth}px wide in ${facts.innerWidth}px (${facts.wide.join(", ")})`);
          if (facts.tables.length) failures.push(`${tag}: visible table ${facts.tables.join(", ")}`);
          if (facts.squeezed.length) failures.push(`${tag}: cells one character per line: ${facts.squeezed.join(" / ")}`);
          if (facts.lastBottom > facts.navTop + 0.5) failures.push(`${tag}: last content ${facts.last} (bottom ${Math.round(facts.lastBottom)}) under the capsule (top ${Math.round(facts.navTop)})`);
          const errors = errorsOf(page);
          if (errors.length) failures.push(`${tag}: page errors ${errors.slice(0, 2).join(" | ")}`);
          if (SHOTS && width === 390) {
            mkdirSync(SHOTS, { recursive: true });
            await page.evaluate(() => window.scrollTo(0, 0));
            await page.screenshot({ path: `${SHOTS}/${key}-${state}-390.png`, fullPage: true });
          }
          await page.close();
        }
      }
    }
  } finally {
    await browser.close();
  }
  assert.deepEqual(failures, []);
});

// ≥768 keeps the dense desktop forms: the sample table on the empty 人脉 page and the task table (the phone rules stop at 767).
test("1024: the desktop tables are still tables", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const all = cases();
    for (const [key, state, selector] of [["network", "empty", "[data-network-table]"], ["taskList", "data", "table"]] as const) {
      const page = await openCase(browser, key, all[key]!, state, 1024);
      await page.locator(selector).first().waitFor();
      assert.equal(await page.locator(selector).first().evaluate((el) => getComputedStyle(el).display), "table", `${key} ${state} 1024`);
      if (key === "network") assert.equal(await page.locator("[data-network-empty-phone]").count(), 0);
      await page.close();
    }
  } finally {
    await browser.close();
  }
});
