import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { build } from "esbuild";
import { chromium, type Browser, type Page } from "playwright";

const require = createRequire(import.meta.url);
const iconFont = readFileSync(require.resolve("@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Ionicons.ttf")).toString("base64");
let browser: Browser, script: string;
const task = { id: "task:1", accountId: "test", ownerUserId: "test", title: "发送项目介绍", notes: "先确认合作方向", status: "open", category: "relationship", priority: "normal", source: "manual", relatedContactId: "contact:1", dueAt: "2026-09-11T18:00:00+09:00", plannedDate: "2026-09-11", createdAt: "2026-09-10T00:00:00Z", updatedAt: "2026-09-10T00:00:00Z" };
const tasks = [task,
  { ...task, id: "task:2", relatedContactId: "contact:2", title: "整理需求复盘", dueAt: "2026-09-11T18:30:00+09:00" },
  { ...task, id: "task:3", relatedContactId: "contact:3", title: "确认下周会面时间", dueAt: "2026-09-11T19:00:00+09:00" },
  { ...task, id: "task:4", relatedContactId: "contact:4", title: "询问合作方向", dueAt: undefined, plannedDate: "2026-09-14" },
  { ...task, id: "done:1", title: "发送活动总结", status: "completed", completedAt: "2026-09-10T09:00:00Z" },
  { ...task, id: "cancel:1", title: "已取消的事项", status: "cancelled" },
  { ...task, id: "personal:1", title: "个人待办", category: "personal", relatedContactId: undefined },
];
const contacts = [
  { id: "contact:1", displayName: "林悦", role: "产品设计师", organization: "云间工作室", status: "active" },
  { id: "contact:2", displayName: "陈默", role: "产品经理", organization: "山海科技", status: "active" },
  { id: "contact:3", displayName: "周宁", role: "市场负责人", organization: "松石咨询", status: "active" },
  { id: "contact:4", displayName: "许妍", role: "创业者", organization: "白露设计", status: "active" },
];
const candidate = { taskId: "candidate:1", title: "建议联络", contactName: "候选联系人", organization: "候选公司", contactId: "candidate-contact", connectionId: "candidate-contact", priority: "today", dueInDays: 0, recommendedAction: "确认是否方便继续讨论", rationale: "活动中提到合作", triggerKind: "event_encounter", source: { label: "活动记录" }, evidenceIds: [], liveTaskPersistenceRequested: false };
const draft = { draftId: "draft:1", recipientName: "林悦", organization: "云间工作室", channel: "email", status: "held_for_review", subject: "项目介绍草稿", body: "这是待复核的草稿。", recommendedSendWindow: "24 小时内", source: { label: "活动记录" }, evidenceIds: [], sendActionRequiresConfirmation: true };
// Real screen, list, view models, theme and RNW. Only external resource/client
// and device/navigation boundaries are replaced; no HTTP/native success claim.
const fixture = `
import React, { useSyncExternalStore } from "react";
import { View } from "react-native-web";
import glyphs from "@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json";
let revision = 0; const listeners = new Set();
const state = window.fixture = { width: 390, fontScale: 1, navigation: [], requests: [], reads: [], refreshes: [], ...window.initialFixture,
  update(patch) { Object.assign(state, patch); revision++; listeners.forEach(fn => fn()); } };
export const useFixture = () => { useSyncExternalStore(fn => { listeners.add(fn); return () => listeners.delete(fn); }, () => revision); return state; };
export const useApiResource = path => { useFixture(); if (!state.reads.includes(path)) state.reads.push(path); return { kind: state.kinds?.[path] || "success", data: path === "/api/tasks" ? { tasks: state.tasks } : path === "/api/contacts" ? { contacts: state.contacts } : { reminders: [], notificationQueue: [] }, error: { message: "暂时无法读取，请重试。" }, refreshing: false, refresh() { state.refreshes.push(path); } }; };
async function request(method, path, options) { state.requests.push({ method, path, ...options }); if (state.hold) await new Promise(resolve => state.release = resolve); if (state.thrown) throw Error("transport"); if (state.failure) return { success: false, error: { message: "保存失败，请重试。" } }; return { success: true, data: path === "/api/tasks/generate" ? { tasks: [state.candidate] } : path.includes("followup-draft") ? { assists: [{ assistId: "assist:1", participantName: "林悦", suggestedText: "请复核这段联系文案", source: { label: "已保存待办" } }] } : path.includes("message-drafts") ? { drafts: [{ ...state.draft, ...(options.body.status ? { status: options.body.status } : {}) }] } : {} }; }
const client = { patch: (p, o) => request("PATCH", p, o), post: (p, o) => request("POST", p, o) };
export const useOrbitApiClient = () => client;
export const useOrbitApiBaseUrl = () => ({ baseUrl: "https://orbit.test", ready: true });
export const useRouter = () => ({ canGoBack: () => false, push(href) { state.navigation.push(href); }, replace(href) { state.navigation.push(href); }, back() { state.navigation.push("back"); } });
export const usePathname = () => "/followups";
export const useRelationshipInboxBadgeCount = () => 0;
export const SafeAreaView = ({ edges, style, ...props }) => <View {...props} style={[style, edges?.includes("top") && { paddingTop: 48 }]} />;
export const useSafeAreaInsets = () => ({ top: 48, bottom: 24, left: 0, right: 0 });
export const Ionicons = ({ name, size, color }) => <span aria-hidden="true" style={{ fontFamily: "OrbitTestIonicons", fontSize: size, color, width: size, height: size, flexShrink: 0, lineHeight: 1 }}>{String.fromCodePoint(glyphs[name])}</span>;
`;

