import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { createRequire } from "node:module";
import test from "node:test";
import { build } from "esbuild";
import { chromium, type Browser, type Page } from "playwright";

const require = createRequire(import.meta.url);
let browser: Browser;
let server: Server;
let url: string;

// Replace native/navigation and HTTP boundaries only. Real screen, hooks,
// view-models, styles and RN Web handlers execute in Chromium.
const fixture = `
import React, { useSyncExternalStore } from "react";
const listeners = new Set(); let revision = 0;
const subscribe = listener => { listeners.add(listener); return () => listeners.delete(listener); };
const emit = () => { revision++; listeners.forEach(listener => listener()); };
const rerender = () => useSyncExternalStore(subscribe, () => revision);
const conversations = [
  { conversationId: "thread:wei", contactId: "contact:wei", participantName: "曾伟", organization: "Orbit", subject: "活动安排", preview: "周四见面，带上资料。", unreadCount: 2, lastCorrespondenceAt: "2026-06-28T13:00:00+09:00", nextActionLabel: "Review relationship context before external follow-up", sourceContextLabels: [] },
  { conversationId: "thread:hu", contactId: "contact:hu", participantName: "胡家明", organization: "Example", subject: "项目进度", preview: "下周讨论预算。", unreadCount: 0, lastCorrespondenceAt: "2026-06-27T13:00:00+09:00", nextActionLabel: "", sourceContextLabels: [] }
];
const effects = { calendarEntryCreated: false, externalMessageSent: false, networkRequestMade: false, notificationDelivered: false, savedRecordCreated: false };
const thread = { conversationId: "thread:wei", subject: "活动安排", summary: "先复核关系上下文。", sourceContextLabels: [], messages: [{ messageId: "message:wei", senderRole: "contact", senderName: "曾伟", body: "周四见面，带上资料。", occurredAt: "2026-06-28T13:00:00+09:00" }] };
const state = window.fixture = { requests: [], navigation: [], detail: false, failure: false, hold: false, seed: {}, kind: "success", emptyMessages: false,
  update(patch) { Object.assign(state, patch); emit(); }
};
export const useLocalSearchParams = () => { rerender(); return state.detail ? { id: "thread:wei" } : state.seed; };
export const usePathname = () => "/inbox";
export const useRouter = () => ({ canGoBack: () => true, back() { state.navigation.push("back"); }, replace(path) { state.navigation.push(path); }, push(path) { state.navigation.push(path); } });
export const useApiResource = path => {
  rerender();
  if (state.kind !== "success") return { kind: state.kind, error: { message: "连接暂时失败" }, refreshing: false, refresh() {} };
  const data = path.includes("notifications") ? { reminders: Array.from({ length: 8 }, (_, i) => ({ reminderId: "reminder:" + i, title: "联系提醒" + i, contactName: "联系人" + i, organization: "Orbit", priority: "normal", dueAt: "2026-09-09T13:00:00+09:00" })) }
    : path.includes("signals") ? { signals: [] }
    : { inbox: { conversations }, selectedThread: state.detail ? { ...thread, messages: state.emptyMessages ? Array.from({ length: 10 }, (_, i) => ({ ...thread.messages[0], messageId: "empty:" + i, senderRole: "orbit_user", body: "", occurredAt: "2026-06-" + String(i + 1).padStart(2, "0") + "T13:00:00+09:00" })) : thread.messages } : null, currentUser: { displayName: "我" }, draftReply: { body: "" }, sideEffects: effects };
  return { kind: "success", data, refreshing: false, refresh() {} };
};
const client = {
  async get() { return { success: false, error: { message: "暂时不可用" } }; },
  async post(path, options) {
    state.requests.push({ path, body: options.body });
    if (state.hold) await new Promise(resolve => { state.release = resolve; });
    if (state.failure) return { success: false, error: { message: "连接暂时失败" } };
    const draft = options.body;
    return { success: true, data: { inboxItem: { ...conversations[0], participantName: draft.participantName, subject: draft.subject }, thread: { ...thread, subject: draft.subject, messages: [{ ...thread.messages[0], senderRole: "orbit_user", body: draft.body }] }, sideEffects: effects } };
  }
};
export const useOrbitApiClient = () => client;
export const SafeAreaView = ({ children, edges, ...props }) => <div>{children}</div>;
export const Ionicons = () => <span aria-hidden="true" />;
`;

