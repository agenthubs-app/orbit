// 2026-11-27 用户反馈（线上 iPhone Safari）：活动 › 发现 在手机上显示成电脑版表格、页面比屏幕宽。
// 硬规则：视口 <768 永远是卡片列表、没有可见的 <table>，页面不横向溢出，最后一块内容不被底部胶囊盖住。
// 真的外壳 + 真的 EventsScreen（发现页），接口在页面里假装；WebKit（Safari 内核）与 Chromium 都跑。
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import test from "node:test";
import { existsSync } from "node:fs";
import { chromium, webkit as bundledWebkit, type Browser, type BrowserType, type Page } from "playwright";

import { errorsOf, open } from "./support/orbit-2026-harness";
import { shellBundle } from "./support/orbit-2026-shell-harness";

const SHOTS = process.env.DISCOVER_SHOTS_DIR;

// 1 场即将举办 + 4 场已结束，没有计划（popularityFallback）。
const row = (id: string, startsAt: string, title: string) => ({ eventId: id, title, startsAt, venue: "東京都渋谷区神宮前 6-23-4 桑野ビル 2F 渋谷スクランブルスクエア", priceYen: 3000, emoji: "🤝", href: `/events/${id}`, registrationCount: 58, relevance: null });
const DISCOVER = {
  all: [row("u1", "2026-12-05T09:00:00.000Z", "第七期 中日创业交流会 · 东京站（创业者 · 投资人 · 大企业新事业负责人）")],
  community: [], planFit: [], planFitTotal: 0, popularityFallback: true, total: 1, pastTotal: 4,
  past: [1, 2, 3, 4].map((n) => row(`p${n}`, `2026-1${n % 2}-0${n}T09:00:00.000Z`, `第${n}期 中日创业交流会`)),
};

const PAGE = `
  import { EventsScreen } from "./app/(app)/app/orbit-2026/events/EventsScreen";
  window.fetch = async (url) => {
    const path = new URL(String(url), location.href).pathname;
    const ok = (data) => new Response(JSON.stringify({ success: true, data }), { status: 200, headers: { "content-type": "application/json" } });
    if (path === "/api/events/discover") return ok(window.discoverFixture);
    if (path === "/api/profile") return ok({ profile: { relationshipGoal: window.goalFixture ?? "" } });
    return new Response(JSON.stringify({ success: false, error: { code: "NOT_FOUND", message: "test" } }), { status: 404, headers: { "content-type": "application/json" } });
  };
  function TestPage() { return <EventsScreen language="zh" nowIso="2026-11-27T03:00:00.000Z" />; }
`;

// The fixture page is served without a charset: keep the inline JSON ASCII.
const ascii = (json: string) => json.replace(/[\u0080-\uffff]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);

let code: { js: string; css: string };
test.before(async () => { code = await shellBundle(PAGE); });

async function openDiscover(browser: Browser, width: number, dark = false): Promise<Page> {
  const page = await open(browser, code, {
    width, dark, origin: "https://orbit.test/app/events?tab=discover",
    html: `<div id="root"></div><script>window.shellFixture=${JSON.stringify({ lang: "zh", signedIn: true, unread: false, calls: [], path: "/app/events" })};window.discoverFixture=${ascii(JSON.stringify(DISCOVER))};</script>`,
  });
  await page.locator("[data-discover-row]").first().waitFor({ state: "attached" });
  await page.locator("[data-discover-past-section]").waitFor({ state: "attached" });
  return page;
}

// WebKit：本机装的 WebKit 版本可能和仓库的 playwright 不配套；ORBIT_WEBKIT_PLAYWRIGHT 可指向另一份 playwright（其 WebKit 已安装）。
// 两者都没有时跳过 WebKit（Chromium 照跑）。
async function webkitEngine(): Promise<BrowserType | null> {
  const override = process.env.ORBIT_WEBKIT_PLAYWRIGHT;
  const loaded = override ? (await import(override)) as { webkit?: BrowserType; default?: { webkit: BrowserType } } : null;
  const engine = loaded ? (loaded.webkit ?? loaded.default!.webkit) : bundledWebkit;
  return existsSync(engine.executablePath()) ? engine : null;
}

const engines: [string, () => Promise<BrowserType | null>][] = [["webkit", webkitEngine], ["chromium", async () => chromium]];
for (const [name, pick] of engines) {
  test(`${name}: phone widths show cards, no table, no sideways scroll, nothing under the bottom capsule`, async (t) => {
    const engine = await pick();
    if (!engine) { t.skip(`${name} is not installed for this playwright`); return; }
    const browser = await engine.launch({ headless: true });
    try {
      for (const width of [375, 390, 402, 430]) {
        const page = await openDiscover(browser, width);
        const facts = await page.evaluate(() => {
          const visibleTables = [...document.querySelectorAll("table")].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).display !== "none"; }).length;
          return { scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth, visibleTables, cards: document.querySelectorAll("[data-discover-row]").length };
        });
        assert.ok(facts.scrollWidth <= facts.innerWidth, `${name} ${width}: page is ${facts.scrollWidth}px wide in a ${facts.innerWidth}px viewport`);
        assert.equal(facts.visibleTables, 0, `${name} ${width}: a table is visible`);
        assert.equal(facts.cards, 5, `${name} ${width}: 1 upcoming + 4 ended cards`);
        // Scrolled to the end, the last card sits above the bottom capsule.
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        const gap = await page.evaluate(() => {
          const last = [...document.querySelectorAll("[data-discover-row]")].at(-1)!.getBoundingClientRect();
          // The bottom capsule: the visible nav pinned to the viewport's foot.
          const nav = [...document.querySelectorAll("nav")].map((el) => el.getBoundingClientRect()).find((r) => r.height > 0 && r.bottom > window.innerHeight - 40);
          return { lastBottom: last.bottom, navTop: nav ? nav.top : window.innerHeight };
        });
        assert.ok(gap.lastBottom <= gap.navTop, `${name} ${width}: last card (bottom ${gap.lastBottom}) under the capsule (top ${gap.navTop})`);
        if (SHOTS && width === 390) {
          mkdirSync(SHOTS, { recursive: true });
          await page.evaluate(() => window.scrollTo(0, 0));
          await page.screenshot({ path: `${SHOTS}/${name}-390-light.png`, fullPage: true });
          const dark = await openDiscover(browser, width, true);
          await dark.screenshot({ path: `${SHOTS}/${name}-390-dark.png`, fullPage: true });
          await dark.close();
        }
        assert.deepEqual(errorsOf(page), []);
        await page.close();
      }
      // ≥768 the table is still there (iPad / desktop keep the dense list).
      const wide = await openDiscover(browser, 1024);
      assert.equal(await wide.locator("table").isVisible(), true);
      await wide.close();
    } finally {
      await browser.close();
    }
  });
}
