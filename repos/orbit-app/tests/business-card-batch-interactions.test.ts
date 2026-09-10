import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { build } from "esbuild";
import { chromium, type Browser, type Page } from "playwright";

const require = createRequire(import.meta.url);
let browser: Browser;
let script: string;
const hasRoute = existsSync(new URL("../app/contacts/new/batch/[id].tsx", import.meta.url));
// Real React, screen, form, theme, private gate, client, schemas and selected-image
// helper run. Only native/router/providers, clock and fetch are controlled here.
const fixture = `
import React, { useEffect, useSyncExternalStore } from "react";
import { View } from "react-native-web";
const listeners = new Set(); let revision = 0;
const observe = () => useSyncExternalStore(fn => { listeners.add(fn); return () => listeners.delete(fn); }, () => revision);
const extraction = { fullName: "Misaki Hayashi", nativeFullName: "林 美咲", romanizedFullName: "HAYASHI Misaki", organization: "Orbit Labs", title: "Director", departments: ["Research"], emails: [{ label: "Work", value: "one@example.invalid" }, { label: "Personal", value: "two@example.invalid" }], contactPoints: [{ type: "wechat", label: "微信", value: "misaki-chat" }, { type: "mobile", label: "携帯", value: "090-primary" }], website: "https://orbit.invalid", addresses: [{ label: "Tokyo", value: "Tokyo address" }], certifications: ["PhD"], detectedLanguages: ["ja"] };
const stamp = "2026-09-10T00:00:00Z";
const timers = new Map(); let timerId = 10000;
window.setInterval = (fn, ms) => { const id = ++timerId; timers.set(id, { fn, ms }); return id; };
window.clearInterval = id => timers.delete(id);
const appListeners = new Set();
const state = window.fixture = { actor: "one", baseUrl: "https://orbit.example", ready: true, baseReady: true, signedIn: true, mounted: true, focused: true, appState: "active", batchId: "batch:/ 空", route: false, requests: [], replies: [], rejects: [], images: [], imageReplies: [], alerts: [], presses: {}, navigation: [], now: 1800000000000, ...window.initialFixture,
 update(patch) { Object.assign(state, patch); if (patch.appState) appListeners.forEach(fn => fn(patch.appState)); revision++; listeners.forEach(fn => fn()); },
 tick() { [...timers.values()].forEach(t => t.fn()); }, timers() { return [...timers.values()].map(t => t.ms); },
 snapshot(index, patch = {}) { const r = state.requests[index]; const statuses = patch.statuses ?? ["extracted"];
 const batch = { id: r.batchId, actorId: patch.owner ?? r.actor, status: patch.status ?? "ready_for_review", totalItems: statuses.length, processedItems: statuses.filter(s => !["pending", "processing"].includes(s)).length, failedItems: statuses.filter(s => s === "failed").length, confirmedItems: statuses.filter(s => s === "confirmed").length, skippedItems: statuses.filter(s => s === "skipped").length, sourceFiles: [], createdAt: stamp, updatedAt: patch.version ?? stamp, expiresAt: patch.expired ? stamp : "2099-09-10T00:00:00Z" };
 const items = statuses.map((status, i) => ({ id: "item:" + i, batchId: batch.id, actorId: batch.actorId, seq: i + 1, sourceFileName: "card-" + i + ".png", sourcePage: null, status, imagePath: patch.noImage ? null : "private/object", imageDigest: "sha256:" + "a".repeat(64), uploadMimeType: "image/png", ...(batch.status === "processing" ? {} : { extraction: { ...extraction, fullName: patch.name ?? extraction.fullName } }), reviewIssues: [{ code: "INVALID_EMAIL", field: "email", message: "核对邮箱" }], usage: null, errorCode: status === "failed" ? "OCR_PROVIDER_FAILED" : null, attempts: 1, leaseOwner: null, leasedAt: null, confirmedContactId: status === "confirmed" ? "contact:/ 空" : null, createdAt: stamp, updatedAt: patch.version ?? stamp })); return { batch, items }; },
 reply(index, kind = "success", patch = {}) { if (kind === "network") { state.rejects[index](new Error("unavailable")); return; }
 const r = state.requests[index]; let data = state.snapshot(index, patch);
 if (r.method === "POST") data = r.path.endsWith("/confirm") ? { state: "created", contactId: "contact:/ 空" } : { state: r.path.endsWith("/skip") ? "skipped" : r.path.endsWith("/retry") ? "pending" : "completed" };
 if (kind === "duplicate") data = { state: "duplicate_review", duplicateContactId: "dup:/ 空" };
 if (kind === "malformed") data = r.method === "POST" ? { state: "created" } : {};
 if (kind === "wrong-state") data = { state: "unknown" };
 if (kind === "wrong-actor") data.items.forEach(i => i.actorId = "wrong");
 if (patch.itemIds) data.items?.forEach((item, i) => item.id = patch.itemIds[i]);
 if (kind === "wrong-batch") { data.batch.id = "wrong"; data.items.forEach(i => i.batchId = "wrong"); }
 const status = kind === "missing" ? 404 : kind === "forbidden" ? 403 : kind === "conflict" ? 409 : ["unavailable", "http-error"].includes(kind) ? 503 : 200;
 const failed = ["missing", "forbidden", "conflict", "unavailable"].includes(kind);
 state.replies[index](new Response(JSON.stringify(failed ? { success: false, error: { code: status === 403 ? "FORBIDDEN" : status === 404 ? "NOT_FOUND" : "CONFLICT", message: "请求未被接受" } } : { success: true, data }), { status, headers: { "content-type": "application/json" } })); },
 imageReply(index, fail = false) { state.imageReplies[index](fail ? new Response(JSON.stringify({ success: false, error: { code: "NOT_FOUND", message: "图片不可用" } }), { status: 404, headers: { "content-type": "application/json" } }) : new Response(Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a8MsAAAAASUVORK5CYII="), c => c.charCodeAt(0)), { status: 200, headers: { "content-type": "image/png" } })); },
 fill(label, value) { const field = document.querySelector('[aria-label="' + label + '"]'); Object.getOwnPropertyDescriptor(field.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, "value").set.call(field, value); field.dispatchEvent(new Event("input", { bubbles: true })); },
 confirm(index, cancel = false) { const button = state.alerts[index].buttons.find(b => cancel ? b.style === "cancel" : b.style !== "cancel"); button?.onPress?.(); },
};
Date.now = () => state.now;
window.fetch = async (url, init) => { const path = new URL(url).pathname; const r = { method: init.method, path, origin: new URL(url).origin, body: init.body ? JSON.parse(init.body) : null, headers: init.headers, credentials: init.credentials, signal: init.signal, actor: state.actor, batchId: state.batchId };
 if (path.endsWith("/image")) { state.images.push(r); return new Promise(resolve => state.imageReplies.push(resolve)); }
 state.requests.push(r); return new Promise((resolve, reject) => { state.replies.push(resolve); state.rejects.push(reject); }); };
export const useFixture = () => { observe(); return state; };
export const useOrbitApiBaseUrl = () => { observe(); return { baseUrl: state.baseUrl, ready: state.baseReady }; };
export const useOrbitAuthSession = () => { observe(); return { ready: state.ready, signedIn: state.signedIn, user: state.actor ? { id: state.actor } : null, cookieHeader: state.cookieHeader ?? "" }; };
export const useLocalSearchParams = () => { observe(); return { id: state.batchId, tab: "review" }; };
export const useGlobalSearchParams = useLocalSearchParams;
export const usePathname = () => "/contacts/new/batch/" + encodeURIComponent(state.batchId);
export const useFocusEffect = fn => { observe(); useEffect(() => state.focused ? fn() : undefined, [fn, state.focused]); };
const router = { canGoBack: () => false, back() {}, push(href) { state.navigation.push(href); }, replace(href) { state.navigation.push(href); } };
export const useRouter = () => router;
export const Redirect = ({ href }) => <div role="status">{href}</div>;
export const Stack = () => null;
export const SafeAreaView = ({ children, edges, ...props }) => <View {...props}>{children}</View>;
export const Ionicons = ({ size }) => <span aria-hidden="true" style={{ display: "inline-block", width: size, height: size }} />;
export const AppState = { get currentState() { return state.appState; }, addEventListener(event, fn) { appListeners.add(fn); return { remove() { appListeners.delete(fn); } }; } };
`;