test.before(async () => {
  const result = await build({ stdin: { contents: 'import React from "react"; import { createRoot } from "react-dom/client"; import { FollowupsScreen } from "./src/screens/followups/FollowupsScreen"; createRoot(document.getElementById("root")).render(<FollowupsScreen />);', loader: "tsx", resolveDir: process.cwd() }, bundle: true, write: false, format: "iife", jsx: "automatic", resolveExtensions: [".web.tsx", ".web.ts", ".web.js", ".tsx", ".ts", ".jsx", ".js", ".json"], define: { "process.env.NODE_ENV": '"test"', __DEV__: "false" }, plugins: [{ name: "followup-boundaries", setup(plugin) {
    plugin.onResolve({ filter: /^react-native$/ }, () => ({ path: "native", namespace: "ink-followups" }));
    plugin.onResolve({ filter: /^react-native-svg$/ }, () => ({ path: require.resolve("react-native-svg/lib/module/ReactNativeSVG.web.js") }));
    plugin.onResolve({ filter: /^(fixture|expo-router|@expo\/vector-icons|react-native-safe-area-context)$|\/(useApiResource|useOrbitApiClient|useRelationshipInboxBadgeCount|ApiBaseUrlProvider)$/ }, () => ({ path: "fixture", namespace: "ink-followups" }));
    plugin.onLoad({ filter: /.*/, namespace: "ink-followups" }, args => ({ contents: args.path === "native" ? `
import React from "react"; import { Text as RealText, StyleSheet, useWindowDimensions as realDimensions } from "react-native-web"; import { useFixture } from "fixture"; export * from "react-native-web";
export const useWindowDimensions = () => { const s = useFixture(); return { ...realDimensions(), width: s.width, fontScale: s.fontScale }; };
export const Text = props => { const s = StyleSheet.flatten(props.style) || {}, scale = Math.min(useFixture().fontScale, props.maxFontSizeMultiplier || Infinity); return <RealText {...props} style={[props.style, s.fontSize && { fontSize: s.fontSize * scale, ...(s.lineHeight ? { lineHeight: s.lineHeight * scale } : {}) }]} />; };
` : fixture, loader: "jsx", resolveDir: process.cwd() }));
  } }] });
  script = result.outputFiles[0]!.text; browser = await chromium.launch({ headless: true });
});
test.after(async () => { await browser?.close(); });
async function open(t: { after(fn: () => Promise<void>): void }, patch: Record<string, unknown> = {}) {
  const page = await browser.newPage({ viewport: { width: Number(patch.width ?? 390), height: 844 }, deviceScaleFactor: 2, colorScheme: patch.dark ? "dark" : "light" });
  page.setDefaultTimeout(1500); const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  t.after(async () => { await page.close(); assert.deepEqual(errors, []); });
  await page.clock.install({ time: new Date("2026-09-11T05:20:00Z") });
  await page.route("**/*", r => r.abort());
  await page.setContent('<style>@font-face{font-family:OrbitTestIonicons;src:url(data:font/ttf;base64,' + iconFont + ')}html,body,#root{margin:0;height:100%}#root{display:flex;flex-direction:column}</style><div id="root"></div>');
  await page.evaluate(patch => { (window as any).initialFixture = patch; }, { tasks, contacts, candidate, draft, ...patch });
  await page.addScriptTag({ content: script }); await page.getByRole("heading").first().waitFor(); await page.evaluate(() => document.fonts.ready);
  return page;
}
async function requests(page: Page) { return page.evaluate(() => (window as any).fixture.requests); }
async function shot(page: Page, name: string) { if (process.env.APP_STYLE_SCREENSHOTS) await page.screenshot({ path: `/tmp/orbit-ink-signal-followups-${name}.png`, fullPage: true }); }

