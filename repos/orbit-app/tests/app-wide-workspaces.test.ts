import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { createRequire } from "node:module";
import test from "node:test";
import { build } from "esbuild";
import { chromium, type Browser, type Locator, type Page } from "playwright";

const require = createRequire(import.meta.url);
let browser: Browser, server: Server, url: string;
// Only native services, routing and HTTP are replaced. Real screen state,
// presentation, view-model decoding and action handlers run in the browser.
const fixture = `
import React, { useSyncExternalStore } from "react";
import { View } from "react-native";
let revision = 0; const listeners = new Set();
const rerender = () => useSyncExternalStore(fn => { listeners.add(fn); return () => listeners.delete(fn); }, () => revision);
const state = window.fixture = { kind: "success", empty: false, requests: [], navigation: [], refreshes: [], update(patch) { Object.assign(state, patch); revision++; listeners.forEach(fn => fn()); } };
const screen = new URLSearchParams(location.search).get("screen");
const finalInsets = new URLSearchParams(location.search).get("insets") === "true";
const task = { id: "task-one", taskId: "task-one", title: "确认合作时间", notes: "带上合作资料", category: "relationship", status: "open", priority: "normal", plannedDate: "2026-09-08", dueAt: "2026-09-08T10:00:00+09:00", createdAt: "2026-09-07T01:00:00Z", updatedAt: "2026-09-07T01:00:00Z", contactName: "林悦", organization: "Orbit", source: "manual" };
const conversation = { conversationId: "thread-one", participantContactId: "person-one", participantName: "林悦", organization: "Orbit", title: "合作讨论", status: "needs_followup", unreadCount: 1, lastMessagePreview: "周四讨论合作资料", lastMessageAt: "2026-09-07T01:00:00Z" };
const event = { id: "event-one", eventId: "event-one", title: "合作交流会", startsAt: "2026-09-08T14:00:00+09:00", endsAt: "2026-09-08T15:00:00+09:00", date: "2026-09-08", location: "东京", venue: "东京", status: "published" };
const entry = { entryId: "action-one", runId: "run-one", workflowKey: "post_event_followup_v1", contactName: "林悦", organization: "Orbit", title: "建立会后待办", preview: "确认合作资料", whyNow: "延续活动讨论", status: "awaiting_confirmation", riskLevel: "write", undoable: true, createdAt: "2026-09-07T01:00:00Z", updatedAt: "2026-09-07T01:00:00Z", evidenceIds: [], evidenceChips: [], sourceRefs: [], operations: [{ operationId: "operation-one", operationType: "create_followup_task", title: "创建会后待办", effectSummary: "创建任务，不会自动发送消息。", status: "pending", selectedByDefault: true, autoSendCapable: false, idempotencyKey: "operation-one:v1" }] };
function dataFor(path) {
  if (finalInsets && path.startsWith("/api/ai/conversations")) return { activeConversationId: "thread-one", messages: [{ messageId: "question", role: "user", content: "整理联系人、活动、跟进、日程和个人档案。", createdAt: "2026-09-07T01:00:00Z" }, { messageId: "reply", role: "assistant", content: "可以先核对合作背景。", createdAt: "2026-09-07T01:00:01Z" }], proposedToolIntents: [{ intentId: "intent:style", label: "核对合作信息", reason: "先确认事实再行动", requiresUserConfirmation: true }], taskInteraction: { state: "suggested", title: "待确认的采购讨论", category: "relationship", reason: "先检查安排", suggestionId: "suggestion:style", taskId: "" }, aiRuns: [{ runId: "ai-run-style" }] };
  if (finalInsets && path === "/api/contacts") return { contacts: [{ id: "person-one", displayName: "林悦", organization: "Orbit", role: "采购负责人", status: "active" }] };
  if (finalInsets && path === "/api/events") return { events: [event] };
  if (finalInsets && path === "/api/profile") return { profile: { displayName: "资料里的林悦", headline: "连接采购合作", organization: "Orbit", offering: ["本地渠道"], seeking: ["采购伙伴"] } };
  if (finalInsets && path.includes("extractions")) return { extractedNeeds: [{ needId: "need:style", statement: "寻找日本采购合作伙伴", priority: "high" }], extractedTasks: [], relationshipProfileUpdates: [], confirmationRequiredProfileSuggestions: [], provenance: { sourceLabel: "对话记录" } };
  if (screen === "inboxThread" && path.includes("relationship-inbox")) return { inbox: { conversations: [{ ...conversation, contactId: "person-one", subject: "合作讨论" }] }, currentUser: { displayName: "我" }, selectedThread: { conversationId: "thread-one", subject: "合作讨论", summary: "先复核关系上下文", sourceContextLabels: [], messages: [{ messageId: "message-one", senderRole: "contact", senderName: "林悦", body: "周四讨论合作资料", occurredAt: "2026-09-07T01:00:00Z" }] }, draftReply: { body: "" }, sideEffects: {} };
  if (path === "/api/agent/ledger") return { entries: state.empty ? [] : [entry], state: "success", nextAction: "确认或稍后处理", summary: "1 条待确认" };
  if (path === "/api/agent/actions") return { actions: state.empty ? [] : [{ actionId: "action-one", actionType: "post_event_followup", contactName: "林悦", title: "确认合作资料", recommendedAction: "确认时间", confirmationRequired: true, externalSideEffectExecuted: false, priority: "high" }] };
  if (path.includes("sessions")) return { sessions: state.empty ? [] : [{ id: "session-one", title: "合作计划", messages: [{ role: "user", content: "讨论合作时间", createdAt: "2026-09-07T01:00:00Z" }], updatedAt: "2026-09-07T01:00:00Z", createdAt: "2026-09-07T01:00:00Z", pinned: true }] };
  if (path.startsWith("/api/ai/conversations")) return screen === "conversation" ? { activeConversationId: "thread-one", messages: [{ messageId: "reply", role: "assistant", content: "可以先确认周四的合作时间。", createdAt: "2026-09-07T01:00:00Z" }], proposedToolIntents: [] } : {};
  if (path.includes("relationship-inbox")) return { inbox: { conversations: [{ ...conversation, contactId: "person-one", subject: "合作讨论", preview: "周四讨论合作资料", lastCorrespondenceAt: "2026-09-07T01:00:00Z", nextActionLabel: "", sourceContextLabels: [] }] }, currentUser: { displayName: "我" }, selectedThread: null, sideEffects: {} };
  if (path.includes("extractions")) return {};
  if (path.startsWith("/api/chat/conversations/")) return { conversation, messages: [{ messageId: "message-one", body: "周四讨论合作资料", senderRole: "contact", senderName: "林悦", createdAt: "2026-09-07T01:00:00Z" }], sendMessageState: { canSendInMock: true, confirmationRequiredBeforeLiveSend: true, status: "ready" } };
  if (path === "/api/chat/conversations") return { conversations: state.empty ? [] : [conversation] };
  if (path.includes("activities")) return { activities: [] };
  if (path.startsWith("/api/tasks/")) return { task };
  if (path.startsWith("/api/tasks")) return { tasks: state.empty ? [] : screen === "schedule" ? [task] : [task, { ...task, id: "completed-one", taskId: "completed-one", status: "completed", title: "已经完成的资料核对" }] };
  if (path.startsWith("/api/today")) return { date: "2026-09-08", timeZone: "Asia/Tokyo", tasks: state.empty ? [] : [task], suggestions: [{ id: "suggestion-one", title: "确认参会伙伴", reason: "安排会面", category: "relationship", status: "pending" }], schedule: [], completedCount: 1 };
  if (path.startsWith("/api/events/public/")) return { event };
  if (path === "/api/events/public") return { events: state.empty ? [] : [event] };
  if (path === "/api/schedule-items") return { scheduleItems: [] };
  return {};
}
export const useApiResource = path => { rerender(); return { kind: state.kind, data: dataFor(path), error: { message: "连接暂时失败" }, refreshing: false, refresh() { state.refreshes.push(path); } }; };
const client = Object.fromEntries(["get", "post", "patch", "delete", "put"].map(method => [method, async (path, options) => {
  state.requests.push({ method, path, body: options?.body });
  if (finalInsets) {
    if (method === "get" && path === "/api/ai/runs/ai-run-style") return { success: true, data: { run: { runId: "ai-run-style", promptTemplateId: "style-review", evidenceIds: ["evidence:style"], output: { text: "可以先核对采购合作资料。" } }, summary: "已核对会话来源", nextAction: "检查依据后继续" } };
    if (method === "post" && path === "/api/chat/conversations/thread-one/messages") return { success: true, data: { conversationId: "thread-one", oneToOneContext: { participantName: "林悦", contactId: "person-one", organization: "Orbit" }, messages: [{ messageId: "draft:style", body: options.body.body, senderRole: "orbit_user", createdAt: "2026-09-08T03:00:00Z" }], sendMessageState: { canSendInMock: true, confirmationRequiredBeforeLiveSend: true, status: "ready" } } };
    if (method === "get" && path === "/api/chat/privacy?conversationId=thread-one") return { success: true, data: { conversationId: "thread-one", participantName: "林悦", organization: "Orbit", analysisOptIn: { enabled: true, status: "opted_in" }, analysisDeletion: { status: "available" }, sensitiveShareConfirmation: { confirmationRequired: true, status: "required" }, privateNotes: [], state: "success" } };
    if (method === "post" && path === "/api/chat/assist/rewrite") return { success: true, data: { assists: [{ assistId: "assist:style", label: "润色建议", rationale: "先核对时间", source: { label: "合作讨论" }, suggestedText: "周四可以一起核对合作资料。" }], state: "success" } };
  }
  return { success: false, error: { message: "操作暂时失败" } };
}]));
export const useOrbitApiClient = () => client;
export const useLocalSearchParams = () => ({ id: screen === "task" ? "task-one" : "thread-one" });
export const usePathname = () => "/" + screen;
export const useRouter = () => ({ canGoBack: () => true, back() { state.navigation.push("back"); }, push(path) { state.navigation.push(path); }, replace(path) { state.navigation.push(path); } });
export const useOrbitApiBaseUrl = () => ({ baseUrl: "https://orbit.test" });
export const useOrbitAuthSession = () => ({ ready: true, user: { id: "reader", name: "林悦", email: "reader@example.test" } });
export const useRelationshipInboxBadgeCount = () => 0;
export const SafeAreaView = ({ edges, ...props }) => <View {...props} />;
export const useSafeAreaInsets = () => ({ top: 0, bottom: 0, left: 0, right: 0 });
export const Ionicons = () => <span aria-hidden="true" />;
export const randomUUID = () => "test-uuid";
export const notifyReminderPlansChanged = () => {};
export const requestNotificationPermission = async () => "denied";
`;

