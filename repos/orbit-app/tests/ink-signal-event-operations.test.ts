import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { build } from "esbuild";
import { chromium, type Browser, type Page } from "playwright";

const require = createRequire(import.meta.url);
const iconFont = readFileSync(require.resolve("@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Ionicons.ttf")).toString("base64");
let browser: Browser, script: string;
// Real Screen/Content/VM/AppScreen/theme and confirmation/mutation callbacks run.
// Native dimensions, Alert, route and HTTP resource/client are controlled. These
// tests never contact a service or grant actual event permissions.
const fixture = `
import React, { useSyncExternalStore } from "react";
import { View } from "react-native-web";
import glyphs from "@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json";
let revision = 0; const listeners = new Set();
const s = window.fixture = { width: 390, fontScale: 1, kind: "success", status: 200, eventId: "event:ops", generationStatus: "completed", progress: 100, posts: [], navigation: [], refreshes: 0, alerts: [], ...window.initialFixture,
  update(patch) { Object.assign(s, patch); revision++; listeners.forEach(fn => fn()); } };
export const useFixture = () => { useSyncExternalStore(fn => { listeners.add(fn); return () => listeners.delete(fn); }, () => revision); return s; };
const generation = status => ({ eventId: s.eventId, generationId: "generation:01", status, errorCode: status === "failed" ? "GENERATION_FAILED" : null, errorMessage: status === "failed" ? "生成未完成，请重试。" : null, snapshot: { hash: "abcdef1234567890", participants: [{ participantId: "p1" }, { participantId: "p2" }] } });
const published = () => ({ eventId: s.eventId, generationId: "generation:01", grouping: { roundOne: [{ tableNumber: 1, theme: s.long ? "跨国团队的产品研究与长期合作讨论" : "产品与设计", rationale: s.long ? "请完整确认每位参与者的合作方向、可用时间及下一次讨论的安排。" : "讨论合作方向", members: [{ participantId: "p1", seat: "A" }] }], roundTwo: [] } });
export const useApiResource = path => { useFixture(); s.readPath = path; return { kind: s.kind, status: s.status, data: s.invalid ? {} : { eventId: s.eventId, configuration: { checkInOpensAt: "2026-09-12T04:00:00Z", eventStartsAt: "2026-09-12T05:00:00Z", eventEndsAt: "2026-09-12T09:00:00Z", profileEditDeadlineAt: "2026-09-11T04:00:00Z", registrationCutoffAt: "2026-09-11T05:00:00Z", resultsAvailableAt: "2026-09-12T04:30:00Z", roundOneStartsAt: "2026-09-12T06:00:00Z", roundTwoStartsAt: "2026-09-12T07:00:00Z", maxAttemptsPerTask: 3, recommendationCount: 3, shardSize: 20, tableSize: 6 }, metrics: { participantCount: s.long ? 123456 : 24, checkedIn: 1, contactRequests: 4, acceptedContactRequests: 2 }, generations: s.noGenerations ? [] : [{ generation: generation(s.generationStatus), progress: { percent: s.progress, completedTasks: s.progress === 100 ? 5 : s.progress === 80 ? 4 : 0, totalTasks: 5, failedTasks: s.generationStatus === "failed" ? 1 : 0 } }], publishedResult: s.published ? published() : null }, error: { code: s.status === 403 ? "FORBIDDEN" : "SERVICE_UNAVAILABLE", message: s.kind === "offline" ? "无法连接服务器，请稍后重试。" : s.status === 403 ? "当前账号没有权限完成这项操作。" : "运营状态读取失败，请重试。", context: s.unconfigured ? { eventOperationsCode: "EVENT_OPERATIONS_NOT_CONFIGURED" } : {} }, refreshing: false, refresh() { s.refreshes++; } }; };
export const useOrbitApiClient = () => ({ post: async (path, options) => { s.posts.push({ path, ...(options ? { options } : {}) }); if (s.hold) await new Promise(resolve => s.release = resolve); return s.mutationFailure ? { success: false, error: { message: "操作未完成，请重试。" } } : { success: true, data: path.endsWith("/publish") ? published() : generation("queued") }; } });
export const useRouter = () => ({ canGoBack: () => Boolean(s.hasHistory), push(href) { s.navigation.push(href); }, replace(href) { s.navigation.push(href); }, back() { s.navigation.push("back"); } });
export const usePathname = () => "/events/" + encodeURIComponent(s.eventId) + "/operations";
export const useLocalSearchParams = () => ({ id: s.eventId });
export const SafeAreaView = ({ edges, style, ...props }) => <View {...props} style={[style, { paddingTop: edges?.includes("top") ? 48 : 0 }]} />;
export const Ionicons = ({ name, size, color }) => <span aria-hidden="true" data-icon={name} style={{ fontFamily: "OrbitTestIonicons", fontSize: size, color, width: size, height: size, flexShrink: 0, lineHeight: 1 }}>{String.fromCodePoint(glyphs[name])}</span>;
export const Alert = { alert(title, message, buttons) { s.alerts.push({ title, message, buttons }); } };
`;