test.before(async () => {
  const result = await build({ stdin: { contents: `import React from "react"; import { createRoot } from "react-dom/client"; import { useFixture } from "fixture"; import { BusinessCardBatchScreen } from "./src/screens/contacts/BusinessCardBatchScreen"; ${hasRoute ? 'import Route from "./app/contacts/new/batch/[id]";' : 'const Route = () => null;'} function App() { const s = useFixture(); return !s.mounted ? null : s.route ? <Route /> : <BusinessCardBatchScreen />; } createRoot(document.getElementById("root")).render(<App />);`, resolveDir: process.cwd(), loader: "tsx" }, bundle: true, write: false, format: "iife", jsx: "automatic", define: { "process.env.NODE_ENV": '"test"', "process.env": "{}", __DEV__: "false" }, plugins: [{ name: "batch-boundaries", setup(plugin) {
    plugin.onResolve({ filter: /^react-native$/ }, () => ({ path: "native", namespace: "batch" }));
    plugin.onResolve({ filter: /^(fixture|expo-router|@expo\/vector-icons|react-native-safe-area-context|expo-file-system|expo-crypto)$|\/(ApiBaseUrlProvider|AuthSessionProvider)$/ }, () => ({ path: "fixture", namespace: "batch" }));
    plugin.onLoad({ filter: /.*/, namespace: "batch" }, args => ({ contents: args.path === "native" ? `import React from "react"; import { Image as NativeImage, Pressable as NativePressable } from "react-native-web"; export * from "react-native-web"; export { AppState } from "fixture"; export const Alert = { alert(title, message, buttons) { window.fixture.alerts.push({ title, message, buttons: buttons.slice(0, 3) }); } }; export const Image = props => { window.fixture.imageError = props.onError; return <NativeImage {...props} />; }; export const Pressable = props => { if (props.accessibilityLabel) window.fixture.presses[props.accessibilityLabel] = props.onPress; return <NativePressable {...props} />; };` : fixture + '\nexport const File = class {}; export const CryptoDigestAlgorithm = {}; export const digest = () => { throw Error("unexpected native hashing"); };', loader: "jsx", resolveDir: process.cwd() }));
    plugin.onResolve({ filter: /^react-native-web$/ }, () => ({ path: require.resolve("react-native-web") }));
  } }] });
  script = result.outputFiles[0]!.text; browser = await chromium.launch({ headless: true });
});
test.after(async () => { await browser?.close(); });
async function settle(p: Page) { await p.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); }
async function open(t: { after: (fn: () => Promise<void>) => void }, patch: Record<string, unknown> = {}) { const p = await browser.newPage({ viewport: { width: 390, height: 844 }, colorScheme: patch.scheme === "dark" ? "dark" : "light" }); p.setDefaultTimeout(2500); const errors: string[] = []; p.on("pageerror", e => errors.push(e.message)); t.after(async () => { await p.close(); assert.deepEqual(errors, []); }); await p.route("**/*", r => r.abort()); await p.setContent('<div id="root"></div>'); await p.evaluate(patch => { (window as any).initialFixture = patch; }, patch); await p.addScriptTag({ content: script }); await settle(p); await p.waitForFunction(() => { const s = (window as any).fixture; return !s.ready || !s.baseReady || !s.signedIn || !s.actor || !s.batchId || !s.focused || s.requests.length > 0; }); return p; }
async function reply(p: Page, index: number, kind = "success", patch = {}) { await p.waitForFunction(index => Boolean((window as any).fixture.requests[index]), index); await p.evaluate(({ index, kind, patch }) => (window as any).fixture.reply(index, kind, patch), { index, kind, patch }); await settle(p); }
async function update(p: Page, patch: object) { await p.evaluate(patch => (window as any).fixture.update(patch), patch); await settle(p); }
async function press(p: Page, label: string) { await p.getByRole("button", { name: label, exact: true }).click(); await settle(p); }
async function direct(p: Page, label: string) { await p.evaluate(label => { const fn = (window as any).fixture.presses[label]; fn(); fn(); }, label); await settle(p); }
async function fill(p: Page, label: string, value: string) { await p.evaluate(({ label, value }) => (window as any).fixture.fill(label, value), { label, value }); await settle(p); }
async function count(p: Page) { return p.evaluate(() => (window as any).fixture.requests.length); }
async function tick(p: Page) { await p.evaluate(() => (window as any).fixture.tick()); await settle(p); }
async function confirm(p: Page, index: number, cancel = false) { await p.evaluate(({ index, cancel }) => (window as any).fixture.confirm(index, cancel), { index, cancel }); await settle(p); }

