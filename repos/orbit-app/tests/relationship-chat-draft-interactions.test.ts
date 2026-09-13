import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { build } from "esbuild";
import { chromium, type Browser, type Page } from "playwright";

const require = createRequire(import.meta.url);
let browser: Browser;
let script: string;

// Exercise the real private route, screen, resource/client and view-models.
// Replace only device/auth boundaries, snapshots and the external HTTP service.
const fixture = `
import React, { useSyncExternalStore } from "react";
import { View } from "react-native-web";
import { onSessionExpired } from "./src/api/session-expiry";
const listeners = new Set(); let revision = 0; let uuidSequence = 0;
const observe = () => useSyncExternalStore(fn => { listeners.add(fn); return () => listeners.delete(fn); }, () => revision);
const state = window.fixture = {
  actor: "actor-1", conversationId: "conversation:1", baseUrl: "https://orbit.example", cookieHeader: "", ready: true, baseReady: true, signedIn: true, mounted: true,
  requests: [], pending: [], presses: {}, expiries: 0, holdReads: false, readStatus: 200, snapshotReads: [], empty: false, permission: "ready", canSave: true,
  messages: [], ...window.initialFixture,
  update(patch) { Object.assign(state, patch); revision++; listeners.forEach(fn => fn()); },
  boundary() { return { status: state.permission, canSendInMock: state.canSave, confirmationRequiredBeforeLiveSend: true, realtimeTransportRequested: false, websocketSubscriptionRequested: false, productionMessageStorageRequested: false, externalSendRequested: false }; },
  message(body, id = "saved:1") { return { messageId: id, conversationId: state.conversationId, senderRole: "orbit_user", senderName: "Account owner", body, createdAt: "2026-09-13T00:00:00Z", deliveryState: "mock_recorded_locally", source: { type: "manual", id: "source:1" }, evidenceIds: ["evidence:1"], realtimeTransportRequested: false, websocketSubscriptionRequested: false, productionMessageStorageRequested: false, externalNetworkRequested: false, liveDatabaseReadExecuted: true, liveDatabaseWriteExecuted: true, aiProviderRequested: false, emailSendRequested: false, calendarWriteRequested: false, notificationSendRequested: false, devicePushRequested: false }; },
  data(path) {
    if (path.endsWith("/extractions")) return { extractedNeeds: [], extractedTasks: [], relationshipProfileUpdates: [], confirmationRequiredProfileSuggestions: [] };
    if (Object.hasOwn(state, "readData")) return state.readData;
    return { state: state.empty ? "empty" : "success", conversation: { conversationId: state.conversationId, participantContactId: "private-contact:1", participantName: "Private contact", organization: "Example", title: "草稿会话" }, messages: state.empty ? [] : [state.message("已有草稿", "old:1"), ...state.messages], sendMessageState: state.boundary(), oneToOneContext: { latestContext: "只供复核的关系记录" }, provenance: { liveDatabaseReadExecuted: true, liveDatabaseWriteExecuted: false } };
  },
  receipt(body) { const message = state.message(body); return { state: "success", conversationId: state.conversationId, message, messages: [...state.data("").messages, message], sendMessageState: state.boundary(), oneToOneContext: {}, provenance: { liveDatabaseReadExecuted: true, liveDatabaseWriteExecuted: true } }; },
  reply(index, status = 200, data) { state.pending[index]?.(new Response(JSON.stringify(data === undefined && status >= 400 ? { success: false, error: { code: status === 401 ? "UNAUTHORIZED" : "SERVICE_UNAVAILABLE", message: "Read or write rejected" } } : { success: true, data: data === undefined ? state.data(state.requests[index].path) : data }), { status, headers: { "content-type": "application/json" } })); }
};
onSessionExpired(() => state.expiries++);
window.fetch = async (input, init) => { const index = state.requests.length; const url = new URL(String(input)); state.requests.push({ method: init.method, path: url.pathname, origin: url.origin, body: init.body ? JSON.parse(init.body) : null, signal: init.signal }); const result = new Promise(resolve => state.pending[index] = resolve); if (init.method === "GET" && !state.holdReads) queueMicrotask(() => state.reply(index, state.readStatus)); return result; };
export const useFixture = () => { observe(); return state; };
export const useOrbitAuthSession = () => { observe(); return { ready: state.ready, signedIn: state.signedIn, user: state.signedIn ? { id: state.actor } : null, cookieHeader: state.cookieHeader }; };
export const useOrbitApiBaseUrl = () => { observe(); return { ready: state.baseReady, baseUrl: state.baseUrl }; };
export const useLocalSearchParams = () => { observe(); return { id: state.conversationId }; };
export const useGlobalSearchParams = useLocalSearchParams;
export const usePathname = () => "/chat/" + encodeURIComponent(state.conversationId);
export const useRouter = () => ({ canGoBack: () => false, back() {}, push() {}, replace() {} });
export const Redirect = () => <div role="status">Sign in</div>;
export const Stack = () => null;
export const randomUUID = () => "test-uuid-" + (++uuidSequence);
export const readSnapshot = async (baseUrl, actorId, path) => { state.snapshotReads.push(path); return state.cached ? { result: { success: true, status: 200, data: state.data(path), meta: { featureMode: null, privacy: null, runtimeBoundary: null } }, syncedAt: "2026-09-12T00:00:00Z" } : null; };
export const writeSnapshot = async () => {};
export const Ionicons = () => <span aria-hidden="true" />;
export const SafeAreaView = ({ edges, ...props }) => <View {...props} />;
`;

