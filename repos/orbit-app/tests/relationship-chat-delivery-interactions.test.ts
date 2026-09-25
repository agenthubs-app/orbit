import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { build } from "esbuild";
import { chromium, type Browser, type Page } from "playwright";

const require = createRequire(import.meta.url);
let browser: Browser;
let script: string;

// Exercise the real private route, screen, resource/client and view-model. Only
// device/auth boundaries, local snapshots and external HTTP are replaced.
const fixture = `
import React, { useSyncExternalStore } from "react";
import { View } from "react-native-web";
const listeners = new Set(); let revision = 0; let uuidSequence = 0;
const observe = () => useSyncExternalStore(fn => { listeners.add(fn); return () => listeners.delete(fn); }, () => revision);
const state = window.fixture = {
  actor: "account:sender", conversationId: "conversation:1", baseUrl: "https://orbit.example", cookieHeader: "", ready: true, baseReady: true, signedIn: true,
  requests: [], pending: [], presses: {}, holdReads: false, readStatus: 200, status: "active", qualificationVersion: "qv:1", messages: [], ...window.initialFixture,
  update(patch) { Object.assign(state, patch); revision++; listeners.forEach(fn => fn()); },
  message(body, id = "message:1", senderAccountId = state.actor) { return { messageId: id, conversationId: state.conversationId, senderAccountId, senderDisplayName: senderAccountId === state.actor ? "Sender" : "Receiver", body, sentAt: "2026-09-14T12:00:00.000Z", deliveryState: "delivered" }; },
  conversation() { return { conversationId: state.conversationId, contactId: "contact:receiver", participantAccountIds: ["account:sender", "account:receiver"], participantDisplayNames: { "account:sender": "Sender", "account:receiver": "Receiver" }, qualificationVersion: state.qualificationVersion, status: state.status, createdAt: "2026-09-14T11:00:00.000Z", updatedAt: "2026-09-14T12:00:00.000Z", unreadCount: 0, messages: state.messages }; },
  data(path) { const url = new URL(path, state.baseUrl); if (url.pathname.endsWith("/conversation-summaries")) { const start = Number(url.searchParams.get("cursor") || 0), end = Math.min(start + 20, 45); const { messages, ...base } = state.conversation(); return { actorId: state.actor, items: Array.from({ length: end - start }, (_, i) => ({ ...base, conversationId: 'conversation:' + (i + start), participantDisplayNames: { ...base.participantDisplayNames, 'account:receiver': 'Receiver ' + (i + start) }, lastMessage: null })), hasMore: end < 45, nextCursor: end < 45 ? String(end) : null, asOf: base.updatedAt }; } if (url.pathname.endsWith("/extractions")) return { extractedNeeds: [], extractedTasks: [], relationshipProfileUpdates: [], confirmationRequiredProfileSuggestions: [] }; if (url.pathname.endsWith("/messages")) { const { messages, unreadCount, ...conversation } = state.conversation(); const end = Number(url.searchParams.get("cursor") || messages.length); const start = Math.max(0, end - 30); return { actorId: state.actor, conversation, items: messages.slice(start, end), hasMore: start > 0, nextCursor: start ? String(start) : null, newestCursor: end ? String(end) : null, direction: "older", asOf: conversation.updatedAt }; } return state.conversation(); },
  receipt(body, overrides = {}) { const message = state.message(body); return { conversationId: state.conversationId, deliveryState: "delivered", qualificationVersion: state.qualificationVersion, message, ...overrides }; },
  reply(index, status = 200, data) { const body = status >= 400 ? { success: false, error: { code: "SERVICE_UNAVAILABLE", message: "Rejected" } } : { success: true, data: data === undefined ? state.data(state.requests[index].path) : data }; state.pending[index]?.(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })); }
};
window.fetch = async (input, init = {}) => { const index = state.requests.length; const url = new URL(String(input)); state.requests.push({ method: init.method || "GET", path: url.pathname + url.search, body: init.body ? JSON.parse(init.body) : null, headers: Object.fromEntries(new Headers(init.headers).entries()), signal: init.signal }); const result = new Promise(resolve => state.pending[index] = resolve); if ((init.method || "GET") === "GET" && !state.holdReads) queueMicrotask(() => state.reply(index, state.readStatus)); return result; };
export const useFixture = () => { observe(); return state; };
export const useOrbitAuthSession = () => { observe(); return { ready: state.ready, signedIn: state.signedIn, accountId: state.signedIn ? state.actor : null, actorId: state.signedIn ? state.actor : null, user: state.signedIn ? { id: state.actor } : null, cookieHeader: state.cookieHeader }; };
export const useOrbitApiBaseUrl = () => { observe(); return { ready: state.baseReady, baseUrl: state.baseUrl }; };
export const useLocalSearchParams = () => { observe(); return { id: state.conversationId }; };
export const useGlobalSearchParams = useLocalSearchParams;
export const usePathname = () => "/chat/" + encodeURIComponent(state.conversationId);
export const useRouter = () => ({ canGoBack: () => false, back() {}, push() {}, replace() {} });
export const Redirect = () => <div role="status">Sign in</div>;
export const Stack = () => null;
export const randomUUID = () => "test-uuid-" + (++uuidSequence);
export const readSnapshot = async () => null;
export const writeSnapshot = async () => {};
export const Ionicons = () => <span aria-hidden="true" />;
export const SafeAreaView = ({ edges, ...props }) => <View {...props} />;
`;

