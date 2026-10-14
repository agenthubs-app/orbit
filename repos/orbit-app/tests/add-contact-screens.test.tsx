import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";

import { build } from "esbuild";
import { chromium, type Browser, type Page } from "playwright";

import { nativeUiStubs } from "./helpers/native-ui-stubs";
import { FakeAddServer, type Call, type Person } from "./helpers/add-fake-server";

// R12 人脈を追加 (DESIGN §2.1–2.3, §2.9; b11 A1 / A3, b9 A1 / A2 ④, b1 B1 / B2 / B6): the App add
// screens rendered for real with react-native-web in Chromium. The camera, the photo picker and
// the camera permission are the expo modules' own entry points replaced by window-driven fakes,
// so the screens' permission flow, image preparation (blob photos, real SHA-256) and upload run
// unchanged; every request goes to an in-memory server (tests/helpers/add-fake-server.ts) that
// keeps the 人脈 it writes, so the 完成 numbers can be checked against what was really added.
const root = new URL("..", import.meta.url).pathname;
let browser: Browser;
let script: string;

const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=";

test.before(async () => {
  const result = await build({
    stdin: { contents: `
import React from "react";
import { createRoot } from "react-dom/client";
import { AddContactScreen } from "./src/screens/add/AddContactScreen";
import { AddContactSheet } from "./src/screens/add/AddContactSheet";
import { ScanCaptureScreen } from "./src/screens/add/ScanCaptureScreen";
import { ScanBatchScreen } from "./src/screens/add/ScanBatchScreen";
import { ManualContactScreen } from "./src/screens/add/ManualContactScreen";
import { ContactDraftsScreen } from "./src/screens/add/ContactDraftsScreen";
import { ToastProvider, UiPortalHost } from "./src/components/ui";
const fixedNow = () => new Date("2026-10-11T00:00:00Z");
function Screen({ path }) {
  const [pathname, query = ""] = path.split("?");
  const params = new URLSearchParams(query);
  const batch = pathname.match(/^\\/contacts\\/new\\/scan\\/([^/]+)$/);
  if (batch) return <ScanBatchScreen key={path} batchId={decodeURIComponent(batch[1])} />;
  if (pathname === "/contacts/new/scan") return <ScanCaptureScreen key={path} />;
  if (pathname === "/contacts/new/manual") return <ManualContactScreen now={fixedNow} />;
  if (pathname === "/contacts/new/drafts") return <ContactDraftsScreen key={path} eventId={params.get("eventId")} />;
  if (pathname === "/contacts/new") return <AddContactScreen key={path} />;
  if (pathname === "/sheet") return <AddContactSheet visible draftCount={3} onClose={() => window.addNav.navigation.push({ method: "closeSheet" })} />;
  return <div data-testid="elsewhere">{path}</div>;
}
function Root() {
  const [, force] = React.useState(0);
  window.addNav.render = () => force((n) => n + 1);
  // Like a native stack, pages under the top one stay mounted (a pushed page keeps the one below alive).
  const stack = window.addNav.stack;
  return <ToastProvider><UiPortalHost>{stack.map((path, index) => (
    <div key={index + ":" + path} data-testid={index === stack.length - 1 ? "top" : "below"} style={{ display: index === stack.length - 1 ? "flex" : "none", flexDirection: "column", height: "100%" }}><Screen path={path} /></div>
  ))}</UiPortalHost></ToastProvider>;
}
const realFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const url = String(input);
  if (url.startsWith("blob:")) return realFetch(input, init);
  const parsed = new URL(url);
  const raw = init?.body;
  const body = typeof raw === "string" ? JSON.parse(raw) : raw ? { bytes: raw.byteLength ?? 0 } : null;
  const reply = await window.addServer(JSON.stringify({ method: init?.method ?? "GET", path: parsed.pathname + parsed.search, body, headers: init?.headers ?? {} }));
  return new Response(JSON.stringify(reply.body), { status: reply.status, headers: { "Content-Type": "application/json" } });
};
createRoot(document.getElementById("root")).render(<Root />);
`, loader: "tsx", resolveDir: root },
    bundle: true, write: false, format: "iife", jsx: "automatic",
    define: { __ORBIT_LEGACY_TEST_LANGUAGE__: '"ja"', "process.env.NODE_ENV": '"test"', "process.env": "{}", __DEV__: "false" },
    resolveExtensions: [".web.tsx", ".web.ts", ".web.js", ".tsx", ".ts", ".jsx", ".js", ".json"],
    plugins: [nativeUiStubs, { name: "add-screens", setup(plugin) {
      plugin.onResolve({ filter: /^react-native$/ }, () => ({ path: "native", namespace: "add-native" }));
      plugin.onResolve({ filter: /^react-native-web$/ }, () => ({ path: require.resolve("react-native-web") }));
      plugin.onLoad({ filter: /.*/, namespace: "add-native" }, () => ({ contents: `
import * as RNW from "react-native-web";
export * from "react-native-web";
export const findNodeHandle = (instance) => instance ?? null;
export const AccessibilityInfo = { ...RNW.AccessibilityInfo, isReduceMotionEnabled: async () => Boolean(window.reduceMotion), addEventListener: () => ({ remove() {} }), setAccessibilityFocus: () => {} };
export const Linking = { ...RNW.Linking, openSettings: async () => { (window.opened ??= []).push("settings"); }, openURL: async (url) => { (window.opened ??= []).push(url); } };
export const AppState = { currentState: "active", addEventListener: (type, listener) => { (window.appStateListeners ??= []).push(listener); return { remove() { window.appStateListeners = window.appStateListeners.filter((entry) => entry !== listener); } }; } };
`, loader: "js", resolveDir: root }));
      plugin.onResolve({ filter: /^react-native-svg$/ }, () => ({ path: join(root, "tests/helpers/stubs/react-native-svg.js") }));
      plugin.onResolve({ filter: /^react-native-safe-area-context$/ }, () => ({ path: join(root, "tests/helpers/stubs/react-native-safe-area-context.js") }));
      plugin.onResolve({ filter: /^(expo-router|expo-camera|expo-image-picker|expo-crypto|@react-native-async-storage\/async-storage)$/ }, (args) => ({ path: args.path, namespace: "add-stub" }));
      plugin.onResolve({ filter: /(AuthSessionProvider|ApiBaseUrlProvider)$/ }, (args) => ({ path: args.path, namespace: "add-stub" }));
      plugin.onLoad({ filter: /AuthSessionProvider$/, namespace: "add-stub" }, () => ({ contents: `export const useOrbitAuthSession = () => ({ ready: true, signedIn: true, actorId: "actor-r12", cookieHeader: "c", user: { id: "actor-r12" } });`, loader: "js" }));
      plugin.onLoad({ filter: /ApiBaseUrlProvider$/, namespace: "add-stub" }, () => ({ contents: `export const useOrbitApiBaseUrl = () => ({ ready: true, baseUrl: "http://local.test" });`, loader: "js" }));
      plugin.onLoad({ filter: /^@react-native-async-storage\/async-storage$/, namespace: "add-stub" }, () => ({ contents: `
const store = () => (window.deviceStore ??= {});
export default { getItem: async (key) => store()[key] ?? null, setItem: async (key, value) => { store()[key] = value; } };`, loader: "js" }));
      plugin.onLoad({ filter: /^expo-crypto$/, namespace: "add-stub" }, () => ({ contents: `
import { sha256 } from "./tests/helpers/stubs/sha256.js";
export const CryptoDigestAlgorithm = { SHA256: "SHA-256" };
export const digest = async (algorithm, bytes) => sha256(bytes);
export const randomUUID = () => "uuid-" + Math.random().toString(36).slice(2);`, loader: "js", resolveDir: root }));
      plugin.onLoad({ filter: /^expo-camera$/, namespace: "add-stub" }, () => ({ contents: `
import React from "react";
import { View } from "react-native-web";
// The permission lives on window.camera: { permission: { granted, canAskAgain }, onRequest, requests }.
export function useCameraPermissions() {
  const [permission, setPermission] = React.useState(window.camera.permission);
  return [permission, async () => { window.camera.requests += 1; window.camera.permission = window.camera.onRequest; setPermission(window.camera.permission); return window.camera.permission; }, async () => { setPermission(window.camera.permission); return window.camera.permission; }];
}
export const CameraView = React.forwardRef(function CameraView(props, ref) {
  React.useImperativeHandle(ref, () => ({ takePictureAsync: async () => ({ uri: window.newPhoto() }) }));
  return <View testID="camera-live" style={props.style} />;
});`, loader: "jsx", resolveDir: root }));
      plugin.onLoad({ filter: /^expo-image-picker$/, namespace: "add-stub" }, () => ({ contents: `
export const UIImagePickerPreferredAssetRepresentationMode = { Current: "current" };
export const launchImageLibraryAsync = async (options) => {
  window.pickerCalls = (window.pickerCalls ?? 0) + 1;
  const count = Math.min(window.pickCount ?? 0, options.selectionLimit ?? 100);
  if (!count) return { canceled: true, assets: null };
  return { canceled: false, assets: Array.from({ length: count }, () => ({ uri: window.newPhoto(), fileName: "album.png", mimeType: "image/png" })) };
};`, loader: "js" }));
      plugin.onLoad({ filter: /^expo-router$/, namespace: "add-stub" }, () => ({ contents: `
const nav = () => window.addNav;
const top = () => nav().stack[nav().stack.length - 1];
const router = {
  push: (href) => { nav().navigation.push({ method: "push", href }); nav().stack.push(href); nav().render?.(); },
  replace: (href) => { nav().navigation.push({ method: "replace", href }); nav().stack[nav().stack.length - 1] = href; nav().render?.(); },
  back: () => { nav().navigation.push({ method: "back" }); if (nav().stack.length > 1) nav().stack.pop(); nav().render?.(); },
  canGoBack: () => nav().stack.length > 1,
  // expo-router: pops back to the nearest href in the stack; not in the stack → it replaces the top.
  dismissTo: (href) => { nav().navigation.push({ method: "dismissTo", href }); const at = nav().stack.lastIndexOf(href); if (at >= 0) nav().stack.length = at + 1; else nav().stack[nav().stack.length - 1] = href; nav().render?.(); },
  dismissAll: () => {}, setParams() {},
};
export const useRouter = () => router;
export const usePathname = () => top().split("?")[0];
export const useLocalSearchParams = () => Object.fromEntries(new URLSearchParams(top().split("?")[1] ?? ""));
export const useGlobalSearchParams = useLocalSearchParams;
export const useFocusEffect = () => {};
export const useIsFocused = () => true;
export const Redirect = () => null;
export const Stack = { Screen: () => null };`, loader: "js" }));
    } }],
  });
  script = result.outputFiles[0]!.text;
  browser = await chromium.launch({ headless: true });
});