test.before(async () => {
  const result = await build({
    stdin: { contents: 'import React from "react"; import { createRoot } from "react-dom/client"; import Route from "./app/chat/[id]"; import { useFixture } from "fixture"; function App() { const s = useFixture(); return s.mounted ? <Route /> : null; } createRoot(document.getElementById("root")).render(<App />);', resolveDir: process.cwd(), loader: "tsx" },
    bundle: true, write: false, format: "iife", jsx: "automatic", resolveExtensions: [".web.tsx", ".web.ts", ".web.js", ".tsx", ".ts", ".jsx", ".js", ".json"], define: { "process.env.NODE_ENV": '"test"', "process.env": "{}", __DEV__: "false" },
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
  script = result.outputFiles[0]!.text; browser = await chromium.launch({ headless: true });
});
test.after(async () => { await browser?.close(); });

async function settle(p: Page) { await p.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); }
async function open(t: { after(fn: () => Promise<void>): void }, patch = {}, form = true) {
  const p = await browser.newPage({ viewport: { width: 390, height: 844 } }); p.setDefaultTimeout(2000);
  const errors: string[] = []; p.on("pageerror", e => errors.push(e.message)); t.after(async () => { await p.close(); assert.deepEqual(errors, []); });
  await p.route("**/*", r => r.abort()); await p.setContent('<div id="root"></div>'); await p.evaluate(patch => { (window as any).initialFixture = patch; }, patch); await p.addScriptTag({ content: script });
  if (form) await input(p).waitFor(); await settle(p); return p;
}
function input(p: Page) { return p.getByPlaceholder("写一版给对方的回复", { exact: true }); }
async function fill(p: Page, body = "需要保留的草稿") { await input(p).fill(body); await settle(p); }
async function update(p: Page, patch: object) { await p.evaluate(patch => (window as any).fixture.update(patch), patch); await settle(p); }
async function save(p: Page) { await p.getByRole("button", { name: "保存草稿", exact: true }).click(); await settle(p); }
async function writes(p: Page) { return p.evaluate(() => (window as any).fixture.requests.filter((r: any) => r.method === "POST").map((r: any) => ({ path: r.path, body: r.body }))); }
async function refresh(p: Page) { await p.evaluate(() => (window as any).fixture.refresh()); await settle(p); }

test("an empty authorized thread still accepts a review-only draft and never sends on open", async t => {
  const p = await open(t, { empty: true }, false);
  assert.equal(await input(p).count(), 1); await fill(p);
  assert.deepEqual(await writes(p), []);
  assert.equal(await p.getByRole("button", { name: "保存草稿", exact: true }).isEnabled(), true);
  assert.equal(await p.getByRole("button", { name: /发送|发信/u }).count(), 0);
});

for (const patch of [{ permission: "blocked" }, { permission: "pending_confirmation" }, { permission: "unknown" }, { canSave: false }]) test(`draft authority fails closed ${JSON.stringify(patch)}`, async t => {
  const p = await open(t, patch);
  assert.equal(await p.getByRole("button", { name: "保存草稿", exact: true }).isDisabled(), true);
  await p.evaluate(() => (window as any).fixture.presses["保存草稿"]()); await settle(p);
  assert.deepEqual(await writes(p), []);
});

test("draft save is single-flight, uses a stable retry id, and refreshes after a matching receipt", async t => {
  const p = await open(t); await fill(p, "  需要保留的草稿  ");
  await p.evaluate(() => { const fn = (window as any).fixture.presses["保存草稿"]; fn(); fn(); }); await settle(p);
  const first = await writes(p); assert.equal(first.length, 1); assert.equal(first[0].path, "/api/chat/conversations/conversation%3A1/messages");
  assert.equal(first[0].body.body, "需要保留的草稿"); assert.match(first[0].body.requestId, /^[\w-]+$/u);
  await p.evaluate(() => { const s = (window as any).fixture; s.reply(s.requests.findLastIndex((r: any) => r.method === "POST"), 503); }); await settle(p);
  assert.equal(await input(p).inputValue(), "  需要保留的草稿  "); await save(p);
  assert.equal((await writes(p))[1].body.requestId, first[0].body.requestId);
  await p.evaluate(() => { const s = (window as any).fixture; const i = s.requests.findLastIndex((r: any) => r.method === "POST"); const receipt = s.receipt(s.requests[i].body.body); s.messages = [receipt.message]; s.reply(i, 201, receipt); }); await settle(p);
  assert.equal(await input(p).inputValue(), ""); assert.equal(await p.getByText("回复草稿已保存", { exact: true }).count(), 1);
  assert.equal(await p.getByText("需要保留的草稿", { exact: true }).count(), 1);
  assert.deepEqual(await p.evaluate(() => (window as any).fixture.requests.slice(4).map((r: any) => r.path).sort()), ["/api/chat/conversations/conversation%3A1", "/api/chat/conversations/conversation%3A1/extractions"]);
  await fill(p, "第二版草稿"); await save(p); assert.notEqual((await writes(p))[2].body.requestId, first[0].body.requestId);
});

for (const kind of ["empty", "pending", "wrong-conversation", "wrong-message-conversation", "wrong-body", "missing-message", "wrong-sender", "not-saved", "external-send", "external-boundary", "missing-boundary", "missing-list-entry", "conflicting-list-entry", "http-error"]) test(`unconfirmed ${kind} receipt retains input and cannot claim success`, async t => {
  const p = await open(t); await fill(p); await save(p);
  await p.evaluate(kind => { const s = (window as any).fixture; const i = s.requests.findLastIndex((r: any) => r.method === "POST"); let receipt = s.receipt(s.requests[i].body.body);
    if (kind === "empty") receipt = {};
    if (kind === "pending") receipt.state = "pending";
    if (kind === "wrong-conversation") receipt.conversationId = "other";
    if (kind === "wrong-message-conversation") receipt.message.conversationId = "other";
    if (kind === "wrong-body") receipt.message.body = "other";
    if (kind === "missing-message") delete receipt.message;
    if (kind === "wrong-sender") receipt.message.senderRole = "contact";
    if (kind === "not-saved") receipt.message.deliveryState = "not_sent";
    if (kind === "external-send") receipt.message.externalNetworkRequested = true;
    if (kind === "external-boundary") receipt.sendMessageState.externalSendRequested = true;
    if (kind === "missing-boundary") delete receipt.sendMessageState;
    if (kind === "missing-list-entry") receipt.messages = [];
    if (kind === "conflicting-list-entry") receipt.messages = [{ ...receipt.message, body: "Different stored body" }];
    s.reply(i, kind === "http-error" ? 503 : 200, receipt);
  }, kind); await settle(p);
  assert.equal(await input(p).inputValue(), "需要保留的草稿"); assert.equal(await p.getByText("回复草稿已保存", { exact: true }).count(), 0);
  assert.match(await p.locator("body").innerText(), /草稿.*(确认|保存不了|保留)/u);
});

test("refresh preserves drafts but immediately revokes stale callbacks until a fresh read", async t => {
  const p = await open(t); await fill(p);
  await update(p, { holdReads: true });
  await p.evaluate(() => { const s = (window as any).fixture; s.oldSave = s.presses["保存草稿"]; s.refresh(); s.oldSave(); }); await settle(p);
  assert.deepEqual(await writes(p), []); assert.equal(await input(p).inputValue(), "需要保留的草稿");
  await p.evaluate(() => { const s = (window as any).fixture; s.requests.forEach((r: any, i: number) => { if (i >= 2) s.reply(i, 503); }); }); await settle(p);
  assert.equal(await input(p).inputValue(), "需要保留的草稿"); assert.equal(await p.getByRole("button", { name: "保存草稿", exact: true }).isDisabled(), true);
  await update(p, { holdReads: false }); await refresh(p);
  assert.equal(await input(p).inputValue(), "需要保留的草稿"); assert.equal(await p.getByRole("button", { name: "保存草稿", exact: true }).isEnabled(), true);
  await update(p, { permission: "blocked" }); await refresh(p);
  await p.evaluate(() => (window as any).fixture.oldSave()); await settle(p); assert.deepEqual(await writes(p), []);
});

test("a cached thread cannot authorize a draft after a failed current read", async t => {
  const p = await open(t, { cached: true, readStatus: 503 }, false);
  assert.equal(await input(p).count(), 0); assert.deepEqual(await writes(p), []);
  assert.equal(await p.evaluate(() => (window as any).fixture.snapshotReads.includes("/api/chat/conversations/conversation%3A1")), false);
});

for (const readData of [null, {}, { state: "pending", conversation: { conversationId: "conversation:1" }, messages: [] }, { state: "success", conversation: { conversationId: "other" }, messages: [] }]) test(`invalid current thread is visibly rejected ${JSON.stringify(readData)}`, async t => {
  const p = await open(t, { readData }, false);
  assert.equal(await input(p).count(), 0); assert.deepEqual(await writes(p), []);
  assert.match(await p.locator("body").innerText(), /没有读到当前会话/u);
});

test("summary is explicit and single-flight, then revoked with its conversation", async t => {
  const p = await open(t); assert.deepEqual(await writes(p), []);
  await p.evaluate(() => { const s = (window as any).fixture; s.presses["生成摘要"](); s.presses["生成摘要"](); }); await settle(p);
  assert.deepEqual(await writes(p), [{ path: "/api/chat/conversations/conversation%3A1/summary", body: null }]);
  await p.evaluate(() => { const s = (window as any).fixture; s.oldSummary = s.requests.findLastIndex((r: any) => r.method === "POST"); });
  await update(p, { conversationId: "conversation:2" });
  assert.equal(await p.evaluate(() => { const s = (window as any).fixture; return s.requests[s.oldSummary].signal.aborted; }), true);
  await p.evaluate(() => { const s = (window as any).fixture; s.reply(s.oldSummary, 200, { summary: { narrative: "旧会话摘要不能串入" } }); }); await settle(p);
  assert.equal(await p.getByText("旧会话摘要不能串入", { exact: true }).count(), 0);
});

test("a summary appears only after an accepted explicit response and survives ordinary refresh", async t => {
  const p = await open(t);
  await p.getByRole("button", { name: "生成摘要", exact: true }).click(); await settle(p);
  await p.evaluate(() => { const s = (window as any).fixture; s.reply(s.requests.findLastIndex((r: any) => r.method === "POST"), 200, { conversationId: s.conversationId, summary: { narrative: "这段摘要需要人工复核", evidenceIds: ["evidence:1"] }, provenance: { sourceLabel: "summary" } }); }); await settle(p);
  assert.equal(await p.getByText("这段摘要需要人工复核", { exact: true }).count(), 1); await refresh(p);
  assert.equal(await p.getByText("这段摘要需要人工复核", { exact: true }).count(), 1); assert.equal((await writes(p)).length, 1);
});

test("a captured save cannot overwrite a later edit and a new GET replaces the displayed messages", async t => {
  const p = await open(t); await fill(p, "先写的草稿");
  await p.evaluate(() => { const s = (window as any).fixture; s.oldSave = s.presses["保存草稿"]; });
  await fill(p, "后改的草稿"); await p.evaluate(() => (window as any).fixture.oldSave()); await settle(p);
  assert.deepEqual(await writes(p), []); assert.equal(await input(p).inputValue(), "后改的草稿");
  await save(p);
  await p.evaluate(() => { const s = (window as any).fixture; const i = s.requests.findLastIndex((r: any) => r.method === "POST"); const receipt = s.receipt(s.requests[i].body.body); s.messages = [receipt.message]; s.reply(i, 201, receipt); }); await settle(p);
  await p.evaluate(() => { const s = (window as any).fixture; s.messages = [s.message("另一端新增的草稿", "remote:1")]; }); await refresh(p);
  assert.equal(await p.getByText("另一端新增的草稿", { exact: true }).count(), 1);
  assert.equal(await p.getByText("后改的草稿", { exact: true }).count(), 0);
});

for (const patch of [{ actor: "actor-2" }, { conversationId: "conversation:2" }, { baseUrl: "https://other.example" }, { cookieHeader: "session=new-test-session" }, { ready: false }, { baseReady: false }, { signedIn: false }, { mounted: false }]) test(`scope changes abort writes and discard late expiry/receipt ${JSON.stringify(patch)}`, async t => {
  const p = await open(t); await fill(p); await save(p);
  await p.evaluate(() => { const s = (window as any).fixture; s.oldWrite = s.requests.findLastIndex((r: any) => r.method === "POST"); s.oldSave = s.presses["保存草稿"]; });
  await update(p, patch);
  assert.equal(await p.evaluate(() => { const s = (window as any).fixture; return s.requests[s.oldWrite].signal?.aborted; }), true);
  await p.evaluate(() => { const s = (window as any).fixture; s.oldSave(); s.reply(s.oldWrite, 401); }); await settle(p);
  assert.equal((await writes(p)).length, 1); assert.equal(await p.evaluate(() => (window as any).fixture.expiries), 0);
  assert.equal(await p.getByText("回复草稿已保存", { exact: true }).count(), 0);
  if (await input(p).count()) assert.equal(await input(p).inputValue(), "");
});