test.before(async () => {
  const result = await build({
    stdin: { contents: 'import React from "react"; import { createRoot } from "react-dom/client"; import Route from "./app/chat/[id]"; import ListRoute from "./app/chat"; import { useFixture } from "fixture"; function App() { const state = useFixture(); return state.listMode ? <ListRoute /> : <Route />; } createRoot(document.getElementById("root")).render(<App />);', resolveDir: process.cwd(), loader: "tsx" },
    bundle: true,
    write: false,
    format: "iife",
    jsx: "automatic",
    resolveExtensions: [".web.tsx", ".web.ts", ".web.js", ".tsx", ".ts", ".jsx", ".js", ".json"],
    define: { "process.env.NODE_ENV": '"test"', "process.env": "{}", __DEV__: "false" },
    plugins: [{ name: "chat-boundaries", setup(plugin) {
      plugin.onResolve({ filter: /^react-native$/ }, () => ({ path: "native", namespace: "chat" }));
      plugin.onResolve({ filter: /^(fixture|expo-router|expo-crypto|@expo\/vector-icons|react-native-safe-area-context)$|\/(ApiBaseUrlProvider|AuthSessionProvider|snapshot-store)$/ }, () => ({ path: "fixture", namespace: "chat" }));
      plugin.onLoad({ filter: /.*/, namespace: "chat" }, args => ({ contents: args.path === "native" ? `
import React from "react"; import { Pressable as RealPressable, RefreshControl as RealRefreshControl } from "react-native-web"; export * from "react-native-web";
export const Pressable = props => { const text = React.Children.toArray(props.children).find(child => React.isValidElement(child) && typeof child.props.children === "string"); const label = props.accessibilityLabel || text?.props.children; if (label) window.fixture.presses[label] = props.onPress; return <RealPressable {...props} />; };
export const RefreshControl = props => { window.fixture.refresh = props.onRefresh; return <RealRefreshControl {...props} />; };
` : fixture, loader: "jsx", resolveDir: process.cwd() }));
      plugin.onResolve({ filter: /^react-native-web$/ }, () => ({ path: require.resolve("react-native-web") }));
    } }],
  });
  script = result.outputFiles[0]!.text;
  browser = await chromium.launch({ headless: true });
});

test.after(async () => { await browser?.close(); });

async function settle(page: Page) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function open(t: { after(fn: () => Promise<void>): void }, patch: { listMode?: boolean; [key: string]: unknown } = {}) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.setDefaultTimeout(2500);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  t.after(async () => { await page.close(); assert.deepEqual(errors, []); });
  await page.route("**/*", route => route.abort());
  await page.setContent('<div id="root"></div>');
  await page.evaluate(value => { (window as any).initialFixture = value; }, patch);
  await page.addScriptTag({ content: script });
  if (patch.listMode) await page.getByText("关系对话", { exact: true }).first().waitFor();
  else await page.getByPlaceholder("写给已验证联系人", { exact: true }).waitFor();
  await settle(page);
  return page;
}

async function fill(page: Page, body = "需要确认送达的消息") {
  await page.getByPlaceholder("写给已验证联系人", { exact: true }).fill(body);
  await settle(page);
}

async function send(page: Page) {
  await page.getByRole("button", { name: "发送消息", exact: true }).click();
  await settle(page);
}

async function writes(page: Page) {
  return page.evaluate(() => (window as any).fixture.requests.filter((request: any) => request.method === "POST"));
}

test("opening a verified conversation never sends and revoked qualification fails closed", async t => {
  const page = await open(t);
  assert.deepEqual(await writes(page), []);
  assert.equal(await page.getByRole("button", { name: "发送消息", exact: true }).isDisabled(), true);
  await fill(page);
  assert.equal(await page.getByRole("button", { name: "发送消息", exact: true }).isEnabled(), true);

  await page.evaluate(() => (window as any).fixture.update({ status: "revoked" }));
  await page.evaluate(() => (window as any).fixture.refresh());
  await settle(page);
  assert.equal(await page.getByRole("button", { name: "发送消息", exact: true }).count(), 0);
  assert.match(await page.locator("body").innerText(), /当前账号可访问/u);
  assert.deepEqual(await writes(page), []);
});

