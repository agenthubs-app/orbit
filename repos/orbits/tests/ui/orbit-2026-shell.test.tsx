import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import type { Browser, Page } from "playwright";

import { monthHeading } from "../../app/(app)/app/orbit-2026/shell/month-heading";
import { shellAppliesTo, shellNavKeyFor, shellShowsRail } from "../../app/(app)/app/orbit-2026/shell/shell-routes";
import { ORBIT_2026_HISTORY, ORBIT_2026_RAIL, ORBIT_2026_SIDEBAR, ORBIT_2026_SIDEBAR_COMPACT, ORBIT_LEFT_SIDEBAR_WIDTH } from "../../app/(app)/app/orbit-layout-constants";
import { launch } from "./support/orbit-2026-harness";
import { errorsOf, LEGACY_PAGE, openShell, shellBundle } from "./support/orbit-2026-shell-harness";

// R07 (SC-R07-01 / 02 / 06): one shell for every signed-in page, three widths, the
// demo pill slot, no old top bar or floating ask left anywhere.
const A = "app/(app)/app";
let browser: Browser;
let code: { js: string; css: string };

test.before(async () => {
  code = await shellBundle(LEGACY_PAGE);
  browser = await launch();
});
test.after(async () => { await browser?.close(); });

async function shell(t: { after: (fn: () => Promise<void>) => void }, fixture: Parameters<typeof openShell>[2], options: Parameters<typeof openShell>[3] = {}): Promise<Page> {
  const page = await openShell(browser, code, fixture, options);
  t.after(async () => { const errors = errorsOf(page); await page.close(); assert.deepEqual(errors, []); });
  await page.getByText("legacy button").waitFor();
  return page;
}

test("route rules: every signed-in product page gets the shell; public, sign-in, admin and onboarding do not", () => {
  for (const path of ["/app/home", "/app/contacts", "/app/contacts/c1", "/app/agent", "/app/agent/actions", "/app/events", "/app/events/e1", "/app/events/center", "/app/events/e1/operations", "/app/events/e1/operations/experience", "/app/events/e1/operations/admission", "/app/tasks", "/app/tasks/personal", "/app/inbox", "/app/inbox/sources/s1", "/app/settings", "/app/profile", "/app/home/events", "/app/invitations/t"]) {
    assert.equal(shellAppliesTo(path, true), true, path);
    assert.equal(shellAppliesTo(path, false), false, `${path} signed out`);
  }
  // Check-in is the kiosk screen (the old floating ask's exclusion): no rail, no ⌘K. R17: admission became the console's 参加者 tab (the old URL redirects).
  for (const path of ["/", "/app", "/app/account/login", "/app/login-admin", "/app/admin", "/app/admin/events", "/app/o/acme", "/app/start", "/app/register", "/app/profile/onboarding", "/app/platform", "/dev/capabilities", "/showcase/components", "/app/events/e1/operations/check-in"]) {
    assert.equal(shellAppliesTo(path, true), false, path);
  }
  assert.equal(shellNavKeyFor("/app/contacts/c1"), "network");
  assert.equal(shellNavKeyFor("/app/events/e1/operations"), "host");
  assert.equal(shellNavKeyFor("/app/events/e1"), "events");
  assert.equal(shellNavKeyFor("/app/events/e1/live"), "events", "R27: 会場モード is the attendee's own page");
  // 计划页像素返工：生成流程、見直し在 iOrbit 里（设计稿左栏高亮 iOrbit）；概要、人物类型、手動編集（b10 #21 高亮 Task）、完了、以前のプラン 仍属 Task。
  for (const path of ["/app/plans/flow/intake_1", "/app/plans/plan_1/review"]) assert.equal(shellNavKeyFor(path), "iorbit", path);
  for (const path of ["/app/plans/drafts/draft_1/edit", "/app/plans/plan_1/types/item_1", "/app/plans/plan_1/done", "/app/plans/legacy/v1", "/app/plans/review"]) assert.equal(shellNavKeyFor(path), "task", path);
  assert.equal(shellShowsRail("/app/agent/actions"), false);
  assert.deepEqual([ORBIT_2026_SIDEBAR, ORBIT_2026_SIDEBAR_COMPACT, ORBIT_2026_RAIL, ORBIT_2026_HISTORY, ORBIT_LEFT_SIDEBAR_WIDTH], [84, 72, 360, 260, 212]);
});