test.after(async () => { await browser?.close(); });

interface OpenOptions {
  stack?: string[];
  people?: Partial<Person>[];
  setup?: (server: FakeAddServer) => void;
  dark?: boolean;
  reduceMotion?: boolean;
  camera?: { granted: boolean; canAskAgain: boolean };
  onRequest?: { granted: boolean; canAskAgain: boolean };
  deviceStore?: Record<string, string>;
  pickCount?: number;
}

async function open(t: { after: (fn: () => Promise<void>) => void }, path: string, options: OpenOptions = {}): Promise<{ page: Page; server: FakeAddServer }> {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, colorScheme: options.dark ? "dark" : "light" });
  page.setDefaultTimeout(5000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  t.after(async () => { await page.close(); assert.deepEqual(errors, []); });
  const server = new FakeAddServer(options.people ?? []);
  options.setup?.(server);
  await page.exposeFunction("addServer", async (raw: string) => {
    const reply = await server.handle(JSON.parse(raw) as Call);
    return reply ?? { body: { error: { code: "NOT_FOUND", message: "unexpected" }, success: false }, status: 404 };
  });
  const camera = options.camera ?? { canAskAgain: true, granted: true };
  await page.setContent(`<!doctype html><html><body style="margin:0"><div id="root" style="height:100vh;display:flex;flex-direction:column"></div><script>
window.reduceMotion=${Boolean(options.reduceMotion)};
window.addNav=${JSON.stringify({ navigation: [], stack: options.stack ?? [path] })};
window.deviceStore=${JSON.stringify(options.deviceStore ?? {})};
window.camera={ permission: ${JSON.stringify(camera)}, onRequest: ${JSON.stringify(options.onRequest ?? { canAskAgain: true, granted: true })}, requests: 0 };
window.pickCount=${options.pickCount ?? 0};
window.photoSeq=0;
window.newPhoto=()=>{ const png=Uint8Array.from(atob("${PNG}"), (c)=>c.charCodeAt(0)); const tail=new TextEncoder().encode("photo-"+(++window.photoSeq)); const bytes=new Uint8Array(png.length+tail.length); bytes.set(png); bytes.set(tail, png.length); return URL.createObjectURL(new Blob([bytes], { type: "image/png" })); };
</script></body></html>`);
  await page.addScriptTag({ content: script });
  return { page, server };
}

