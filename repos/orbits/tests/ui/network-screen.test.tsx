import assert from "node:assert/strict";
import test from "node:test";
import type { Browser, Page } from "playwright";

import { bundle, errorsOf, launch, open } from "./support/orbit-2026-harness";
import { SHELL_STUBS } from "./support/orbit-2026-shell-harness";
import { filtersFromSearch, lastTouch, networkQuery } from "../../app/(app)/app/orbit-2026/network/network-model";

// R11a SC-07 / SC-08 / SC-09 / SC-10（Web 人脈）：新人脈页在壳里渲染（ShellPage + 右栏今日の 1問），页签 / 絞り込み / 搜索都走
// 有界接口的参数；联系人抽屉（可复用组件）显示なぜこの人か、人物タイプの確認カード、招待连接（同期停止、解除），删除后可撤回。
type Reply = { status: number; body: unknown };
type Call = { url: string; method: string; body?: any };
const ok = (data: unknown): Reply => ({ status: 200, body: { success: true, data } });
const card = (id: string, name: string, org: string, role: string, extra: Record<string, unknown> = {}) => ({ id, displayName: name, organization: org, role, sourceType: "business_card_ocr", status: "active", pendingInitialization: false, nextActionPreview: "", valueTypes: [], updatedAt: "2026-10-10T00:00:00.000Z", ...extra });
const CARDS = [
  card("c-ito", "伊藤 直子", "株式会社ハルモニア", "CFO", { density: 3, sourceChip: "meishi", lastInteractionAt: "2026-10-18T01:00:00.000Z", goalRelated: true }),
  card("c-mori", "森 恭平", "東雲キャピタル", "プリンシパル", { density: 1, sourceChip: "linkedin", addedAt: "2024-03-10T03:00:00.000Z" }),
  card("c-matsui", "松井 遥", "株式会社ソラノテ", "取締役 COO", { density: 3, sourceChip: "self" }),
];
const SUMMARY = { total: 286, sources: {}, statuses: { active: 172, nurture: 64 }, values: {}, tags: [], hasMoreTags: false, asOf: "2026-10-18T00:00:00.000Z",
  densityCounts: { 1: 74, 2: 171, 3: 41 }, addedThisMonth: 24, tabCounts: { goalRelated: 9, needsFollowUp: 12 },
  sourceChips: { meishi: 204, phone: 41, linkedin: 22, event: 8, manual: 8, self: 3 }, industries: { finance_investment: 105, manufacturing_supply_chain: 83, none: 21 }, regions: { Tokyo: 188, Osaka: 41, none: 24 }, metKinds: { event: 142, referral: 61, visit: 52, other: 31 } };
const DETAIL = { state: "success", contact: { id: "c-ito", displayName: "伊藤 直子", organization: "株式会社ハルモニア", role: "CFO", status: "nurture", primaryIndustryLabel: "金融・投資", region: { countryCode: "JP", city: "Tokyo" },
  primaryEmail: "ito@example.test", primaryPhone: "", nextAction: "決算資料のお礼を送る", tags: [], publicProfile: { offering: ["資本政策の助言"], seeking: ["製造業 SaaS"] },
  notes: [{ noteId: "n1", body: "DD の資料リストを受領", createdAt: "2026-10-06T01:00:00.000Z" }], lastInteraction: null, updatedAt: "2026-10-06T00:00:00.000Z",
  fieldHistory: [{ field: "offering", previous: "資本政策", next: "資本政策の助言", source: "invite_sync", at: "2026-10-12T00:00:00.000Z" }] } };
const SELF_DETAIL = { state: "success", contact: { ...DETAIL.contact, id: "c-matsui", displayName: "松井 遥", organization: "株式会社ソラノテ", role: "取締役 COO", fieldHistory: [] } };

