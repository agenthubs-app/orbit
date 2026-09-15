import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { build } from "esbuild";
import { chromium, type Browser, type Page } from "playwright";

const require = createRequire(import.meta.url);
let browser: Browser;
let script = "";

const initialItem = {
  appointmentId: "appointment:one",
  confirmed: { durationMinutes: 45, medium: { kind: "in_person", location: "丸の内" }, startsAtUtc: "2026-09-20T01:00:00.000Z", timezone: "Asia/Tokyo" },
  contactId: "contact:one",
  details: "准备报价单",
  detailsUpdatedAt: "2026-09-15T07:00:00.000Z",
  detailsUpdatedBy: "other",
  eventId: "event:one",
  proposals: [{ createdAt: "2026-09-13T00:00:00.000Z", durationMinutes: 45, medium: { kind: "in_person", location: "丸の内" }, note: "讨论合作范围", proposedBy: "you", revision: 1, timezone: "Asia/Tokyo" }],
  status: "confirmed",
  updatedAt: "2026-09-15T07:00:00.000Z",
  version: 4,
};

const fixture = `
import React, { useSyncExternalStore } from "react";
import { View } from "react-native-web";
const listeners = new Set(); let revision = 0, keyIndex = 0;
const observe = () => useSyncExternalStore(fn => { listeners.add(fn); return () => listeners.delete(fn); }, () => revision);
const state = window.fixture = {
  actor: "actor:one", rawUserId: "raw:user", item: window.initialFixture.item, appointmentId: "appointment:one", baseUrl: "https://orbit.example", ready: true, baseReady: true, signedIn: true,
  requests: [], pending: [], navigations: [], ...window.initialFixture,
  update(patch) { Object.assign(state, patch); revision++; listeners.forEach(fn => fn()); },
  reply(index, status = 200, data) {
    const payload = status >= 200 && status < 300 ? { success: true, data: data ?? state.item } : { success: false, error: { code: status === 409 ? "CONFLICT" : "SERVICE_UNAVAILABLE", message: "Request failed" } };
    state.pending[index]?.(new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } }));
  }
};
window.fetch = async (input, init = {}) => { const index = state.requests.length; const url = new URL(String(input)); const headers = Object.fromEntries(new Headers(init.headers).entries());
  state.requests.push({ method: init.method ?? "GET", path: url.pathname, body: init.body ? JSON.parse(init.body) : null, headers });
  const response = new Promise(resolve => state.pending[index] = resolve);
  if ((init.method ?? "GET") === "GET") queueMicrotask(() => state.reply(index));
  return response;
};
export const useFixture = () => { observe(); return state; };
export const useOrbitAuthSession = () => { observe(); return { ready: state.ready, signedIn: state.signedIn, accountId: state.actor, actorId: state.actor, user: state.signedIn ? { id: state.rawUserId } : null, cookieHeader: "" }; };
export const useOrbitApiBaseUrl = () => { observe(); return { ready: state.baseReady, baseUrl: state.baseUrl }; };
export const useLocalSearchParams = () => { observe(); return { id: state.appointmentId }; };
export const useGlobalSearchParams = useLocalSearchParams;
export const usePathname = () => "/schedule/meetings/" + encodeURIComponent(state.appointmentId);
export const useRouter = () => ({ canGoBack: () => false, back() {}, push(path) { state.navigations.push(path); }, replace(path) { state.navigations.push(path); } });
export const Redirect = () => <div role="status">Sign in</div>;
export const Stack = () => null;
export const randomUUID = () => "meeting-details-key-" + ++keyIndex;
export const Ionicons = () => <span aria-hidden="true">◇</span>;
export const useSafeAreaInsets = () => ({ top: 48, bottom: 24, left: 0, right: 0 });
export const SafeAreaView = ({ edges, style, ...props }) => <View {...props} style={[style, edges?.includes("top") && { paddingTop: 48 }]} />;
export const useRelationshipInboxBadgeCount = () => 0;
`;

test.before(async () => {
  const result = await build({
    stdin: { contents: 'import React from "react"; import { createRoot } from "react-dom/client"; import Route from "./app/schedule/meetings/[id]"; createRoot(document.getElementById("root")).render(<Route />);', resolveDir: process.cwd(), loader: "tsx" },
    bundle: true,
    write: false,
    format: "iife",
    jsx: "automatic",
    resolveExtensions: [".web.tsx", ".web.ts", ".web.js", ".tsx", ".ts", ".jsx", ".js", ".json"],
    define: { "process.env.NODE_ENV": '"test"', "process.env": "{}", __DEV__: "false" },
    plugins: [{ name: "meeting-details-boundaries", setup(plugin) {
      plugin.onResolve({ filter: /^react-native$/ }, () => ({ path: "native", namespace: "meeting-details" }));
      plugin.onResolve({ filter: /^react-native-svg$/ }, () => ({ path: require.resolve("react-native-svg/lib/module/ReactNativeSVG.web.js") }));
      plugin.onResolve({ filter: /^(fixture|expo-router|expo-crypto|@expo\/vector-icons|react-native-safe-area-context)$|\/(ApiBaseUrlProvider|AuthSessionProvider|useRelationshipInboxBadgeCount)$/ }, () => ({ path: "fixture", namespace: "meeting-details" }));
      plugin.onLoad({ filter: /.*/, namespace: "meeting-details" }, args => ({ contents: args.path === "native" ? `
import React from "react"; import { Pressable as RealPressable, RefreshControl as RealRefreshControl, Text as RealText, TextInput as RealInput, StyleSheet, useWindowDimensions } from "react-native-web"; export * from "react-native-web";
export { useWindowDimensions };
export const Text = props => <RealText {...props} />;
export const TextInput = React.forwardRef((props, ref) => <RealInput {...props} ref={ref} />);
export const Pressable = props => <RealPressable {...props} />;
export const RefreshControl = props => { window.fixture.refresh = props.onRefresh; return <RealRefreshControl {...props} />; };
` : fixture, loader: "jsx", resolveDir: process.cwd() }));
    } }],
  });
  script = result.outputFiles[0]!.text;
  browser = await chromium.launch({ headless: true });
});

