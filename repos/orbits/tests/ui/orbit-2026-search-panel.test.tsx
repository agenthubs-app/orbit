import assert from "node:assert/strict";
import test from "node:test";
import type { Browser, Page } from "playwright";

import { launch } from "./support/orbit-2026-harness";
import { errorsOf, LEGACY_PAGE, openShell, shellBundle } from "./support/orbit-2026-shell-harness";

// R30 ⌘K 全局搜索面板（b5 #57 初期 / #58 名前 / #71 結果なし；search/DESIGN.md §2.1）：the real panel inside the shell; the
// page-side fake of GET /api/search/global records each query. Recent searches live in this browser only (localStorage).
let browser: Browser;
let code: { js: string; css: string };

test.before(async () => {
  code = await shellBundle(LEGACY_PAGE + `
    window.searches = [];
    // about:blank has no origin, so the page's localStorage is replaced by an in-memory one.
    const memory = {};
    Object.defineProperty(window, "localStorage", { configurable: true, value: { getItem: (key) => (key in memory ? memory[key] : null), setItem: (key, value) => { memory[key] = String(value); }, removeItem: (key) => { delete memory[key]; } } });
    const empty = { total: 0, items: [] };
    window.fetch = async (url) => {
      const params = new URL(String(url), "http://local.test").searchParams;
      const query = params.get("q") ?? "";
      window.searches.push(params.toString());
      if (query === "busy") return new Response(JSON.stringify({ success: false, error: { code: "FORBIDDEN", message: "Too many" } }), { status: 429 });
      const base = { query, types: ["people", "events", "conversations"], people: empty, events: empty, conversations: empty, semantic: { available: false, enabled: false }, searchedPeople: 286, examples: [], suggestions: [], alternatives: [] };
      const data = !query ? { ...base, examples: ["製造業の決裁者", "先月会った人"] }
        : query === "半導体 商社" ? { ...base, suggestions: [{ kind: "industry", emoji: "🏭", label: "製造業 › 電子部品", count: 12, href: "/app/contacts?industry=electronics" }], alternatives: [
            { kind: "ask_iorbit", emoji: "✨", label: "iOrbit に紹介ルートを聞く", detail: "「半導体商社の人に会うには？」", href: "#ask" },
            { kind: "events", emoji: "🎟️", label: "イベントで探す", detail: "探すで条件を変えて探す", href: "/app/events?tab=discover&q=x" }] }
        : { ...base, people: { total: 1, items: [{ contactId: "c1", name: "高橋 美咲", initial: "高", org: "青葉ベンチャーズ", role: "パートナー", status: "in_progress", highlights: [{ field: "title", start: 0, end: 2 }], href: "/app/contacts/c1" }] } };
      return new Response(JSON.stringify({ success: true, data }), { status: 200 });
    };
  `);
  browser = await launch();
});
test.after(async () => { await browser?.close(); });

async function palette(t: { after: (fn: () => Promise<void>) => void }, recent?: string[]): Promise<Page> {
  const page = await openShell(browser, code, { path: "/app/home" });
  t.after(async () => { const errors = errorsOf(page); await page.close(); assert.deepEqual(errors, []); });
  await page.getByText("legacy button").waitFor();
  if (recent) await page.evaluate((items) => window.localStorage.setItem("orbit.search.recent", JSON.stringify(items)), recent);
  await page.keyboard.press("Control+k");
  await page.getByRole("dialog", { name: "検索と iOrbit" }).waitFor();
  return page;
}
const searches = (page: Page) => page.evaluate(() => (window as unknown as { searches: string[] }).searches);

test("初期 (b5 #57): recent searches and examples; × forgets one; picking one searches it", async (t) => {
  const page = await palette(t, ["高橋", "CFO Night"]);
  for (const text of ["最近の検索", "高橋", "CFO Night", "こんな検索もできます", "製造業の決裁者"]) await page.getByText(text, { exact: true }).waitFor();
  assert.equal(await page.getByText("言葉の意味でも探します", { exact: false }).count(), 0, "no semantic hint while it is unavailable (A2)");
  await page.getByRole("button", { name: "消去 CFO Night" }).dispatchEvent("mousedown");
  assert.equal(await page.getByText("CFO Night", { exact: true }).count(), 0);
  assert.equal(await page.evaluate(() => window.localStorage.getItem("orbit.search.recent")), JSON.stringify(["高橋"]));
  await page.getByRole("option", { name: "高橋" }).dispatchEvent("mousedown");
  await page.getByText("青葉ベンチャーズ · パートナー").waitFor();
});

test("Tab switches the type chip and the request narrows; 429 shows one line", async (t) => {
  const page = await palette(t);
  await page.keyboard.type("高橋");
  await page.getByText("人 · 1").waitFor();
  await page.keyboard.press("Tab");
  assert.equal(await page.getByRole("tab", { selected: true }).textContent(), "人");
  await page.waitForFunction(() => (window as unknown as { searches: string[] }).searches.some((entry) => entry.includes("types=people")));
  await page.keyboard.press("Shift+Tab");
  assert.equal(await page.getByRole("tab", { selected: true }).textContent(), "すべて");
  await page.getByRole("combobox").fill("busy");
  await page.getByText("少し待ってからもう一度").waitFor();
  await page.waitForTimeout(500);
  assert.equal((await searches(page)).filter((entry) => entry.includes("q=busy")).length, 1, "not retried");
});

test("結果なし (b5 #71): searched count, suggestion and the two other ways; ↵ on a suggestion opens it", async (t) => {
  const page = await palette(t);
  await page.keyboard.type("半導体 商社");
  for (const text of ["「半導体 商社」に一致する人はいません", "286人の名前・会社・役職・メモを探しました", "近い条件なら", "12人 · 業界で絞り込む", "ほかの方法", "iOrbit に紹介ルートを聞く", "イベントで探す"]) await page.getByText(text, { exact: true }).first().waitFor();
  assert.equal(await page.locator("[aria-live=polite]").textContent(), "「半導体 商社」に一致する人はいません", "the empty title is announced outside the listbox");
  await page.keyboard.press("Enter");
  assert.deepEqual(await page.evaluate(() => (window as unknown as { shellFixture: { calls: object[] } }).shellFixture.calls.filter((call) => "push" in call)), [{ push: "/app/contacts?industry=electronics" }]);
});