test("FinalFix I1 legacy confirmation body preserves labeled channel meanings", async t => {
  const p = await open(t);
  await p.evaluate(() => {
    const s = (window as any).fixture; const d = s.snapshot(0);
    d.items[0].extraction.contactPoints = [
      { type: "phone", label: "Office", value: "0312345678" },
      { type: "fax", label: "Office", value: "0312345678" },
      { type: "fax", label: "Office", value: "0312345678" },
      { type: "wechat", label: "Tokyo", value: "same-account" },
      { type: "whatsapp", label: "Tokyo", value: "same-account" },
    ];
    s.replies[0](new Response(JSON.stringify({ success: true, data: d }), { headers: { "content-type": "application/json" } }));
  }); await settle(p);
  await press(p, "确认收录");
  const body = await p.evaluate(() => (window as any).fixture.requests[1].body);
  assert.equal(body.phone, "0312345678");
  for (const line of ["phone (Office): 0312345678", "fax (Office): 0312345678", "wechat (Tokyo): same-account", "whatsapp (Tokyo): same-account"]) {
    assert.equal(body.notes.split("\n").filter((note: string) => note === line).length, 1, line);
  }
});

test("loading and unavailable/missing/forbidden/malformed reads expose no mutation authority", async t => {
  const p = await open(t); assert.equal(await count(p), 1);
  await p.getByText("正在读取批次...", { exact: true }).waitFor();
  for (const [i, kind] of ["unavailable", "missing", "forbidden", "malformed", "wrong-actor", "wrong-batch", "http-error", "network"].entries()) { await reply(p, i, kind); await p.getByRole("alert").waitFor(); assert.equal(await p.getByLabel("姓名", { exact: true }).count(), 0); await press(p, "刷新批次"); }
  await reply(p, 8); assert.equal(await p.getByLabel("姓名", { exact: true }).inputValue(), "林 美咲");
});
test("actual controlled form submits exact edited fields once and links the confirmed contact", async t => {
  const p = await open(t); await reply(p, 0); await p.getByText("核对邮箱", { exact: true }).waitFor();
  for (const [label, value] of [["姓名", "Edited"], ["公司", "New Org"], ["职位", "Lead"], ["邮箱", "new@example.invalid"], ["电话", "123"], ["认识背景", "Meeting"], ["备注", "Keep notes"]]) await fill(p, label!, value!);
  await direct(p, "确认收录"); assert.equal(await count(p), 2);
  assert.deepEqual(await p.evaluate(() => { const r = (window as any).fixture.requests[1]; return [r.method, r.path, r.body]; }), ["POST", "/api/contact-drafts/business-card/batches/batch%3A%2F%20%E7%A9%BA/items/item%3A0/confirm", { displayName: "Edited", organization: "New Org", role: "Lead", email: "new@example.invalid", phone: "123", relationshipContext: "Meeting", notes: "Keep notes", allowDuplicate: false }]);
  await reply(p, 1); assert.equal(await count(p), 3); await reply(p, 2, "success", { statuses: ["confirmed"], noImage: true });
  await press(p, "查看联系人 1"); assert.deepEqual(await p.evaluate(() => (window as any).fixture.navigation), ["/contacts/contact%3A%2F%20%E7%A9%BA"]);
});
test("duplicate review requires second explicit consent; cancelling sends nothing and edits clear consent", async t => {
  const p = await open(t); await reply(p, 0); await press(p, "确认收录"); await reply(p, 1, "duplicate");
  assert.equal(await count(p), 2); await press(p, "仍然收录"); assert.equal(await count(p), 2); await confirm(p, 0, true); assert.equal(await count(p), 2);
  await press(p, "仍然收录"); await fill(p, "姓名", "Changed"); await confirm(p, 1); assert.equal(await count(p), 2); assert.equal(await p.getByRole("button", { name: "仍然收录", exact: true }).count(), 0);
  await press(p, "确认收录"); await reply(p, 2, "duplicate"); await press(p, "仍然收录"); await confirm(p, 2); await confirm(p, 2); assert.equal(await count(p), 4);
  assert.equal(await p.evaluate(() => (window as any).fixture.requests[3].body.allowDuplicate), true);
});
test("processing polls every three seconds with one read and stops on terminal/inactive states", async t => {
  const p = await open(t); await reply(p, 0, "success", { status: "processing", statuses: ["processing"] });
  assert.deepEqual(await p.evaluate(() => (window as any).fixture.timers()), [3000]);
  await tick(p); await tick(p); assert.equal(await count(p), 2); await reply(p, 1, "success", { status: "processing", statuses: ["pending"] });
  await update(p, { focused: false }); await tick(p); assert.equal(await count(p), 2);
  await update(p, { focused: true }); assert.equal(await count(p), 3); await reply(p, 2, "success", { status: "processing", statuses: ["processing"] });
  await update(p, { appState: "background" }); await tick(p); assert.equal(await count(p), 3);
  await update(p, { appState: "active" }); assert.equal(await count(p), 4); await reply(p, 3, "success", { status: "completed", statuses: ["confirmed"], noImage: true });
  await tick(p); assert.equal(await count(p), 4); assert.deepEqual(await p.evaluate(() => (window as any).fixture.timers()), []);
});
test("dirty forms survive switching items, retry processing projection, polling and failed refresh", async t => {
  const p = await open(t); await reply(p, 0, "success", { statuses: ["extracted", "failed"] }); await fill(p, "备注", "Keep dirty");
  await press(p, "选择名片 2"); await press(p, "重试识别"); await reply(p, 1); await reply(p, 2, "success", { status: "processing", statuses: ["extracted", "pending"] });
  await press(p, "选择名片 1"); assert.equal(await p.getByLabel("备注", { exact: true }).inputValue(), "Keep dirty");
  await tick(p); await reply(p, 3, "unavailable"); assert.equal(await p.getByLabel("备注", { exact: true }).inputValue(), "Keep dirty");
  await tick(p); await reply(p, 4, "success", { statuses: ["extracted", "extracted"] }); assert.equal(await p.getByLabel("备注", { exact: true }).inputValue(), "Keep dirty");
});
for (const action of ["确认收录", "跳过名片", "重试识别", "完成批次"]) test(`${action} rejects wrong-state/malformed/non2xx, preserves edits and refetches conflicts`, async t => {
  const p = await open(t); await reply(p, 0, "success", { statuses: action === "重试识别" || action === "完成批次" ? ["failed"] : ["extracted"] });
  if (action === "确认收录") await fill(p, "备注", "Unchanged");
  let index = 1;
  for (const [alertIndex, kind] of ["malformed", "wrong-state", "http-error", "conflict"].entries()) {
    await press(p, action); if (action === "完成批次" || action === "跳过名片") await confirm(p, alertIndex);
    await reply(p, index++, kind); await p.getByRole("alert").waitFor();
    if (kind === "conflict") { assert.equal(await count(p), index + 1); await reply(p, index++, "success", { statuses: action === "重试识别" || action === "完成批次" ? ["failed"] : ["extracted"] }); }
    else { await press(p, "刷新批次"); await reply(p, index++, "success", { statuses: action === "重试识别" || action === "完成批次" ? ["failed"] : ["extracted"] }); }
    if (action === "确认收录") assert.equal(await p.getByLabel("备注", { exact: true }).inputValue(), "Unchanged");
  }
});
test("skip and finish require acknowledgments; failed items are truthfully settled", async t => {
  const p = await open(t); await reply(p, 0, "success", { statuses: ["extracted", "failed"] }); await press(p, "跳过名片"); await confirm(p, 0, true); assert.equal(await count(p), 1);
  await press(p, "跳过名片"); await confirm(p, 1); await reply(p, 1); await reply(p, 2, "success", { statuses: ["skipped", "failed"] });
  await press(p, "完成批次"); assert.equal(await count(p), 3); await confirm(p, 2); await reply(p, 3); await p.getByText("批次已完成", { exact: true }).waitFor();
  assert.equal(await p.getByText("2. card-1.png · 识别失败", { exact: true }).count(), 1); assert.equal(await p.getByRole("button", { name: "确认收录", exact: true }).count(), 0);
});
for (const change of ["actor", "baseUrl", "batchId", "ready", "baseReady", "mounted"]) for (const operation of ["read", "mutation", "consent"]) test(`${operation} cannot cross ${change} including same-client empty-cookie accounts`, async t => {
  const p = await open(t);
  if (operation !== "read") { await reply(p, 0); await fill(p, "备注", "Old scope"); await press(p, "确认收录"); if (operation === "consent") { await reply(p, 1, "duplicate"); await press(p, "仍然收录"); } }
  await update(p, { [change]: change === "actor" ? "two" : change === "baseUrl" ? "https://other.example" : change === "batchId" ? "other" : false });
  const before = await count(p);
  if (operation === "consent") await confirm(p, 0); else await reply(p, operation === "read" ? 0 : 1);
  assert.equal(await count(p), before); assert.equal(await p.getByRole("button", { name: "仍然收录", exact: true }).count(), 0); assert.equal(await p.getByLabel("备注", { exact: true }).count(), 0);
  if (["actor", "baseUrl", "batchId"].includes(change)) { await reply(p, before - 1); assert.ok(!(await p.getByLabel("备注", { exact: true }).inputValue()).includes("Old scope")); }
});
test("only selected authenticated image loads, aborts on selection/removal and ignores late bytes", async t => {
  const p = await open(t); await reply(p, 0, "success", { statuses: ["extracted", "extracted"] });
  assert.equal(await p.evaluate(() => (window as any).fixture.images.length), 1);
  assert.deepEqual(await p.evaluate(() => { const r = (window as any).fixture.images[0]; return [r.path, r.credentials]; }), ["/api/contact-drafts/business-card/batches/batch%3A%2F%20%E7%A9%BA/items/item%3A0/image", "include"]);
  await press(p, "选择名片 2"); assert.equal(await p.evaluate(() => (window as any).fixture.images[0].signal.aborted), true);
  await p.evaluate(() => (window as any).fixture.imageReply(0)); await settle(p); assert.equal(await p.getByRole("img", { name: "名片图片" }).count(), 0);
  await p.evaluate(() => (window as any).fixture.imageReply(1)); await settle(p); await p.getByRole("img", { name: "名片图片" }).first().waitFor();
  await press(p, "刷新批次"); await reply(p, 1, "success", { statuses: ["extracted", "extracted"], noImage: true }); assert.equal(await p.getByRole("img", { name: "名片图片" }).count(), 0);
});
test("image unavailable is visible with no public fallback; expired batch cannot mutate", async t => {
  const p = await open(t); await reply(p, 0); await p.evaluate(() => (window as any).fixture.imageReply(0, true)); await settle(p); await p.getByText("图片不可用", { exact: true }).waitFor();
  assert.equal(await p.getByRole("img", { name: "名片图片" }).count(), 0); await press(p, "刷新批次"); await reply(p, 1, "success", { expired: true }); await direct(p, "确认收录"); assert.equal(await count(p), 2);
});

