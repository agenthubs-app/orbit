import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { build } from "esbuild";
import { chromium, type Browser, type Page } from "playwright";

const require = createRequire(import.meta.url);
const font = readFileSync(require.resolve("@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Ionicons.ttf")).toString("base64");
let browser: Browser, script: string;
// Real screens, VM, theme and RNW execute. Only device/navigation/GET/POST
// boundaries are controlled; these tests do not constitute iOS acceptance.
const fixture = `
import React, { useSyncExternalStore } from "react";
import { View } from "react-native-web";
import glyphs from "@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json";
let revision = 0, uuid = 0; const listeners = new Set();
const state = window.fixture = { width: 390, fontScale: 1, kind: "success", notificationsKind: "success", signalsKind: "success", hasHistory: false, detail: false, requests: [], resourceReads: [], navigation: [], refreshes: [], ...window.initialFixture,
 update(patch) { Object.assign(state, patch); revision++; listeners.forEach(fn => fn()); } };
export const useFixture = () => { useSyncExternalStore(fn => { listeners.add(fn); return () => listeners.delete(fn); }, () => revision); return state; };
const effects = { calendarEntryCreated: false, externalMessageSent: false, networkRequestMade: false, notificationDelivered: false, savedRecordCreated: false };
const names = ["林悦", "程川", "陈默", "孙宁", "吴清"];
const subjects = ["周末产品交流会", "项目介绍", "合作记录", "设计师午间聚会", "上周会话摘要"];
const conversations = names.map((name, i) => ({ conversationId: "thread:" + i, contactId: "contact:" + i, participantName: name, organization: "星野社区", subject: subjects[i], preview: "请确认时间后再安排下一步。", unreadCount: i < 2 ? 1 : 0, lastCorrespondenceAt: "2026-09-11T10:24:00+09:00", nextActionLabel: "", sourceContextLabels: [] }));
const reminders = [{ reminderId: "reminder:1", title: "周末产品交流会需要准备资料", organization: "星野社区", priority: "normal", dueAt: "2026-09-12T18:00:00+09:00" }, { reminderId: "reminder:2", title: "给程川发送项目介绍", organization: "山海科技", priority: "high", dueAt: "2026-09-13T18:00:00+09:00" }];
const signal = { id: "signal:mail", displayName: "田中由纪", organization: "星野社区", role: "负责人", sourceKind: "email", signalKind: "introduction", relationshipContext: "对方希望先了解合作的范围与时间安排。", suggestedNextAction: "先核对邮件中的背景信息，再决定下一步。", occurredAt: "2026-09-11T10:24:00+09:00", confirmation: { state: "pending" }, permission: { state: "granted" }, confidence: "high", evidence: [{ excerpt: "邮件标题提到了上次交流的主题。" }] };
export const useLocalSearchParams = () => { useFixture(); return state.detail ? { id: "thread:0" } : {}; };
export const useIsFocused = () => true;
export const useRouter = () => ({ canGoBack: () => state.hasHistory, back() { state.navigation.push("back"); }, replace(path) { state.navigation.push(path); }, push(path) { state.navigation.push(path); } });
export const useApiResource = path => {
 const part = path.includes("notifications") ? "notifications" : path.includes("signals") ? "signals" : "inbox";
 const kind = part === "inbox" ? state.kind : state[part + "Kind"];
 const items = state.long ? conversations.map(c => ({ ...c, participantName: c.participantName + "与跨国项目的合作负责人", subject: c.subject + "：确认项目的分工和下一次讨论安排", preview: "请核对全部事项，确认时间后再安排下一步，不要遗漏约定的合作范围。" })) : conversations;
 const data = part === "notifications" ? { reminders: kind === "empty" ? [] : reminders }
  : part === "signals" ? { signals: state.signals ? [{ ...signal, ...(state.long ? { displayName: "田中由纪与跨国合作项目的负责人", relationshipContext: signal.relationshipContext.repeat(3), evidence: [{ excerpt: signal.evidence[0].excerpt.repeat(3) }] } : {}) }] : [] }
  : { inbox: { conversations: kind === "empty" ? [] : items }, selectedThread: state.detail ? { conversationId: "thread:0", subject: "周末产品交流会", summary: "", messages: [{ messageId: "message:0", senderRole: "contact", senderName: "林悦", body: "周末交流会安排在下午，请带上资料。", occurredAt: "2026-09-11T10:24:00+09:00" }] } : null, currentUser: { displayName: "我" }, draftReply: { body: "" }, sideEffects: effects };
 return { kind, data, error: { message: part === "notifications" ? "提醒读取失败，请重试。" : part === "signals" ? "关系线索读取失败，请重试。" : "消息读取失败，请重试。" }, refreshing: false, refresh() { state.refreshes.push(part); } };
};
// The same presentation fixture now feeds the screen's real network resource.
// Keep auxiliary/action requests separate from its initial content reads.
const client = { async get(path) {
 if (path.includes("relationship-inbox") || path === "/api/notifications" || path.includes("relationship-signals")) {
  state.resourceReads.push(path);
  const resource = useApiResource(path); if (resource.kind === "loading") return new Promise(() => {});
  return { success: resource.kind === "success" || resource.kind === "empty", status: resource.kind === "offline" ? 0 : resource.kind === "failure" ? 503 : 200, data: resource.data, error: { code: "READ_FAILED", ...resource.error }, meta: { featureMode: null, privacy: null, runtimeBoundary: null } };
 }
 state.requests.push({ method: "GET", path }); return { success: false, error: { message: "隐私控制暂时不可用。" } };
}, async post(path, options) { state.requests.push({ method: "POST", path, body: options.body }); return { success: true, data: { confirmedSignal: signal, confirmedAt: "2026-09-11T10:24:00+09:00", externalActionExecuted: false, relationshipWriteExecuted: false } }; }, async patch(path, options) { state.requests.push({ method: "PATCH", path, body: options.body }); return { success: true }; } };
export const useOrbitApiClient = () => { useFixture(); return React.useMemo(() => ({ ...client }), [revision]); };
export const useOrbitAuthSession = () => ({ ready: true, signedIn: true, user: { id: "inbox-style-actor" }, cookieHeader: "" });
export const useOrbitApiBaseUrl = () => ({ ready: true, baseUrl: "https://orbit.example" });
export const randomUUID = () => "inbox-style-" + (++uuid);
export const SafeAreaView = ({ edges, style, ...props }) => <View {...props} style={[style, { paddingTop: edges?.includes("top") ? 48 : 0 }]} />;
export const Ionicons = ({ name, size, color }) => <span aria-hidden="true" style={{ fontFamily: "OrbitTestIonicons", fontSize: size, color, width: size, height: size, flexShrink: 0, lineHeight: 1 }}>{String.fromCodePoint(glyphs[name])}</span>;
`;