const HANDLERS: { method: string; url: string; reply: Reply }[] = [
  { method: "GET", url: "^/api/contacts/summary$", reply: ok(SUMMARY) },
  { method: "GET", url: "^/api/contacts/summary\\?", reply: ok({ ...SUMMARY, total: 38 }) },
  { method: "GET", url: "^/api/contacts/page\\?", reply: ok({ items: CARDS, nextCursor: "cur-2", hasMore: true, asOf: "2026-10-18T00:00:00.000Z" }) },
  { method: "GET", url: "^/api/contacts/goal-related-ids$", reply: ok({ ids: ["c-ito"], truncated: false, asOf: "2026-10-18T00:00:00.000Z", links: [{ contactId: "c-ito", label: "CFO 経験者", talked: true }] }) },
  { method: "GET", url: "^/api/contacts/completion-question$", reply: ok(null) },
  { method: "GET", url: "^/api/contacts/c-ito$", reply: ok(DETAIL) },
  { method: "GET", url: "^/api/contacts/c-matsui$", reply: ok(SELF_DETAIL) },
  { method: "GET", url: "^/api/contacts/value-lines\\?ids=c-ito", reply: ok({ lines: [{ contactId: "c-ito", relation: "Led two Series A raises as CFO.", evidence: ["card"] }] }) },
  { method: "GET", url: "^/api/agent/plans/v2/contacts/c-ito/fit$", reply: ok({ contactId: "c-ito", fits: [{ planId: "p1", goal: "g", itemId: "cfo", shortLabel: "CFO 経験者", emoji: "📊", status: "candidate", reason: "役職が CFO" }] }) },
  { method: "POST", url: "/decision$", reply: ok({ candidateId: "x", status: "accepted", replayed: false }) },
  { method: "GET", url: "^/api/invite-codes/connections/c-matsui$", reply: ok({ contactId: "c-matsui", connectedAt: "2026-10-08T03:00:00.000Z", via: { code: "7Q2K-8M4P" }, sharedByMe: ["organization"], sharedByPeer: ["organization", "email"], pausedFields: ["email"] }) },
  { method: "POST", url: "^/api/invite-codes/connections/c-matsui/unlink$", reply: ok({ outcome: "unlinked", keptContactId: "c-matsui" }) },
  { method: "DELETE", url: "^/api/contacts/c-ito$", reply: ok({ contactId: "c-ito", deletedAt: "2026-10-18T00:00:00.000Z", restorableUntil: "2026-11-17T00:00:00.000Z" }) },
  { method: "POST", url: "^/api/contacts/c-ito/restore$", reply: ok({ contactId: "c-ito", restoredAt: "2026-10-18T00:00:01.000Z" }) },
];

let browser: Browser;
let code: { js: string; css: string };
test.before(async () => {
  code = await bundle(`
    import React from "react";
    import { createRoot } from "react-dom/client";
    import { Orbit2026Shell } from "./app/(app)/app/orbit-2026/shell/Orbit2026Shell";
    import { OrbitAskProvider } from "./app/(app)/app/orbit-global-ask/orbit-ask-context";
    import { NetworkScreen } from "./app/(app)/app/orbit-2026/network/NetworkScreen";
    const f = window.shellFixture;
    window.fetch = async (url, init = {}) => {
      const method = init.method || "GET";
      f.fetches.push({ url: String(url), method, body: init.body ? JSON.parse(init.body) : undefined });
      const handler = (f.handlers || []).find((h) => h.method === method && new RegExp(h.url).test(String(url)));
      if (!handler) return new Response(JSON.stringify({ success: false, error: { code: "NOT_FOUND", message: "no stub" } }), { status: 404 });
      return new Response(JSON.stringify(handler.reply.body), { status: handler.reply.status, headers: { "content-type": "application/json" } });
    };
    createRoot(document.getElementById("root")).render(<OrbitAskProvider><Orbit2026Shell language="ja" signedIn><NetworkScreen language="ja" nowIso="2026-10-18T03:00:00.000Z" /></Orbit2026Shell></OrbitAskProvider>);
  `, SHELL_STUBS);
  browser = await launch();
});
test.after(async () => { await browser?.close(); });