test("native Image error exposes unavailable state and authenticated image retry recovers", async t => {
  const p = await open(t, { cookieHeader: "authjs.session-token=fixture-only" }); await reply(p, 0);
  await p.evaluate(() => (window as any).fixture.imageReply(0)); await settle(p);
  await p.evaluate(() => (window as any).fixture.imageError?.({ nativeEvent: { error: "fixture decode failure" } })); await settle(p);
  assert.equal(await p.getByText("名片图片无法显示，请重新加载。", { exact: true }).count(), 1);
  assert.equal(await p.getByRole("img", { name: "名片图片" }).count(), 0);
  await press(p, "重载图片");
  assert.deepEqual(await p.evaluate(() => { const s = (window as any).fixture; const r = s.images[1]; return [s.images.length, r.path, r.headers.Cookie, r.credentials]; }), [2, "/api/contact-drafts/business-card/batches/batch%3A%2F%20%E7%A9%BA/items/item%3A0/image", "authjs.session-token=fixture-only", "omit"]);
  await p.evaluate(() => (window as any).fixture.imageReply(1)); await settle(p);
  assert.equal(await p.locator('img[alt="名片图片"]').evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0), true);
  assert.equal(await p.getByRole("button", { name: "重载图片", exact: true }).count(), 0);
});