test("delivery is single-flight, retries with the same idempotency key, and clears only on a matching receipt", async t => {
  const page = await open(t);
  await fill(page, "  需要确认送达的消息  ");
  await page.evaluate(() => { const sendNow = (window as any).fixture.presses["发送消息"]; sendNow(); sendNow(); });
  await settle(page);
  let sent = await writes(page);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].path, "/api/relationship-communication/conversations/conversation%3A1/messages");
  assert.deepEqual(sent[0].body, { body: "需要确认送达的消息", qualificationVersion: "qv:1" });
  const key = sent[0].headers["idempotency-key"];
  assert.match(key, /^test-uuid-/u);

  await page.evaluate(() => { const state = (window as any).fixture; state.reply(state.requests.findLastIndex((request: any) => request.method === "POST"), 503); });
  await settle(page);
  assert.equal(await page.getByPlaceholder("写给已验证联系人").inputValue(), "  需要确认送达的消息  ");
  await send(page);
  sent = await writes(page);
  assert.equal(sent[1].headers["idempotency-key"], key);

  await page.evaluate(() => { const state = (window as any).fixture; const index = state.requests.findLastIndex((request: any) => request.method === "POST"); state.messages = [state.message(state.requests[index].body.body)]; state.reply(index, 201, state.receipt(state.requests[index].body.body)); });
  await settle(page);
  assert.equal(await page.getByPlaceholder("写给已验证联系人").inputValue(), "");
  assert.equal(await page.getByText("消息已送达已验证的 Orbit 账号。", { exact: true }).count(), 1);
});

for (const kind of ["wrong-body", "wrong-version", "wrong-sender", "wrong-conversation", "missing-message"]) {
  test(`unconfirmed ${kind} receipt retains the input`, async t => {
    const page = await open(t);
    await fill(page);
    await send(page);
    await page.evaluate(kind => { const state = (window as any).fixture; const index = state.requests.findLastIndex((request: any) => request.method === "POST"); let receipt = state.receipt(state.requests[index].body.body); if (kind === "wrong-body") receipt.message.body = "other"; if (kind === "wrong-version") receipt.qualificationVersion = "qv:old"; if (kind === "wrong-sender") receipt.message.senderAccountId = "account:other"; if (kind === "wrong-conversation") receipt.conversationId = "conversation:other"; if (kind === "missing-message") delete receipt.message; state.reply(index, 201, receipt); }, kind);
    await settle(page);
    assert.equal(await page.getByPlaceholder("写给已验证联系人").inputValue(), "需要确认送达的消息");
    assert.match(await page.locator("body").innerText(), /尚未确认消息送达/u);
  });
}

test("an identity change aborts an in-flight delivery and suppresses its late receipt", async t => {
  const page = await open(t);
  await fill(page);
  await send(page);
  await page.evaluate(() => { const state = (window as any).fixture; state.oldWrite = state.requests.findLastIndex((request: any) => request.method === "POST"); state.update({ actor: "account:other" }); });
  await settle(page);
  assert.equal(await page.evaluate(() => { const state = (window as any).fixture; return state.requests[state.oldWrite].signal.aborted; }), true);
  await page.evaluate(() => { const state = (window as any).fixture; state.reply(state.oldWrite, 201, state.receipt("需要确认送达的消息")); });
  await settle(page);
  assert.equal(await page.getByText("消息已送达已验证的 Orbit 账号。", { exact: true }).count(), 0);
});

test("legacy chat opens only a 30-message window, replaces older pages and retains the draft", async t => {
  const messages = Array.from({ length: 65 }, (_, index) => ({ messageId: `message:${index}`, conversationId: "conversation:1", senderAccountId: "account:receiver", senderDisplayName: "Receiver", body: `历史正文 ${index}`, sentAt: "2026-09-14T12:00:00.000Z", deliveryState: "delivered" }));
  const page = await open(t, { messages });
  await fill(page, "翻页也不要丢掉草稿");
  assert.equal(await page.getByText("历史正文 64", { exact: true }).count(), 1);
  assert.equal(await page.getByText("历史正文 34", { exact: true }).count(), 0);
  await page.getByRole("button", { name: "更早的消息", exact: true }).click();
  await settle(page);
  assert.equal(await page.getByText("历史正文 34", { exact: true }).count(), 1);
  assert.equal(await page.getByText("历史正文 64", { exact: true }).count(), 0);
  assert.equal(await page.getByPlaceholder("写给已验证联系人").inputValue(), "翻页也不要丢掉草稿");
  await page.getByRole("button", { name: "更早的消息", exact: true }).click();
  await settle(page);
  assert.equal(await page.getByText("历史正文 0", { exact: true }).count(), 1);
  assert.equal(await page.getByText("历史正文 34", { exact: true }).count(), 0);
  assert.equal(await page.getByRole("button", { name: "更早的消息", exact: true }).count(), 0);
  await page.getByRole("button", { name: "最新消息", exact: true }).click();
  await settle(page);
  assert.equal(await page.getByText("历史正文 64", { exact: true }).count(), 1);
  const reads = await page.evaluate(() => (window as any).fixture.requests.filter((r: any) => r.method === "GET" && !r.path.endsWith("/extractions")).map((r: any) => r.path));
  assert.equal(reads.length, 4);
  assert.ok(reads.every((path: string) => path.includes("/messages?limit=30&direction=older")));
  assert.deepEqual(await writes(page), []);
});