test.before(async () => {
  const screens = { ai: "ai/AiScreen", conversation: "ai/AiConversationScreen", actions: "ai/AgentActionsScreen", chat: "chat/RelationshipChatScreen", thread: "chat/RelationshipChatDetailScreen", inbox: "inbox/RelationshipInboxScreen", inboxThread: "inbox/RelationshipInboxScreen", today: "today/TodayScreen", tasks: "tasks/TasksScreen", task: "tasks/TaskDetailScreen", schedule: "schedule/ScheduleScreen", preview: "schedule/ScheduleEventPreviewScreen", followups: "followups/FollowupsScreen", ledger: "agent/AgentLedgerScreen" };
  const imports = Object.entries(screens).map(([key, path]) => `import { ${key === "ledger" ? "AllActionsAgentLedgerScreen" : key === "inboxThread" ? "RelationshipInboxThreadScreen" : path.split("/")[1]} as ${key} } from "./src/screens/${path}";`).join("\n");
  const result = await build({ stdin: { contents: `${imports}\nimport React from "react"; import { createRoot } from "react-dom/client"; const screens = { ${Object.keys(screens).join(",")} }; const Screen = screens[new URLSearchParams(location.search).get("screen")]; createRoot(document.getElementById("root")).render(<Screen />);`, loader: "tsx", resolveDir: process.cwd() }, bundle: true, write: false, format: "iife", jsx: "automatic", resolveExtensions: [".web.tsx", ".web.ts", ".web.js", ".tsx", ".ts", ".jsx", ".js", ".json"], define: { "process.env.NODE_ENV": '"test"', __DEV__: "false" }, plugins: [{ name: "workspace-boundaries", setup(plugin) {
    plugin.onResolve({ filter: /^react-native$/ }, () => ({ path: "native", namespace: "workspace-native" }));
    // RN Web hardcodes fontScale=1. Replace this native dimension value only;
    // the real native-web elements, press handlers and layout stay intact.
    plugin.onLoad({ filter: /.*/, namespace: "workspace-native" }, () => ({ contents: `export * from ${JSON.stringify(require.resolve("react-native-web"))}; import { useWindowDimensions as realDimensions } from ${JSON.stringify(require.resolve("react-native-web"))}; import { useSyncExternalStore } from "react"; export function useWindowDimensions() { const dimensions = realDimensions(); const fontScale = useSyncExternalStore(listener => { window.addEventListener("workspace-fontscale", listener); return () => window.removeEventListener("workspace-fontscale", listener); }, () => window.fixture?.fontScale || 1); return { ...dimensions, fontScale }; }`, loader: "js", resolveDir: process.cwd() }));
    plugin.onResolve({ filter: /^(expo-router|@expo\/vector-icons|react-native-safe-area-context|expo-crypto)$|\/(useApiResource|useOrbitApiClient|ApiBaseUrlProvider|AuthSessionProvider|useRelationshipInboxBadgeCount|native-notifications)$/ }, () => ({ path: "fixture", namespace: "workspace-test" }));
    plugin.onLoad({ filter: /.*/, namespace: "workspace-test" }, () => ({ contents: fixture, loader: "jsx", resolveDir: process.cwd() }));
  } }] });
  server = createServer((_request, response) => { response.setHeader("content-type", "text/html; charset=utf-8"); response.end(`<style>html,body,#root{margin:0;height:100%}</style><div id="root"></div><script>${result.outputFiles[0]!.text}</script>`); });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string"); url = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({ headless: true });
});
test.after(async () => { await browser?.close(); if (server) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); });
async function open(t: { after: (fn: () => Promise<void>) => void }, screen: string, colorScheme: "light" | "dark" = "light"): Promise<Page> {
  const page = await browser.newPage({ viewport: { width: 320, height: 874 }, colorScheme }); page.setDefaultTimeout(2500); t.after(() => page.close());
  await page.clock.install({ time: new Date("2026-09-08T03:00:00Z") });
  await page.route("**/*", route => route.request().url().startsWith(url) ? route.continue() : route.abort());
  await page.goto(`${url}?screen=${screen}`); return page;
}
async function fits(action: Locator, height = 44) { const b = (await action.boundingBox())!; assert.ok(b && b.height >= height, `expected ${height}pt target, got ${b?.height}`); assert.ok(b.x >= 0 && b.x + b.width <= 320, "action fits 320pt screen"); }
async function noWrites(page: Page) { assert.deepEqual(await page.evaluate(() => (window as any).fixture.requests), []); }

