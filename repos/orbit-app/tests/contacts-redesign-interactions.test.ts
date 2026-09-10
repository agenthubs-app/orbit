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

// Only HTTP/auth/native/navigation boundaries are replaced. The production screens,
// view-models, theme, form state and RN Web event handlers run in the browser.
const fixture = `
import React, { useSyncExternalStore } from "react";
import { View } from "react-native";
const listeners = new Set(); let revision = 0;
const subscribe = listener => { listeners.add(listener); return () => listeners.delete(listener); };
const rerender = () => useSyncExternalStore(subscribe, () => revision);
const contacts = ["吴可欣", "刘雨薇", "赵思琪", "王一凡", "张博文", "姚晓琳", "方欣然"].map((displayName, i) => ({
  id: "contact:" + i, displayName, organization: i === 0 ? "南山餐饮" : "晨光餐饮", role: "DX 顾问", status: i === 0 ? "needs_follow_up" : "active",
  value: { score: 84, valueTypes: [] }, location: "东京", relationshipContext: "在行业交流中认识", nextAction: "请共同联系人确认双方意愿后再发起引荐",
  publicProfile: { bio: "可核对的公开介绍", seeking: ["零售直播电商分销伙伴"], offering: ["跟进消息多语言本地化"] }
}));
const state = window.fixture = { requests: [], reads: [], navigation: [], kind: "success", canGoBack: true, failure: false,
  detail: location.search.includes("detail"), update(patch) { Object.assign(state, patch); revision++; listeners.forEach(listener => listener()); }
};
export const useLocalSearchParams = () => { rerender(); return state.detail ? { id: "contact:0" } : {}; };
export const usePathname = () => state.detail ? "/contacts/contact:0" : "/contacts/list";
export const useRouter = () => ({ canGoBack: () => state.canGoBack, back() { state.navigation.push("back"); }, replace(path) { state.navigation.push(path); }, push(path) { state.navigation.push(path); } });
export const useApiResource = path => {
  rerender(); state.reads.push(path);
  if (state.kind !== "success") return { kind: state.kind, error: { message: "连接暂时失败" }, refreshing: false, refresh() {} };
  const query = new URL(path, "http://fixture").searchParams.get("query") || "";
  const data = path.includes("suggestions") ? { suggestions: [] }
    : path.includes("contact%3A0") ? { contact: { ...contacts[0], notes: [] } }
    : path.includes("connections") ? { connections: [] }
    : path.includes("relationship-value") ? {} : { contacts: contacts.filter(contact => (contact.displayName + contact.organization).includes(query)), availableFilters: { sources: [{ value: "manual", count: 7 }], tags: [], values: [] } };
  return { kind: "success", data, refreshing: false, refresh() {} };
};
const client = {
  async post(path, options) { state.requests.push({ method: "POST", path, body: options.body }); return { success: false, error: { message: "暂时无法搜索，请重试" } }; },
  async patch(path, options) { state.requests.push({ method: "PATCH", path, body: options.body }); return state.failure ? { success: false } : { success: true, data: {} }; }
};
export const useOrbitApiClient = () => client;
const authSession = { ready: true, signedIn: true, cookieHeader: "", user: { id: "actor:contacts-test" } };
export const useOrbitAuthSession = () => authSession;
export const useOrbitApiBaseUrl = () => ({ baseUrl: "http://fixture" });
export const SafeAreaView = ({ children, edges, ...props }) => <View {...props}>{children}</View>;
export const Ionicons = ({ size }) => <span aria-hidden="true" style={{ display: "inline-block", flexShrink: 0, width: size, height: size }} />;
`;

