import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { build } from "esbuild";
import { chromium, type Browser, type Page } from "playwright";
const require = createRequire(import.meta.url);
let browser: Browser;
let script: string;
// Real screens, schemas, client, preparation and uploads; native/router/providers,
// clock and fetch are controlled. This is not actual HTTP/DB/simulator evidence.
const fixture = "\nimport React, { useEffect, useSyncExternalStore } from \"react\";\nimport { View } from \"react-native-web\";\nconst listeners = new Set(); let revision = 0;\nconst observe = () => useSyncExternalStore(fn => { listeners.add(fn); return () => listeners.delete(fn); }, () => revision);\nconst png = Uint8Array.from(atob(\"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=\"), c => c.charCodeAt(0));\nconst hash = \"f3ec9e14b9c085b55edc96155f7bd26b6fdeda2462f02af4e0279d8319b365e3\";\nconst stamp = \"2026-09-10T00:00:00Z\";\nconst timers = new Map(); let timerId = 10000;\nwindow.setInterval = (fn, ms) => { const id = ++timerId; timers.set(id, { fn, ms }); return id; };\nwindow.clearInterval = id => timers.delete(id);\nconst appListeners = new Set();\nconst s = window.fixture = { screen: \"start\", actor: \"subject\", owner: \"canonical-owner\", ready: true, baseReady: true, signedIn: true, baseUrl: \"https://orbit.example\", cookieHeader: \"\", batchId: \"batch:/\", focused: true, mounted: true, appState: \"active\", requests: [], replies: [], picks: [], pickReplies: [], reads: [], readReplies: [], holdRead: false, alerts: [], navigation: [], presses: {}, now: 1800000000000, ...window.initialFixture,\n update(patch) { Object.assign(s, patch); if (patch.appState) appListeners.forEach(fn => fn(patch.appState)); revision++; listeners.forEach(fn => fn()); },\n tick() { [...timers.values()].forEach(t => t.fn()); }, timers() { return [...timers.values()].map(t => t.ms); },\n detail(patch = {}) { const statuses = patch.statuses ?? [\"awaiting_upload\"];\n const batch = { id: patch.id ?? s.batchId, actorId: patch.owner ?? s.owner, status: patch.status ?? \"collecting\", expectedItems: statuses.length, version: patch.version ?? 1, reviewGeneration: 0, idempotencyKey: patch.key ?? \"key-1\", manifestFingerprint: \"a\".repeat(64), statusReason: null, createdAt: stamp, updatedAt: stamp, finalizedAt: patch.status === \"processing\" ? stamp : null, expiresAt: patch.expired ? stamp : \"2099-01-01T00:00:00Z\" };\n const items = statuses.map((status, i) => ({ id: \"item:\" + i, batchId: batch.id, seq: i + 1, status, version: patch.itemVersion ?? 1, sourceFileName: \"card.png\", rawSize: png.length, rawMimeType: \"image/png\", clientDigest: \"sha256:\" + hash, imageDigest: null, derivativeObjectKey: null, derivativeSize: null, extraction: null, extractionSchemaVersion: null, reviewIssues: [], usage: null, confirmedContactId: status === \"confirmed\" ? \"contact\" : null, attemptCount: 0, nextRetryAt: null, leaseExpiresAt: null, errorStage: null, errorCode: null, createdAt: stamp, updatedAt: stamp }));\n return { batch, items }; },\n legacy() { return { id: \"legacy:/\", actorId: s.owner, status: \"ready_for_review\", totalItems: 1, processedItems: 1, failedItems: 0, confirmedItems: 0, skippedItems: 0, sourceFiles: [], createdAt: stamp, updatedAt: stamp, expiresAt: \"2099-01-01T00:00:00Z\" }; },\n reply(index, kind = \"ok\", patch = {}) { const r = s.requests[index]; let data = s.detail(patch);\n if (r.method === \"GET\" && r.path.endsWith(\"/v2\")) data = { batches: patch.empty ? [] : [data.batch] };\n else if (r.method === \"GET\" && r.path.endsWith(\"/batches\")) data = { batches: patch.empty ? [] : [s.legacy()] };\n else if (r.method === \"POST\" && r.path.endsWith(\"/v2\")) { data = { ...data, reused: patch.reused ?? false }; data.batch.idempotencyKey = patch.wrongKey ? \"wrong\" : r.body.idempotencyKey; data.items = r.body.manifest.map((m, i) => ({ ...data.items[0], id: \"item:\" + i, seq: m.seq, sourceFileName: m.fileName, clientDigest: m.clientDigest, rawSize: m.rawSize, rawMimeType: m.mimeType })); data.batch.expectedItems = data.items.length; }\n else if (r.path.endsWith(\"/content\") || r.path.endsWith(\"/exclude\")) { const id = decodeURIComponent(r.path.split(\"/\").at(-2)); data = { item: { ...data.items[0], id, status: r.method === \"PUT\" ? \"uploaded\" : \"excluded\", version: 2 }, ...(r.method === \"PUT\" ? { alreadyUploaded: false } : {}) }; }\n else if (r.path.endsWith(\"/finalize\")) data = { batch: { ...data.batch, status: \"processing\", version: 2, finalizedAt: stamp }, alreadyFinalized: false };\n else if (r.path.endsWith(\"/cancel\")) data = { batch: { ...data.batch, status: \"cancelled\", version: 2 } };\n if (kind === \"wrong\") { if (data.item) data.item.id = \"wrong\"; else if (data.batch) data.batch.id = \"wrong\"; }\n if (kind === \"malformed\") data = {};\n const status = kind === \"conflict\" ? 409 : kind === \"gone\" ? 410 : [\"fail\", \"http-error\"].includes(kind) ? 503 : 200;\n s.replies[index](new Response(JSON.stringify([\"fail\", \"conflict\", \"gone\"].includes(kind) ? { success: false, error: { code: \"FAILED\", message: \"temporary failure\" } } : { success: true, data }), { status, headers: { \"content-type\": \"application/json\" } })); },\n pick(index, count = 1, cancelled = false, patch = {}) { s.pickReplies[index]({ canceled: cancelled, assets: Array.from({ length: count }, (_, i) => ({ uri: \"file:///card-\" + i + \".png\", fileName: \"card.png\", mimeType: \"image/heic\", ...patch })) }); },\n confirm(index, cancel = false) { s.alerts[index].buttons.find(b => cancel ? b.style === \"cancel\" : b.style !== \"cancel\")?.onPress?.(); }\n};\nDate.now = () => s.now;\nwindow.fetch = (url, init) => { const r = { path: new URL(url).pathname, origin: new URL(url).origin, method: init.method, body: typeof init.body === \"string\" ? JSON.parse(init.body) : init.body ? [...init.body] : null, headers: init.headers, signal: init.signal, actor: s.actor }; s.requests.push(r); return new Promise(resolve => s.replies.push(resolve)); };\nexport const useFixture = () => { observe(); return s; };\nexport const useOrbitAuthSession = () => { observe(); return { ready: s.ready, signedIn: s.signedIn, user: s.actor ? { id: s.actor } : null, cookieHeader: s.cookieHeader }; };\nexport const useOrbitApiBaseUrl = () => { observe(); return { ready: s.baseReady, baseUrl: s.baseUrl }; };\nexport const useLocalSearchParams = () => { observe(); return { id: s.batchId }; };\nexport const useGlobalSearchParams = useLocalSearchParams;\nexport const usePathname = () => s.screen === \"start\" ? \"/contacts/new/batch2\" : \"/contacts/new/batch2/\" + encodeURIComponent(s.batchId);\nexport const useFocusEffect = fn => { observe(); useEffect(() => s.focused ? fn() : undefined, [fn, s.focused]); };\nexport const useRouter = () => ({ canGoBack: () => false, back() {}, push(href) { s.navigation.push(href); }, replace(href) { s.navigation.push(href); } });\nexport const Redirect = ({ href }) => <div role=\"status\">{href}</div>;\nexport const Stack = () => null;\nexport const SafeAreaView = ({ children, edges, ...props }) => <View {...props}>{children}</View>;\nexport const Ionicons = ({ size }) => <span aria-hidden=\"true\" style={{ display: \"inline-block\", width: size, height: size }} />;\nexport const AppState = { get currentState() { return s.appState; }, addEventListener(event, fn) { appListeners.add(fn); return { remove() { appListeners.delete(fn); } }; } };\nexport const UIImagePickerPreferredAssetRepresentationMode = { Current: \"current\" };\nexport const launchImageLibraryAsync = options => { s.picks.push(options); return new Promise(resolve => s.pickReplies.push(resolve)); };\nexport const File = class { constructor(uri) { this.uri = uri; } get exists() { return true; } get size() { return s.rawSize ?? png.length; } async bytes() { s.reads.push(this.uri); if (s.holdRead) await new Promise(resolve => s.readReplies.push(resolve)); return png; } };\nexport const CryptoDigestAlgorithm = { SHA256: \"SHA-256\" };\nexport const digest = async () => Uint8Array.from(hash.match(/../g), h => parseInt(h, 16)).buffer;\nlet key = 0; export const randomUUID = () => \"key-\" + ++key;\n";
test.before(async () => {
  const start = existsSync(new URL("../src/screens/contacts/BusinessCardIngestStartScreen.tsx", import.meta.url));
  const detail = existsSync(new URL("../src/screens/contacts/BusinessCardIngestScreen.tsx", import.meta.url));
  const routes = existsSync(new URL("../app/contacts/new/batch2/index.tsx", import.meta.url));
  const contents = 'import React from "react"; import { createRoot } from "react-dom/client"; import { useFixture } from "fixture";' +
    'import { activatePendingIdentity, pendingFiles } from "./src/screens/contacts/business-card-pending-files"; window.capturePending = () => { const s = window.fixture; const scope = { identity: activatePendingIdentity(s.baseUrl, s.actor, s.ready && s.baseReady && s.signedIn), batchId: s.batchId }; const detail = s.detail(); return () => pendingFiles(scope, detail).size; };' +
    (start ? 'import { BusinessCardIngestStartScreen as Start } from "./src/screens/contacts/BusinessCardIngestStartScreen";' : 'const Start = () => null;') +
    (detail ? 'import { BusinessCardIngestScreen as Detail } from "./src/screens/contacts/BusinessCardIngestScreen";' : 'const Detail = () => null;') +
    (routes ? 'import StartRoute from "./app/contacts/new/batch2/index"; import DetailRoute from "./app/contacts/new/batch2/[id]";' : 'const StartRoute = () => null; const DetailRoute = () => null;') +
    'function App() { const s = useFixture(); return !s.mounted ? null : s.screen === "start" ? s.route ? <StartRoute /> : <Start /> : s.route ? <DetailRoute /> : <Detail />; } createRoot(document.getElementById("root")).render(<App />);';
  const result = await build({ stdin: { contents, resolveDir: process.cwd(), loader: "tsx" }, bundle: true, write: false, format: "iife", jsx: "automatic", define: { "process.env.NODE_ENV": '"test"', "process.env": "{}", __DEV__: "false" }, plugins: [{ name: "ingest-boundaries", setup(plugin) {
    plugin.onResolve({ filter: /^react-native$/ }, () => ({ path: "native", namespace: "ingest" }));
    plugin.onResolve({ filter: /^(fixture|expo-router|@expo\/vector-icons|react-native-safe-area-context|expo-file-system|expo-crypto|expo-image-picker)$|\/(ApiBaseUrlProvider|AuthSessionProvider)$/ }, () => ({ path: "fixture", namespace: "ingest" }));
    plugin.onLoad({ filter: /.*/, namespace: "ingest" }, args => ({ contents: args.path === "native" ? 'import React from "react"; import { Pressable as NativePressable } from "react-native-web"; export * from "react-native-web"; export { AppState } from "fixture"; export const Alert = { alert(title, message, buttons) { window.fixture.alerts.push({ title, message, buttons: buttons.slice(0, 3) }); } }; export const Pressable = props => { if (props.accessibilityLabel) window.fixture.presses[props.accessibilityLabel] = props.onPress; return <NativePressable {...props} />; };' : fixture, loader: "jsx", resolveDir: process.cwd() }));
    plugin.onResolve({ filter: /^react-native-web$/ }, () => ({ path: require.resolve("react-native-web") }));
  } }] });
  script = result.outputFiles[0]!.text; browser = await chromium.launch({ headless: true });
});
test.after(async () => { await browser?.close(); });
for (const screen of ["start", "detail"]) test("Fix1 background during " + screen + " preparation cancels the returned picker", async t => {
  const p = await open(t, { screen, holdRead: true });
  if (screen === "start") await listed(p); else await reply(p, 0);
  await press(p, screen === "start" ? "选择名片" : "重新选择名片");
  await update(p, { appState: "background" }); await update(p, { appState: "active" });
  await pick(p); await p.waitForFunction(() => (window as any).fixture.readReplies.length === 1);
  await update(p, { appState: "background" });
  await p.evaluate(() => (window as any).fixture.readReplies[0]()); await settle(p);
  await update(p, { appState: "active" });
  if (screen === "start") { await reply(p, 2); await reply(p, 3); } else await reply(p, 1);
  assert.equal(await p.getByRole("button", { name: screen === "start" ? "创建批次" : "上传待传名片", exact: true }).isDisabled(), true);
  assert.equal(await p.getByRole("alert").count(), 0);
});
for (const screen of ["start", "detail"]) test("Fix1 old " + screen + " picker cannot unlock a newer picker after focus return", async t => {
  const p = await open(t, { screen });
  if (screen === "start") await listed(p); else await reply(p, 0);
  const label = screen === "start" ? "选择名片" : "重新选择名片";
  await press(p, label); await update(p, { appState: "background" });
  await update(p, { focused: false }); await update(p, { appState: "active", focused: true });
  if (screen === "start") { await reply(p, 2); await reply(p, 3); } else await reply(p, 1);
  await press(p, label); await pick(p, 0);
  assert.equal(await p.getByRole("button", { name: label, exact: true }).isDisabled(), true);
  assert.equal(await p.evaluate(() => (window as any).fixture.reads.length), 0);
  await pick(p, 1);
  assert.equal(await p.getByRole("button", { name: screen === "start" ? "创建批次" : "上传待传名片", exact: true }).isDisabled(), false);
});
for (const stage of ["read", "put"]) test("Fix1 background still cancels upload " + stage + " with no recovery or next dispatch", async t => {
  const p = await open(t, { screen: "detail" }); await reply(p, 0);
  await press(p, "重新选择名片"); await pick(p);
  await p.evaluate(() => { (window as any).inspectPending = (window as any).capturePending(); });
  if (stage === "read") await update(p, { holdRead: true });
  await press(p, "上传待传名片");
  await update(p, { appState: "background" });
  if (stage === "read") { await p.evaluate(() => (window as any).fixture.readReplies[0]()); await settle(p); }
  else {
    assert.equal(await p.evaluate(() => (window as any).fixture.requests[1].signal.aborted), true);
    await reply(p, 1, "gone");
  }
  await p.evaluate(() => (window as any).fixture.tick()); await settle(p);
  assert.equal(await count(p), stage === "read" ? 1 : 2);
  assert.equal(await p.evaluate(() => (window as any).inspectPending()), 1, "unowned background response cannot mutate pending files");
});
test("Fix1 in-flight poll is aborted on background and its late response is ignored", async t => {
  const p = await open(t, { screen: "detail" }); await reply(p, 0);
  await p.evaluate(() => (window as any).fixture.tick()); await settle(p);
  await update(p, { appState: "background" });
  assert.equal(await p.evaluate(() => (window as any).fixture.requests[1].signal.aborted), true);
  await reply(p, 1, "ok", { status: "cancelled" });
  await update(p, { appState: "active" }); await reply(p, 2);
  assert.equal(await p.getByRole("button", { name: "重新选择名片", exact: true }).isDisabled(), false);
});
test("Fix1 picker does not preserve an independent collection request through background", async t => {
  const p = await open(t); await press(p, "选择名片");
  await update(p, { appState: "background" });
  assert.deepEqual(await p.evaluate(() => (window as any).fixture.requests.map((r: any) => r.signal.aborted)), [true, true]);
  await listed(p); await update(p, { appState: "active" }); await pick(p);
  assert.equal(await p.getByRole("button", { name: "创建批次", exact: true }).isDisabled(), false);
  assert.equal(await p.getByRole("button", { name: "打开批次 batch:/", exact: true }).count(), 0);
  await press(p, "刷新列表"); await reply(p, 2); await reply(p, 3);
  assert.equal(await p.getByRole("button", { name: "打开批次 batch:/", exact: true }).count(), 1);
});
for (const order of [["conflict", "gone"], ["gone", "fail"]]) test("Fix1 concurrent screen recovery clears captured pending for " + order.join(" then "), async t => {
  const p = await open(t, { screen: "detail" });
  await reply(p, 0, "ok", { statuses: ["awaiting_upload", "awaiting_upload", "awaiting_upload"] });
  await press(p, "重新选择名片"); await pick(p);
  await p.evaluate(() => { (window as any).inspectPending = (window as any).capturePending(); });
  await press(p, "上传待传名片"); assert.equal(await count(p), 3);
  await reply(p, 1, order[0]); assert.equal(await count(p), 3);
  await reply(p, 2, order[1]); assert.equal(await count(p), 4);
  assert.equal(await p.evaluate(() => (window as any).inspectPending()), 0);
  assert.equal(await p.evaluate(() => (window as any).fixture.requests[3].method), "GET");
  await reply(p, 3, "fail");
  assert.equal(await p.evaluate(() => (window as any).inspectPending()), 0);
});
for (const screen of ["start", "detail"]) for (const beforeActive of [false, true]) for (const cancelled of [false, true]) test("Fix1 picker round trip " + [screen, beforeActive ? "result-before-active" : "active-before-result", cancelled ? "cancel" : "select"].join(" "), async t => {
  const p = await open(t, { screen });
  if (screen === "start") await listed(p); else await reply(p, 0);
  const label = screen === "start" ? "选择名片" : "重新选择名片";
  await press(p, label); const requests = await count(p);
  await update(p, { appState: "background" });
  await p.evaluate(() => (window as any).fixture.tick()); await settle(p);
  assert.equal(await count(p), requests, "no background GET");
  assert.equal(await p.evaluate(() => (window as any).fixture.reads.length), 0);
  if (beforeActive) {
    await pick(p, 0, 1, cancelled);
    assert.equal(await p.evaluate(() => (window as any).fixture.reads.length), 0, "wait for foreground before file preparation");
  }
  await update(p, { appState: "active" });
  if (!beforeActive) {
    assert.equal(await p.getByRole("button", { name: label, exact: true }).isDisabled(), true, "picker lock survives foreground return");
    await direct(p, label);
    assert.equal(await p.evaluate(() => (window as any).fixture.picks.length), 1, "no second native picker");
    assert.equal(await count(p), requests, "return refresh cannot replace owned detail");
    await pick(p, 0, 1, cancelled);
  }
  const action = screen === "start" ? "创建批次" : "上传待传名片";
  assert.equal(await p.getByRole("button", { name: action, exact: true }).isDisabled(), cancelled);
  assert.equal(await p.getByRole("button", { name: label, exact: true }).isDisabled(), false);
  assert.equal(await p.getByRole("alert").count(), 0);
  assert.equal(await p.evaluate(() => (window as any).fixture.requests.filter((r: any) => r.method !== "GET").length), 0);
});
for (const screen of ["start", "detail"]) for (const change of ["actor", "baseUrl", "ready", "baseReady", "focused", "mounted", ...(screen === "detail" ? ["batchId"] : [])]) test("Fix1 picker presentation still invalidates on " + screen + " " + change, async t => {
  const p = await open(t, { screen });
  if (screen === "start") await listed(p); else await reply(p, 0);
  await press(p, screen === "start" ? "选择名片" : "重新选择名片");
  await update(p, { appState: "background" }); await pick(p);
  await update(p, { [change]: change === "actor" ? "other" : change === "baseUrl" ? "https://other.example" : change === "batchId" ? "other-batch" : false });
  await update(p, { appState: "active" });
  assert.equal(await p.evaluate(() => (window as any).fixture.reads.length), 0);
});
for (const kind of ["fail", "malformed"]) test("Fix1 owned upload410 clears pending before " + kind + " recovery GET", async t => {
  const p = await open(t, { screen: "detail" }); await reply(p, 0);
  await press(p, "重新选择名片"); await pick(p);
  await p.evaluate(() => { (window as any).inspectPending = (window as any).capturePending(); });
  assert.equal(await p.evaluate(() => (window as any).inspectPending()), 1);
  await press(p, "上传待传名片"); await reply(p, 1, "gone");
  assert.equal(await count(p), 3);
  assert.equal(await p.evaluate(() => (window as any).inspectPending()), 0, "clear before awaiting recovery GET");
  await reply(p, 2, kind);
  assert.equal(await p.evaluate(() => (window as any).inspectPending()), 0);
});
for (const kind of ["conflict", "fail"]) test("Fix1 upload " + kind + " retains URI despite unavailable reload", async t => {
  const p = await open(t, { screen: "detail" }); await reply(p, 0);
  await press(p, "重新选择名片"); await pick(p);
  await p.evaluate(() => { (window as any).inspectPending = (window as any).capturePending(); });
  await press(p, "上传待传名片"); await reply(p, 1, kind); await reply(p, 2, "fail");
  assert.equal(await p.evaluate(() => (window as any).inspectPending()), 1);
});
for (const change of ["actor", "batchId"]) test("Fix1 old upload410 cannot clear newer " + change + " pending state", async t => {
  const p = await open(t, { screen: "detail" }); await reply(p, 0);
  await press(p, "重新选择名片"); await pick(p); await press(p, "上传待传名片");
  await update(p, { [change]: "new-owner-or-batch" }); await reply(p, 2);
  await press(p, "重新选择名片"); await pick(p, 1);
  await p.evaluate(() => { (window as any).inspectPending = (window as any).capturePending(); });
  assert.equal(await p.evaluate(() => (window as any).inspectPending()), 1);
  await reply(p, 1, "gone");
  assert.equal(await p.evaluate(() => (window as any).inspectPending()), 1);
  assert.equal(await count(p), 3, "old scope cannot request a recovery reload");
});
for (const change of ["actor", "baseUrl", "ready", "focused", "mounted"]) test("delayed create result cannot navigate or hand off files across " + change, async t => {
  const p = await open(t); await selected(p); await press(p, "创建批次");
  await update(p, { [change]: change === "actor" ? "other" : change === "baseUrl" ? "https://other.example" : false });
  await reply(p, 2); assert.equal(await p.evaluate(() => (window as any).fixture.navigation.length), 0);
  assert.equal(await p.evaluate(() => (window as any).fixture.requests.filter((r: any) => r.method === "PUT").length), 0);
});
for (const change of ["actor", "baseUrl", "batchId", "ready", "focused", "mounted"]) test("delayed raw read cannot dispatch upload after " + change, async t => {
  const p = await open(t, { screen: "detail" }); await reply(p, 0);
  await press(p, "重新选择名片"); await pick(p); await update(p, { holdRead: true });
  await press(p, "上传待传名片");
  await p.waitForFunction(() => (window as any).fixture.readReplies.length === 1);
  await update(p, { [change]: change === "actor" ? "other" : change === "baseUrl" ? "https://other.example" : change === "batchId" ? "other-batch" : false });
  await p.evaluate(() => (window as any).fixture.readReplies[0]()); await settle(p);
  assert.equal(await p.evaluate(() => (window as any).fixture.requests.filter((r: any) => r.method === "PUT").length), 0);
});
test("same empty-cookie client does not coalesce collection reads across session subject changes", async t => {
  const p = await open(t); await update(p, { actor: "other" }); assert.equal(await count(p), 4);
  await reply(p, 0); await reply(p, 1); assert.equal(await p.getByRole("button", { name: "打开批次 batch:/", exact: true }).count(), 0);
  assert.equal(await p.evaluate(() => (window as any).fixture.requests[0].signal.aborted), true);
  await reply(p, 2); await reply(p, 3); await press(p, "打开批次 batch:/");
});
test("unmatched resume files stay visible and never enable upload", async t => {
  const p = await open(t, { screen: "detail" });
  await p.evaluate(() => { const s = (window as any).fixture; const detail = s.detail; s.detail = (patch: any) => { const d = detail(patch); d.items.forEach((i: any) => i.clientDigest = "sha256:" + "b".repeat(64)); return d; }; });
  await reply(p, 0); await press(p, "重新选择名片"); await pick(p);
  assert.equal(await p.getByRole("alert").count(), 1);
  assert.equal(await p.getByRole("button", { name: "上传待传名片", exact: true }).isDisabled(), true);
  assert.equal(await count(p), 1);
});
test("an inherited-property item ID cannot fabricate an upload failure", async t => {
  const p = await open(t, { screen: "detail" });
  await p.evaluate(() => { const s = (window as any).fixture; const detail = s.detail; s.detail = (patch: any) => { const d = detail(patch); d.items[0].id = "toString"; return d; }; });
  await reply(p, 0); assert.equal(await p.getByRole("alert").count(), 0);
  await press(p, "重新选择名片"); await pick(p);
  assert.equal(await p.getByRole("button", { name: "上传待传名片", exact: true }).isDisabled(), false);
});
test("accepted upload version survives a stale following GET without another upload authority", async t => {
  const p = await open(t, { screen: "detail" }); await reply(p, 0);
  await press(p, "重新选择名片"); await pick(p); await press(p, "上传待传名片");
  await reply(p, 1); await reply(p, 2);
  assert.equal(await p.getByText("已上传", { exact: true }).count(), 1);
  assert.equal(await p.getByRole("alert").count(), 1);
  assert.equal(await p.getByRole("button", { name: "上传待传名片", exact: true }).isDisabled(), true);
});
test("upload 409 stops the pass and performs authoritative reload without finalize", async t => {
  const p = await open(t, { screen: "detail" }); await reply(p, 0);
  await press(p, "重新选择名片"); await pick(p); await press(p, "上传待传名片");
  await reply(p, 1, "conflict"); assert.equal(await count(p), 3); await reply(p, 2, "ok", { statuses: ["uploaded"] });
  assert.equal(await p.getByRole("alert").count(), 1); assert.equal(await count(p), 3);
});
test("HTTP failure success envelopes and wrong identities cannot create action success", async t => {
  const p = await open(t, { screen: "detail" }); await reply(p, 0);
  for (const [offset, kind] of ["http-error", "wrong", "malformed"].entries()) {
    await press(p, "取消批次"); await confirm(p, offset); await reply(p, 1 + offset * 2, kind);
    await reply(p, 2 + offset * 2); assert.equal(await p.getByRole("alert").count(), 1);
    assert.equal(await p.getByText("批次已取消。", { exact: true }).count(), 0);
  }
});
async function settle(p: Page) { await p.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); }
async function open(t: { after: (fn: () => Promise<void>) => void }, patch: object = {}) {
  const p = await browser.newPage({ viewport: { width: 390, height: 844 } }); p.setDefaultTimeout(1500);
  const errors: string[] = []; p.on("pageerror", e => errors.push(e.message));
  t.after(async () => { await p.close(); assert.deepEqual(errors, []); });
  await p.route("**/*", r => r.abort()); await p.setContent('<div id="root"></div>');
  await p.evaluate(patch => { (window as any).initialFixture = patch; }, patch);
  await p.addScriptTag({ content: script }); await settle(p);
  await p.waitForFunction(() => { const s = (window as any).fixture; return !s.ready || !s.baseReady || !s.signedIn || !s.focused || !s.mounted || s.requests.length > 0; });
  return p;
}
async function update(p: Page, patch: object) { await p.evaluate(patch => (window as any).fixture.update(patch), patch); await settle(p); }
async function reply(p: Page, index: number, kind = "ok", patch = {}) { await p.waitForFunction(index => Boolean((window as any).fixture.requests[index]), index); await p.evaluate(({ index, kind, patch }) => (window as any).fixture.reply(index, kind, patch), { index, kind, patch }); await settle(p); }
async function press(p: Page, label: string) { await p.getByRole("button", { name: label, exact: true }).click(); await settle(p); }
async function direct(p: Page, label: string) { await p.evaluate(label => { const fn = (window as any).fixture.presses[label]; fn(); fn(); }, label); await settle(p); }
async function count(p: Page) { return p.evaluate(() => (window as any).fixture.requests.length); }
async function pick(p: Page, index = 0, count = 1, cancelled = false, patch = {}) { await p.evaluate(args => (window as any).fixture.pick(...args), [index, count, cancelled, patch]); await settle(p); }
async function confirm(p: Page, index = 0, cancel = false) { await p.evaluate(({ index, cancel }) => (window as any).fixture.confirm(index, cancel), { index, cancel }); await settle(p); }
async function listed(p: Page) { await reply(p, 0); await reply(p, 1); }
async function selected(p: Page) { await listed(p); await press(p, "选择名片"); await pick(p); }