test.before(async () => {
  const result = await build({
    stdin: { contents: `import React from "react"; import { createRoot } from "react-dom/client"; import { RelationshipInboxScreen, RelationshipInboxThreadScreen } from "./src/screens/inbox/RelationshipInboxScreen"; const root = createRoot(document.getElementById("root")); window.openDetail = () => { window.fixture.update({ detail: true }); root.render(<RelationshipInboxThreadScreen />); }; root.render(<RelationshipInboxScreen />);`, resolveDir: process.cwd(), loader: "tsx" },
    bundle: true, write: false, format: "iife", jsx: "automatic",
    define: { "process.env.NODE_ENV": '"test"', __DEV__: "false" },
    plugins: [{ name: "inbox-boundaries", setup(plugin) {
      plugin.onResolve({ filter: /^react-native$/ }, () => ({ path: require.resolve("react-native-web") }));
      plugin.onResolve({ filter: /^(expo-router|@expo\/vector-icons|react-native-safe-area-context)$|\/(useApiResource|useOrbitApiClient)$/ }, () => ({ path: "fixture", namespace: "inbox-test" }));
      plugin.onLoad({ filter: /.*/, namespace: "inbox-test" }, () => ({ contents: fixture, loader: "jsx", resolveDir: process.cwd() }));
    } }],
  });
  server = createServer((_request, response) => {
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end(`<div id="root"></div><script>${result.outputFiles[0]!.text}</script>`);
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  url = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({ headless: true });
});

test.after(async () => {
  await browser?.close();
  if (server) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});

async function openScreen(t: { after: (fn: () => Promise<void>) => void }): Promise<Page> {
  const page = await browser.newPage({ viewport: { width: 402, height: 874 } });
  page.setDefaultTimeout(2000);
  t.after(() => page.close());
  await page.route("**/*", route => route.request().url().startsWith(url) ? route.continue() : route.abort());
  await page.goto(url);
  await page.getByText("曾伟", { exact: true }).waitFor();
  return page;
}

test("mail inbox searches actual sender, subject and body without exposing workflow instructions", async t => {
  const page = await openScreen(t);
  const search = page.getByRole("textbox", { name: "搜索姓名、主题或内容", exact: true });
  assert.ok((await search.boundingBox())!.height >= 44, "the editable search target must be at least 44pt");
  for (const query of ["曾伟", "活动安排", "资料", " orbit "]) {
    await search.fill(query);
    assert.equal(await page.getByText("曾伟", { exact: true }).count(), 1);
    assert.equal(await page.getByText("胡家明", { exact: true }).count(), 0);
  }
  await search.fill("不存在");
  await page.getByText("没有找到消息", { exact: true }).waitFor();
  await search.fill("");
  assert.equal(await page.getByText("胡家明", { exact: true }).count(), 1);
  assert.equal(await page.getByText("复核关系上下文后再决定是否外发。", { exact: true }).count(), 0);
  await page.getByRole("button", { name: /曾伟.*未读/ }).click();
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.navigation), ["/inbox/thread%3Awei"]);
});

test("writing a message is a focused editor and cancel restores the inbox without requests", async t => {
  const page = await openScreen(t);
  await page.getByRole("button", { name: "写消息", exact: true }).click();
  assert.equal(await page.getByText("曾伟", { exact: true }).count(), 0);
  assert.equal(await page.getByRole("textbox", { name: "搜索姓名、主题或内容" }).count(), 0);
  assert.equal(await page.getByRole("textbox", { name: "正文", exact: true }).inputValue(), "");
  assert.equal(await page.getByRole("textbox", { name: "主题", exact: true }).inputValue(), "");
  await page.getByRole("textbox", { name: "收件人", exact: true }).fill("王明");
  await page.getByRole("button", { name: "取消", exact: true }).click();
  assert.equal(await page.getByText("曾伟", { exact: true }).count(), 1);
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.requests), []);
});

test("reminder tab exposes every reminder and does not mix mail rows into the same list", async t => {
  const page = await openScreen(t);
  await page.getByRole("tab", { name: "提醒 8", exact: true }).click();
  assert.equal(await page.getByText("暂无关系线索", { exact: true }).count(), 0);
  assert.equal(await page.getByText("曾伟", { exact: true }).count(), 0);
  await page.getByText("联系提醒7", { exact: true }).waitFor();
  await page.getByRole("button", { name: /忽略/ }).first().click();
  assert.equal(await page.getByText("联系提醒0", { exact: true }).count(), 0);
  await page.getByRole("tab", { name: "提醒 7", exact: true }).waitFor();
  await page.getByRole("tab", { name: "消息", exact: true }).click();
  await page.getByText("曾伟", { exact: true }).waitFor();
});

