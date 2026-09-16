import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { build } from "esbuild";
import { chromium, type Browser, type Page } from "playwright";
import { scheduleToCalendarView } from "../src/view-models/schedule";

const require = createRequire(import.meta.url);
const iconFont = readFileSync(require.resolve("@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Ionicons.ttf")).toString("base64");
let browser: Browser, script: string;
const fixture = `
import React, { useSyncExternalStore } from "react";
import { View } from "react-native-web";
import glyphs from "@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json";
let revision = 0; const listeners = new Set();
const state = window.fixture = { width: 390, fontScale: 1, navigation: [], refreshes: [], writes: [], ...window.initialFixture,
  update(patch) { Object.assign(state, patch); revision++; listeners.forEach(fn => fn()); } };
window.fetch = async (input, init) => { state.writes.push({ input: String(input), method: init?.method || "GET" }); return new Response("{}", { status: 503 }); };
export const useFixture = () => { useSyncExternalStore(fn => { listeners.add(fn); return () => listeners.delete(fn); }, () => revision); return state; };
export const useApiResource = path => { useFixture(); return { kind: state.kinds?.[path] || "success", data: state.payloads[path], error: { message: "暂时无法读取，请重试。" }, refreshing: false, refresh() { state.refreshes.push(path); } }; };
export const useRouter = () => ({ canGoBack: () => false, push(href) { state.navigation.push(href); }, replace(href) { state.navigation.push(href); }, back() { state.navigation.push("back"); } });
export const usePathname = () => "/schedule";
export const useRelationshipInboxBadgeCount = () => 0;
export const SafeAreaView = ({ edges, style, ...props }) => <View {...props} style={[style, edges?.includes("top") && { paddingTop: 48 }]} />;
export const useSafeAreaInsets = () => ({ top: 48, bottom: 24, left: 0, right: 0 });
export const Ionicons = ({ name, size, color }) => <span aria-hidden="true" style={{ fontFamily: "OrbitTestIonicons", fontSize: size, color, width: size, height: size, flexShrink: 0, lineHeight: 1 }}>{String.fromCodePoint(glyphs[name])}</span>;
`;
const tasks = { tasks: [{ id: "task-fri", taskId: "task-fri", title: "给山田发介绍资料", contactName: "山田洋介", organization: "Sakura Ventures", notes: "确认合作资料", recommendedAction: "发送合作资料", category: "relationship", status: "open", priority: "normal", plannedDate: "2026-09-11", dueAt: "2026-09-11T09:00:00+09:00", source: "manual", createdAt: "2026-09-10T00:00:00Z", updatedAt: "2026-09-10T00:00:00Z" }] };
const events = { events: [{ id: "event-fri", eventId: "event-fri", title: "AI 创业者交流", startsAt: "2026-09-11T16:00:00+09:00", endsAt: "2026-09-11T17:00:00+09:00", date: "2026-09-11", location: "渋谷", venue: "渋谷", status: "published" }] };
const item = { id: "meeting-fri", kind: "meeting", sourceId: "meeting-fri", title: "与陈雨辰聊合作", startsAt: "2026-09-11T14:30:00+09:00", endsAt: "2026-09-11T15:15:00+09:00", location: "东京 · 线上", state: "scheduled" };
const scheduleItems = { scheduleItems: [item,
  { ...item, id: "personal-sat", kind: "personal", title: "整理本周笔记", startsAt: "2026-09-12T15:00:00+09:00", endsAt: "2026-09-12T16:00:00+09:00", location: "个人日程" },
  { ...item, id: "meeting-sun", title: "周日会面", startsAt: "2026-09-13T10:00:00+09:00", endsAt: "2026-09-13T11:00:00+09:00" },
  { ...item, id: "meeting-mon", title: "周一已安排的会面", startsAt: "2026-09-07T10:00:00+09:00", endsAt: "2026-09-07T11:00:00+09:00" }] };
const payloads = { "/api/tasks": tasks, "/api/events/public": events, "/api/schedule-items": scheduleItems };

