import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";

import { build } from "esbuild";
import { chromium, type Browser, type Page } from "playwright";

import { nativeUiStubs } from "./helpers/native-ui-stubs";

// Sprint 0149: the calendar title opens the shared date picker and jumps there.
// CalendarContent, calendarProjection and PersonalScheduleDateTimePicker are real;
// the wrapper holds the date/mode state the way CalendarScreen does (onSelectDate = setDateKey).
const root = new URL("..", import.meta.url).pathname;
let browser: Browser;
let script: string;

test.before(async () => {
  const result = await build({
    stdin: { contents: `
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { CalendarContent } from "./src/screens/calendar/CalendarContent";
import { calendarProjection } from "./src/screens/calendar/calendar-projection";
import { OrbitLocaleContext } from "./src/i18n/OrbitLocaleContext";
import { createTranslator } from "./src/i18n/messages";
const locale = { choice: "zh", deviceLanguage: "zh", error: null, language: "zh", preference: { mode: "system", language: null, updatedAt: null }, retryLanguageSave: async () => undefined, setLanguage: async () => undefined, source: "device", syncState: "idle", t: createTranslator("zh") };
function App() {
  const [dateKey, setDateKey] = useState("2026-10-07");
  const [mode, setMode] = useState(window.initialMode ?? "month");
  window.selections = window.selections ?? [];
  const projection = calendarProjection({ actorId: "actor-1", dateKey, events: { events: [] }, language: "zh", mode, now: new Date("2026-10-07T01:00:00.000Z"), scheduleItems: { scheduleItems: [] }, tasks: { tasks: [] }, timeZone: "Asia/Shanghai" });
  return <OrbitLocaleContext.Provider value={locale}><output id="date">{dateKey}</output>
    {projection.kind === "ready" ? <CalendarContent mode={mode} projection={projection} timeZone="Asia/Shanghai" onConnectExternal={() => {}} onChangeMode={setMode}
      onSelectDate={value => { window.selections.push(value); setDateKey(value); }} onShift={() => {}} onToday={() => {}} onCreate={() => {}} onOpenItem={() => {}} onEditPersonal={() => {}} /> : null}
  </OrbitLocaleContext.Provider>;
}
createRoot(document.getElementById("root")).render(<App />);
`, loader: "tsx", resolveDir: root },
    bundle: true, write: false, format: "iife", jsx: "automatic",
    define: { __ORBIT_LEGACY_TEST_LANGUAGE__: '"zh"', "process.env.NODE_ENV": '"test"', "process.env": "{}", __DEV__: "false" },
    resolveExtensions: [".web.tsx", ".web.ts", ".web.js", ".tsx", ".ts", ".jsx", ".js", ".json"],
    plugins: [nativeUiStubs, { name: "calendar-jump", setup(plugin) {
      plugin.onResolve({ filter: /^react-native$/ }, () => ({ path: "calendar-react-native-web", namespace: "calendar-native" }));
      plugin.onLoad({ filter: /^calendar-react-native-web$/, namespace: "calendar-native" }, () => ({
        contents: 'export * from "react-native-web"; export const findNodeHandle = () => null;', loader: "js", resolveDir: root,
      }));
      plugin.onResolve({ filter: /^react-native-svg$/ }, () => ({ path: join(root, "tests/helpers/stubs/react-native-svg.js") }));
      plugin.onResolve({ filter: /^react-native-safe-area-context$/ }, () => ({ path: join(root, "tests/helpers/stubs/react-native-safe-area-context.js") }));
    } }],
  });
  script = result.outputFiles[0]!.text;
  browser = await chromium.launch({ headless: true });
});
test.after(async () => { await browser?.close(); });