test.before(async () => {
  const result = await build({ stdin: { contents: 'import React from "react"; import { createRoot } from "react-dom/client"; import { EventOperationsScreen } from "./src/screens/events/EventOperationsScreen"; createRoot(document.getElementById("root")).render(<EventOperationsScreen />);', loader: "tsx", resolveDir: process.cwd() }, bundle: true, write: false, format: "iife", jsx: "automatic", resolveExtensions: [".web.tsx", ".web.ts", ".web.js", ".tsx", ".ts", ".jsx", ".js", ".json"], define: { "process.env.NODE_ENV": '"test"', "process.env": "{}", __DEV__: "false" }, plugins: [{ name: "ink-operations-boundaries", setup(plugin) {
    plugin.onResolve({ filter: /^react-native$/ }, () => ({ path: "native", namespace: "ink-operations" }));
    plugin.onResolve({ filter: /^(fixture|expo-router|@expo\/vector-icons|react-native-safe-area-context)$|\/(useOrbitApiClient|useApiResource)$/ }, () => ({ path: "fixture", namespace: "ink-operations" }));
    plugin.onLoad({ filter: /.*/, namespace: "ink-operations" }, args => ({ contents: args.path === "native" ? `
import React from "react"; import { Text as RealText, StyleSheet, useWindowDimensions as realDimensions } from "react-native-web"; import { useFixture } from "fixture"; export * from "react-native-web"; export { Alert } from "fixture";
export const useWindowDimensions = () => { const s = useFixture(); return { ...realDimensions(), width: s.width, fontScale: s.fontScale }; };
export const Text = props => { const s = StyleSheet.flatten(props.style) || {}, scale = useFixture().fontScale; return <RealText {...props} style={[props.style, s.fontSize && { fontSize: s.fontSize * scale, ...(s.lineHeight ? { lineHeight: s.lineHeight * scale } : {}) }]} />; };
` : fixture, loader: "jsx", resolveDir: process.cwd() }));
  } }] });
  script = result.outputFiles[0]!.text; browser = await chromium.launch({ headless: true });
});
test.after(async () => { await browser?.close(); });
async function open(t: { after(fn: () => Promise<void>): void }, patch: Record<string, unknown> = {}) {
  const page = await browser.newPage({ viewport: { width: Number(patch.width ?? 390), height: 844 }, deviceScaleFactor: 2, colorScheme: patch.dark ? "dark" : "light" });
  page.setDefaultTimeout(1500); const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  t.after(async () => { await page.close(); assert.deepEqual(errors, []); });
  await page.route("**/*", r => r.abort());
  await page.setContent('<style>@font-face{font-family:OrbitTestIonicons;src:url(data:font/ttf;base64,' + iconFont + ')}html,body,#root{margin:0;height:100%}#root{display:flex;flex-direction:column}</style><div id="root"></div>');
  await page.evaluate(patch => { (window as any).initialFixture = patch; }, patch);
  await page.addScriptTag({ content: script }); await page.getByRole("heading").first().waitFor(); await page.evaluate(() => document.fonts.ready);
  return page;
}
async function posts(page: Page) { return page.evaluate(() => (window as any).fixture.posts); }
async function navigation(page: Page) { return page.evaluate(() => (window as any).fixture.navigation); }
async function shot(page: Page, name: string) { if (process.env.APP_STYLE_SCREENSHOTS) await page.screenshot({ path: `/tmp/orbit-ink-signal-event-operations-${name}.png`, fullPage: true }); }
async function confirm(page: Page, text: string) { await page.evaluate(text => (window as any).fixture.alerts.at(-1).buttons.find((b: any) => b.text === text).onPress?.(), text); }