test.before(async () => {
  const result = await build({ stdin: { contents: 'import React from "react"; import { createRoot } from "react-dom/client"; import { ScheduleScreen } from "./src/screens/schedule/ScheduleScreen"; createRoot(document.getElementById("root")).render(<ScheduleScreen />);', loader: "tsx", resolveDir: process.cwd() }, bundle: true, write: false, format: "iife", jsx: "automatic", resolveExtensions: [".web.tsx", ".web.ts", ".web.js", ".tsx", ".ts", ".jsx", ".js", ".json"], define: { "process.env.NODE_ENV": '"test"', __DEV__: "false" }, plugins: [{ name: "schedule-boundaries", setup(plugin) {
    plugin.onResolve({ filter: /^react-native$/ }, () => ({ path: "native", namespace: "schedule-test" }));
    plugin.onResolve({ filter: /^react-native-svg$/ }, () => ({ path: require.resolve("react-native-svg/lib/module/ReactNativeSVG.web.js") }));
    plugin.onResolve({ filter: /^(fixture|expo-router|@expo\/vector-icons|react-native-safe-area-context)$|\/(useApiResource|useRelationshipInboxBadgeCount)$/ }, () => ({ path: "fixture", namespace: "schedule-test" }));
    plugin.onLoad({ filter: /.*/, namespace: "schedule-test" }, args => ({ contents: args.path === "native" ? `
import React from "react"; import { Text as RealText, StyleSheet, useWindowDimensions as realDimensions } from "react-native-web"; import { useFixture } from "fixture"; export * from "react-native-web";
export const useWindowDimensions = () => { const s = useFixture(); return { ...realDimensions(), width: s.width, fontScale: s.fontScale }; };
export const Text = props => { const s = useFixture(); const style = StyleSheet.flatten(props.style) || {}; return <RealText {...props} style={[props.style, style.fontSize && { fontSize: style.fontSize * s.fontScale, ...(style.lineHeight ? { lineHeight: style.lineHeight * s.fontScale } : {}) }]} />; };
` : fixture, loader: "jsx", resolveDir: process.cwd() }));
  } }] });
  script = result.outputFiles[0]!.text; browser = await chromium.launch({ headless: true });
});
test.after(async () => { await browser?.close(); });
async function open(t: { after(fn: () => Promise<void>): void }, patch: Record<string, unknown> = {}) {
  const page = await browser.newPage({ viewport: { width: Number(patch.width ?? 390), height: 844 }, deviceScaleFactor: 2, colorScheme: patch.dark ? "dark" : "light", timezoneId: String(patch.timezoneId ?? "Asia/Tokyo") });
  page.setDefaultTimeout(1500); const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  t.after(async () => { await page.close(); assert.deepEqual(errors, []); });
  await page.clock.install({ time: new Date("2026-09-11T05:20:00Z") });
  await page.route("**/*", r => r.abort());
  await page.setContent('<style>@font-face{font-family:OrbitTestIonicons;src:url(data:font/ttf;base64,' + iconFont + ')}html,body,#root{margin:0;height:100%}#root{display:flex;flex-direction:column}</style><div id="root"></div>');
  await page.evaluate(patch => { (window as any).initialFixture = patch; }, { payloads, ...patch });
  await page.addScriptTag({ content: script }); await page.getByRole("tab", { name: "日", exact: true }).waitFor(); await page.evaluate(() => document.fonts.ready);
  return page;
}
async function mode(page: Page, label: string) { await page.getByRole("tab", { name: label, exact: true }).click(); }
async function shot(page: Page, name: string) { if (process.env.APP_STYLE_SCREENSHOTS) await page.screenshot({ path: `/tmp/orbit-ink-signal-schedule-${name}.png`, fullPage: true }); }

test("calendar can opt into Monday without changing the existing Sunday default", () => {
  const input = { tasks, events, scheduleItems, now: new Date("2026-09-11T05:20:00Z") };
  assert.equal(scheduleToCalendarView(input).days[0]?.dateKey, "2026-09-06");
  const monday = scheduleToCalendarView({ ...input, weekStartsOn: 1 });
  assert.deepEqual(monday.days.map(d => d.dateKey), ["2026-09-07", "2026-09-08", "2026-09-09", "2026-09-10", "2026-09-11", "2026-09-12", "2026-09-13"]);
  assert.equal(monday.items.length, 6); assert.equal(monday.selectedDateKey, "2026-09-11");
});