async function open(t: { after(fn: () => Promise<void>): void }, mode: "month" | "week" | "day" = "month"): Promise<Page> {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.setDefaultTimeout(2500);
  t.after(async () => { await page.close(); assert.deepEqual(errors, []); });
  await page.route("**/*", route => route.abort());
  await page.setContent('<div id="root"></div>');
  await page.evaluate(mode => { (window as any).initialMode = mode; }, mode);
  await page.addScriptTag({ content: script });
  await page.locator("#date").waitFor();
  return page;
}
const titleButton = (page: Page) => page.getByRole("button", { name: /选择日期/u });
const date = (page: Page) => page.locator("#date").textContent();
// react-native-web drops aria-selected on role=button, so the highlight is read from the computed background.
const selectedBackground = (page: Page, selector: string) => page.locator(selector).evaluate(node => {
  const siblings = [...node.parentElement!.children].map(child => getComputedStyle(child).backgroundColor);
  const own = getComputedStyle(node).backgroundColor;
  return siblings.filter(color => color === own).length === 1 && own !== "rgba(0, 0, 0, 0)";
});
const agendaTitle = async (page: Page) => (await page.getByRole("heading").allTextContents()).at(-1) ?? "";
/** Opens the picker from the title, picks `year` in the year grid, steps to `month` and taps `day`. */
async function pick(page: Page, year: number, month: number, day: number) {
  await titleButton(page).click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  await dialog.getByRole("button", { name: /^\d{4}年\d{1,2}月$/u }).click();
  await dialog.getByRole("button", { name: String(year), exact: true }).click();
  // The picker keeps the open month (October) when the year changes.
  for (let current = 10; current !== month; current += month > current ? 1 : -1) {
    await dialog.getByRole("button", { name: month > current ? "下个月" : "上个月", exact: true }).click();
  }
  const key = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  await dialog.getByRole("button", { name: key, exact: true }).click();
  await dialog.getByRole("button", { name: "完成", exact: true }).click();
  await dialog.waitFor({ state: "detached" });
}

test("the title is a labelled button with a chevron and a full touch target", async t => {
  const page = await open(t);
  const button = titleButton(page);
  assert.equal(await button.count(), 1);
  assert.match(await button.getAttribute("aria-label") ?? "", /2026年10月/u, "the label names the shown month");
  assert.equal(await button.locator("svg").count(), 1, "a chevron marks the title as a menu");
  const box = await button.boundingBox();
  assert.ok(box && box.height >= 44 && box.width >= 44, `title touch target ${JSON.stringify(box)}`);
  assert.equal(await page.getByRole("button", { name: "回到今天", exact: true }).count(), 1, "the today button stays");
});

test("the picker opens on the selected date in date mode", async t => {
  const page = await open(t);
  await titleButton(page).click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  assert.equal(await dialog.getByRole("button", { name: "2026-10-07", exact: true }).getAttribute("aria-selected"), "true");
  assert.equal(await dialog.getByRole("radio").count(), 0, "no time columns");
});

test("month view jumps across years to the chosen month with that day selected", async t => {
  const page = await open(t, "month");
  await pick(page, 2024, 2, 29);
  assert.equal(await date(page), "2024-02-29");
  assert.match(await titleButton(page).getAttribute("aria-label") ?? "", /2024年2月/u);
  assert.match(await agendaTitle(page), /2月29日/u, "the agenda shows the chosen day");
  assert.equal(await page.getByRole("button", { name: /^2月1日/u }).count(), 1, "the grid shows February 2024");
});

test("future years are reachable from the year grid", async t => {
  const page = await open(t, "month");
  await pick(page, 2030, 6, 15);
  assert.equal(await date(page), "2030-06-15");
  assert.match(await titleButton(page).getAttribute("aria-label") ?? "", /2030年6月/u);
});

test("week view jumps to the Sunday-first week that holds the date, across a year boundary", async t => {
  const page = await open(t, "week");
  await pick(page, 2027, 1, 1);
  assert.equal(await date(page), "2027-01-01");
  const strip = await page.locator('[aria-label^="周"]').evaluateAll(nodes => nodes.map(node => node.getAttribute("aria-label")).filter(label => /^周. \d+$/u.test(label ?? "")));
  assert.deepEqual(strip.map(label => Number(label!.split(" ").pop())), [27, 28, 29, 30, 31, 1, 2]);
  assert.equal(await selectedBackground(page, '[aria-label="周五 1"]'), true, "January 1 is the highlighted day");
  assert.match(await agendaTitle(page), /1月1日/u);
});

test("day view jumps to the chosen day", async t => {
  const page = await open(t, "day");
  await pick(page, 2025, 12, 31);
  assert.equal(await date(page), "2025-12-31");
  assert.match(await titleButton(page).getAttribute("aria-label") ?? "", /2025年12月31日/u);
});

test("cancel leaves the calendar where it was", async t => {
  const page = await open(t);
  await titleButton(page).click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  await dialog.getByRole("button", { name: "下个月", exact: true }).click();
  await dialog.getByRole("button", { name: "2026-11-20", exact: true }).click();
  await dialog.getByRole("button", { name: "取消", exact: true }).first().click();
  await dialog.waitFor({ state: "detached" });
  assert.equal(await date(page), "2026-10-07");
  assert.deepEqual(await page.evaluate(() => (window as any).selections), []);
  assert.match(await titleButton(page).getAttribute("aria-label") ?? "", /2026年10月/u);
});