test("source followup list shows canonical contact tasks with truthful counts and date groups", async t => {
  const page = await open(t);
  await page.getByRole("heading", { name: "联系跟进", exact: true }).waitFor();
  const pending = page.getByRole("tab", { name: "待跟进 4", exact: true }); await pending.waitFor();
  assert.equal(await pending.evaluate(el => getComputedStyle(el).borderBottomColor), "rgb(11, 18, 32)");
  for (const label of ["今天 3", "之后 1"]) await page.getByRole("heading", { name: label, exact: true }).waitFor();
  assert.equal(await page.getByRole("checkbox").count(), 4);
  assert.equal(await page.getByText("林悦", { exact: true }).first().evaluate(el => getComputedStyle(el).fontSize), "15px");
  await page.getByText("产品设计师 · 云间工作室", { exact: true }).waitFor();
  for (const initial of ["林", "陈", "周", "许"]) {
    const avatar = page.getByText(initial, { exact: true }).locator("..");
    assert.notEqual(await avatar.evaluate(el => getComputedStyle(el).backgroundColor), "rgba(0, 0, 0, 0)", "initial avatars need a visible themed background");
    assert.equal(await avatar.locator("linearGradient stop").count(), 2, "reuse the existing contact-list gradient treatment");
  }
  assert.equal(await page.getByText("已取消的事项", { exact: true }).count(), 0);
  assert.equal(await page.getByText("个人待办", { exact: true }).count(), 0);
  await shot(page, "open");
  await page.getByRole("tab", { name: "已完成 1", exact: true }).click();
  assert.equal(await page.getByRole("checkbox").count(), 1);
  assert.equal(await page.getByRole("checkbox").getAttribute("aria-checked"), "true");
  const completedDetail = page.getByRole("button", { name: "查看待办：发送活动总结", exact: true });
  assert.equal(await completedDetail.getByText("今天 18:00", { exact: true }).count(), 0, "completed rows show the completion record, not the old due time");
  await completedDetail.getByText("9月10日 18:00", { exact: true }).waitFor();
  await shot(page, "completed"); assert.deepEqual(await requests(page), []);
});