test.before(async () => {
  const result = await build({
    stdin: { contents: `import React from "react"; import { createRoot } from "react-dom/client"; import { ContactsScreen } from "./src/screens/contacts/ContactsScreen"; import { ContactDetailScreen } from "./src/screens/contacts/ContactDetailScreen"; createRoot(document.getElementById("root")).render(location.search.includes("detail") ? <ContactDetailScreen /> : <ContactsScreen mode="list" />);`, resolveDir: process.cwd(), loader: "tsx" },
    bundle: true, write: false, format: "iife", jsx: "automatic",
    define: { "process.env.NODE_ENV": '"test"', __DEV__: "false" },
    plugins: [{ name: "contacts-boundaries", setup(plugin) {
      plugin.onResolve({ filter: /^react-native$/ }, () => ({ path: require.resolve("react-native-web") }));
      plugin.onResolve({ filter: /^(expo-router|@expo\/vector-icons|react-native-safe-area-context)$|\/(useApiResource|useOrbitApiClient|ApiBaseUrlProvider|AuthSessionProvider)$/ }, () => ({ path: "fixture", namespace: "contacts-test" }));
      plugin.onLoad({ filter: /.*/, namespace: "contacts-test" }, () => ({ contents: fixture, loader: "jsx", resolveDir: process.cwd() }));
    } }],
  });
  server = createServer((_request, response) => {
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end(`<style>html,body,#root{margin:0;height:100%}</style><div id="root"></div><script>${result.outputFiles[0]!.text}</script>`);
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

async function openScreen(t: { after: (fn: () => Promise<void>) => void }, detail = false, width = 402): Promise<Page> {
  const page = await browser.newPage({ viewport: { width, height: 874 } });
  page.setDefaultTimeout(2000);
  t.after(() => page.close());
  await page.route("**/*", route => route.request().url().startsWith(url) ? route.continue() : route.abort());
  await page.goto(url + (detail ? "?detail" : ""));
  await page.getByText("吴可欣", { exact: true }).waitFor();
  return page;
}

test("contact search has a named editable touch target and preserves search and clear behavior", async t => {
  const page = await openScreen(t);
  const search = page.getByRole("textbox", { name: "搜索姓名、公司、资源", exact: true });
  await search.waitFor();
  assert.ok((await search.boundingBox())!.height >= 44);
  await search.fill("吴可欣");
  assert.equal(await page.getByText("刘雨薇", { exact: true }).count(), 0);
  const clear = page.getByRole("button", { name: "清空搜索", exact: true });
  assert.ok((await clear.boundingBox())!.width >= 44);
  await clear.click();
  await page.getByText("刘雨薇", { exact: true }).waitFor();
  await page.getByRole("button", { name: /吴可欣.*打开联系人详情/ }).click();
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.navigation), [{ params: { id: "contact:0" }, pathname: "/contacts/[id]" }]);
});

test("both search actions remain large enough to tap on narrow phones and keep request boundaries", async t => {
  const page = await openScreen(t, false, 320);
  const deep = page.getByRole("button", { name: "深度搜索", exact: true });
  const relationship = page.getByRole("button", { name: "关系搜索", exact: true });
  for (const button of [deep, relationship]) {
    const box = (await button.boundingBox())!;
    assert.ok(box.height >= 44, "search actions must retain 44pt touch height");
    assert.ok(box.x >= 0 && box.x + box.width <= 320, "search action cannot overflow");
    const labelBox = (await button.getByText(await button.innerText(), { exact: true }).boundingBox())!;
    assert.ok(labelBox.x >= box.x && labelBox.x + labelBox.width <= box.x + box.width, "the label must fit beside its icon");
  }
  await page.getByPlaceholder("搜索姓名、公司、资源").fill("吴可欣");
  await deep.click();
  await page.getByText("暂时无法搜索，请重试", { exact: true }).waitFor();
  await relationship.click();
  const requests = await page.evaluate(() => (window as any).fixture.requests);
  assert.equal(requests.length, 2);
  assert.equal(requests[0].path, "/api/contacts/search");
  assert.equal(requests[1].path, "/api/search/relationships");
  assert.equal(requests[0].body.query, "吴可欣");
  assert.equal(requests[1].body.query, "吴可欣");
});

test("compact list retains every contact and all four operable filters", async t => {
  const page = await openScreen(t);
  assert.equal(await page.getByRole("button", { name: /打开联系人详情/ }).count(), 7);
  for (const [label, option] of [["行业", "企业 SaaS"], ["进展", "推进中"], ["行动", "需要联系"], ["更多", "添加方式"]] as const) {
    const button = page.getByRole("button", { name: `${label}筛选`, exact: true });
    assert.ok((await button.boundingBox())!.height >= 44);
    await button.click();
    await page.getByText(option, { exact: true }).waitFor();
    await button.click();
    assert.equal(await page.getByText(option, { exact: true }).count(), 0);
  }
  await page.getByRole("button", { name: "行动筛选", exact: true }).click();
  await page.getByRole("button", { name: /^需要联系 \d+$/ }).click();
  assert.equal(await page.getByRole("button", { name: /打开联系人详情/ }).count(), 1);
  assert.equal(await page.getByRole("button", { name: "行动筛选，已选 1 项", exact: true }).count(), 1);
});

test("detail offers a full-width draft action that navigates with the real contact without sending", async t => {
  const page = await openScreen(t, true);
  const draft = page.getByRole("button", { name: "起草消息", exact: true });
  const box = (await draft.boundingBox())!;
  assert.ok(box.width >= 350 && box.height >= 48, "primary draft action must use the content width");
  await draft.click();
  const navigation = await page.evaluate(() => (window as any).fixture.navigation);
  const route = new URL(navigation[0], "http://fixture");
  assert.equal(route.pathname, "/inbox");
  assert.equal(route.searchParams.get("contactId"), "contact:0");
  assert.equal(route.searchParams.get("participantName"), "吴可欣");
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.requests), []);
});