async function screen(t: { after: (fn: () => Promise<void>) => void }, fixture: Record<string, unknown> = {}, options: { width?: number; dark?: boolean } = {}): Promise<Page> {
  const page = await open(browser, code, { ...options, html: `<div id="root"></div><script>window.shellFixture=${JSON.stringify({ calls: [], fetches: [], lang: "ja", path: "/app/contacts", unread: false, handlers: HANDLERS, ...fixture })}</script>` });
  t.after(async () => { assert.deepEqual(errorsOf(page), []); await page.close(); });
  return page;
}
const fetches = (page: Page): Promise<Call[]> => page.evaluate(() => (window as any).shellFixture.fetches);

test("1440: header counts in the shell, three cards, tabs with counts, table rows with chips, 🎯 and 最終接点; the rail holds 今日の 1問", async (t) => {
  const page = await screen(t);
  await page.locator("[data-network-row='c-ito']").waitFor();
  await page.getByText("286人 · 今月 +24", { exact: true }).first().waitFor();
  await page.getByText("目標に関係する人 9 · 今月 +24", { exact: true }).waitFor();
  for (const label of ["身元だけ", "名刺レベル", "関係まで"]) await page.locator("[data-network-density]").getByText(label, { exact: true }).waitFor();
  const sources = await page.locator("[data-network-sources]").innerText();
  assert.match(sources, /名刺\s*204[\s\S]*連絡先\s*41[\s\S]*LinkedIn\s*22[\s\S]*イベント\s*8[\s\S]*手入力\s*8[\s\S]*本人入力\s*3/u);
  assert.equal((await page.getByRole("tab", { name: /目標に関係/ }).innerText()).replace(/\s+/g, ""), "目標に関係9");
  assert.equal((await page.getByRole("tab", { name: /要フォロー/ }).innerText()).replace(/\s+/g, ""), "要フォロー12");
  const ito = await page.locator("[data-network-row='c-ito']").innerText();
  assert.match(ito, /🎯 CFO 経験者 · 話した/u);
  assert.match(ito, /今日/u);
  assert.match(await page.locator("[data-network-row='c-mori']").innerText(), /2024年3月につながる/u);
  await page.locator("[data-network-rail]").getByRole("heading", { name: /今日の 1問/ }).waitFor();
  await page.getByRole("button", { name: "さらに表示（283人）" }).waitFor();
  assert.ok((await fetches(page)).every((call) => !call.url.startsWith("/api/contacts?")), "no legacy /api/contacts read");
});

test("tabs, search and 絞り込み go to the bounded page / summary with the new parameters", async (t) => {
  const page = await screen(t);
  await page.locator("[data-network-row='c-ito']").waitFor();
  await page.getByRole("tab", { name: /要フォロー/ }).click();
  await page.waitForFunction(() => (window as any).shellFixture.fetches.some((call: any) => call.url.includes("needsFollowUp=1")));
  await page.getByRole("tab", { name: /すべて/ }).click();
  await page.getByRole("textbox", { name: "名前・会社・「投資家」などで検索" }).fill("ハルモニア");
  await page.waitForFunction(() => (window as any).shellFixture.fetches.some((call: any) => call.url.startsWith("/api/contacts/page?") && call.url.includes("query=")));
  await page.locator("[data-network-filter]").click();
  const panel = page.locator("[data-network-filter-panel]");
  await panel.waitFor();
  assert.equal(await panel.getByRole("button", { name: /^推進中/ }).count(), 0, "推進中 / 協業中 are not shown (代定 12)");
  assert.equal(await panel.getByRole("button", { name: /^要フォロー/ }).count(), 0);
  await panel.getByRole("button", { name: /^紹介/ }).click();
  await panel.getByRole("button", { name: /^その他/ }).first().click();
  await page.waitForFunction(() => (window as any).shellFixture.fetches.some((call: any) => call.url.includes("met=referral")));
  const industry = (await fetches(page)).filter((call) => call.url.includes("industry="));
  assert.ok(industry.some((call) => call.url.includes("industry=none")), "その他 expands to the rest incl. unset");
  await panel.getByText("該当 38 人 / 286", { exact: true }).waitFor();
});