test("current and legacy lists expose encoded routes and visible partial failure", async t => {
  const p = await open(t); assert.equal(await count(p), 2);
  await reply(p, 0); await reply(p, 1, "fail"); assert.equal(await p.getByRole("alert").count(), 1);
  await press(p, "打开批次 batch:/"); assert.deepEqual(await p.evaluate(() => (window as any).fixture.navigation), ["/contacts/new/batch2/batch%3A%2F"]);
  await press(p, "刷新列表"); await reply(p, 2, "http-error"); await reply(p, 3); await press(p, "打开批次 legacy:/");
  assert.equal(await p.evaluate(() => (window as any).fixture.navigation.at(-1)), "/contacts/new/batch/legacy%3A%2F");
});
test("selection cancellation is neutral; original representation, count/byte limits and removal precede create", async t => {
  const p = await open(t); await listed(p); await press(p, "选择名片"); await pick(p, 0, 0, true);
  assert.equal(await p.getByRole("alert").count(), 0); assert.equal(await p.getByRole("button", { name: "创建批次", exact: true }).isDisabled(), true);
  await press(p, "选择名片"); await pick(p, 1, 101); assert.equal(await p.getByRole("alert").count(), 1);
  await press(p, "选择名片"); await pick(p, 2);
  assert.deepEqual(await p.evaluate(() => { const o = (window as any).fixture.picks[2]; return [o.allowsEditing, o.quality, o.base64, o.preferredAssetRepresentationMode, o.selectionLimit]; }), [false, 1, false, "current", 100]);
  await press(p, "移除名片 1"); assert.equal(await p.getByRole("button", { name: "创建批次", exact: true }).isDisabled(), true);
  await update(p, { rawSize: 10485761 }); await press(p, "选择名片"); await pick(p, 3);
  assert.equal(await p.getByRole("alert").count(), 1); assert.equal(await count(p), 2);
});
test("ambiguous creation retries frozen key and manifest; changed selection makes a new key", async t => {
  const p = await open(t); await selected(p); await direct(p, "创建批次"); assert.equal(await count(p), 3);
  await reply(p, 2, "fail"); await press(p, "创建批次");
  assert.deepEqual(await p.evaluate(() => (window as any).fixture.requests[2].body), await p.evaluate(() => (window as any).fixture.requests[3].body));
  await reply(p, 3, "ok", { wrongKey: true }); assert.equal(await p.getByRole("alert").count(), 1); assert.equal(await p.evaluate(() => (window as any).fixture.navigation.length), 0);
  await press(p, "选择名片"); await pick(p, 1, 1, false, { fileName: "new.png" }); await press(p, "创建批次");
  assert.equal(await p.evaluate(() => (window as any).fixture.requests[4].body.idempotencyKey), "key-2");
  await reply(p, 4); assert.equal(await p.evaluate(() => (window as any).fixture.navigation.at(-1)), "/contacts/new/batch2/batch%3A%2F");
  assert.equal(await count(p), 5);
});
for (const change of ["actor", "baseUrl", "ready", "baseReady", "focused", "mounted"]) test("delayed selection cannot cross " + change, async t => {
  const p = await open(t); await selected(p); await press(p, "选择名片");
  await update(p, { [change]: change === "actor" ? "other" : change === "baseUrl" ? "https://other.example" : false });
  await pick(p, 1, 1, false, { fileName: "late.png" }); assert.equal(await p.getByText("late.png", { exact: true }).count(), 0);
});
test("resume uploads matching original files explicitly; failures await retry and never finalize", async t => {
  const p = await open(t, { screen: "detail" }); assert.equal(await count(p), 1); await reply(p, 0);
  await press(p, "重新选择名片"); await pick(p); assert.equal(await count(p), 1);
  await direct(p, "上传待传名片"); assert.equal(await count(p), 2); await reply(p, 1, "fail"); await reply(p, 2);
  assert.equal(await count(p), 3); assert.equal(await p.getByRole("alert").count(), 1);
  await press(p, "上传待传名片"); await reply(p, 3); await reply(p, 4, "ok", { statuses: ["uploaded"], itemVersion: 2 });
  assert.equal(await count(p), 5); assert.equal(await p.getByRole("button", { name: "开始识别", exact: true }).isDisabled(), false);
  assert.equal(await p.evaluate(() => (window as any).fixture.requests.filter((r: { path: string }) => r.path.endsWith("/finalize")).length), 0);
  assert.equal(await p.evaluate(() => (window as any).fixture.requests[1].body.length), 68);
});
test("collecting actions require fresh explicit consent, accepted identities and 410 reload", async t => {
  const p = await open(t, { screen: "detail" }); await reply(p, 0);
  await press(p, "排除名片 1"); assert.equal(await count(p), 1); await confirm(p, 0, true); assert.equal(await count(p), 1);
  await press(p, "排除名片 1"); await press(p, "刷新批次"); await reply(p, 1, "ok", { itemVersion: 2 }); await confirm(p, 1); assert.equal(await count(p), 2);
  await press(p, "排除名片 1"); await confirm(p, 2); assert.equal(await count(p), 3); await reply(p, 2, "wrong"); await reply(p, 3, "ok", { itemVersion: 2 });
  assert.equal(await p.getByRole("alert").count(), 1);
  await press(p, "取消批次"); await confirm(p, 3); await reply(p, 4, "gone"); await reply(p, 5, "ok", { status: "expired", expired: true, itemVersion: 2 });
  assert.equal(await p.getByRole("button", { name: "上传待传名片", exact: true }).count(), 0);
  assert.equal(await p.getByRole("button", { name: "取消批次", exact: true }).count(), 0);
});
test("finalize is explicit and cannot run while awaiting or after expiry", async t => {
  const p = await open(t, { screen: "detail" }); await reply(p, 0);
  assert.equal(await p.getByRole("button", { name: "开始识别", exact: true }).isDisabled(), true);
  await press(p, "刷新批次"); await reply(p, 1, "ok", { statuses: ["uploaded"] });
  await press(p, "开始识别"); assert.equal(await count(p), 2); await confirm(p); await confirm(p);
  assert.equal(await count(p), 3); await reply(p, 2); await reply(p, 3, "ok", { status: "processing", statuses: ["queued"], version: 2 });
  assert.deepEqual(await p.evaluate(() => (window as any).fixture.timers()), [3000]);
  await update(p, { now: 4102444800001 }); await p.evaluate(() => (window as any).fixture.tick()); await settle(p);
  assert.equal(await p.getByRole("button", { name: "取消批次", exact: true }).count(), 0);
});
test("three-second polling stops on blur/background/terminal and pins canonical owner", async t => {
  const p = await open(t, { screen: "detail" }); await reply(p, 0);
  assert.deepEqual(await p.evaluate(() => (window as any).fixture.timers()), [3000]);
  await p.evaluate(() => { (window as any).fixture.tick(); (window as any).fixture.tick(); }); await settle(p); assert.equal(await count(p), 2);
  await reply(p, 1, "ok", { owner: "wrong-owner" }); assert.equal(await p.getByRole("alert").count(), 1);
  await update(p, { focused: false }); await p.evaluate(() => (window as any).fixture.tick()); assert.equal(await count(p), 2);
  await update(p, { focused: true }); await reply(p, 2); await update(p, { appState: "background" }); await p.evaluate(() => (window as any).fixture.tick()); assert.equal(await count(p), 3);
  await update(p, { appState: "active" }); await reply(p, 3, "ok", { status: "cancelled" }); assert.deepEqual(await p.evaluate(() => (window as any).fixture.timers()), []);
});
for (const change of ["actor", "baseUrl", "batchId", "ready", "mounted"]) test("stale confirmation is inert after " + change, async t => {
  const p = await open(t, { screen: "detail" }); await reply(p, 0); await press(p, "取消批次");
  await update(p, { [change]: change === "actor" ? "other" : change === "baseUrl" ? "https://other.example" : change === "batchId" ? "other-batch" : false });
  const before = await count(p); await confirm(p); assert.equal(await count(p), before);
});
test("both real route wrappers gate signed-out users without protected requests", async t => {
  for (const screen of ["start", "detail"]) {
    const p = await open(t, { screen, route: true, signedIn: false }); assert.equal(await count(p), 0);
    assert.match(await p.locator("body").innerText(), /account\/login/);
  }
});
