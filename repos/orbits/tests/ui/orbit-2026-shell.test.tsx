import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import type { Browser, Page } from "playwright";

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
  for (const path of ["/app/home", "/app/contacts", "/app/contacts/c1", "/app/agent", "/app/agent/actions", "/app/events", "/app/events/e1", "/app/events/center", "/app/events/e1/operations/check-in", "/app/tasks", "/app/tasks/personal", "/app/inbox", "/app/inbox/sources/s1", "/app/settings", "/app/profile", "/app/home/events", "/app/invitations/t"]) {
    assert.equal(shellAppliesTo(path, true), true, path);
    assert.equal(shellAppliesTo(path, false), false, `${path} signed out`);
  }
  for (const path of ["/", "/app", "/app/account/login", "/app/login-admin", "/app/admin", "/app/admin/events", "/app/o/acme", "/app/start", "/app/register", "/app/profile/onboarding", "/app/platform", "/dev/capabilities", "/showcase/components"]) {
    assert.equal(shellAppliesTo(path, true), false, path);
  }
  assert.equal(shellNavKeyFor("/app/contacts/c1"), "network");
  assert.equal(shellNavKeyFor("/app/events/e1/operations"), "host");
  assert.equal(shellNavKeyFor("/app/events/e1"), "events");
  assert.equal(shellShowsRail("/app/agent/actions"), false);
  assert.deepEqual([ORBIT_2026_SIDEBAR, ORBIT_2026_SIDEBAR_COMPACT, ORBIT_2026_RAIL, ORBIT_2026_HISTORY, ORBIT_LEFT_SIDEBAR_WIDTH], [84, 72, 360, 260, 212]);
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

test("1024: a 72 icons-only rail (labels kept for screen readers), no right rail", async (t) => {
  const page = await shell(t, { path: "/app/home", rail: true }, { width: 1024 });
  const nav = page.getByRole("navigation", { name: "メインナビゲーション" }).first();
  assert.equal(Math.round((await nav.boundingBox())!.width), 72);
  assert.equal(await nav.getByRole("link", { name: "ホーム" }).count(), 1);
  assert.equal(await page.locator("aside").isVisible(), false);
});

test("1440 with the rail slot: a 360 right rail with the ⌘K entry; iOrbit never has one", async (t) => {
  const home = await shell(t, { path: "/app/home", rail: true });
  const rail = home.locator("aside");
  assert.equal(Math.round((await rail.boundingBox())!.width), 360);
  assert.match(await rail.innerText(), /次の一手[\s\S]*最近の会話[\s\S]*iOrbit に聞く/u);
  const agent = await shell(t, { path: "/app/agent", rail: true });
  assert.equal(await agent.locator("aside").count(), 0);
});

test("390: no left rail; a bottom capsule with five tabs that never covers the end of the page", async (t) => {
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
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= 391));
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

test("the avatar menu: language, appearance (自動 / ライト / ダーク) and sign out", async (t) => {
  const page = await shell(t, { path: "/app/settings" });
  await page.getByRole("button", { name: "アカウント" }).click();
  const menu = page.getByRole("dialog", { name: "アカウント" });
  await menu.getByRole("tab", { name: "English" }).click();
  await menu.getByRole("tab", { name: "ダーク" }).click();
  assert.equal(await page.evaluate(() => document.documentElement.getAttribute("data-theme")), "dark");
  await menu.getByRole("tab", { name: "自動" }).click();
  // (The stored choice lives in localStorage, which a test document cannot use; the
  // shared setOrbitThemePreference is covered by orbit-settings-theme.)
  assert.equal(await page.evaluate(() => document.documentElement.getAttribute("data-theme")), "light", "automatic follows the (light) system again");
  await menu.getByRole("button", { name: "ログアウト" }).click();
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
  for (const file of [`${A}/events/page.tsx`, `${A}/events/[id]/page.tsx`]) assert.match(readFileSync(file, "utf8"), /\{authenticated \? null : <PublicTopNav active="events" \/>\}/u, file);
  assert.match(readFileSync(`${A}/layout.tsx`, "utf8"), /<Orbit2026Shell language=\{language\} signedIn=\{Boolean\(session\?\.user\)\}>/u);
});