test("the contact drawer: why (value line), the type confirm card → decision, next step, offering / seeking with 以前の値, interactions; delete → undo restores", async (t) => {
  const page = await screen(t);
  await page.locator("[data-network-row='c-ito']").click();
  const drawer = page.locator("[data-contact-drawer='c-ito']");
  await drawer.getByText("Led two Series A raises as CFO.", { exact: true }).waitFor();
  await drawer.getByText("プランの「CFO 経験者」に当てはまりそうです", { exact: true }).waitFor();
  await drawer.getByText("関係構築", { exact: true }).waitFor();
  await drawer.getByText("東京", { exact: true }).waitFor();
  await drawer.getByText("資本政策の助言", { exact: true }).waitFor();
  await drawer.getByRole("button", { name: "以前の値 ›" }).click();
  await drawer.getByText("資本政策", { exact: true }).waitFor();
  await drawer.getByText("DD の資料リストを受領", { exact: true }).waitFor();
  await drawer.getByRole("button", { name: "当てはまる" }).click();
  await page.waitForFunction(() => !document.querySelector("[data-network-fit]"));
  assert.ok((await fetches(page)).some((call) => call.method === "POST" && call.url === "/api/agent/plans/v2/p1/types/cfo/candidates/c-ito/decision" && call.body.decision === "accept"));
  await drawer.getByRole("button", { name: "その他の操作" }).click();
  await page.getByRole("menuitem", { name: "削除" }).click();
  await page.getByText("伊藤 直子さんを削除しますか？", { exact: true }).waitFor();
  await page.getByRole("button", { name: "削除する" }).click();
  await page.getByText("削除しました", { exact: true }).waitFor();
  assert.ok((await fetches(page)).some((call) => call.method === "DELETE" && call.url === "/api/contacts/c-ito"));
  await page.getByRole("button", { name: "元に戻す" }).click();
  await page.waitForFunction(() => (window as any).shellFixture.fetches.some((call: any) => call.method === "POST" && call.url === "/api/contacts/c-ito/restore"));
});

test("an invite-linked person: 本人入力, 同期停止 on the field I changed, connected via, 共有する項目; つながりを解除 (480 modal, keep on by default)", async (t) => {
  const page = await screen(t);
  await page.locator("[data-network-row='c-matsui']").click();
  const drawer = page.locator("[data-contact-drawer='c-matsui']");
  await drawer.getByText("本人が入力 · 相手の更新は自動で反映されます", { exact: true }).waitFor();
  await drawer.locator("[data-network-invite]").getByText("同期停止", { exact: true }).waitFor();
  await drawer.getByText("招待コード 7Q2K-8M4P · 10/8", { exact: true }).waitFor();
  await drawer.getByRole("button", { name: "その他の操作" }).click();
  await page.getByRole("menuitem", { name: "つながりを解除" }).click();
  const modal = page.locator("[data-network-unlink]");
  await modal.waitFor();
  assert.equal(await page.getByRole("checkbox", { name: "名前と会社だけの連絡先として残す" }).getAttribute("aria-checked"), "true");
  await page.getByRole("button", { name: "つながりを解除する" }).click();
  await page.waitForFunction(() => (window as any).shellFixture.fetches.some((call: any) => call.url.endsWith("/unlink") && call.body.keepAsContact === true));
});