const nav = (page: Page) => page.evaluate(() => (window as unknown as { addNav: { navigation: { method: string; href?: string }[]; stack: string[] } }).addNav);
const top = (page: Page) => page.getByTestId("top");
const GUIDE_DONE = { "orbit:add:scan-guide:v1": JSON.stringify({ hidden: false, shown: 3 }) };

test("入口: 名刺をスキャン, 招待コード (R15) and 手入力 (その他 hidden until R16), 下書き N件 when there are drafts", async (t) => {
  const { page, server } = await open(t, "/contacts/new", { setup: (s) => { s.drafts = [{ displayName: "林 悦", id: "d1", organization: "星野", role: "", source: { label: "CFO Night" }, status: "pending_confirmation" }, { displayName: "森", id: "d2", organization: "", role: "", source: { label: "" }, status: "pending_confirmation" }]; } });
  await page.getByTestId("add-doors").waitFor();
  await page.getByText("人脈を追加", { exact: true }).first().waitFor();
  for (const id of ["add-door-scan", "add-door-invite", "add-door-manual"]) assert.equal(await page.getByTestId(id).count(), 1, id);
  for (const id of ["add-door-contacts", "add-door-linkedin"]) assert.equal(await page.getByTestId(id).count(), 0, `${id} is hidden, not greyed`);
  await page.getByText("確認待ちの下書き 2件").waitFor();
  await page.getByTestId("add-density-legend").waitFor();
  for (const label of ["身元だけ", "名刺レベル", "関係まで"]) await page.getByText(label, { exact: true }).waitFor();
  await page.getByTestId("add-door-scan").click();
  assert.deepEqual((await nav(page)).navigation.at(-1), { href: "/contacts/new/scan", method: "push" });
  assert.deepEqual(server.writes(), [], "opening the page writes nothing");
  // No drafts: no 下書き door.
  const empty = await open(t, "/contacts/new");
  await empty.page.getByTestId("add-doors").waitFor();
  await empty.page.waitForTimeout(150);
  assert.equal(await empty.page.getByTestId("add-door-drafts").count(), 0);
});

test("AddContactSheet: the same doors in the R04 bottom sheet; choosing one closes the sheet first", async (t) => {
  const { page } = await open(t, "/sheet");
  const sheet = page.getByTestId("add-contact-sheet");
  await sheet.waitFor();
  await sheet.getByText("確認待ちの下書き 3件").waitFor();
  assert.equal(await sheet.getByTestId("add-door-invite").count(), 1);
  await sheet.getByTestId("add-door-manual").click();
  assert.deepEqual((await nav(page)).navigation, [{ method: "closeSheet" }, { href: "/contacts/new/manual", method: "push" }]);
});

test("「視差効果を減らす」: the add pages only fade in (no translate or scale)", async (t) => {
  for (const reduceMotion of [false, true]) {
    const { page } = await open(t, "/contacts/new", { reduceMotion });
    const fade = page.getByTestId("add-contact-page");
    await fade.waitFor();
    const transform = await fade.evaluate((node) => getComputedStyle(node).transform);
    assert.ok(transform === "none" || transform === "matrix(1, 0, 0, 1, 0, 0)", `no movement (${transform})`);
    await page.waitForFunction(() => Number(getComputedStyle(document.querySelector("[data-testid=add-contact-page]")!).opacity) === 1);
  }
});

test("はじめての方へ: the first three visits only; 次回から表示しない; 「?」 opens it again", async (t) => {
  const { page } = await open(t, "/contacts/new/scan", { camera: { canAskAgain: true, granted: true } });
  await page.getByTestId("add-scan-guide").waitFor();
  for (const text of ["はじめての方へ", "明るい場所で", "平らに置く", "四隅を枠に", "表と裏", "撮ったあと"]) await page.getByText(text, { exact: true }).first().waitFor();
  assert.deepEqual(JSON.parse((await page.evaluate(() => (window as unknown as { deviceStore: Record<string, string> }).deviceStore))["orbit:add:scan-guide:v1"]!), { hidden: false, shown: 1 });
  // 4th visit (shown 3 times): straight to the camera; 「?」 brings the guide back.
  const fourth = await open(t, "/contacts/new/scan", { deviceStore: GUIDE_DONE });
  await fourth.page.getByTestId("add-scan-camera").waitFor();
  assert.equal(await fourth.page.getByTestId("add-scan-guide").count(), 0);
  await fourth.page.getByRole("button", { name: "撮り方のコツ" }).click();
  await fourth.page.getByTestId("add-scan-guide").waitFor();
  // 次回から表示しない hides it for good and opens the camera.
  await page.getByRole("button", { name: "次回から表示しない" }).click();
  await page.getByTestId("add-scan-camera").waitFor();
  assert.equal(JSON.parse((await page.evaluate(() => (window as unknown as { deviceStore: Record<string, string> }).deviceStore))["orbit:add:scan-guide:v1"]!).hidden, true);
});