test.before(async () => {
  const result = await build({ stdin: { contents: 'import React from "react"; import { createRoot } from "react-dom/client"; import { useFixture } from "fixture"; import { RelationshipInboxScreen, RelationshipInboxThreadScreen } from "./src/screens/inbox/RelationshipInboxScreen"; function App() { const s = useFixture(); return s.detail ? <RelationshipInboxThreadScreen /> : <RelationshipInboxScreen />; } createRoot(document.getElementById("root")).render(<App />);', loader: "tsx", resolveDir: process.cwd() }, bundle: true, write: false, format: "iife", jsx: "automatic", resolveExtensions: [".web.tsx", ".web.ts", ".web.js", ".tsx", ".ts", ".jsx", ".js", ".json"], define: { "process.env.NODE_ENV": '"test"', "process.env": "{}", __DEV__: "false" }, plugins: [{ name: "ink-inbox-boundaries", setup(plugin) {
    plugin.onResolve({ filter: /^react-native$/ }, () => ({ path: "native", namespace: "ink-inbox" }));
    plugin.onResolve({ filter: /^(fixture|expo-router|expo-crypto|@expo\/vector-icons|react-native-safe-area-context)$|\/(useApiResource|useOrbitApiClient|AuthSessionProvider|ApiBaseUrlProvider)$/ }, () => ({ path: "fixture", namespace: "ink-inbox" }));
    plugin.onLoad({ filter: /.*/, namespace: "ink-inbox" }, args => ({ contents: args.path === "native" ? `
import React from "react"; import { Text as RealText, TextInput as RealInput, StyleSheet, useWindowDimensions as realDimensions } from "react-native-web"; import { useFixture } from "fixture"; export * from "react-native-web";
export const useWindowDimensions = () => { const s = useFixture(); return { ...realDimensions(), width: s.width, fontScale: s.fontScale }; };
function scaled(style, scale) { const s = StyleSheet.flatten(style) || {}; return [style, s.fontSize && { fontSize: s.fontSize * scale, ...(s.lineHeight ? { lineHeight: s.lineHeight * scale } : {}) }]; }
export const Text = props => <RealText {...props} style={scaled(props.style, useFixture().fontScale)} />;
export const TextInput = props => <RealInput {...props} style={scaled(props.style, useFixture().fontScale)} />;
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
  await page.setContent('<style>@font-face{font-family:OrbitTestIonicons;src:url(data:font/ttf;base64,' + font + ')}html,body,#root{margin:0;height:100%}#root{display:flex;flex-direction:column}</style><div id="root"></div>');
  await page.evaluate(patch => { (window as any).initialFixture = patch; }, patch);
  await page.addScriptTag({ content: script }); await page.getByRole("heading").first().waitFor(); await page.evaluate(() => document.fonts.ready);
  return page;
}
async function shot(page: Page, name: string) { if (process.env.APP_STYLE_SCREENSHOTS) await page.screenshot({ path: `/tmp/orbit-ink-signal-inbox-${name}.png`, fullPage: true }); }
async function requests(page: Page) { return page.evaluate(() => (window as any).fixture.requests); }
async function textBounds(page: Page) {
  return page.locator('[dir="auto"]').evaluateAll(els => els.filter(el => el.textContent?.trim()).filter(el => {
    const s = getComputedStyle(el), b = el.getBoundingClientRect();
    return s.visibility !== "hidden" && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1 || b.x < 0 || b.right > innerWidth + 1);
  }).map(el => el.textContent));
}

test("inbox uses compact fixed header and source ink tabs above the working search", async t => {
  const page = await open(t);
  const title = page.getByRole("heading", { name: "收件箱", exact: true });
  assert.equal(await title.evaluate(el => getComputedStyle(el).fontSize), "16px");
  assert.ok((await title.boundingBox())!.y < 96);
  const tab = page.getByRole("tab", { name: "消息", exact: true });
  assert.equal(await tab.evaluate(el => getComputedStyle(el).borderBottomColor), "rgb(11, 18, 32)");
  assert.equal(await tab.getByText("消息", { exact: true }).evaluate(el => getComputedStyle(el).fontSize), "14px");
  assert.ok((await tab.boundingBox())!.y < (await page.getByRole("textbox").boundingBox())!.y);
  assert.equal(await page.getByRole("button", { name: "全部已读", exact: true }).count(), 0);
  assert.equal(await page.getByText("已显示最近 30 天", { exact: true }).count(), 0);
  assert.deepEqual(await requests(page), []); await shot(page, "list");
});

test("read and unread messages share the 20pt source gutter and compact row spacing", async t => {
  const page = await open(t);
  const first = page.getByRole("button", { name: /^林悦，/ });
  const read = page.getByRole("button", { name: /^陈默，/ });
  assert.equal(await first.evaluate(el => getComputedStyle(el).paddingTop), "14px");
  assert.equal((await first.boundingBox())!.x, 16);
  assert.equal((await page.getByText("林悦", { exact: true }).boundingBox())!.x, 36);
  assert.equal((await page.getByText("陈默", { exact: true }).boundingBox())!.x, 36);
  assert.ok((await first.boundingBox())!.height < 126);
  assert.equal(await first.locator('[aria-hidden="true"]').count(), 1);
  assert.equal(await read.locator('[aria-hidden="true"]').count(), 0);
  await read.click(); assert.deepEqual(await page.evaluate(() => (window as any).fixture.navigation), ["/inbox/thread%3A2"]);
  assert.deepEqual(await requests(page), []);
});

test("no-history inbox returns to the selected home parent and history uses actual back", async t => {
  const page = await open(t);
  await page.getByRole("button", { name: "首页", exact: true }).click();
  await page.evaluate(() => (window as any).fixture.update({ hasHistory: true }));
  await page.getByRole("button", { name: "返回", exact: true }).click();
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.navigation), ["/home", "back"]);
});

test("large-text search hint fits the field and retains the full accessible search scope", async t => {
  const page = await open(t, { width: 320, fontScale: 2 });
  const input = page.getByRole("textbox", { name: "搜索姓名、主题或内容", exact: true });
  assert.equal(await input.getAttribute("placeholder"), "搜索消息");
  const fits = await input.evaluate(el => {
    const input = el as HTMLInputElement, style = getComputedStyle(input);
    const context = document.createElement("canvas").getContext("2d")!;
    context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    return context.measureText(input.placeholder).width <= input.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
  });
  assert.equal(fits, true);
  await input.fill("程川");
  assert.equal(await input.inputValue(), "程川");
  assert.equal(await page.getByText("程川", { exact: true }).count(), 1);
  assert.equal(await page.getByText("林悦", { exact: true }).count(), 0);
});

for (const kind of ["failure", "loading"]) test(`reminder ${kind} is not presented as an empty successful inbox`, async t => {
  const page = await open(t, { notificationsKind: kind });
  await page.getByRole("tab", { name: "提醒", exact: true }).click();
  await page.getByText(kind === "loading" ? "正在读取提醒。" : "提醒读取失败，请重试。", { exact: true }).waitFor();
  assert.equal(await page.getByText("暂无提醒", { exact: true }).count(), 0);
  if (kind === "failure") {
    await page.getByRole("button", { name: "重试读取提醒", exact: true }).click();
    assert.equal(await page.evaluate(() => (window as any).fixture.resourceReads.filter((path: string) => path === "/api/notifications").length), 2);
  }
  assert.deepEqual(await requests(page), []); await shot(page, `reminders-${kind}`);
});

test("reminders and relationship signals keep real counts, local dismiss and explicit confirmation", async t => {
  const page = await open(t, { signals: true });
  await page.getByRole("tab", { name: "提醒 3", exact: true }).click();
  await page.getByText("田中由纪", { exact: true }).waitFor();
  await shot(page, "alerts");
  await page.getByRole("button", { name: "忽略", exact: true }).first().click();
  await page.getByRole("tab", { name: "提醒 2", exact: true }).waitFor();
  assert.deepEqual(await requests(page), []);
  await page.getByRole("button", { name: "确认线索", exact: true }).click();
  await page.getByText("线索已确认", { exact: true }).waitFor();
  const calls = await requests(page); assert.equal(calls.length, 1); assert.equal(calls[0].method, "POST");
  assert.equal(calls[0].path, "/api/relationship-signals/signal%3Amail/confirm");
  assert.deepEqual(calls[0].body, { actorLabel: "Orbit iOS" });
  assert.equal(await page.evaluate(() => (window as any).fixture.resourceReads.filter((path: string) => path === "/api/relationship-signals/email-calendar").length), 2);
});

test("unavailable relationship signals do not claim the source is empty", async t => {
  const page = await open(t, { signalsKind: "failure" });
  await page.getByRole("tab", { name: "提醒 2", exact: true }).click();
  await page.getByText("关系线索读取失败，请重试。", { exact: true }).waitFor();
  assert.equal(await page.getByText(/暂无.*线索/).count(), 0);
  assert.deepEqual(await requests(page), []);
  await shot(page, "signals-failure");
});

test("empty and failed message resources never imply successful message contents", async t => {
  const page = await open(t, { kind: "empty" });
  await page.getByText("暂无消息", { exact: true }).waitFor(); await shot(page, "empty");
  await page.evaluate(() => (window as any).fixture.update({ kind: "failure" }));
  await page.getByText("消息读取失败，请重试。", { exact: true }).waitFor();
  assert.equal(await page.getByText("暂无消息", { exact: true }).count(), 0);
  assert.equal(await page.getByRole("button", { name: "写消息", exact: true }).count(), 0);
  await shot(page, "failure");
});

for (const variant of [{ name: "narrow-large", width: 320, fontScale: 1.6 }, { name: "narrow-double", width: 320, fontScale: 2 }, { name: "wide-dark", width: 820, fontScale: 1, dark: true }]) {
  test(`${variant.name}: complete text and reachable controls across list, alerts, composer and detail`, async t => {
    const page = await open(t, { ...variant, long: true, signals: true });
    async function check(name: string) {
      assert.deepEqual(await textBounds(page), [], `${name} text bounds`);
      const headerY = (await page.getByRole("heading").first().boundingBox())!.y;
      await shot(page, `${variant.name}-${name}`);
      for (const role of ["button", "tab"] as const) for (const control of await page.getByRole(role).all()) {
        await control.scrollIntoViewIfNeeded(); const box = await control.boundingBox();
        assert.ok(box && box.height >= 44 && box.x >= 0 && box.x + box.width <= variant.width + 1 && box.y >= 48 && box.y + box.height <= 845, `${name} ${await control.textContent()} ${JSON.stringify(box)}`);
      }
      await page.evaluate(() => {
        for (const el of document.querySelectorAll<HTMLElement>("div")) {
          if (/auto|scroll/.test(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight) el.scrollTop = el.scrollHeight;
        }
      });
      assert.equal((await page.getByRole("heading").first().boundingBox())!.y, headerY, "the navigation title stays fixed while the body scrolls");
      await shot(page, `${variant.name}-${name}-bottom`);
    }
    await check("list");
    await page.getByRole("tab", { name: "提醒 3", exact: true }).click(); await check("alerts");
    await page.getByRole("button", { name: "写消息", exact: true }).click(); await check("composer");
    await page.getByRole("button", { name: "取消", exact: true }).click();
    await page.evaluate(() => (window as any).fixture.update({ detail: true })); await check("detail");
    assert.deepEqual(await requests(page), []);
  });
}