test("no contacts yet: the guide, four doors and the sample table (web.html #4); the rail suggests the invite code", async (t) => {
  const page = await screen(t, { handlers: [{ method: "GET", url: "^/api/contacts/summary", reply: ok({ ...SUMMARY, total: 0, densityCounts: { 1: 0, 2: 0, 3: 0 }, addedThisMonth: 0, tabCounts: { goalRelated: 0, needsFollowUp: 0 }, sourceChips: {} }) },
    { method: "GET", url: "^/api/contacts/page\\?", reply: ok({ items: [], nextCursor: null, hasMore: false, asOf: "2026-10-18T00:00:00.000Z" }) }] });
  await page.locator("[data-network-empty]").waitFor();
  await page.getByText("最初のつながりを追加", { exact: true }).waitFor();
  for (const label of ["招待コード", "手入力", "連絡先から", "LinkedIn"]) await page.locator("[data-network-empty]").getByText(label, { exact: true }).first().waitFor();
  await page.locator("[data-network-rail]").getByRole("heading", { name: /いちばん早い方法/ }).waitFor();
});

test("390 dark: no 🔍 in the page (G12), the list still renders without errors", async (t) => {
  const page = await screen(t, {}, { width: 390, dark: true });
  await page.locator("[data-network-row='c-ito']").waitFor();
  assert.equal(await page.locator("[data-orbit-2026-search]:visible").count(), 0);
});

test("人脈分析 entry (RD-33): 390 below 10 people shows 「10人から使えます · あと N人」 → /app/contacts/dashboard; 10 or more has none; 1440 keeps 「人脈分析 ›」", async (t) => {
  const few = await screen(t, { handlers: [{ method: "GET", url: "^/api/contacts/summary$", reply: ok({ ...SUMMARY, total: 5, densityCounts: { 1: 3, 2: 1, 3: 1 }, addedThisMonth: 3, tabCounts: { goalRelated: 2, needsFollowUp: 0 } }) }, ...HANDLERS] }, { width: 390 });
  await few.locator("[data-network-row='c-ito']").waitFor();
  const locked = few.locator("[data-network-analysis-locked]");
  await locked.getByText("10人から使えます · あと 5人", { exact: true }).waitFor();
  assert.equal(await locked.getAttribute("href"), "/app/contacts/dashboard");
  const many = await screen(t, {}, { width: 390 });
  await many.locator("[data-network-row='c-ito']").waitFor();
  assert.equal(await many.locator("[data-network-analysis-locked]").count(), 0);
  const wide = await screen(t, { handlers: [{ method: "GET", url: "^/api/contacts/summary$", reply: ok({ ...SUMMARY, total: 5 }) }, ...HANDLERS] });
  await wide.locator("[data-network-row='c-ito']").waitFor();
  assert.equal(await wide.locator("[data-network-analysis-locked]").count(), 0);
  assert.equal(await wide.getByRole("link", { name: "人脈分析" }).getAttribute("href"), "/app/contacts/dashboard");
});

test("model: ?industry= preselects, the query carries tab / filters, 最終接点 wording", () => {
  assert.deepEqual(filtersFromSearch(new URLSearchParams("industry=finance_investment.venture_capital")).industries, ["finance_investment.venture_capital"]);
  assert.equal(networkQuery({ query: " x ", tab: "goal", filters: { statuses: ["nurture"], industries: [], regions: [], mets: ["visit"], densities: ["1"] }, facets: null, limit: 30 }),
    "query=x&status=nurture&met=visit&density=1&goalRelated=1&limit=30");
  const now = Date.parse("2026-10-18T03:00:00.000Z");
  assert.deepEqual(lastTouch({ lastInteractionAt: "2026-10-17T03:00:00.000Z", addedAt: null, chip: "manual" }, now), { kind: "yesterday" });
  assert.deepEqual(lastTouch({ lastInteractionAt: null, addedAt: "2026-10-03T01:00:00.000Z", chip: "manual" }, now), { kind: "added", date: "10/3" });
});