test("camera permission: explained before asking; turned off → three steps, 設定を開く, 写真から選ぶ, and back from Settings opens the camera", async (t) => {
  const asked = await open(t, "/contacts/new/scan", { camera: { canAskAgain: true, granted: false }, deviceStore: GUIDE_DONE });
  await asked.page.getByTestId("add-scan-permission").waitFor();
  assert.equal(await asked.page.evaluate(() => (window as unknown as { camera: { requests: number } }).camera.requests), 0, "nothing is asked before the explanation");
  await asked.page.getByRole("button", { name: "カメラを許可する" }).click();
  await asked.page.getByTestId("add-scan-camera").waitFor();

  const denied = await open(t, "/contacts/new/scan", { camera: { canAskAgain: false, granted: false }, deviceStore: GUIDE_DONE });
  await denied.page.getByTestId("add-scan-denied").waitFor();
  for (const text of ["カメラへのアクセスがオフになっています", "設定を開く", "「Orbit」をタップ", "「カメラ」をオンにする"]) await denied.page.getByText(text, { exact: true }).first().waitFor();
  await denied.page.getByRole("button", { name: "設定を開く" }).click();
  assert.deepEqual(await denied.page.evaluate(() => (window as unknown as { opened: string[] }).opened), ["settings"]);
  // The person turns the camera on in Settings and comes back: the app re-reads the permission.
  await denied.page.evaluate(() => {
    const w = window as unknown as { camera: { permission: unknown }; appStateListeners: ((state: string) => void)[] };
    w.camera.permission = { canAskAgain: true, granted: true };
    w.appStateListeners.forEach((listener) => listener("active"));
  });
  await denied.page.getByTestId("add-scan-camera").waitFor();
  // 写真から選ぶ stays available while the camera is off.
  const album = await open(t, "/contacts/new/scan", { camera: { canAskAgain: false, granted: false }, deviceStore: GUIDE_DONE, pickCount: 2 });
  await album.page.getByRole("button", { name: "写真から選ぶ" }).click();
  await album.page.waitForFunction(() => (window as unknown as { addNav: { stack: string[] } }).addNav.stack.at(-1)!.startsWith("/contacts/new/scan/"));
  const created = [...album.server.batches.values()][0]!;
  assert.equal(created.items.length, 2);
  assert.ok(created.items.every((item) => item.side === "front"), "album photos are fronts");
});

test("camera: [表面][裏面], a back pairs with the last front, 裏なし, the counter and the tray; 完了 uploads and opens the batch", async (t) => {
  const { page, server } = await open(t, "/contacts/new/scan", { deviceStore: GUIDE_DONE });
  await page.getByTestId("add-scan-camera").waitFor();
  const shutter = page.getByRole("button", { name: "撮影する" });
  await shutter.click();
  await page.getByText("連続撮影 1枚 · あと 99枚まで").waitFor();
  await page.getByRole("tab", { name: "裏面" }).click();
  await page.getByText("裏面を撮ると、前の表面と自動でペアになります").waitFor();
  await shutter.click();
  await page.getByText("連続撮影 2枚 · あと 98枚まで").waitFor();
  assert.equal(await page.getByRole("tab", { name: "表面" }).getAttribute("aria-selected"), "true", "back to 表面 after the back");
  await shutter.click();
  await page.getByRole("tab", { name: "裏面" }).click();
  await page.getByRole("button", { name: "裏なし" }).click();
  assert.equal(await page.getByRole("tab", { name: "表面" }).getAttribute("aria-selected"), "true");
  await shutter.click();
  assert.equal(await page.getByTestId("add-scan-shot-back").count(), 1);
  // Tap a photo to remove it.
  await page.getByRole("button", { name: "4枚目を削除" }).click();
  await page.getByText("連続撮影 3枚 · あと 97枚まで").waitFor();
  await page.getByRole("button", { name: "完了 2" }).click();
  await page.waitForFunction(() => (window as unknown as { addNav: { stack: string[] } }).addNav.stack.at(-1)!.startsWith("/contacts/new/scan/batch-"));
  const created = [...server.batches.values()][0]!;
  assert.deepEqual(created.items.map((item) => [item.seq, item.side]), [[1, "front"], [2, "back"], [3, "front"]]);
  assert.equal(created.items[0]!.cardId, created.items[1]!.cardId, "the back is paired with its front");
  assert.equal(created.batch.status, "processing", "uploaded and finalized");
  assert.deepEqual(server.writes().filter((write) => write.startsWith("PUT")).length, 3);
  assert.deepEqual((await nav(page)).navigation.at(-1)?.method, "replace");
});

/** A ready batch built through the real capture flow (upload included), then read by the fake server. */
async function batchPage(t: { after: (fn: () => Promise<void>) => void }, photos: number, options: OpenOptions & { readings: FakeAddServer["readings"]; twoSidedAt?: number }) {
  const opened = await open(t, "/contacts/new/scan", { deviceStore: GUIDE_DONE, ...options });
  const { page, server } = opened;
  server.readings = options.readings;
  await page.getByTestId("add-scan-camera").waitFor();
  for (let index = 1; index <= photos; index += 1) {
    if (index === options.twoSidedAt) await page.getByRole("tab", { name: "裏面" }).click();
    await page.getByRole("button", { name: "撮影する" }).click();
    await page.getByText(`連続撮影 ${index}枚`, { exact: false }).waitFor();
  }
  await page.getByRole("button", { name: /^完了 / }).click();
  await page.getByTestId("add-batch-reading").waitFor();
  const batchId = [...server.batches.keys()][0]!;
  return { ...opened, batchId };
}