test("draft creation retains input on failure and clearly identifies a non-persistent preview", async t => {
  const page = await openScreen(t);
  await page.getByRole("button", { name: "写消息", exact: true }).click();
  await page.getByRole("textbox", { name: "收件人", exact: true }).fill("王明");
  await page.getByRole("textbox", { name: "主题", exact: true }).fill("见面时间");
  await page.getByRole("textbox", { name: "正文", exact: true }).fill("周四下午方便吗？");
  await page.evaluate(() => { (window as any).fixture.failure = true; });
  await page.getByRole("button", { name: "预览草稿", exact: true }).click();
  await page.getByText("连接暂时失败", { exact: true }).waitFor();
  assert.equal(await page.getByRole("textbox", { name: "正文", exact: true }).inputValue(), "周四下午方便吗？");
  await page.evaluate(() => { (window as any).fixture.failure = false; });
  await page.getByRole("button", { name: "预览草稿", exact: true }).click();
  await page.getByText("仅在本页预览，尚未保存或发送。", { exact: true }).waitFor();
  await page.getByText("收件人：王明", { exact: true }).waitFor();
  assert.equal(await page.getByText("胡家明", { exact: true }).count(), 0);
  const requests = await page.evaluate(() => (window as any).fixture.requests);
  assert.equal(requests.length, 2);
  assert.equal(requests[1].path, "/api/chat/relationship-inbox");
  assert.equal(requests[1].body.body, "周四下午方便吗？");
  await page.getByRole("button", { name: "继续编辑", exact: true }).click();
  assert.equal(await page.getByRole("textbox", { name: "收件人", exact: true }).inputValue(), "王明");
  assert.equal(await page.getByRole("textbox", { name: "正文", exact: true }).inputValue(), "周四下午方便吗？");
});

test("pending draft preview locks cancellation and duplicate submission until it finishes", async t => {
  const page = await openScreen(t);
  await page.getByRole("button", { name: "写消息", exact: true }).click();
  await page.getByRole("textbox", { name: "收件人", exact: true }).fill("王明");
  await page.getByRole("textbox", { name: "主题", exact: true }).fill("时间");
  await page.getByRole("textbox", { name: "正文", exact: true }).fill("周四见。");
  await page.evaluate(() => { (window as any).fixture.hold = true; });
  await page.getByRole("button", { name: "预览草稿", exact: true }).click();
  assert.equal(await page.getByRole("button", { name: "取消", exact: true }).isDisabled(), true);
  assert.equal(await page.getByRole("button", { name: "正在准备", exact: true }).isDisabled(), true);
  assert.equal(await page.getByRole("textbox", { name: "正文", exact: true }).isEditable(), false);
  await page.evaluate(() => (window as any).fixture.release());
  await page.getByText("仅在本页预览，尚未保存或发送。", { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => (window as any).fixture.requests.length), 1);
});

for (const kind of ["loading", "offline", "failure"]) {
  test(`${kind} inbox always leaves a way back and cannot enter an invisible composer`, async t => {
    const page = await openScreen(t);
    await page.evaluate(kind => (window as any).fixture.update({ kind, seed: { participantName: "王明" } }), kind);
    await page.getByRole("button", { name: "返回", exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "写消息", exact: true }).count(), 0);
    await page.getByRole("button", { name: "返回", exact: true }).click();
    assert.deepEqual(await page.evaluate(() => (window as any).fixture.navigation), ["back"]);
  });
}

test("reply preview is local and privacy controls are available without crowding message reading", async t => {
  const page = await openScreen(t);
  await page.evaluate(() => (window as any).openDetail());
  const reply = page.getByRole("textbox", { name: "回复正文", exact: true });
  await reply.waitFor();
  assert.equal(await reply.inputValue(), "");
  assert.equal(await page.getByText("隐私控制暂时不可用。", { exact: true }).count(), 0);
  await reply.fill("周四见。");
  await page.getByRole("button", { name: "预览回复", exact: true }).click();
  await page.getByText("仅在本页预览，尚未保存或发送。", { exact: true }).waitFor();
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.requests), []);
  await page.getByRole("button", { name: "继续编辑", exact: true }).click();
  assert.equal(await reply.inputValue(), "周四见。");
  await page.getByRole("button", { name: "隐私设置", exact: true }).click();
  await page.getByText("隐私控制暂时不可用。", { exact: true }).waitFor();
});

test("empty-body history is visibly counted and expandable without burying the reply editor", async t => {
  const page = await openScreen(t);
  await page.evaluate(() => { (window as any).fixture.update({ emptyMessages: true }); (window as any).openDetail(); });
  await page.getByText("联系人：曾伟", { exact: true }).waitFor();
  await page.getByText("10 条记录没有可显示的正文。", { exact: true }).waitFor();
  assert.equal(await page.getByText("暂无消息正文", { exact: true }).count(), 0);
  const replyBox = await page.getByRole("textbox", { name: "回复正文", exact: true }).boundingBox();
  assert.ok(replyBox && replyBox.y + replyBox.height < 874);
  await page.getByRole("button", { name: "展开无正文记录", exact: true }).click();
  assert.equal(await page.getByText("暂无消息正文", { exact: true }).count(), 10);
  await page.getByRole("button", { name: "收起无正文记录", exact: true }).click();
  assert.equal(await page.getByText("暂无消息正文", { exact: true }).count(), 0);
});