test("day view shows compact source date, Monday strip and distinct ink selection with no writes", async t => {
  const page = await open(t); await page.getByRole("heading", { name: "9.11", exact: true }).waitFor();
  const tab = page.getByRole("tab", { name: "日", exact: true });
  assert.equal(await tab.getAttribute("aria-selected"), "true");
  assert.equal(await tab.evaluate(el => getComputedStyle(el).backgroundColor), "rgb(11, 18, 32)");
  assert.equal(await page.getByTestId("schedule-week-strip").getByRole("button").first().getAttribute("aria-label"), "周一7日，1项安排");
  const selected = page.getByRole("button", { name: "周五11日，3项安排", exact: true });
  assert.equal(await selected.evaluate(el => getComputedStyle(el).borderBottomColor), "rgb(10, 92, 255)");
  assert.equal(await page.getByRole("button", { name: /与陈雨辰聊合作/ }).evaluate(el => getComputedStyle(el).top), "308px");
  assert.equal(await page.getByRole("button", { name: /与陈雨辰聊合作/ }).evaluate(el => getComputedStyle(el).height), "44px");
  await shot(page, "day");
  await page.getByRole("button", { name: "下一天", exact: true }).click(); await page.getByRole("heading", { name: "9.12", exact: true }).waitFor();
  await page.getByRole("button", { name: "回到今天", exact: true }).click(); await page.getByRole("heading", { name: "9.11", exact: true }).waitFor();
  await page.getByRole("button", { name: /AI 创业者交流/ }).click();
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.navigation), ["/schedule/events/event-fri"]);
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.writes), []);
});

test("week agenda starts with selected date but retains earlier days and all four kinds", async t => {
  const page = await open(t); await mode(page, "周");
  await page.getByRole("heading", { name: "9.7 – 9.13", exact: true }).waitFor();
  assert.equal(await page.getByTestId("schedule-week-agenda").getByRole("heading").first().innerText(), "今天 · 9月11日 周五");
  for (const title of ["给山田发介绍资料", "与陈雨辰聊合作", "AI 创业者交流", "整理本周笔记", "周日会面", "周一已安排的会面"]) await page.getByRole("button", { name: new RegExp(title) }).waitFor();
  await shot(page, "week");
  await page.getByRole("button", { name: "上一周", exact: true }).click(); await page.getByRole("heading", { name: "8.31 – 9.6", exact: true }).waitFor();
  await page.getByRole("button", { name: "下一周", exact: true }).click();
  await page.getByRole("button", { name: "周一7日，1项安排", exact: true }).click(); await mode(page, "日");
  await page.getByRole("heading", { name: "9.7", exact: true }).waitFor(); await page.getByRole("button", { name: /周一已安排的会面/ }).waitFor();
});

test("month is Monday-first with real month length, circle selection and retained holiday navigation", async t => {
  const page = await open(t); await mode(page, "月");
  await page.getByRole("heading", { name: "2026 · 9月", exact: true }).waitFor();
  assert.equal(await page.getByTestId("schedule-month-days").getByRole("button").count(), 30);
  assert.equal(await page.getByTestId("schedule-month-days").locator(":scope > *").count(), 35);
  const selected = page.getByRole("button", { name: "11日，3项安排", exact: true });
  assert.equal(await selected.getAttribute("aria-selected"), "true");
  assert.equal(await selected.getByText("11", { exact: true }).evaluate(el => getComputedStyle(el).borderRadius), "16px");
  assert.equal(await selected.getByText("11", { exact: true }).evaluate(el => getComputedStyle(el).backgroundColor), "rgb(10, 92, 255)");
  await shot(page, "month");
  await page.getByRole("button", { name: "21日，敬老日，0项安排", exact: true }).click(); await page.getByText("敬老日", { exact: true }).waitFor();
  await mode(page, "日"); await page.getByRole("heading", { name: "9.21", exact: true }).waitFor();
  await mode(page, "月"); await page.getByRole("button", { name: "下个月", exact: true }).click(); await page.getByRole("heading", { name: "2026 · 10月", exact: true }).waitFor();
  assert.equal(await page.getByTestId("schedule-month-days").getByRole("button").count(), 31);
  await page.getByRole("button", { name: "上个月", exact: true }).click();
  await page.getByRole("button", { name: "上个月", exact: true }).click();
  await page.getByRole("heading", { name: "2026 · 8月", exact: true }).waitFor();
  assert.equal(await page.getByTestId("schedule-month-days").locator(":scope > *").count(), 42);
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.writes), []);
});