for (const scheme of ["light", "dark"] as const) {
  test(`${scheme}: final inset AI artifacts preserve all embedded panels, audit request and navigation`, async t => {
    const page = await open(t, "conversation&insets=true", scheme);
    const reply = page.getByRole("textbox", { name: "继续聊聊", exact: true }); await reply.fill("仍需核对的草稿");
    const contact = page.getByText("林悦", { exact: true }).locator("xpath=ancestor::*[@role='button'][1]");
    const event = page.getByText("合作交流会", { exact: true }).locator("xpath=ancestor::*[@role='button'][1]");
    const profile = page.getByText("资料里的林悦", { exact: true }).locator("xpath=ancestor::*[@role='button'][1]");
    const followup = page.getByRole("button", { name: "打开待办详情：联系 林悦", exact: true }).first();
    const schedule = page.getByRole("button", { name: "打开待办详情：确认合作时间", exact: true });
    await followup.waitFor();
    const auditReference = page.getByRole("button", { name: /ai-run-style/ });
    const panels = [contact, event, followup, profile, schedule,
      page.getByText("核对合作信息", { exact: true }).locator(".."),
      page.getByText("待确认的采购讨论", { exact: true }).locator("..").locator("..").locator(".."),
      page.getByText("AI 运行依据", { exact: true }).locator("..").locator("..").locator(".."), auditReference];
    const radii = []; for (const panel of panels) { await panel.waitFor(); radii.push(await panel.evaluate(el => getComputedStyle(el).borderRadius)); }
    await auditReference.click();
    const auditResult = page.getByText("可以先核对采购合作资料。", { exact: true }).locator(".."); await auditResult.waitFor();
    radii.push(await auditResult.evaluate(el => getComputedStyle(el).borderRadius));
    assert.deepEqual(await page.evaluate(() => (window as any).fixture.requests), [{ method: "get", path: "/api/ai/runs/ai-run-style", body: undefined }]);
    for (const panel of [contact, event, followup, profile, schedule]) await panel.click();
    assert.deepEqual(await page.evaluate(() => (window as any).fixture.navigation), ["/contacts/person-one", "/events/event-one", "/tasks/task-one", "/profile", "/tasks/task-one"]);
    assert.equal(await reply.inputValue(), "仍需核对的草稿");
    assert.deepEqual(radii, ["12px", "12px", "12px", "12px", "12px", "12px", "12px", "12px", "12px", "12px"], "contact/event/followup/profile/schedule suggestions, intentBlock, taskInteractionCard, aiRunPanel, aiRunReference, aiRunResult");
  });
  test(`${scheme}: final inset chat extraction and saved draft keep the exact request boundary`, async t => {
    const page = await open(t, "thread&insets=true", scheme);
    const signal = page.getByText("寻找日本采购合作伙伴", { exact: true }).locator("..");
    const radii = [await signal.evaluate(el => getComputedStyle(el).borderRadius)];
    const draft = page.getByPlaceholder("写一版给对方的回复"); await draft.fill("周四可以");
    await page.getByRole("button", { name: "保存草稿", exact: true }).click();
    const result = page.getByText("回复草稿已保存", { exact: true }).locator(".."); await result.waitFor();
    radii.push(await result.evaluate(el => getComputedStyle(el).borderRadius));
    assert.deepEqual(await page.evaluate(() => (window as any).fixture.requests), [{ method: "post", path: "/api/chat/conversations/thread-one/messages", body: { body: "周四可以" } }]);
    assert.equal(await draft.inputValue(), "");
    await page.getByText("已记录为本地草稿，尚未真正发出。", { exact: true }).waitFor();
    assert.deepEqual(radii, ["12px", "12px"], "signalRow, draftResult");
  });
  test(`${scheme}: final inset inbox empty feedback has the shared boundary`, async t => {
    const page = await open(t, "inbox", scheme);
    await page.getByRole("textbox").first().fill("没有这个联系人");
    const empty = page.getByText("没有找到消息", { exact: true }).locator("..");
    assert.equal(await empty.evaluate(el => getComputedStyle(el).borderRadius), "12px", "emptyInboxSection");
    await noWrites(page);
  });
  test(`${scheme}: final inset inbox privacy, rewrite and local preview preserve the reply`, async t => {
    const page = await open(t, "inboxThread&insets=true", scheme);
    const reply = page.getByRole("textbox", { name: "回复正文", exact: true }); await reply.fill("周四可以");
    await page.getByRole("button", { name: "隐私设置", exact: true }).click();
    const privacy = page.getByText("隐私控制", { exact: true }).locator("..").locator("..").locator("..");
    await page.getByText("允许关系分析", { exact: true }).waitFor();
    const radii = [await privacy.evaluate(el => getComputedStyle(el).borderRadius)];
    await page.getByRole("button", { name: "润色草稿", exact: true }).click();
    const rewrite = page.getByText("润色建议", { exact: true }).locator(".."); await rewrite.waitFor();
    radii.push(await rewrite.evaluate(el => getComputedStyle(el).borderRadius));
    assert.equal(await reply.inputValue(), "周四可以一起核对合作资料。");
    await page.getByRole("button", { name: "预览回复", exact: true }).click();
    const staged = page.getByText("回复预览", { exact: true }).locator(".."); await staged.waitFor();
    radii.push(await staged.evaluate(el => getComputedStyle(el).borderRadius));
    await page.getByRole("button", { name: "继续编辑", exact: true }).click();
    assert.equal(await reply.inputValue(), "周四可以一起核对合作资料。");
    assert.deepEqual(await page.evaluate(() => (window as any).fixture.requests), [{ method: "get", path: "/api/chat/privacy?conversationId=thread-one", body: undefined }, { method: "post", path: "/api/chat/assist/rewrite", body: { conversationId: "thread-one", organization: "", participantName: "林悦", sourceText: "周四可以" } }]);
    assert.deepEqual(radii, ["12px", "12px", "12px"], "privacyBox, rewriteBox, stagedBox");
  });
}