test("読み取り中 → 自動で人脈へ → まとめて確認 → 完成: 4 cards (identical, similar, unreadable, clean front+back)", async (t) => {
  const people = [
    { displayName: "佐藤 健", email: "sato@example.jp", id: "contact-sato", organization: "ミライ精機", phone: "", role: "部長" },
    { displayName: "高橋 美咲", email: "", id: "contact-takahashi", organization: "", phone: "", role: "" },
  ];
  const { page, server, batchId } = await batchPage(t, 5, {
    people,
    readings: [
      { fields: { email: "sato@example.jp", name: "佐藤 健", organization: "ミライ精機", title: "部長" }, kind: "read" },
      { fields: { name: "高橋 美咲", organization: "東邦テクノ" }, kind: "read" },
      { code: "IMAGE_INVALID", kind: "fail" },
      { fields: { name: "石川 陽介", organization: "北辰製作所", title: "工場長" }, kind: "read" },
      { fields: { name: "石川 陽介", organization: "北辰製作所" }, kind: "read" },
    ],
    twoSidedAt: 5,
  });
  const before = server.people.length;
  // 読み取り中: each card is listed while the server reads.
  await page.getByText("読み取り中 4枚 · 閉じても続きます").waitFor();
  assert.equal(await page.getByTestId("add-card-queued").count(), 4);
  server.completeReading(batchId);
  // The automatic pass: the identical card merges, the clean two-sided card is created — once each.
  await page.getByTestId("add-batch-review").waitFor({ timeout: 10000 });
  const confirms = server.calls.filter((call) => /\/(confirm|manual-entry)$/.test(call.path));
  assert.equal(confirms.length, 2, "the similar and the unreadable card are not added automatically");
  assert.equal((confirms[0]!.body as { mergeIntoContactId?: string }).mergeIntoContactId, "contact-sato");
  assert.equal(server.people.length, before + 1);
  // まとめて確認: three tiles, the similar card side by side, the unreadable card's three ways.
  assert.equal(await page.getByTestId("add-tile-duplicate").getAttribute("aria-label"), "重複 1件");
  assert.equal(await page.getByTestId("add-tile-review").getAttribute("aria-label"), "要確認 0件");
  assert.equal(await page.getByTestId("add-tile-asIs").getAttribute("aria-label"), "そのまま追加 2件");
  await page.getByText("2人はもう人脈に入っています。").waitFor();
  const duplicate = page.getByTestId("add-section-duplicate");
  for (const text of ["既存", "今回", "同じ名前", "統合する", "別人として追加"]) await duplicate.getByText(text, { exact: true }).first().waitFor();
  assert.equal(await duplicate.getByTestId("add-compare-diff-organization").count(), 1, "東邦テクノ differs from the existing empty company");
  const failed = page.getByTestId("add-section-failed");
  await failed.getByText("画像を読み取れませんでした").waitFor();
  for (const label of ["撮り直す", "手入力で補う", "スキップ"]) await failed.getByRole("button", { name: label }).waitFor();
  // R12 review M2: 統合する is only the choice (no second 統合する button); the card itself only has スキップ.
  assert.equal(await duplicate.getByText("統合する", { exact: true }).count(), 1);
  assert.deepEqual(await duplicate.getByRole("button").allInnerTexts(), ["スキップ"]);
  // R12 review m5: 統合 is counted apart from 追加.
  await page.getByRole("button", { name: "1人を統合" }).waitFor();
  // 別人として追加 for the similar card, スキップ for the unreadable one, then 「N人を人脈に追加」.
  await duplicate.getByRole("checkbox", { name: "別人として追加" }).click();
  await failed.getByRole("button", { name: "スキップ" }).click();
  await page.getByRole("button", { name: "1人を人脈に追加" }).click();
  await page.getByTestId("add-batch-done-panel").waitFor({ timeout: 10000 });
  const separate = server.calls.filter((call) => /\/confirm$/.test(call.path)).at(-1)!;
  assert.equal((separate.body as { allowDuplicate?: boolean }).allowDuplicate, true);
  // 完成: 人脈 +2 (clean + similar as someone else), 統合 1, 読み取れず 1 — the same as what was written.
  await page.getByText("3人を人脈に追加しました").first().waitFor();
  assert.equal(await page.getByTestId("add-tile-created").getAttribute("aria-label"), "新しく追加 2件");
  assert.equal(await page.getByTestId("add-tile-merged").getAttribute("aria-label"), "既存と統合 1件");
  assert.equal(await page.getByTestId("add-tile-unreadable").getAttribute("aria-label"), "読み取れず 1件");
  assert.equal(server.people.length - before, 2);
  assert.equal(server.people.find((person) => person.id === "contact-sato")!.merged, 1);
  // R12 review m11: the two new people are both 身元だけ (no email / phone, no 会った場所).
  assert.match(await page.getByTestId("add-done-density").innerText(), /身元だけ\s*2人/);
  // The batch is completed, so the plan line offers プランで見る.
  await page.getByTestId("add-done-plan-ready").getByRole("button", { name: "プランで見る" }).click();
  assert.deepEqual((await nav(page)).navigation.at(-1), { href: "/task?seg=plan", method: "push" });
  // Every card was confirmed at most once.
  const confirmedItems = server.calls.filter((call) => /\/(confirm|manual-entry)$/.test(call.path) && call.method === "POST").map((call) => call.path);
  assert.equal(new Set(confirmedItems).size, confirmedItems.length, "no card was confirmed twice");
});

test("R12 review m9: when the duplicate lookup fails nothing is added automatically", async (t) => {
  const { page, server, batchId } = await batchPage(t, 2, {
    readings: [
      { fields: { name: "林 悦", organization: "星野" }, kind: "read" },
      { fields: { name: "森 恭平", organization: "海風" }, kind: "read" },
    ],
    setup: (s) => { s.duplicatesFail = true; },
  });
  server.completeReading(batchId);
  await page.getByTestId("add-batch-review").waitFor({ timeout: 10000 });
  assert.equal(server.calls.filter((call) => /\/confirm$/.test(call.path)).length, 0, "nothing was added behind the person's back");
  await page.getByRole("button", { name: "2人を人脈に追加" }).waitFor();
});