test.after(async () => { await browser?.close(); });

async function settle(page: Page) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function open(t: { after(fn: () => Promise<void>): void }, patch: Record<string, unknown> = {}) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, timezoneId: "Asia/Tokyo", locale: "zh-CN" });
  page.setDefaultTimeout(2_000);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  t.after(async () => { await page.close(); assert.deepEqual(errors, []); });
  await page.route("**/*", route => route.abort());
  await page.setContent('<div id="root"></div>');
  await page.evaluate(({ item, patch }) => { (window as any).initialFixture = { item, ...patch }; }, { item: initialItem, patch });
  await page.addScriptTag({ content: script });
  await page.getByText("准备报价单", { exact: true }).waitFor();
  await settle(page);
  return page;
}

async function latestWrite(page: Page) {
  return page.evaluate(() => (window as any).fixture.requests.filter((request: any) => request.method === "PATCH").at(-1));
}

async function replyLatestWrite(page: Page, status: number, data?: object) {
  await page.evaluate(({ status, data }) => { const state = (window as any).fixture; const index = state.requests.findLastIndex((request: any) => request.method === "PATCH"); state.reply(index, status, data); }, { status, data });
  await settle(page);
}

test("meeting notes keep the draft and idempotency key across failure, then show the verified save", async t => {
  const page = await open(t);
  assert.equal(await page.getByText("2026年9月20日 10:00 · 45分钟 · Asia/Tokyo", { exact: true }).count(), 1);
  await page.getByRole("button", { name: "编辑会议说明", exact: true }).click();
  await page.getByRole("textbox", { name: "会议说明", exact: true }).fill(" 新议题\n带上报价 ");
  await page.getByRole("button", { name: "保存说明", exact: true }).click();
  const first = await latestWrite(page);
  assert.deepEqual(first.body, { details: " 新议题\n带上报价 ", expectedVersion: 4 });
  assert.equal(first.headers["idempotency-key"], "ios:meeting-details:meeting-details-key-1");
  await replyLatestWrite(page, 503);
  assert.equal(await page.getByRole("textbox", { name: "会议说明" }).inputValue(), " 新议题\n带上报价 ");

  await page.getByRole("button", { name: "保存说明", exact: true }).click();
  const retry = await latestWrite(page);
  assert.equal(retry.headers["idempotency-key"], first.headers["idempotency-key"]);
  const saved = { ...initialItem, details: "新议题\n带上报价", detailsUpdatedAt: "2026-09-15T07:02:00.000Z", detailsUpdatedBy: "you", replayed: false, updatedAt: "2026-09-15T07:02:00.000Z", version: 5 };
  await replyLatestWrite(page, 200, saved);
  await page.getByText("会议说明已保存", { exact: true }).waitFor();
  assert.equal(await page.getByRole("textbox", { name: "会议说明" }).count(), 0);
  assert.equal(await page.getByText("新议题\n带上报价", { exact: true }).count(), 1);
});

test("meeting note conflict retains local text until the user loads the latest version", async t => {
  const page = await open(t);
  await page.getByRole("button", { name: "编辑会议说明", exact: true }).click();
  await page.getByRole("textbox", { name: "会议说明", exact: true }).fill("本地草稿");
  await page.getByRole("button", { name: "保存说明", exact: true }).click();
  await replyLatestWrite(page, 409);
  await page.getByText("会议说明已有新版本，你写的内容仍保留。", { exact: true }).waitFor();
  await page.evaluate(() => { const state = (window as any).fixture; state.item = { ...state.item, details: "对方的新内容", detailsUpdatedAt: "2026-09-15T07:03:00.000Z", detailsUpdatedBy: "other", updatedAt: "2026-09-15T07:03:00.000Z", version: 5 }; });
  await page.getByRole("button", { name: "重新读取会议", exact: true }).click();
  await page.getByRole("button", { name: "放弃草稿并载入最新说明", exact: true }).waitFor();
  assert.equal(await page.getByRole("textbox", { name: "会议说明" }).inputValue(), "本地草稿");
  await page.getByRole("button", { name: "放弃草稿并载入最新说明", exact: true }).click();
  assert.equal(await page.getByRole("textbox", { name: "会议说明" }).inputValue(), "对方的新内容");
});

test("meeting detail opens its contact and event and keeps an unverified receipt editable", async t => {
  const page = await open(t);
  await page.getByRole("button", { name: "查看联系人", exact: true }).click();
  await page.getByRole("button", { name: "查看相关活动", exact: true }).click();
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.navigations), ["/contacts/contact%3Aone", "/events/event%3Aone"]);
  await page.getByRole("button", { name: "编辑会议说明", exact: true }).click();
  await page.getByRole("textbox", { name: "会议说明", exact: true }).fill("必须保留");
  await page.getByRole("button", { name: "保存说明", exact: true }).click();
  await replyLatestWrite(page, 200, { ...initialItem, details: "错误回执", detailsUpdatedBy: "you", replayed: false, version: 5 });
  await page.getByText("未能确认保存结果，文字已保留，请重试。", { exact: true }).waitFor();
  assert.equal(await page.getByRole("textbox", { name: "会议说明" }).inputValue(), "必须保留");
});