test("the header's date line: the month over its first to last day (web.html 「10月」 / 「10月1日–10月31日」)", () => {
  assert.deepEqual(monthHeading("ja", new Date(2026, 9, 11)), { month: "10月", range: "10月1日–10月31日" });
  assert.deepEqual(monthHeading("zh", new Date(2026, 1, 3)), { month: "2月", range: "2月1日–2月28日" });
  assert.deepEqual(monthHeading("en", new Date(2026, 8, 30)), { month: "September", range: "Sep 1 – Sep 30" });
});

test("1440: left rail 84 with the six items, host / settings / avatar at the bottom, current item marked", async (t) => {
  const page = await shell(t, { path: "/app/contacts/c1" });
  const nav = page.getByRole("navigation", { name: "メインナビゲーション" }).first();
  assert.equal(Math.round((await nav.boundingBox())!.width), 84);
  assert.deepEqual(await nav.locator("a").allTextContents(), ["O", "ホーム", "人脈", "iOrbit", "イベント", "Task", "受信箱", "主催", "設定"]);
  assert.equal(await nav.getByRole("link", { name: "人脈" }).getAttribute("aria-current"), "page");
  assert.equal(await nav.getByRole("link", { name: "人脈" }).getAttribute("href"), "/app/contacts");
  assert.equal(await page.getByRole("button", { name: "アカウント" }).count(), 1);
  // The shell parts are new-scope islands next to the old page, never around it.
  assert.equal(await page.locator("[data-orbit-real-page] [data-orbit-2026], [data-orbit-2026] [data-orbit-real-page]").count(), 0);
  assert.equal(await page.locator("[data-orbit-2026-content] > [data-orbit-real-page]").count(), 1);
});

test("1024: a 72 icons-only rail whose labels show as a tooltip on hover and keyboard focus; the right rail becomes a button + 380 drawer", async (t) => {
  const page = await shell(t, { path: "/app/home", rail: true }, { width: 1024 });
  const nav = page.getByRole("navigation", { name: "メインナビゲーション" }).first();
  assert.equal(Math.round((await nav.boundingBox())!.width), 72);
  const home = nav.getByRole("link", { name: "ホーム" });
  assert.equal(await home.count(), 1);
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  const focused = await page.evaluate(() => document.activeElement?.getAttribute("data-tip"));
  assert.equal(focused, "ホーム", "Tab reaches the rail items in order (logo, then ホーム)");
  const tip = await page.evaluate(() => getComputedStyle(document.activeElement!, "::after").content);
  assert.equal(tip, '"ホーム"', "the label is visible on keyboard focus, not only in a title");
  assert.equal(await page.locator("aside").isVisible(), false);
  await page.getByRole("button", { name: "次の一手を開く" }).click();
  const drawer = page.getByRole("dialog", { name: "次の一手" });
  assert.equal(Math.round((await drawer.boundingBox())!.width), 380);
  assert.match(await drawer.innerText(), /iOrbit に聞く/u);
  await page.keyboard.press("Escape");
  assert.equal(await drawer.count(), 0);
});

test("the header's round 🔍 (no rail item any more) is named for what it does, with the platform's shortcut, and opens ⌘K", async (t) => {
  const page = await shell(t, { path: "/app/home", rail: true });
  const nav = page.getByRole("navigation", { name: "メインナビゲーション" }).first();
  assert.equal(await nav.getByRole("button").count(), 1, "the rail keeps only the avatar button (web.html: no ⌘K item)");
  const button = page.locator("[data-orbit-2026-mainhead]").getByRole("button", { name: /^検索 · iOrbit に聞く \((⌘K|Ctrl K)\)$/u });
  assert.equal(await button.count(), 1);
  await button.click();
  await page.getByRole("dialog", { name: "検索と iOrbit" }).waitFor();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Meta+k");
  await page.getByRole("dialog", { name: "検索と iOrbit" }).waitFor();
});

test("the main header is three parts: left slot · title over subtitle · right slot; 🔔 links to 受信箱 with the unread dot", async (t) => {
  const page = await shell(t, { path: "/app/home", rail: true, unread: true });
  const head = page.locator("[data-orbit-2026-mainhead]");
  const [left, middle, right] = await head.locator(":scope > div").all();
  assert.equal(await left!.locator("[data-orbit-2026-search]").count(), 1);
  assert.match(await middle!.innerText(), /ホーム\s+10月1日–10月31日/u);
  const bell = right!.getByRole("link", { name: "受信箱 · 未読あり" });
  assert.equal(await bell.getAttribute("href"), "/app/inbox");
  await bell.locator("i").waitFor();
});