test("contact and task navigation stay separate from completion with encoded real IDs", async t => {
  const page = await open(t);
  const check = (await page.getByRole("checkbox", { name: "完成：发送项目介绍", exact: true }).boundingBox())!;
  const detail = page.getByRole("button", { name: "查看待办：发送项目介绍", exact: true });
  const box = (await detail.boundingBox())!;
  assert.ok(check.width >= 44 && check.height >= 44 && box.x >= check.x + check.width);
  await page.getByRole("button", { name: "查看人脉：林悦", exact: true }).first().click();
  await detail.click();
  await page.getByRole("button", { name: "查看其他待办 1", exact: true }).click();
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.navigation), ["/contacts/contact%3A1", "/tasks/task%3A1", "/tasks"]);
  assert.deepEqual(await requests(page), []);
});

test("complete and reopen use saved status, guard double taps, and refresh only on success", async t => {
  const page = await open(t, { hold: true });
  const check = page.getByRole("checkbox", { name: "完成：发送项目介绍", exact: true });
  await check.evaluate(el => { el.dispatchEvent(new MouseEvent("click", { bubbles: true })); el.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  let writes = await requests(page); assert.equal(writes.length, 1);
  assert.equal(writes[0].path, "/api/tasks/task%3A1"); assert.equal(writes[0].body.action, "complete"); assert.ok(writes[0].body.idempotencyKey);
  await page.evaluate(() => { (window as any).fixture.update({ hold: false }); (window as any).fixture.release(); });
  await page.getByRole("tab", { name: "已完成 1", exact: true }).click();
  await page.getByRole("checkbox", { name: "恢复：发送活动总结", exact: true }).click();
  writes = await requests(page); assert.equal(writes[1].path, "/api/tasks/done%3A1"); assert.equal(writes[1].body.action, "reopen");
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.refreshes), ["/api/tasks", "/api/tasks"]);
});

for (const failure of [{ failure: true }, { thrown: true }]) test(`failed completion remains visible and can retry: ${JSON.stringify(failure)}`, async t => {
  const page = await open(t, failure); const checkbox = page.getByRole("checkbox", { name: "完成：发送项目介绍", exact: true });
  await checkbox.click(); await page.getByRole("alert").filter({ hasText: /保存失败|操作未完成/ }).waitFor();
  assert.equal(await checkbox.isEnabled(), true); assert.equal(await checkbox.getAttribute("aria-checked"), "false");
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.refreshes), []);
  await page.evaluate(() => (window as any).fixture.update({ failure: false, thrown: false }));
  await checkbox.click(); assert.equal((await requests(page)).length, 2);
});

test("candidate generation, writing assist, saved draft and review retain explicit boundaries", async t => {
  const page = await open(t, { tasks: [candidate] });
  await page.getByText("待复核建议", { exact: true }).waitFor();
  assert.equal(await page.getByRole("checkbox").count(), 0);
  for (const label of ["生成候选", "生成提醒候选", "AI 起草", "起草联系消息", "标记可确认"]) await page.getByRole("button", { name: label, exact: true }).click();
  const writes = await requests(page);
  assert.deepEqual(writes.map((r: any) => [r.method, r.path]), [["POST", "/api/tasks/generate"], ["POST", "/api/notifications/reminders/generate"], ["POST", "/api/chat/assist/followup-draft"], ["POST", "/api/message-drafts"], ["PATCH", "/api/message-drafts/draft%3A1"]]);
  assert.deepEqual(writes[0].body, { limit: 5 });
  assert.deepEqual(writes[1].body, { dueWithinDays: 14, includeGroupedLowPriority: true, limit: 5 });
  assert.deepEqual(writes[2].body, { contextNote: "确认是否方便继续讨论", organization: "候选公司", participantName: "候选联系人", sourceText: "活动中提到合作" });
  assert.deepEqual(writes[3].body, { channel: "email", contextNote: "确认是否方便继续讨论", draftKind: "follow_up", organization: "候选公司", recipientName: "候选联系人" });
  assert.deepEqual(writes[4].body, { reviewerLabel: "Orbit iOS", status: "ready_for_confirmation" });
  await page.getByText("这里只保存草稿，不会自动发送。", { exact: true }).waitFor();
});