for (const change of ["item", "actor", "baseUrl", "batchId", "attempt", "mounted"]) test(`native Image error ignores superseded ${change} even with identical image bytes`, async t => {
  const p = await open(t); await reply(p, 0, "success", { statuses: ["extracted", "extracted"] });
  await p.evaluate(() => (window as any).fixture.imageReply(0)); await settle(p);
  await p.evaluate(() => { (window as any).oldImageError = (window as any).fixture.imageError; });
  if (change === "item") await press(p, "选择名片 2");
  else if (change === "attempt") {
    await p.evaluate(() => (window as any).oldImageError?.({ nativeEvent: { error: "fixture decode failure" } })); await settle(p);
    assert.equal(await p.getByText("名片图片无法显示，请重新加载。", { exact: true }).count(), 1);
    await press(p, "重载图片");
  } else await update(p, { [change]: change === "actor" ? "two" : change === "baseUrl" ? "https://other.example" : change === "batchId" ? "other" : false });
  await p.evaluate(() => (window as any).oldImageError?.({ nativeEvent: { error: "late decode failure" } })); await settle(p);
  assert.equal(await p.getByText("名片图片无法显示，请重新加载。", { exact: true }).count(), 0);
  if (change === "mounted") { assert.equal(await p.getByRole("img", { name: "名片图片" }).count(), 0); return; }
  if (["actor", "baseUrl", "batchId"].includes(change)) await reply(p, 1);
  await p.evaluate(() => (window as any).fixture.imageReply(1)); await settle(p);
  await p.evaluate(() => (window as any).oldImageError?.({ nativeEvent: { error: "late decode failure" } })); await settle(p);
  assert.equal(await p.locator('img[alt="名片图片"]').evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0), true);
  assert.equal(await p.getByRole("button", { name: "重载图片", exact: true }).count(), 0);
  await p.evaluate(() => (window as any).fixture.imageError?.({ nativeEvent: { error: "current decode failure" } })); await settle(p);
  assert.equal(await p.getByText("名片图片无法显示，请重新加载。", { exact: true }).count(), 1);
});
test("private route gates auth/readiness and retains the exact legacy return destination", async t => {
  const p = await open(t, { route: true, signedIn: false, actor: null, ready: false }); assert.ok(hasRoute, "real private route exists"); await p.getByRole("progressbar", { name: "正在确认登录状态", exact: true }).waitFor(); assert.equal(await count(p), 0);
  await update(p, { ready: true }); const href = await p.getByRole("status").textContent(); assert.equal(href, `/account/login?next=${encodeURIComponent("/contacts/new/batch/batch%3A%2F%20%E7%A9%BA?tab=review")}`);
  await update(p, { signedIn: true, actor: "one" }); assert.equal(await count(p), 1);
});