test("R12 review m7: leaving the camera page while photos go up does not drop the batch — it is uploaded and read", async (t) => {
  let release: () => void = () => undefined;
  const { page, server } = await open(t, "/contacts/new/scan", { deviceStore: GUIDE_DONE, stack: ["/contacts/new", "/contacts/new/scan"], setup: (s) => { s.uploadGate = new Promise((resolve) => { release = resolve; }); } });
  await page.getByTestId("add-scan-camera").waitFor();
  for (let index = 1; index <= 2; index += 1) {
    await page.getByRole("button", { name: "撮影する" }).click();
    await page.getByText(`連続撮影 ${index}枚`, { exact: false }).waitFor();
  }
  await page.getByRole("button", { name: /^完了 / }).click();
  await page.getByTestId("add-scan-upload").waitFor();
  for (let attempt = 0; attempt < 50 && !server.calls.some((call) => call.method === "PUT"); attempt += 1) await page.waitForTimeout(50);
  // The person goes back while the photos are still going up.
  await page.evaluate(() => { const nav = (window as unknown as { addNav: { stack: string[]; render?: () => void } }).addNav; nav.stack.pop(); nav.render?.(); });
  await page.getByTestId("add-scan-upload").waitFor({ state: "detached" });
  const batchId = [...server.batches.keys()][0]!;
  assert.equal(server.batches.get(batchId)!.batch.status, "collecting");
  release();
  for (let attempt = 0; attempt < 50 && server.batches.get(batchId)!.batch.status === "collecting"; attempt += 1) await page.waitForTimeout(100);
  assert.equal(server.batches.get(batchId)!.batch.status, "processing", "uploaded and finalized without the page");
  assert.equal(server.writes().filter((write) => write.startsWith("PUT")).length, 2);
  assert.equal((await nav(page)).stack.at(-1), "/contacts/new", "the person was not pulled back to the batch page");
});

test("W0015: cards with an event candidate wait in そのまま追加; the batch's 会った場所 goes with their confirmation", async (t) => {
  const { page, server, batchId } = await batchPage(t, 2, {
    readings: [
      { fields: { name: "林 悦", organization: "星野" }, kind: "read" },
      { fields: { name: "森 恭平", organization: "海風" }, kind: "read" },
    ],
    setup: (s) => {
      s.holdCompletion = true;
      s.attribution = (id) => {
        const cards = [...s.batches.get(id)!.items].map((item) => item.cardId);
        return { cards: { [cards[0]!]: "event-cfo", [cards[1]!]: "event-cfo" }, events: [{ eventId: "event-cfo", startsAt: "2026-10-07T10:00:00.000Z", title: "CFO Night Tokyo" }] };
      };
    },
  });
  server.completeReading(batchId);
  await page.getByTestId("add-batch-review").waitFor({ timeout: 10000 });
  assert.equal(server.calls.filter((call) => /\/confirm$/.test(call.path)).length, 0, "nothing was added without the person");
  await page.getByTestId("add-batch-met").getByText("CFO Night Tokyo", { exact: false }).waitFor();
  await page.getByRole("button", { name: "2人を人脈に追加" }).click();
  await page.getByTestId("add-batch-done-panel").waitFor({ timeout: 10000 });
  const bodies = server.calls.filter((call) => /\/confirm$/.test(call.path)).map((call) => (call.body as { metEventId?: string }).metEventId);
  assert.deepEqual(bodies, ["event-cfo", "event-cfo"]);
  await page.getByText("CFO Night Tokyo", { exact: false }).first().waitFor();
  // The batch is not completed yet: plan candidates are queued on completion.
  await page.getByTestId("add-done-plan-pending").getByText("確認が終わると表示されます").waitFor();
  assert.equal(await page.getByRole("button", { name: "プランで見る" }).count(), 0);
});

test("付けない: no 会った場所 is written; 要確認 opens the fields; a pending batch says when plan candidates appear", async (t) => {
  const { page, server, batchId } = await batchPage(t, 2, {
    readings: [
      { fields: { name: "林 悦", organization: "星野" }, issues: [{ code: "ORG_SUFFIX_MISSING", field: "organization", message: "" }], kind: "read" },
      { fields: { name: "", organization: "無名社" }, kind: "read" },
    ],
    setup: (s) => {
      s.attribution = (id) => ({ cards: { [s.batches.get(id)!.items[0]!.cardId]: "event-cfo" }, events: [{ eventId: "event-cfo", startsAt: "2026-10-07T10:00:00.000Z", title: "CFO Night Tokyo" }] });
    },
  });
  server.completeReading(batchId);
  await page.getByTestId("add-batch-review").waitFor({ timeout: 10000 });
  await page.getByTestId("add-group-orgSuffix").waitFor();
  await page.getByTestId("add-group-name").waitFor();
  await page.getByRole("checkbox", { name: "付けない" }).click();
  // The nameless card: 項目を直す → name → この内容で追加 (the card leaves the 名前 group once it has one).
  const namelessId = await page.getByTestId("add-group-name").locator("[data-testid^=add-review-]").getAttribute("data-testid");
  const nameless = page.getByTestId(namelessId!);
  await nameless.getByRole("button", { name: "この内容で追加" }).click();
  await nameless.getByText("名前を入れてから追加してください。").waitFor();
  await nameless.getByRole("button", { name: "項目を直す" }).click();
  await nameless.getByRole("textbox", { name: "名前" }).fill("佐々木 実");
  await nameless.getByRole("button", { name: "この内容で追加" }).click();
  await nameless.waitFor({ state: "detached", timeout: 10000 });
  assert.equal(server.people.at(-1)!.displayName, "佐々木 実", "added once, by the person — never by the automatic pass after an edit");
  // あとで keeps the batch; the other card is confirmed through the main button.
  await page.getByRole("button", { name: "1人を人脈に追加" }).click();
  await page.getByTestId("add-batch-done-panel").waitFor({ timeout: 10000 });
  const bodies = server.calls.filter((call) => /\/confirm$/.test(call.path)).map((call) => call.body as { displayName: string; metEventId?: string });
  assert.deepEqual(bodies.map((body) => [body.displayName, body.metEventId ?? null]), [["佐々木 実", null], ["林 悦", null]]);
});