test("source date metadata stays beside the date at standard scale and week label is the real ISO week", async t => {
  const page = await open(t);
  const heading = (await page.getByRole("heading", { name: "9.11", exact: true }).boundingBox())!;
  const meta = (await page.getByText("周五 · 3 项", { exact: true }).boundingBox())!;
  assert.ok(meta.x > heading.x + heading.width && meta.y < heading.y + heading.height);
  assert.equal(await page.getByTestId("schedule-week-strip").getByText("周一", { exact: true }).count(), 1);
  await mode(page, "周"); await page.getByText("2026 · 第 37 周", { exact: true }).waitFor();
});

test("February starting Monday keeps five calendar rows without inventing outside-month dates", async t => {
  const page = await open(t); await mode(page, "月");
  for (let index = 0; index < 5; index++) await page.getByRole("button", { name: "下个月", exact: true }).click();
  await page.getByRole("heading", { name: "2027 · 2月", exact: true }).waitFor();
  assert.equal(await page.getByTestId("schedule-month-days").getByRole("button").count(), 28);
  assert.equal(await page.getByTestId("schedule-month-days").locator(":scope > *").count(), 35);
});

test("current time and next-up emphasis update without shifting the event's time position", async t => {
  const page = await open(t); const current = page.getByTestId("schedule-current-time");
  await page.getByText("14:20", { exact: true }).waitFor();
  const initialTop = await current.evaluate(el => parseFloat(getComputedStyle(el).top));
  const meeting = page.getByRole("button", { name: /与陈雨辰聊合作/ });
  assert.equal(await meeting.evaluate(el => getComputedStyle(el).backgroundColor), "rgb(11, 18, 32)");
  const position = await meeting.evaluate(el => getComputedStyle(el).top);
  await page.clock.fastForward(60_000); await page.getByText("14:21", { exact: true }).waitFor();
  assert.ok(await current.evaluate(el => parseFloat(getComputedStyle(el).top)) > initialTop);
  assert.equal(await meeting.evaluate(el => getComputedStyle(el).top), position);
  await page.getByRole("button", { name: "下一天", exact: true }).click(); assert.equal(await current.count(), 0);
});

test("partial-source failure stays visible beside the remaining real agenda", async t => {
  const page = await open(t, { kinds: { "/api/tasks": "failure" } });
  await page.getByText("待办加载失败", { exact: true }).waitFor();
  await page.getByRole("button", { name: /AI 创业者交流/ }).waitFor();
  assert.equal(await page.getByRole("button", { name: /给山田发介绍资料/ }).count(), 0);
  await mode(page, "周"); await page.getByRole("button", { name: /整理本周笔记/ }).waitFor();
});

test("double text keeps the month unit and weekday labels on readable lines", async t => {
  const page = await open(t, { width: 320, fontScale: 2 });
  const weekday = page.getByRole("button", { name: "周一7日，1项安排", exact: true }).locator('[dir="auto"]').first();
  assert.ok((await weekday.boundingBox())!.height <= 32, "compact weekday label is one scaled line, with full weekday in the action label");
  await mode(page, "月");
  const heading = page.getByRole("heading", { name: "2026 · 9月", exact: true });
  assert.ok((await heading.boundingBox())!.height <= 60, "the month unit must not be stranded on a separate line");
});

for (const variant of [{ name: "narrow-large", width: 320, fontScale: 1.6 }, { name: "narrow-double", width: 320, fontScale: 2 }, { name: "wide-dark", width: 820, dark: true }]) {
  test(`${variant.name}: calendar controls and complete agenda remain inside viewport`, async t => {
    const page = await open(t, variant);
    for (const label of ["日", "周", "月"]) {
      await mode(page, label);
      const tabs = page.getByRole("tab");
      for (const tab of await tabs.all()) { const b = (await tab.boundingBox())!; assert.ok(b.height >= 44 && b.x >= 0 && b.x + b.width <= variant.width); }
      if (label !== "日") {
        const row = page.getByRole("button", { name: /与陈雨辰聊合作/ });
        assert.deepEqual(await row.locator('[dir="auto"]').evaluateAll(nodes => nodes.filter(n => n.scrollWidth > n.clientWidth + 1 || n.scrollHeight > n.clientHeight + 1).map(n => n.textContent)), []);
      }
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await shot(page, `${variant.name}-${label}`);
    }
  });
}