for (const scheme of ["light", "dark"] as const) {
  test(`${scheme}: AI drawer, history and composer menu keep a draft and fit the phone`, async t => {
    const page = await open(t, "ai", scheme); const draft = page.getByPlaceholder("询问 Orbit AI"); await draft.fill("先核对合作资料");
    await fits(draft);
    await page.getByRole("button", { name: "打开侧栏", exact: true }).click();
    await fits(page.getByRole("button", { name: "新对话", exact: true }), 50);
    await fits(page.getByPlaceholder("搜索对话"));
    await page.getByRole("button", { name: "关闭侧栏", exact: true }).click();
    await page.getByRole("button", { name: "关闭侧栏", exact: true }).waitFor({ state: "hidden" });
    await page.getByRole("button", { name: "对话历史", exact: true }).click();
    await fits(page.getByRole("button", { name: "打开历史记录：讨论合作时间", exact: true }));
    await fits(page.getByRole("button", { name: "删除历史记录", exact: true }));
    await page.getByRole("button", { name: "关闭历史", exact: true }).click();
    await page.getByRole("button", { name: "关闭历史", exact: true }).waitFor({ state: "hidden" });
    await page.getByRole("button", { name: "更多操作", exact: true }).click();
    await fits(page.getByRole("button", { name: "扫名片", exact: true }));
    await page.getByLabel("关闭菜单", { exact: true }).click({ position: { x: 300, y: 100 } });
    await page.getByRole("button", { name: "扫名片", exact: true }).waitFor({ state: "hidden" });
    assert.equal(await draft.inputValue(), "先核对合作资料"); await noWrites(page);
    if (process.env.APP_STYLE_SCREENSHOTS) await page.screenshot({ path: `/tmp/orbit-workspaces-ai-${scheme}.png`, fullPage: true });
  });
  test(`${scheme}: task mode switching and detail expansion never complete or delete a task`, async t => {
    const page = await open(t, "tasks", scheme);
    for (const name of ["已完成", "待办"]) { const tab = page.getByRole("tab", { name, exact: true }); await fits(tab); await tab.click(); }
    await page.getByRole("button", { name: /确认合作时间/ }).click(); await noWrites(page);
    assert.deepEqual(await page.evaluate(() => (window as any).fixture.navigation), ["/tasks/task-one"]);
    const detail = await open(t, "task", scheme);
    await detail.getByRole("textbox", { name: "待办标题", exact: true }).waitFor();
    const more = detail.getByRole("button", { name: "更多待办操作", exact: true }); await fits(more); await more.click();
    await fits(detail.getByRole("button", { name: "关闭待办设置", exact: true }));
    await detail.getByRole("button", { name: "关闭待办设置", exact: true }).click();
    await fits(detail.getByRole("button", { name: "标记完成", exact: true }), 50); await noWrites(detail);
  });
  test(`${scheme}: calendar day week month modes preserve selected date and event navigation`, async t => {
    const page = await open(t, "schedule", scheme); await fits(page.getByRole("button", { name: "回到今天", exact: true }));
    for (const name of ["周", "月", "日"]) {
      const tab = page.getByRole("tab", { name, exact: true }); await fits(tab); await tab.click();
      await (name === "周" ? page.getByText("本周安排", { exact: true }) : name === "月" ? page.getByRole("button", { name: "上个月", exact: true }) : page.getByText("09:00", { exact: true })).waitFor();
      await page.getByText("合作交流会", { exact: true }).first().waitFor();
      assert.equal(await tab.evaluate(el => getComputedStyle(el).backgroundColor), scheme === "light" ? "rgb(255, 254, 252)" : "rgb(34, 38, 46)");
    }
    await page.getByRole("button", { name: /周三9日/ }).click();
    await page.getByRole("tab", { name: "月", exact: true }).click();
    await page.getByText("9月9日 周三", { exact: true }).waitFor();
    assert.equal(await page.getByText("合作交流会", { exact: true }).count(), 0);
    await page.getByRole("tab", { name: "周", exact: true }).click();
    await page.getByRole("tab", { name: "日", exact: true }).click();
    await page.getByText("9月9日 周三", { exact: true }).waitFor();
    await page.getByRole("button", { name: /周二8日/ }).click();
    await page.getByRole("button", { name: /合作交流会/ }).click();
    const navigation = await page.evaluate(() => (window as any).fixture.navigation); assert.equal(navigation.length, 1); assert.match(navigation[0], /event-one/); await noWrites(page);
  });
}