test("読み取れず: 手入力で補う pre-fills what was read and confirms through manual-entry; 撮り直す replaces the photo", async (t) => {
  const { page, server, batchId } = await batchPage(t, 2, { readings: [{ code: "OCR_PROVIDER_FAILED", kind: "fail" }, { code: "IMAGE_INVALID", kind: "fail" }] });
  server.completeReading(batchId);
  await page.getByTestId("add-section-failed").waitFor({ timeout: 10000 });
  const cards = page.getByTestId("add-section-failed");
  await cards.getByText("混み合っていて失敗しました").waitFor();
  await cards.getByRole("button", { name: "もう一度読み取る" }).waitFor();
  // 手入力で補う on the image failure.
  const imageId = await page.locator("[data-testid^=add-failed-]").filter({ hasText: "画像を読み取れませんでした" }).getAttribute("data-testid");
  const imageCard = page.getByTestId(imageId!);
  await imageCard.getByRole("button", { name: "手入力で補う" }).click();
  await imageCard.getByText("読めたところは入力済みです").waitFor();
  await imageCard.getByRole("textbox", { name: "名前" }).fill("小林 恵");
  await imageCard.getByRole("button", { name: "この内容で追加" }).click();
  await imageCard.waitFor({ state: "detached", timeout: 10000 });
  assert.ok(server.calls.some((call) => call.path.endsWith("/manual-entry") && (call.body as { displayName: string }).displayName === "小林 恵"));
  // 撮り直す opens the camera in single-shot mode; the photo replaces the failed side.
  await page.getByRole("button", { name: "撮り直す" }).click();
  await page.getByTestId("add-scan-camera").waitFor();
  assert.equal(await page.getByRole("tab", { name: "裏面" }).count(), 0, "no sides in single-shot mode");
  await page.getByRole("button", { name: "撮影する" }).click();
  await page.getByTestId("add-batch-reading").waitFor({ timeout: 10000 });
  assert.ok(server.writes().some((write) => write.endsWith("/replace")));
});

test("手入力: a name alone finds a 同名 candidate; 統合 asks only the differing fields; 別の人 saves anyway", async (t) => {
  const people = [{ displayName: "石川 陽介", id: "contact-ishikawa", organization: "ミライ精機", role: "生産技術部" }];
  const { page, server } = await open(t, "/contacts/new/manual", { people });
  await page.getByTestId("add-manual").waitFor();
  await page.getByRole("textbox", { name: "名前" }).fill("石川 陽介");
  // b11 A3 ③: the candidate opens as a sheet (いま入力中 / 人脈にいる人).
  await page.getByTestId("add-manual-dup-sheet").waitFor();
  assert.ok(server.calls.some((call) => call.path === "/api/contacts/manual/duplicates" && JSON.stringify(call.body) === JSON.stringify({ displayName: "石川 陽介" })), "only the name was sent");
  // Closing the sheet without choosing leaves a line to open it again; saving asks first.
  await page.mouse.click(195, 60); // the scrim above the sheet
  await page.getByTestId("add-manual-duplicate").waitFor();
  await page.getByRole("button", { name: "保存" }).first().click();
  await page.getByText("保存の前に、同じ人かどうか選んでください。").waitFor();
  assert.equal(server.writes().filter((write) => write === "POST /api/contacts/manual").length, 0);
  // 統合: company differs → only that field, one choice.
  await page.getByTestId("add-manual-chip-organization").click();
  await page.getByTestId("add-manual-organization").fill("ミライ精機株式会社");
  await page.getByTestId("add-manual-duplicate").click();
  await page.getByRole("button", { name: "統合する（おすすめ）" }).click();
  await page.getByTestId("add-manual-merge").waitFor();
  assert.equal(await page.getByTestId("add-manual-merge-organization").count(), 1);
  assert.equal(await page.getByTestId("add-manual-merge-displayName").count(), 0, "the same name is not asked");
  await page.getByTestId("add-manual-merge-organization").getByRole("radio").first().click();
  await page.getByRole("button", { name: "保存" }).first().click();
  await page.waitForFunction(() => (window as unknown as { addNav: { stack: string[] } }).addNav.stack.at(-1) === "/contacts/contact-ishikawa");
  const merge = server.calls.find((call) => call.path === "/api/contacts/manual" && call.method === "POST")!.body as Record<string, unknown>;
  assert.deepEqual(merge.fieldChoices, { organization: "existing" });
  assert.equal(merge.mergeIntoContactId, "contact-ishikawa");
  assert.equal(server.people.length, 1, "merged, not added");
  await page.getByText("既存の人に統合しました").waitFor();
});