for (const readStatus of [403, 404]) test(`a ${readStatus} refresh hides private content without a full-history fallback`, async t => {
  const page = await open(t);
  await fill(page, "本地未发送草稿");
  await page.evaluate(readStatus => { const state = (window as any).fixture; state.readStatus = readStatus; state.refresh(); }, readStatus);
  await settle(page);
  assert.equal(await page.getByPlaceholder("写给已验证联系人").count(), 0);
  assert.equal(await page.getByText("查看联系人", { exact: true }).count(), 0);
  assert.equal(await page.getByRole("button", { name: "发送消息", exact: true }).count(), 0);
  assert.deepEqual(await writes(page), []);
  const reads = await page.evaluate(() => (window as any).fixture.requests.filter((r: any) => r.method === "GET" && !r.path.endsWith("/extractions")).map((r: any) => r.path));
  assert.ok(reads.every((path: string) => path.includes("/messages?limit=30&direction=older")));
  await page.evaluate(() => { const state = (window as any).fixture; state.readStatus = 200; state.refresh(); });
  await settle(page);
  assert.equal(await page.getByPlaceholder("写给已验证联系人").inputValue(), "本地未发送草稿");
});

test("a late older-page response cannot replace the latest window", async t => {
  const messages = Array.from({ length: 60 }, (_, index) => ({ messageId: `message:${index}`, conversationId: "conversation:1", senderAccountId: "account:receiver", senderDisplayName: "Receiver", body: `保密正文 ${index}`, sentAt: "2026-09-14T12:00:00.000Z", deliveryState: "delivered" }));
  const page = await open(t, { messages });
  await page.evaluate(() => { (window as any).fixture.holdReads = true; });
  await page.getByRole("button", { name: "更早的消息", exact: true }).click();
  await settle(page);
  assert.equal(await page.getByText("保密正文 59", { exact: true }).count(), 0);
  await page.evaluate(() => { const state = (window as any).fixture; state.oldRead = state.requests.length - 1; state.holdReads = false; });
  await page.getByRole("button", { name: "最新消息", exact: true }).click();
  await settle(page);
  assert.equal(await page.getByText("保密正文 59", { exact: true }).count(), 1);
  assert.equal(await page.evaluate(() => { const state = (window as any).fixture; return state.requests[state.oldRead].signal.aborted; }), true);
  await page.evaluate(() => { const state = (window as any).fixture; state.reply(state.oldRead); });
  await settle(page);
  assert.equal(await page.getByText("保密正文 0", { exact: true }).count(), 0);
  assert.equal(await page.getByText("保密正文 59", { exact: true }).count(), 1);
});

test("legacy chat list reads 20 summaries per page and hides them on identity change", async t => {
  const page = await open(t, { listMode: true });
  await page.getByText("Receiver 0", { exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: /Receiver \d/ }).count(), 20);
  await page.getByRole("button", { name: "下一页", exact: true }).click();
  await settle(page);
  assert.equal(await page.getByText("Receiver 0", { exact: true }).count(), 0);
  assert.equal(await page.getByText("Receiver 20", { exact: true }).count(), 1);
  await page.getByRole("button", { name: "下一页", exact: true }).click();
  await settle(page);
  assert.equal(await page.getByRole("button", { name: /Receiver \d/ }).count(), 5);
  await page.getByRole("button", { name: "返回第一页", exact: true }).click();
  await settle(page);
  assert.equal(await page.getByText("Receiver 0", { exact: true }).count(), 1);
  const reads = await page.evaluate(() => (window as any).fixture.requests.map((r: any) => r.path));
  assert.equal(reads.length, 4);
  assert.ok(reads.every((path: string) => path.startsWith("/api/relationship-communication/conversation-summaries?limit=20")));
  await page.evaluate(() => { const state = (window as any).fixture; state.holdReads = true; state.update({ actor: "account:other" }); });
  await settle(page);
  assert.equal(await page.getByRole("button", { name: /Receiver \d/ }).count(), 0);
  assert.deepEqual(await writes(page), []);
});