test("1440 with the rail slot: a 360 right rail with the ⌘K entry; iOrbit never has one", async (t) => {
  const home = await shell(t, { path: "/app/home", rail: true });
  const rail = home.locator("aside");
  assert.equal(Math.round((await rail.boundingBox())!.width), 360);
  assert.match(await rail.innerText(), /iOrbit[\s\S]*はじめまして。[\s\S]*こんなことを聞けます[\s\S]*iOrbit に聞く…/u);
  // 「iOrbit に聞く…」 sits at the rail's foot (web.html assistRail: flex spacer).
  const ask = (await rail.getByRole("button", { name: /iOrbit に聞く…/u }).boundingBox())!;
  const box = (await rail.boundingBox())!;
  assert.ok(box.y + box.height - (ask.y + ask.height) <= 30, JSON.stringify({ ask, box }));
  const agent = await shell(t, { path: "/app/agent", rail: true });
  assert.equal(await agent.locator("aside").count(), 0);
});

test("390: no left rail; a bottom capsule with the five tabs that covers neither the page's end nor its fixed controls", async (t) => {
  const page = await shell(t, { path: "/app/tasks" }, { width: 390 });
  const bars = page.getByRole("navigation", { name: "メインナビゲーション" });
  const visible = [];
  for (const bar of await bars.all()) if (await bar.isVisible()) visible.push(bar);
  assert.equal(visible.length, 1);
  assert.deepEqual(await visible[0]!.locator("a").allTextContents(), ["ホーム", "人脈", "iOrbit", "イベント", "Task"]);
  assert.equal(await visible[0]!.getByRole("link", { name: "Task" }).getAttribute("aria-current"), "page");
  await page.locator("[data-last]").scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const last = (await page.locator("[data-last]").boundingBox())!;
  const capsule = (await visible[0]!.boundingBox())!;
  assert.ok(last.y + last.height <= capsule.y, JSON.stringify({ last, capsule }));
  const dock = (await page.locator("[data-fixed-dock]").boundingBox())!;
  assert.ok(dock.y + dock.height <= capsule.y, `a legacy fixed control sits above the capsule: ${JSON.stringify({ dock, capsule })}`);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= 391));
});

test("390: a legacy page's own dialog sits above the capsule (the shell's bars step back while it is open)", async (t) => {
  const page = await shell(t, { path: "/app/contacts", modal: true }, { width: 390 });
  const capsule = (await page.locator("[data-orbit-2026-shell] nav").last().boundingBox())!;
  const hit = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest("[role=dialog]")?.getAttribute("aria-label") ?? null, { x: capsule.x + capsule.width / 2, y: capsule.y + capsule.height / 2 });
  assert.equal(hit, "legacy dialog");
  await page.getByRole("button", { name: "dialog action" }).click();
});

test("390: a top bar with the 「O Orbit」 wordmark, 受信箱 (with the unread dot) and the avatar menu as a bottom sheet (マイページ, language, appearance, sign out); no header row", async (t) => {
  const page = await shell(t, { path: "/app/tasks", unread: true, rail: true, fold: true }, { width: 390 });
  const top = page.locator("[data-orbit-2026-mobile-top]");
  assert.equal(await top.isVisible(), true);
  assert.equal(await top.getByRole("link", { name: "Orbit" }).innerText(), "O\nOrbit");
  assert.equal(await top.getByRole("button", { name: /検索/u }).count(), 0, "b6 mwHead: no search button in the top bar");
  assert.equal(await page.locator("[data-orbit-2026-mainhead] h1").isVisible(), false, "390: the title folds into the page (b6 / b8)");
  const inbox = top.getByRole("link", { name: "受信箱" });
  assert.equal(await inbox.getAttribute("href"), "/app/inbox");
  await inbox.locator("i").waitFor();
  await top.getByRole("button", { name: "アカウント" }).click();
  const menu = page.getByRole("dialog", { name: "アカウント" });
  // b12 W-R07-07b (user-approved 2026-10-12): a bottom sheet with the same items as 1440 — 設定 / 主催 via マイページ.
  assert.deepEqual(await menu.getByRole("link").evaluateAll((links) => links.map((link) => link.getAttribute("href"))), ["/app/profile"]);
  const sheet = (await menu.boundingBox())!;
  assert.ok(sheet.y + sheet.height >= 844 - 8 - 1 && sheet.x <= 8.5, `a bottom sheet 8 from the edges: ${JSON.stringify(sheet)}`);
  await menu.getByRole("button", { name: "ログアウト" }).click();
  // R17：注销先删本机受付库（IndexedDB，异步），再 signOut。
  await page.waitForFunction(() => (window as any).shellFixture.calls.some((call: object) => "signOut" in call));
  assert.equal(await page.evaluate(() => (window as any).shellFixture.calls.filter((call: object) => "signOut" in call).length), 1);
  const reads = await page.evaluate(() => (window as any).shellFixture.calls.filter((call: { inboxRead?: string }) => call.inboxRead).length);
  assert.equal(reads, 1, "the rail and the top bar share one unread read");
});