test("手入力: 保存 shows 保存したあと (b11 #18) with 「人脈に追加しました · 手入力 · ●●○ [元に戻す]」; 元に戻す deletes it and returns to the form", async (t) => {
  const { page, server } = await open(t, "/contacts/new/manual", { setup: (s) => { s.events = [{ id: "event-cfo", startsAt: "2026-10-07T10:00:00Z", title: "CFO Night Tokyo" }]; } });
  await page.getByRole("textbox", { name: "名前" }).fill("新井 光");
  await page.getByTestId("add-manual-density-1").waitFor();
  await page.getByTestId("add-manual-chip-met").click();
  await page.getByRole("checkbox", { name: "CFO Night Tokyo（10/7）" }).click();
  await page.getByTestId("add-manual-chip-contact").click();
  await page.getByRole("textbox", { name: "メール" }).fill("arai@example.jp");
  await page.getByTestId("add-manual-density-2").waitFor();
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: "保存" }).first().click();
  await page.getByTestId("add-manual-saved").waitFor();
  await page.getByText("情報を濃くする").waitFor();
  await page.getByText("手入力の内容と統合 · ●●○ → ●●●").waitFor();
  const created = server.calls.find((call) => call.path === "/api/contacts/manual" && call.method === "POST")!.body as Record<string, unknown>;
  assert.deepEqual(created.metContext, { eventId: "event-cfo", kind: "event", label: "CFO Night Tokyo" });
  await page.getByText("人脈に追加しました").waitFor();
  await page.getByText("新井 光 · 手入力 · ●●○").waitFor();
  await page.getByRole("button", { name: "元に戻す" }).click();
  await page.getByText("追加を取り消しました").waitFor();
  assert.equal(server.undone.length, 1);
  assert.equal(server.people.length, 0, "the contact is gone (the server keeps a tombstone)");
  assert.equal((await nav(page)).stack.at(-1), "/contacts/new/manual", "back on the form");
  assert.equal(await page.getByRole("textbox", { name: "名前" }).inputValue(), "新井 光", "with what was typed");
});

test("模拟器走查: 元に戻す says it is working at once, waits for the server, then returns to the form (not further back)", async (t) => {
  let release!: () => void;
  const { page, server } = await open(t, "/contacts/new/manual", { stack: ["/contacts/new", "/contacts/new/manual"], setup: (s) => { s.undoGate = new Promise((resolve) => { release = resolve; }); } });
  await page.getByRole("textbox", { name: "名前" }).fill("遅延 太郎");
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: "保存" }).first().click();
  await page.getByText("人脈に追加しました").waitFor();
  await page.getByRole("button", { name: "元に戻す" }).click();
  await page.getByText("元に戻しています…").waitFor();
  assert.ok(server.calls.some((call) => /\/api\/contacts\/manual\/[^/]+\/undo$/.test(call.path)), "元に戻す reached the server");
  release();
  await page.getByText("追加を取り消しました").waitFor();
  assert.equal(server.people.length, 0);
  assert.deepEqual((await nav(page)).stack, ["/contacts/new", "/contacts/new/manual"], "still on the form, not one page further back");
  assert.equal(await page.getByRole("textbox", { name: "名前" }).inputValue(), "遅延 太郎", "with what was typed");
});

test("模拟器走查: 元に戻す too late (409 UNDO_EXPIRED) says so and keeps 保存したあと", async (t) => {
  const { page, server } = await open(t, "/contacts/new/manual");
  await page.getByRole("textbox", { name: "名前" }).fill("期限 花子");
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: "保存" }).first().click();
  await page.getByText("人脈に追加しました").waitFor();
  server.undoExpired = true;
  await page.getByRole("button", { name: "元に戻す" }).click();
  await page.getByText("取り消せる時間を過ぎました").waitFor();
  assert.equal(server.people.length, 1, "still in 人脈");
  await page.getByTestId("add-manual-saved").waitFor();
  assert.equal((await nav(page)).stack.at(-1), "/contacts/new/manual", "保存したあと stays");
});

test("手入力: the sample account cannot save (403 SAMPLE_READ_ONLY) and the page says so", async (t) => {
  const { page, server } = await open(t, "/contacts/new/manual", { setup: (s) => { s.sample = true; } });
  await page.getByRole("textbox", { name: "名前" }).fill("見本 太郎");
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: "保存" }).first().click();
  await page.getByText("サンプル表示中は保存できません。").waitFor();
  assert.equal(server.people.length, 0);
  assert.equal((await nav(page)).stack.at(-1), "/contacts/new/manual");
});

test("確認待ちの下書き: 確認して追加 / 破棄; with ?eventId= 参加者から取り込む", async (t) => {
  const { page, server } = await open(t, "/contacts/new/drafts?eventId=event-cfo", {
    setup: (s) => { s.drafts = [{ displayName: "林 悦", id: "d1", organization: "星野", role: "CFO", source: { label: "CFO Night Tokyo" }, status: "pending_confirmation" }, { displayName: "森 恭平", id: "d2", organization: "", role: "", source: { label: "" }, status: "pending_confirmation" }]; },
  });
  await page.getByTestId("add-draft-d1").waitFor();
  await page.getByText("CFO Night Tokyo から", { exact: false }).waitFor();
  await page.getByTestId("add-draft-d1").getByRole("button", { name: "確認して追加" }).click();
  await page.getByTestId("add-draft-d1").waitFor({ state: "detached" });
  assert.ok(server.writes().includes("POST /api/contact-drafts/d1/confirm"));
  assert.equal(server.people.length, 1);
  await page.getByTestId("add-draft-d2").getByRole("button", { name: "破棄" }).click();
  await page.getByRole("alert").filter({ hasText: "この下書きを破棄しますか？" }).getByRole("button", { name: "破棄" }).click();
  await page.getByTestId("add-draft-d2").waitFor({ state: "detached" });
  assert.equal(server.writes().filter((write) => write.includes("d2")).length, 0, "破棄 is kept on this device");
  await page.getByTestId("add-drafts-import").getByRole("button", { name: "取り込む" }).click();
  await page.getByText("1人を取り込みました").waitFor();
  const imported = server.calls.find((call) => call.path === "/api/contact-drafts/event-attendees/import")!;
  assert.deepEqual(imported.body, { eventId: "event-cfo" });
  await page.getByText("参加者 一郎").waitFor();
  // Without an event there is no import block.
  const plain = await open(t, "/contacts/new/drafts");
  await plain.page.getByTestId("add-drafts").waitFor();
  await plain.page.getByText("確認待ちの下書きはありません").waitFor();
  assert.equal(await plain.page.getByTestId("add-drafts-import").count(), 0);
});

test("dark appearance: the add pages render with no page errors", async (t) => {
  for (const path of ["/contacts/new", "/contacts/new/manual", "/contacts/new/drafts"]) {
    const { page } = await open(t, path, { dark: true });
    await top(page).waitFor();
    await page.waitForTimeout(100);
  }
});