test("session profile and canonical account may differ, but accepted owner cannot change within a scope", async t => {
  const p = await open(t, { actor: "profile:one" }); await reply(p, 0, "success", { owner: "account:one" });
  assert.equal(await p.getByLabel("姓名", { exact: true }).inputValue(), "林 美咲");
  await press(p, "刷新批次"); await reply(p, 1, "success", { owner: "account:two" }); await p.getByRole("alert").waitFor();
  await direct(p, "确认收录"); assert.equal(await count(p), 2);
  await update(p, { actor: "profile:two" }); await reply(p, 2, "success", { owner: "account:two" }); await press(p, "确认收录"); assert.equal(await count(p), 4);
});

for (const action of ["确认收录", "跳过名片", "重试识别"]) test(`retained ${action} callback cannot target a newly selected item`, async t => {
  const p = await open(t); await reply(p, 0, "success", { statuses: action === "重试识别" ? ["failed", "failed"] : ["extracted", "extracted"] });
  await p.evaluate(label => { (window as any).oldPress = (window as any).fixture.presses[label]; }, action);
  await press(p, "选择名片 2"); await p.evaluate(() => (window as any).oldPress()); await settle(p);
  assert.equal(await count(p), 1); assert.equal(await p.evaluate(() => (window as any).fixture.alerts.length), 0);
});