test("operations uses the compact source header and real four-column metric strip before navigation", async t => {
  const page = await open(t);
  const heading = page.getByRole("heading", { name: "活动运营", exact: true }); await heading.waitFor();
  assert.equal(await heading.evaluate(el => getComputedStyle(el).fontSize), "16px");
  const labels = ["已报名", "已签到", "名片申请", "已同意"];
  const boxes = await Promise.all(labels.map(name => page.getByText(name, { exact: true }).locator("..").boundingBox()));
  assert.ok(boxes.every(box => box && box.y === boxes[0]!.y), "all four metrics share a normal-size row");
  assert.equal(await page.getByText("24", { exact: true }).evaluate(el => getComputedStyle(el).fontSize), "24px");
  assert.equal(await page.getByText("已报名", { exact: true }).evaluate(el => getComputedStyle(el).fontSize), "11px");
  const strip = page.getByText("已报名", { exact: true }).locator("../..");
  assert.equal(await strip.evaluate(el => getComputedStyle(el).borderTopWidth), "1px");
  assert.equal(await strip.evaluate(el => getComputedStyle(el).borderBottomWidth), "1px");
  const checkIn = page.getByRole("button", { name: "签到台", exact: true });
  assert.ok((await checkIn.boundingBox())!.y > boxes[0]!.y);
  assert.equal(await checkIn.evaluate(el => getComputedStyle(el).borderRadius), "0px");
  assert.deepEqual(await posts(page), []); assert.equal(await page.getByRole("button", { name: /通过全部|发送通知|申请权限|^编辑$/ }).count(), 0);
  await shot(page, "normal");
});

test("operations shortcuts retain each encoded destination and do not mutate", async t => {
  const page = await open(t);
  for (const name of ["签到台", "活动分析", "角色", "报名体验"]) await page.getByRole("button", { name, exact: true }).click();
  assert.deepEqual(await navigation(page), ["/events/event%3Aops/operations/check-in", "/events/event%3Aops/analytics", "/events/event%3Aops/operations/roles", "/events/event%3Aops/operations/experience"]);
  assert.deepEqual(await posts(page), []);
});

test("only a real forbidden response shows the permission view with real return and refresh actions", async t => {
  const page = await open(t, { kind: "failure", status: 403 });
  const heading = page.getByRole("heading", { name: "需要运营权限", exact: true }); await heading.waitFor();
  assert.equal(await heading.evaluate(el => getComputedStyle(el).fontSize), "22px");
  assert.equal(await page.getByRole("alert").evaluate(el => getComputedStyle(el).color), "rgb(107, 114, 128)");
  const icon = page.locator('[data-icon="lock-closed-outline"]').locator("..");
  assert.equal((await icon.boundingBox())!.width, 64); assert.equal((await icon.boundingBox())!.height, 64);
  assert.equal(await page.getByText("已报名", { exact: true }).count(), 0);
  assert.equal(await page.getByRole("button", { name: /开始生成|签到台|申请权限|发送通知/ }).count(), 0);
  assert.equal(await page.getByText(/管理员：|当前是参与者|星野社区/).count(), 0);
  await page.getByRole("button", { name: "返回活动详情", exact: true }).filter({ hasText: "返回活动详情" }).click();
  await page.getByRole("button", { name: "重新检查权限", exact: true }).click();
  assert.deepEqual(await navigation(page), ["/events/event%3Aops"]);
  assert.equal(await page.evaluate(() => (window as any).fixture.refreshes), 1); assert.deepEqual(await posts(page), []);
  await shot(page, "forbidden");
  await page.evaluate(() => (window as any).fixture.update({ kind: "success", status: 200 }));
  await page.getByText("已报名", { exact: true }).waitFor(); assert.equal(await heading.count(), 0);
});