test("reading canvas keeps its draft when opening shortcuts and uses the shared page inset", async t => {
  const page = await open(t, "conversation"); const reply = page.getByRole("textbox", { name: "继续聊聊", exact: true }); await reply.fill("先核对资料");
  const content = page.getByTestId("conversation-history").locator("div").first();
  assert.equal(await content.evaluate(el => getComputedStyle(el).paddingLeft), "22px");
  await page.getByRole("button", { name: "打开快捷入口", exact: true }).click();
  await page.getByRole("button", { name: "打开快捷入口", exact: true }).click();
  assert.equal(await reply.inputValue(), "先核对资料"); await noWrites(page);
});
test("chat list and detail retain navigation, messages and a failed draft without sending", async t => {
  const page = await open(t, "chat", "dark"); const row = page.getByRole("button", { name: /林悦/ }); await fits(row); await row.click(); await noWrites(page);
  assert.equal(await page.getByText("林悦", { exact: true }).evaluate(el => getComputedStyle(el).fontSize), "17px");
  const detail = await open(t, "thread"); const draft = detail.getByPlaceholder("写一版给对方的回复"); await draft.fill("周四可以");
  await fits(detail.getByRole("button", { name: "保存草稿", exact: true }), 50);
  await detail.getByRole("button", { name: "保存草稿", exact: true }).click(); await detail.getByText("操作暂时失败", { exact: true }).waitFor();
  assert.equal(await draft.inputValue(), "周四可以");
  assert.equal(await detail.evaluate(() => (window as any).fixture.requests.length), 1);
});
test("AI next actions uses open sections and clear section hierarchy", async t => {
  const page = await open(t, "ai"); const heading = page.getByText("下一步", { exact: true });
  await heading.waitFor();
  assert.deepEqual(await heading.evaluate(el => { const s = getComputedStyle(el); return [s.fontSize, s.lineHeight, s.fontWeight]; }), ["18px", "26px", "600"]);
  assert.equal(await heading.locator("..").locator("..").locator("..").evaluate(el => getComputedStyle(el).borderTopWidth), "0px");
});
for (const [screen, label] of [["actions", "确认建议"], ["today", "加入待办：确认参会伙伴"], ["followups", "生成候选"], ["ledger", "确认执行"]]) {
  test(`${screen}: successful workspace exposes a reachable primary action without implicit writes`, async t => {
    const page = await open(t, screen!, "dark"); await fits(page.getByRole("button", { name: label!, exact: true }).first(), screen === "today" ? 44 : 50); await noWrites(page);
  });
}
test("inbox mail composer has a full-size primary preview while cancellation stays local", async t => {
  const page = await open(t, "inbox"); await page.getByRole("button", { name: "写消息", exact: true }).click();
  await fits(page.getByRole("button", { name: "预览草稿", exact: true }), 50);
  await page.getByRole("button", { name: "取消", exact: true }).click(); await noWrites(page);
});
test("schedule preview navigation uses 44pt actions and keeps its no-action boundary", async t => {
  const page = await open(t, "preview"); const actions = page.getByRole("button"); await actions.first().waitFor(); for (const action of await actions.all()) await fits(action); await noWrites(page);
});
test("agent workspace headers do not repeat brand names above their page titles", async t => {
  for (const [screen, brand] of [["actions", "Orbit AI"], ["ledger", "Orbit Agent"]]) {
    const page = await open(t, screen!); await page.getByRole("heading").first().waitFor();
    assert.equal(await page.getByText(brand!, { exact: true }).count(), 0);
  }
});
test("workspace actions grow with doubled text while keeping labels inside the phone", async t => {
  for (const [screen, label] of [["actions", "确认建议"], ["ledger", "确认执行"], ["followups", "生成候选"], ["tasks", "已完成"], ["task", "标记完成"], ["schedule", "回到今天"]]) {
    const page = await open(t, screen!, "dark"); const action = page.getByRole(screen === "tasks" ? "tab" : "button", { name: label!, exact: true }).first(); await action.waitFor();
    await page.evaluate(() => document.querySelectorAll("[dir='auto'],input,textarea").forEach(node => { const el = node as HTMLElement, s = getComputedStyle(el); el.style.fontSize = `${parseFloat(s.fontSize) * 2}px`; const line = parseFloat(s.lineHeight); el.style.lineHeight = `${(Number.isFinite(line) ? line : parseFloat(s.fontSize) * 1.5) * 2}px`; }));
    await fits(action); const bounds = (await action.boundingBox())!;
    for (const text of await action.locator("[dir='auto']").all()) { const box = (await text.boundingBox())!; assert.ok(box.x >= bounds.x && box.x + box.width <= bounds.x + bounds.width + 1, `${screen} action label fits horizontally`); assert.ok(box.y >= bounds.y && box.y + box.height <= bounds.y + bounds.height + 1, `${screen} action label fits vertically`); }
    await noWrites(page);
    if (process.env.APP_STYLE_SCREENSHOTS) await page.screenshot({ path: `/tmp/orbit-workspaces-${screen}-large-dark.png`, fullPage: true });
  }
});
for (const screen of ["tasks", "task", "chat", "thread", "schedule", "today", "followups", "ledger", "actions", "conversation"]) {
  test(`${screen}: resource failure remains visible without write effects`, async t => {
    const page = await open(t, screen); await page.evaluate(() => (window as any).fixture.update({ kind: "offline" })); await page.getByText("连接暂时失败", { exact: true }).first().waitFor(); await noWrites(page);
  });
}
test("AI resource fallback keeps its return action on the same page inset", async t => {
  const page = await open(t, "conversation"); await page.evaluate(() => (window as any).fixture.update({ kind: "offline" }));
  const back = page.getByRole("button", { name: "返回 Orbit AI", exact: true }); await fits(back);
  assert.equal((await back.boundingBox())!.x, 22);
});
test("task metadata stays complete at large text without cutting off the scheduled date", async t => {
  const page = await open(t, "task"); const metadata = page.getByText("安排", { exact: true }).locator("..").locator("..");
  await metadata.waitFor();
  await metadata.locator("[dir='auto']").evaluateAll(elements => elements.forEach(node => { const el = node as HTMLElement; el.style.fontSize = "30px"; el.style.lineHeight = "46px"; }));
  const clipped = await metadata.locator("[dir='auto']").evaluateAll(elements => elements.filter(el => el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1).map(el => el.textContent));
  assert.deepEqual(clipped, []);
});
test("calendar hour labels remain on one readable line when text doubles", async t => {
  const page = await open(t, "schedule"); const hour = page.getByText("09:00", { exact: true }); await hour.waitFor();
  const event = page.getByRole("button", { name: /合作交流会/ });
  const before = await event.evaluate(el => ({ top: getComputedStyle(el).top, height: getComputedStyle(el).height }));
  await page.evaluate(() => { (window as any).fixture.fontScale = 2; window.dispatchEvent(new Event("workspace-fontscale")); });
  await hour.evaluate(node => { const el = node as HTMLElement; el.style.fontSize = "22px"; el.style.lineHeight = "33px"; });
  assert.ok((await hour.boundingBox())!.height <= 33, "09:00 must not wrap in the fixed calendar hour gutter");
  assert.deepEqual(await event.evaluate(el => ({ top: getComputedStyle(el).top, height: getComputedStyle(el).height })), before);
  const hourBox = (await hour.boundingBox())!, eventBox = (await event.boundingBox())!;
  assert.ok(eventBox.x >= hourBox.x + hourBox.width, "events remain clear of the enlarged hour gutter");
  if (process.env.APP_STYLE_SCREENSHOTS) await page.screenshot({ path: "/tmp/orbit-workspaces-calendar-gutter-large.png", fullPage: true });
});
test("calendar agendas retain complete time and event text at doubled native font scale", async t => {
  const page = await open(t, "schedule");
  for (const mode of ["周", "月"]) {
    await page.getByRole("tab", { name: mode, exact: true }).click();
    await page.evaluate(() => { (window as any).fixture.fontScale = 2; window.dispatchEvent(new Event("workspace-fontscale")); });
    const row = page.getByRole("button", { name: "合作交流会，14:00", exact: true }); await row.waitFor();
    await row.locator("[dir='auto']").evaluateAll(elements => elements.forEach(node => { const el = node as HTMLElement; el.style.fontSize = "26px"; el.style.lineHeight = "39px"; }));
    assert.ok((await row.getByText("14:00", { exact: true }).boundingBox())!.height <= 39, `${mode} agenda time stays on one line`);
    assert.deepEqual(await row.locator("[dir='auto']").evaluateAll(elements => elements.filter(el => el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1).map(el => el.textContent)), []);
    await fits(row); await noWrites(page);
    if (process.env.APP_STYLE_SCREENSHOTS) await page.screenshot({ path: `/tmp/orbit-workspaces-calendar-agenda-${mode}-large.png`, fullPage: true });
  }
});
test("primary workspace action labels use the shared semibold role", async t => {
  for (const [screen, label] of [["actions", "确认建议"], ["ledger", "确认执行"], ["followups", "生成候选"], ["task", "标记完成"], ["thread", "保存草稿"]]) {
    const page = await open(t, screen!); const action = page.getByRole("button", { name: label!, exact: true }).first(); await action.waitFor();
    assert.equal(await action.locator("[dir='auto']").first().evaluate(el => getComputedStyle(el).fontWeight), "600", `${screen} primary label weight`);
  }
});
for (const [screen, title] of [["tasks", "暂无待办"], ["chat", "暂无关系对话"], ["thread", "暂无消息"], ["ledger", "操作账本还是空的"]]) {
  test(`${screen}: empty and loading resources preserve their real screen feedback`, async t => {
    const page = await open(t, screen!); await page.evaluate(() => (window as any).fixture.update({ kind: "loading" }));
    await page.getByLabel("正在加载", { exact: true }).first().waitFor();
    await page.evaluate(() => (window as any).fixture.update({ kind: "empty", empty: true }));
    await page.getByText(title!, { exact: true }).waitFor(); await noWrites(page);
  });
}