test("delayed override is invalid after switching items or accepting a new version", async t => {
  const p = await open(t); await reply(p, 0, "success", { statuses: ["extracted", "extracted"] }); await press(p, "确认收录"); await reply(p, 1, "duplicate"); await press(p, "仍然收录");
  await press(p, "选择名片 2"); await confirm(p, 0); assert.equal(await count(p), 2);
  await press(p, "确认收录"); await reply(p, 2, "duplicate"); await press(p, "仍然收录"); await press(p, "刷新批次"); await reply(p, 3, "success", { statuses: ["extracted", "extracted"], version: "2026-09-10T00:01:00Z" }); await confirm(p, 1); assert.equal(await count(p), 4);
});

test("explicit reload discards only the selected dirty draft after a successful read", async t => {
  const p = await open(t); await reply(p, 0); await fill(p, "备注", "Keep until accepted");
  await press(p, "重新载入识别结果"); await confirm(p, 0, true); assert.equal(await count(p), 1);
  await press(p, "重新载入识别结果"); await confirm(p, 1); await reply(p, 1, "unavailable"); assert.equal(await p.getByLabel("备注", { exact: true }).inputValue(), "Keep until accepted");
  await press(p, "重新载入识别结果"); await confirm(p, 2); await reply(p, 2); assert.ok((await p.getByLabel("备注", { exact: true }).inputValue()).includes("misaki-chat"));
});

test("explicit reload consent preserves edits made while its successful read is pending", async t => {
  const p = await open(t); await reply(p, 0); await fill(p, "备注", "Consented draft");
  await press(p, "重新载入识别结果"); await confirm(p, 0); assert.equal(await count(p), 2);
  await fill(p, "备注", "New notes after consent"); await fill(p, "姓名", "New name after consent");
  await reply(p, 1);
  assert.equal(await p.getByLabel("备注", { exact: true }).inputValue(), "New notes after consent");
  assert.equal(await p.getByLabel("姓名", { exact: true }).inputValue(), "New name after consent");
});

test("late processing poll and image bytes cannot replace a newer same-client account read", async t => {
  const p = await open(t); await reply(p, 0, "success", { status: "processing", statuses: ["extracted"] }); await tick(p);
  await update(p, { actor: "two" }); await reply(p, 2); await fill(p, "备注", "New account draft");
  await reply(p, 1); await p.evaluate(() => (window as any).fixture.imageReply(0)); await settle(p);
  assert.equal(await p.getByLabel("备注", { exact: true }).inputValue(), "New account draft"); assert.equal(await p.getByRole("img", { name: "名片图片" }).count(), 0);
  assert.equal(await p.evaluate(() => (window as any).fixture.requests[1].signal.aborted), true);
});