for (const variant of [
  { name: "loading", patch: { kind: "loading" }, text: "正在读取运营状态" },
  { name: "unconfigured", patch: { kind: "failure", status: 404, unconfigured: true }, text: "尚未配置运营规则" },
  { name: "offline", patch: { kind: "offline", status: 0 }, text: "无法连接服务器，请稍后重试。" },
  { name: "failure", patch: { kind: "failure", status: 500 }, text: "运营状态读取失败，请重试。" },
  { name: "unauthorized", patch: { kind: "failure", status: 401 }, text: "运营状态读取失败，请重试。" },
  { name: "invalid", patch: { invalid: true }, text: "运营数据格式暂时无法确认，请刷新后重试。" },
]) test(`operations keeps ${variant.name} distinct from forbidden and empty`, async t => {
  const page = await open(t, variant.patch); await page.getByText(variant.text, { exact: true }).waitFor();
  assert.equal(await page.getByRole("heading", { name: "需要运营权限" }).count(), 0);
  assert.equal(await page.getByText("已报名", { exact: true }).count(), 0);
  assert.equal(await page.getByRole("button", { name: "开始生成匹配" }).count(), 0); assert.deepEqual(await posts(page), []); await shot(page, variant.name);
});

test("start generation preserves cancellation, native confirmation, real endpoint and pending lock", async t => {
  const page = await open(t, { noGenerations: true, hold: true });
  const button = page.getByRole("button", { name: "开始生成匹配", exact: true });
  await button.click(); assert.deepEqual(await posts(page), []);
  assert.match(await page.evaluate(() => (window as any).fixture.alerts.at(-1).message), /24 位参会者/);
  await confirm(page, "取消"); assert.deepEqual(await posts(page), []);
  await button.click(); await confirm(page, "开始生成");
  assert.deepEqual(await posts(page), [{ path: "/api/events/event%3Aops/operations/admin/generations", options: { body: {} } }]);
  await page.waitForFunction(() => document.querySelector('[aria-label="开始生成匹配"]')?.getAttribute("aria-disabled") === "true");
  assert.equal(await button.isDisabled(), true); await button.dispatchEvent("click");
  assert.equal(await page.evaluate(() => (window as any).fixture.alerts.length), 2);
  await page.evaluate(() => { (window as any).fixture.hold = false; (window as any).fixture.release(); });
  await page.getByText("匹配生成已开始。完成后仍需你确认发布。", { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => (window as any).fixture.refreshes), 1);
});

for (const action of ["publish", "retry"] as const) test(`generation ${action} requires confirmation and keeps failure notice/retry path`, async t => {
  const page = await open(t, { generationStatus: action === "publish" ? "completed" : "failed", progress: action === "publish" ? 100 : 80, mutationFailure: true });
  const label = action === "publish" ? "确认发布" : "重试失败分片";
  await page.getByRole("button", { name: label, exact: true }).click(); assert.deepEqual(await posts(page), []);
  await confirm(page, action === "publish" ? "确认发布" : "开始重试");
  await page.getByText("操作未完成，请重试。", { exact: true }).waitFor();
  assert.equal(await page.getByRole("alert").evaluate(el => getComputedStyle(el).backgroundColor), "rgb(245, 247, 250)", "generic notices must not paint failed mutations as success");
  assert.deepEqual(await posts(page), [{ path: `/api/events/event%3Aops/operations/admin/generations/generation%3A01/${action}` }]);
  assert.equal(await page.evaluate(() => (window as any).fixture.refreshes), 1);
  await shot(page, action + "-failure");
  await page.evaluate(() => (window as any).fixture.update({ mutationFailure: false }));
  await page.getByRole("button", { name: label, exact: true }).click(); await confirm(page, action === "publish" ? "确认发布" : "开始重试");
  await page.getByText(action === "publish" ? "完整匹配结果已发布。" : "失败分片已进入重试队列。", { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => (window as any).fixture.refreshes), 2);
});