test("390: a page that does not fold its title (phoneFold) keeps the header row — title, its slots and the 次の一手 button", async (t) => {
  const page = await shell(t, { path: "/app/tasks", unread: true, rail: true }, { width: 390 });
  const head = page.locator("[data-orbit-2026-mainhead]");
  assert.equal(await head.locator("h1").isVisible(), true);
  assert.equal(await head.locator("[data-orbit-2026-search]").isVisible(), true, "the left slot (a back button on 名刺スキャン) stays");
  assert.equal(await head.getByRole("link", { name: /^受信箱/u }).isVisible(), true, "the right slot stays");
  const railButton = head.getByRole("button", { name: "次の一手を開く" });
  assert.equal(await railButton.getAttribute("aria-expanded"), "false");
  await railButton.click();
  await page.getByRole("dialog", { name: "次の一手" }).waitFor();
  assert.equal(await railButton.getAttribute("aria-expanded"), "true");
});

test("1024: the drawer fits its foot — 「iOrbit に聞く…」 sits inside the drawer without scrolling", async (t) => {
  const page = await shell(t, { path: "/app/home", rail: true }, { width: 1024 });
  await page.getByRole("button", { name: "次の一手を開く" }).click();
  const drawer = (await page.getByRole("dialog", { name: "次の一手" }).boundingBox())!;
  const ask = (await page.getByRole("dialog", { name: "次の一手" }).getByRole("button", { name: /iOrbit に聞く/u }).boundingBox())!;
  assert.ok(ask.y + ask.height <= drawer.y + drawer.height - 19, `ask ${JSON.stringify(ask)} inside drawer ${JSON.stringify(drawer)}`);
});

test("the demo pill slot shows next to the main title; the inbox dot reads once and shows unread", async (t) => {
  const page = await shell(t, { path: "/app/contacts", demo: true, unread: true });
  const head = page.locator("[data-orbit-2026-mainhead]");
  await head.getByText("人脈", { exact: true }).waitFor();
  assert.equal(await head.locator("[data-demo-pill]").count(), 1);
  await page.waitForTimeout(200);
  const reads = await page.evaluate(() => (window as any).shellFixture.calls.filter((call: { inboxRead?: string }) => call.inboxRead).length);
  assert.equal(reads, 1, "one unread read for the whole shell (the old top bar read once per page)");
  const inbox = page.getByRole("navigation", { name: "メインナビゲーション" }).first().getByRole("link", { name: "受信箱" });
  assert.equal(await inbox.locator("i").count(), 1);
});

test("two ShellPages on one page each set their own slots (the pill and the rail both show)", async (t) => {
  const page = await shell(t, { path: "/app/contacts", demo: true, rail: true });
  await page.locator("[data-orbit-2026-mainhead] [data-demo-pill]").waitFor();
  assert.equal(await page.locator("aside").count(), 1, "the rail from the second ShellPage survives the first");
  assert.equal(await page.locator("[data-orbit-2026-mainhead] h1").innerText(), "ホーム", "a slot both name: the later-mounted wins");
});