test("special item IDs retain dirty fields without prototype collisions", async t => {
  const p = await open(t); await reply(p, 0, "success", { itemIds: ["__proto__"] }); await fill(p, "备注", "Special ID edit"); await press(p, "刷新批次"); await reply(p, 1, "success", { status: "processing", statuses: ["extracted"], itemIds: ["__proto__"] });
  assert.equal(await p.getByLabel("备注", { exact: true }).inputValue(), "Special ID edit");
});

test("selected image uses explicit cookie/omit transport and aborts on unmount", async t => {
  const p = await open(t, { cookieHeader: "authjs.session-token=fixture-only" }); await reply(p, 0);
  await p.waitForFunction(() => (window as any).fixture.images.length === 1);
  assert.deepEqual(await p.evaluate(() => { const r = (window as any).fixture.images[0]; return [r.headers.Cookie, r.credentials, r.path.includes("fixture-only")]; }), ["authjs.session-token=fixture-only", "omit", false]);
  await update(p, { mounted: false }); assert.equal(await p.evaluate(() => (window as any).fixture.images[0].signal.aborted), true);
  await p.evaluate(() => (window as any).fixture.imageReply(0)); await settle(p); assert.equal(await p.getByRole("img", { name: "名片图片" }).count(), 0);
});

test("missing batch parameter never starts a read or mutation", async t => {
  const p = await open(t, { batchId: "" }); await p.getByText("缺少批次编号。", { exact: true }).waitFor();
  assert.equal(await count(p), 0); assert.equal(await p.getByRole("button", { name: "刷新批次", exact: true }).isDisabled(), true);
});

test("processing expiry stops polling and clears the selected image while the screen remains open", async t => {
  const p = await open(t); await reply(p, 0, "success", { status: "processing", statuses: ["extracted"] });
  await p.evaluate(() => (window as any).fixture.imageReply(0)); await settle(p);
  await update(p, { now: Date.parse("2100-01-01T00:00:00Z") }); await tick(p);
  assert.equal(await count(p), 1); assert.deepEqual(await p.evaluate(() => (window as any).fixture.timers()), []);
  assert.equal(await p.getByRole("img", { name: "名片图片" }).count(), 0);
});

test("reselecting the current item does not strand its pending authenticated image", async t => {
  const p = await open(t); await reply(p, 0); await press(p, "选择名片 1");
  assert.equal(await p.evaluate(() => (window as any).fixture.images[0].signal.aborted), false);
  await p.evaluate(() => (window as any).fixture.imageReply(0)); await settle(p); await p.getByRole("img", { name: "名片图片" }).first().waitFor();
  assert.equal(await p.evaluate(() => (window as any).fixture.images.length), 1);
});

for (const [width, scheme] of [[390, "light"], [1280, "dark"]] as const) test(`review layout fits ${width}px ${scheme} and retains input on theme change`, async t => {
  const p = await open(t, { scheme }); await p.setViewportSize({ width, height: 900 }); await reply(p, 0); await fill(p, "备注", "Layout draft");
  await p.evaluate(() => (window as any).fixture.imageReply(0)); await settle(p);
  assert.equal(await p.locator('img[alt="名片图片"]').evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0), true);
  const overflow = await p.evaluate(() => Array.from(document.querySelectorAll('[role="button"], input, textarea')).filter(element => { const box = element.getBoundingClientRect(); return box.width > 0 && (box.left < -1 || box.right > window.innerWidth + 1 || element.scrollWidth > element.clientWidth + 2); }).map(element => element.getAttribute("aria-label")));
  assert.deepEqual(overflow, []);
  assert.equal(await p.locator("#root > div").evaluate(element => getComputedStyle(element).backgroundColor), scheme === "dark" ? "rgb(25, 28, 34)" : "rgb(247, 246, 243)");
  if (process.env.TASK3_VISUAL === "1") console.log(`TASK3_IMAGE_${width}:` + (await p.screenshot({ fullPage: true })).toString("base64"));
  await p.emulateMedia({ colorScheme: scheme === "light" ? "dark" : "light" }); await p.waitForFunction(expected => getComputedStyle(document.querySelector("#root > div")!).backgroundColor === expected, scheme === "light" ? "rgb(25, 28, 34)" : "rgb(247, 246, 243)"); assert.equal(await p.getByLabel("备注", { exact: true }).inputValue(), "Layout draft");
});