test("active generation exposes real zero progress without a fabricated minimum and blocks new generation", async t => {
  const page = await open(t, { generationStatus: "queued", progress: 0 });
  const progress = page.getByRole("progressbar"); await progress.waitFor();
  assert.equal(await progress.getAttribute("aria-valuenow"), "0");
  assert.equal((await progress.locator(":scope > div").boundingBox())!.width, 0);
  assert.equal(await page.getByRole("button", { name: "开始生成匹配", exact: true }).isDisabled(), true);
  assert.deepEqual(await posts(page), []); await shot(page, "zero-progress");
});

for (const variant of [{ name: "narrow-large", width: 320, fontScale: 1.6 }, { name: "narrow-double", width: 320, fontScale: 2 }, { name: "wide-dark", width: 820, fontScale: 1, dark: true }]) test(`operations and permission content remain readable/reachable at ${variant.name}`, async t => {
  const page = await open(t, { ...variant, long: true, published: true });
  for (const state of ["operations", "forbidden"]) {
    if (state === "forbidden") await page.evaluate(() => (window as any).fixture.update({ kind: "failure", status: 403 }));
    await page.getByRole("heading", { name: state === "forbidden" ? "需要运营权限" : /^活动\s*运营$/ }).waitFor();
    const heading = page.getByRole("heading", { name: /^活动\s*运营$/ }); const y = (await heading.boundingBox())!.y;
    await shot(page, variant.name + "-" + state + "-top");
    for (const title of await page.getByRole("heading", { name: /^活动\s*运营$|^需要运营权限$/ }).all()) {
      const lineCounts = await title.evaluate(el => {
        const lines: Record<string, number> = {}, walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) for (let index = 0; index < (node.textContent ?? "").length; index++) {
          if (/\s/.test(node.textContent![index]!)) continue;
          const range = document.createRange(); range.setStart(node, index); range.setEnd(node, index + 1);
          const line = Math.round(range.getBoundingClientRect().top); lines[line] = (lines[line] ?? 0) + 1;
        }
        return Object.values(lines);
      });
      assert.ok(lineCounts.every(count => count >= 2), "static Chinese headings must not strand one character on a line");
    }
    const overflow = await page.locator('[dir="auto"]').evaluateAll(elements => elements.filter(el => { const box = el.getBoundingClientRect(); return box.width && (box.x < -0.5 || box.right > innerWidth + 0.5 || el.scrollWidth > el.clientWidth + 1); }).map(el => el.textContent));
    assert.deepEqual(overflow, [], "all rendered text stays within its layout and viewport");
    if (state === "operations") {
      await page.getByText("AI 匹配与发布", { exact: true }).scrollIntoViewIfNeeded(); await shot(page, variant.name + "-matching");
      await page.getByText("两轮分桌", { exact: true }).scrollIntoViewIfNeeded(); await shot(page, variant.name + "-tables");
    }
    for (const button of await page.getByRole("button").all()) {
      await button.scrollIntoViewIfNeeded(); const box = await button.boundingBox();
      assert.ok(box && box.height >= 44 && box.x >= 0 && box.x + box.width <= variant.width && box.y >= 0 && box.y + box.height <= 845);
    }
    await page.evaluate(() => { document.querySelectorAll("div").forEach(el => { if (el.scrollHeight > el.clientHeight && /auto|scroll/.test(getComputedStyle(el).overflowY)) el.scrollTop = el.scrollHeight; }); });
    assert.equal((await heading.boundingBox())!.y, y); await shot(page, variant.name + "-" + state + "-bottom");
  }
});