test("old drawer events reach the inbox: elsewhere a visit with the seed; on the inbox page the seed goes straight to the panel", async (t) => {
  const page = await shell(t, { path: "/app/contacts" });
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("orbit:relationship-inbox-compose", { detail: { subject: "資料の件" } })));
  assert.deepEqual(await page.evaluate(() => (window as any).shellFixture.calls.filter((call: object) => "seed" in call || "push" in call)), [{ seed: { subject: "資料の件" } }, { push: "/app/inbox" }]);
  const inbox = await shell(t, { path: "/app/inbox" });
  const received = await inbox.evaluate(() => new Promise((resolve) => {
    window.addEventListener("orbit:inbox-page-compose", (event) => resolve((event as CustomEvent).detail), { once: true });
    window.dispatchEvent(new CustomEvent("orbit:relationship-inbox-compose", { detail: { subject: "資料の件" } }));
  }));
  assert.deepEqual(received, { subject: "資料の件" });
  assert.deepEqual(await inbox.evaluate(() => (window as any).shellFixture.calls.filter((call: object) => "push" in call)), [], "no navigation to the page already open");
});

test("the avatar menu: language, appearance (自動 / ライト / ダーク) and sign out", async (t) => {
  const page = await shell(t, { path: "/app/settings" });
  await page.getByRole("button", { name: "アカウント" }).click();
  const menu = page.getByRole("dialog", { name: "アカウント" });
  // b12 W-R07-07: a 340 pop-up beside the rail (rail edge + 8), its foot by the avatar's.
  const box = (await menu.boundingBox())!;
  const avatar = (await page.getByRole("button", { name: "アカウント" }).boundingBox())!;
  assert.equal(Math.round(box.x), 92);
  assert.equal(Math.round(box.width), 340);
  assert.ok(Math.abs(box.y + box.height - (avatar.y + avatar.height + 4)) <= 1, JSON.stringify({ box, avatar }));
  await menu.getByRole("tab", { name: "English" }).click();
  await menu.getByRole("tab", { name: "ダーク" }).click();
  assert.equal(await page.evaluate(() => document.documentElement.getAttribute("data-theme")), "dark");
  await menu.getByRole("tab", { name: "自動" }).click();
  // (The stored choice lives in localStorage, which a test document cannot use; the
  // shared setOrbitThemePreference is covered by orbit-settings-theme.)
  assert.equal(await page.evaluate(() => document.documentElement.getAttribute("data-theme")), "light", "automatic follows the (light) system again");
  await menu.getByRole("button", { name: "ログアウト" }).click();
  await page.waitForFunction(() => (window as any).shellFixture.calls.some((call: object) => "signOut" in call));
  assert.deepEqual(await page.evaluate(() => (window as any).shellFixture.calls.filter((call: object) => "language" in call || "signOut" in call)), [{ language: "en" }, { signOut: "/app" }]);
});

test("signed out: no shell, the page renders as before", async (t) => {
  const page = await shell(t, { path: "/app/events", signedIn: false });
  assert.equal(await page.locator("[data-orbit-2026-shell]").count(), 0);
  assert.equal(await page.getByRole("navigation").count(), 0);
});

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true }).filter((entry) => entry.isFile() && /\.(tsx?|css)$/.test(entry.name)).map((entry) => join(entry.parentPath, entry.name));
}

test("the old signed-in top bar and the floating ask are gone, with no references left", () => {
  const offenders: string[] = [];
  for (const file of [...sourceFiles("app"), ...sourceFiles("features")]) {
    const source = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gmu, "");
    if (/\bAccountTopNav\b|\bOrbitGlobalAsk\b|orbit-global-ask-styles|<RelationshipInboxTrigger\b/u.test(source)) offenders.push(file);
  }
  assert.deepEqual(offenders, []);
  // Public pages keep the public top bar; signed-in pages never mount it themselves.
  // R27（R26-08，b12 #324 / #326）：活动列表 / 详情的未登录版改用 b1 公开顶栏（PublicEvents 的 PublicNav）；已登录只走壳内新页。
  for (const [file, component] of [[`${A}/events/page.tsx`, "PublicEventList"], [`${A}/events/[id]/page.tsx`, "PublicEventDetail"]] as const) {
    assert.match(readFileSync(file, "utf8"), new RegExp(`if \\(!session\\?\\.user\\?\\.id\\) return <${component}\\b`, "u"), file);
  }
  assert.match(readFileSync(`${A}/layout.tsx`, "utf8"), /<Orbit2026Shell language=\{language\} signedIn=\{Boolean\(session\?\.user\)\}>/u);
});