test("saved task drafting uses its real recipient, task title and notes", async t => {
  const page = await open(t);
  await page.getByRole("button", { name: "AI 起草", exact: true }).click();
  assert.deepEqual((await requests(page))[0].body, { contextNote: "发送项目介绍", organization: "云间工作室", participantName: "林悦", sourceText: "先确认合作方向" });
});

test("missing contact metadata never blocks saved tasks or fabricates a name", async t => {
  const page = await open(t, { kinds: { "/api/contacts": "failure" } });
  await page.getByText("人脉信息暂不可用", { exact: true }).waitFor();
  assert.equal(await page.getByRole("checkbox").count(), 4);
  assert.equal(await page.getByText("林悦", { exact: true }).count(), 0);
  await page.getByRole("button", { name: "查看关联人脉", exact: true }).first().click();
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.navigation), ["/contacts/contact%3A1"]);
  await page.evaluate(() => (window as any).fixture.update({ kinds: { "/api/tasks": "failure" } }));
  await page.getByText("暂时无法读取，请重试。", { exact: true }).waitFor();
  assert.equal(await page.getByRole("checkbox").count(), 0);
  assert.equal(await page.getByRole("tab", { name: / 0$/ }).count(), 0);
  await shot(page, "error");
});

test("Tokyo date groups retain overdue, undated and contact-linked work tasks", async t => {
  const page = await open(t, { tasks: [
    { ...task, id: "overdue", title: "前一天的跟进", dueAt: "2026-09-10T14:59:00Z" },
    { ...task, id: "midnight", title: "东京零点的跟进", category: "work", dueAt: "2026-09-10T15:00:00Z" },
    { ...task, id: "undated", title: "尚未排期的跟进", dueAt: undefined, plannedDate: undefined },
    candidate,
  ] });
  for (const group of ["已逾期 1", "今天 1", "未安排 1"]) await page.getByRole("heading", { name: group, exact: true }).waitFor();
  assert.equal(await page.getByRole("checkbox").count(), 3);
  await page.getByText("待复核建议", { exact: true }).waitFor();
  assert.deepEqual(await requests(page), []);
});

test("failed real avatar requests fall back to the actual contact initial", async t => {
  const page = await open(t, { contacts: [{ ...contacts[0], avatarUrl: "/media/lin.jpg" }, ...contacts.slice(1)] });
  await page.getByText("林", { exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "查看人脉：林悦", exact: true }).count(), 1);
});

for (const variant of [{ name: "narrow-large", width: 320, fontScale: 1.6 }, { name: "narrow-double", width: 320, fontScale: 2 }, { name: "wide-dark", width: 820, dark: true }]) {
  test(`${variant.name}: followup content stays readable and contained`, async t => {
    const page = await open(t, variant);
    await page.getByRole("tab", { name: "待跟进 4", exact: true }).waitFor();
    assert.deepEqual(await page.locator('[dir="auto"]').evaluateAll(nodes => nodes.filter(n => n.scrollWidth > n.clientWidth + 1 || n.scrollHeight > n.clientHeight + 1).map(n => n.textContent)), []);
    for (const checkbox of await page.getByRole("checkbox").all()) { const b = (await checkbox.boundingBox())!; assert.ok(b.width >= 44 && b.height >= 44 && b.x >= 0 && b.x + b.width <= variant.width); }
    await shot(page, variant.name);
    await page.getByRole("button", { name: "生成候选", exact: true }).scrollIntoViewIfNeeded();
    await shot(page, `${variant.name}-tools`);
    await page.getByRole("button", { name: "AI 起草", exact: true }).scrollIntoViewIfNeeded();
    await shot(page, `${variant.name}-drafting`);
  });
}