test("detail disclosures keep read and editing content available without writes on expansion", async t => {
  const page = await openScreen(t, true);
  assert.equal(await page.getByText("可核对的公开介绍", { exact: true }).count(), 0);
  const details = page.getByRole("button", { name: /完整资料/ });
  await details.click();
  await page.getByText("可核对的公开介绍", { exact: true }).waitFor();
  await details.click();
  assert.equal(await page.getByText("可核对的公开介绍", { exact: true }).count(), 0);
  const editing = page.getByRole("button", { name: /更新联系人/ });
  await editing.click();
  await page.getByText("当前状态", { exact: true }).waitFor();
  for (const placeholder of ["AI, 关西渠道, 待联系", "今天下午或 2026-07-24 09:30", "微信、邮件、活动现场", "刚确认了什么，下一步卡在哪里"]) {
    await page.getByPlaceholder(placeholder, { exact: true }).waitFor();
  }
  await editing.click();
  assert.equal(await page.getByText("当前状态", { exact: true }).count(), 0);
  const notes = page.getByRole("button", { name: "联系人备注", exact: true });
  const note = page.getByRole("textbox", { name: "添加联系人备注", exact: true });
  assert.equal(await note.count(), 0);
  await notes.click();
  await page.getByText("还没有联系人备注。", { exact: true }).waitFor();
  assert.equal(await page.getByRole("alert").count(), 0, "valid empty notes must not render a read failure");
  await note.fill("下次带上门店资料");
  await notes.click();
  assert.equal(await note.count(), 0);
  await notes.click();
  assert.equal(await note.inputValue(), "下次带上门店资料");
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.requests), []);
  await page.evaluate(() => { (window as any).fixture.failure = true; });
  const save = page.getByRole("button", { name: "保存备注", exact: true });
  await save.click();
  await page.getByRole("alert").getByText("尚未确认保存成功，内容已保留，请重试。", { exact: true }).waitFor();
  assert.equal(await note.inputValue(), "下次带上门店资料");
  assert.equal(await save.isEnabled(), true);
  const requests = await page.evaluate(() => (window as any).fixture.requests);
  assert.deepEqual(requests, [{ method: "PATCH", path: "/api/contacts/contact%3A0", body: { note: { authorLabel: "我", body: "下次带上门店资料" } } }]);
});

for (const detail of [false, true]) {
  test(`${detail ? "detail" : "list"} opened directly retains a labeled contact return during errors`, async t => {
    const page = await openScreen(t, detail);
    await page.evaluate(() => (window as any).fixture.update({ canGoBack: false, kind: "offline" }));
    await page.getByRole("button", { name: "返回联系人", exact: true }).click();
    assert.deepEqual(await page.evaluate(() => (window as any).fixture.navigation), [detail ? "/contacts/list" : "/contacts"]);
  });
}
