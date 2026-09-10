import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { createRequire } from "node:module";
import test from "node:test";
import { build } from "esbuild";
import { chromium, type Browser, type Locator, type Page } from "playwright";

const require = createRequire(import.meta.url);
let browser: Browser;
let server: Server;
let url: string;
const person = "林悦，负责日本与亚太地区零售伙伴合作";
const eventTitle = "东京与亚太地区零售伙伴长期合作交流活动";

// Real screens, view-models, theme and RN Web controls. Only native, auth,
// navigation, resource loading and HTTP/storage boundaries are controlled.
const boundaries = `
import React, { useSyncExternalStore } from "react";
import { View } from "react-native";
const listeners = new Set(); let revision = 0;
const state = window.fixture = { requests: [], navigation: [], signedIn: !location.search.includes("guest"), ready: true, kind: "success", pending: false, update(patch) { Object.assign(state, patch); revision++; listeners.forEach(f => f()); } };
const rerender = () => useSyncExternalStore(f => { listeners.add(f); return () => listeners.delete(f); }, () => revision);
const failure = { success: false, message: "暂时无法完成，请重试", error: { message: "暂时无法完成，请重试" } };
const record = action => async payload => {
  state.requests.push({ action, payload });
  if (action === "POST" && state.patchSuccess && payload?.path === "/api/profile/update-suggestions/suggestion%3A1/accept") return { success: true, data: { profilePatch: { headline: "关注长期零售伙伴合作的市场负责人" }, appliedFields: ["headline"] } };
  if (action === "POST" && state.calendarSuccess && payload?.path === "/api/permissions/calendar/request") return { success: true, data: { state: "pending", permission: { actionLabel: "Review calendar request", authorizationStage: "staged-review", capability: "calendar", label: "Calendar", requiredFor: "Event readiness, meeting context, and follow-up timing.", status: "pending" }, request: { capability: "calendar", evidenceIds: ["evidence:calendar-request-review"], id: "permission-request:calendar:event-readiness", intent: "connect-event-calendar", replacesProviderFlow: true, reviewLabel: "Calendar event readiness review", status: "pending" } } };
  if (state.pending) return new Promise(resolve => { state.resolve = () => resolve(failure); });
  return failure;
};
export const useOrbitAuthSession = () => { rerender(); return { ready: state.ready, signedIn: state.signedIn, googleEnabled: true, user: { id: "user:1", email: "lin@example.com", name: ${JSON.stringify(person)} }, signIn: record("signIn"), register: record("register"), startGoogleSignIn: record("google"), signOut: record("signOut") }; };
export const useRouter = () => ({ canGoBack: () => false, back() {}, push(path) { state.navigation.push(path); }, replace(path) { state.navigation.push(path); } });
export const usePathname = () => "/account";
export const useLocalSearchParams = () => ({ next: "/profile", created: new URLSearchParams(location.search).get("created") || undefined });
const profile = { profile: { displayName: ${JSON.stringify(person)}, headline: "连接长期零售合作伙伴，探索跨境业务机会", organization: "日本与亚太地区合作团队", role: "市场负责人", bio: "希望认识关注日本市场的长期合作伙伴。", offering: ["日本零售渠道与本地落地资源"], seeking: ["跨境技术与商务伙伴"], topics: ["零售合作"], relationshipGoal: "建立长期互信的伙伴关系", timezone: "Asia/Tokyo" } };
const events = { events: [{ id: "event:1", title: ${JSON.stringify(eventTitle)}, startsAt: "2027-09-10T10:00:00+09:00", endsAt: "2027-09-10T12:00:00+09:00", status: "scheduled", venue: "东京合作交流中心二层会议区", relationshipValue: "寻找可信的长期合作方" }] };
const permissions = { state: "success", permissions: [{ capability: "calendar", label: "Calendar", status: "pending", authorizationStage: "staged-review", requiredFor: "活动准备与后续安排", rationale: "等待用户复核", evidence: [], actionLabel: "Review calendar request" }, { capability: "contacts", label: "Contacts", status: "authorized", authorizationStage: "ready", requiredFor: "关系搜索", rationale: "已可读取", evidence: [], actionLabel: "Use contact context" }] };
const suggestions = { state: "success", suggestions: [{ id: "suggestion:1", confidence: "high", currentValue: "市场负责人", suggestedValue: "关注长期零售伙伴合作的市场负责人", sourceKind: "chat", sourceLabel: "会话记录", status: "pending", targetProfileField: "headline", rationale: "建议来自最近的交流记录，需本人确认。", evidence: [{ evidenceId: "evidence:1", excerpt: "希望认识日本市场的合作伙伴。", sourceKind: "chat", sourceLabel: "会话记录" }] }, { id: "suggestion:2", confidence: "high", currentValue: "Tokyo", suggestedValue: "Tokyo and Singapore", sourceKind: "activity", status: "accepted", targetProfileField: "homeMarket" }] };
export const useApiResource = path => { rerender(); return { kind: state.kind, error: { message: "连接暂时失败" }, refreshing: false, refresh() {}, data: path.includes("suggestions") ? suggestions : path.includes("permissions") ? permissions : path.includes("profile") ? profile : path.includes("events") ? events : path.includes("aggregate") ? { relationshipAssetTotals: { contacts: 66 } } : { user: { displayName: ${JSON.stringify(person)}, email: "lin@example.com" }, workspace: { name: "亚太合作工作区", role: "owner" } } }; };
const client = { post: async (path, options) => record("POST")({ path, body: options?.body }), put: async (path, options) => record("PUT")({ path, body: options?.body }) };
export const useOrbitApiClient = () => client;
export const useOrbitApiBaseUrl = () => ({ baseUrl: "http://fixture.invalid", ready: true, error: null, setBaseUrl: record("setBaseUrl"), resetBaseUrl: record("resetBaseUrl") });
export const createOrbitApiClient = () => ({ get: path => record("GET")({ path }) });
export const SafeAreaView = ({ children, edges, ...props }) => <View {...props}>{children}</View>;
export const Ionicons = ({ size }) => <span aria-hidden="true" style={{ display: "inline-block", flexShrink: 0, width: size, height: size }} />;
export const launchImageLibraryAsync = async () => ({ canceled: true });
export const getDocumentAsync = async () => ({ canceled: true });
export const isPushNotificationsOptedIn = async () => false;
export const setPushNotificationsOptIn = record("setPushNotificationsOptIn");
export const revokeNotificationDevice = async () => { await record("revokeNotificationDevice")(); return true; };
export const revokeRegisteredPushDevice = async () => { await record("revokeRegisteredPushDevice")(); return true; };
`;

test.before(async () => {
  const result = await build({
    stdin: { contents: `import React from "react"; import { createRoot } from "react-dom/client";
import { SettingsScreen } from "./src/screens/settings/SettingsScreen";
import { ApiSettingsScreen } from "./src/screens/settings/ApiSettingsScreen";
import { AccountScreen } from "./src/screens/profile/AccountScreen";
import { AccountAuthScreen } from "./src/screens/profile/AccountAuthScreen";
import { AccountPermissionsScreen } from "./src/screens/profile/AccountPermissionsScreen";
import { ProfileScreen } from "./src/screens/profile/ProfileScreen";
import { AdminScreen } from "./src/screens/admin/AdminScreen";
import { AdminLoginScreen } from "./src/screens/admin/AdminLoginScreen";
import { PlatformScreen } from "./src/screens/platform/PlatformScreen";
const params = new URLSearchParams(location.search);
const screens = { settings: SettingsScreen, api: ApiSettingsScreen, account: AccountScreen, auth: AccountAuthScreen, permissions: AccountPermissionsScreen, profile: ProfileScreen, admin: AdminScreen, adminLogin: AdminLoginScreen, platform: PlatformScreen };
const Screen = screens[params.get("screen")];
createRoot(document.getElementById("root")).render(<Screen mode={params.get("mode") || "login"} surface={params.get("surface") || "dashboard"} />);`, resolveDir: process.cwd(), loader: "tsx" },
    bundle: true, write: false, format: "iife", jsx: "automatic",
    define: { "process.env.NODE_ENV": '"test"', "process.env": "{}", __DEV__: "false" },
    plugins: [{ name: "account-boundaries", setup(plugin) {
      plugin.onResolve({ filter: /^react-native$/ }, () => ({ path: require.resolve("react-native-web") }));
      plugin.onResolve({ filter: /^(expo-router|@expo\/vector-icons|react-native-safe-area-context|expo-image-picker|expo-document-picker)$|\/(AuthSessionProvider|useApiResource|useOrbitApiClient|ApiBaseUrlProvider|native-notifications|push-device-session)$|\/api\/client$/ }, () => ({ path: "fixture", namespace: "account-test" }));
      plugin.onLoad({ filter: /.*/, namespace: "account-test" }, () => ({ contents: boundaries, loader: "jsx", resolveDir: process.cwd() }));
    } }]
  });
  server = createServer((_request, response) => {
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end(`<style>html,body,#root{margin:0;height:100%}</style><div id="root"></div><script>${result.outputFiles[0]!.text}</script>`);
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  url = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({ headless: true });
});
test.after(async () => {
  await browser?.close();
  if (server) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});
async function open(t: { after: (fn: () => Promise<void>) => void }, screen: string, colorScheme: "light" | "dark" = "light"): Promise<Page> {
  const page = await browser.newPage({ viewport: { width: 320, height: 874 }, colorScheme });
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.setDefaultTimeout(2500); t.after(() => page.close());
  await page.route("**/*", route => route.request().url().startsWith(url) ? route.continue() : route.abort());
  await page.goto(`${url}?screen=${screen}`);
  await page.locator("#root > *").waitFor().catch(error => { throw new Error(`${errors.join("; ")} ${error.message}`); });
  assert.deepEqual(errors, []);
  return page;
}
async function fits(control: Locator, minHeight = 44) {
  await control.waitFor(); const box = (await control.boundingBox())!;
  assert.ok(box.height >= minHeight, `expected ${minHeight}pt, got ${box.height}`);
  assert.ok(box.x >= 0 && box.x + box.width <= 320.1, "control must fit a 320pt viewport");
  const clipped = await control.locator("[dir='auto']").evaluateAll(nodes => nodes.filter(n => n.scrollHeight > n.clientHeight + 1 || n.scrollWidth > n.clientWidth + 1).map(n => n.textContent));
  assert.deepEqual(clipped, [], "control text must grow without clipping");
  for (const label of await control.locator("[dir='auto']").all()) {
    const textBox = (await label.boundingBox())!;
    assert.ok(textBox.x >= box.x - 0.1 && textBox.x + textBox.width <= box.x + box.width + 0.1, "label stays inside the control horizontally");
    assert.ok(textBox.y >= box.y - 0.1 && textBox.y + textBox.height <= box.y + box.height + 0.1, "label stays inside the control vertically");
  }
}
async function inflate(page: Page) {
  await page.locator("[dir='auto']").evaluateAll(nodes => nodes.forEach(node => {
    const el = node as HTMLElement, style = getComputedStyle(el);
    el.style.fontSize = `${parseFloat(style.fontSize) * 2}px`;
    el.style.lineHeight = `${parseFloat(style.lineHeight) * 2}px`;
  }));
}

for (const scheme of ["light", "dark"] as const) {
  test(`${scheme}: final inset access note has a 12pt visible boundary`, async t => {
    const page = await open(t, "admin&surface=access", scheme);
    const note = page.getByText("邀请成员、调整角色和撤销访问都需要再次确认。", { exact: true }).locator("..");
    assert.equal(await note.evaluate(el => getComputedStyle(el).borderRadius), "12px", "accessNote");
    assert.deepEqual(await page.evaluate(() => (window as any).fixture.requests), []);
  });
  test(`${scheme}: final inset accepted profile feedback preserves the pending edit`, async t => {
    const page = await open(t, "profile", scheme);
    await page.evaluate(() => (window as any).fixture.update({ patchSuccess: true }));
    await page.getByRole("button", { name: /^确认.*建议$/ }).click();
    const notice = page.getByText("待保存改动", { exact: true }).locator("..").locator("..");
    await notice.waitFor();
    assert.deepEqual(await page.evaluate(() => (window as any).fixture.requests), [{ action: "POST", payload: { path: "/api/profile/update-suggestions/suggestion%3A1/accept", body: undefined } }]);
    assert.equal(await page.getByRole("textbox", { name: "标题", exact: true }).inputValue(), "关注长期零售伙伴合作的市场负责人");
    assert.equal(await notice.evaluate(el => getComputedStyle(el).borderRadius), "12px", "acceptedPatchNotice");
  });
}

for (const theme of ["light", "dark"] as const) {
  test(`${theme}: settings has one compact row per permitted destination`, async t => {
    const page = await open(t, "settings", theme);
    for (const [name, path] of [["账号", "/account"], ["权限中心", "/account/permissions"], ["服务器", "/settings/api"]]) {
      const row = page.getByRole("button", { name: new RegExp(`打开${name}`) });
      await fits(row);
      assert.equal(await page.getByText(`打开${name}`, { exact: true }).count(), 0, "destination must not repeat a separate Open line");
      assert.ok((await row.boundingBox())!.height <= 112, "settings rows stay compact");
      await row.hover(); await page.mouse.down();
      // RN Web's press responder starts feedback after its default 50ms delay.
      await page.waitForFunction(label => {
        const row = document.querySelector(`[aria-label="${label}"]`);
        return row && Number(getComputedStyle(row).opacity) < 1;
      }, `打开${name}`, { timeout: 500 });
      assert.ok(Number(await row.evaluate(el => getComputedStyle(el).opacity)) < 1, "navigation responds immediately to a press");
      await page.mouse.move(0, 0); await page.mouse.up();
      await row.click(); assert.equal(await page.evaluate(() => (window as any).fixture.navigation.at(-1)), path);
    }
    await page.evaluate(() => (window as any).fixture.update({ signedIn: false }));
    assert.equal(await page.getByRole("button", { name: "打开权限中心", exact: true }).count(), 0);
    await fits(page.getByRole("button", { name: "打开账号", exact: true }));
    assert.deepEqual(await page.evaluate(() => (window as any).fixture.requests), []);
  });

  test(`${theme}: profile identity is open and complete; editing stays local`, async t => {
    const page = await open(t, "profile", theme);
    const name = page.getByText(person, { exact: true }).first(); await name.waitFor();
    const identity = name.locator("..").locator("..");
    assert.equal(await identity.evaluate(el => getComputedStyle(el).backgroundColor), theme === "light" ? "rgb(255, 254, 252)" : "rgb(34, 38, 46)");
    assert.equal(await name.evaluate(el => el.scrollWidth <= el.clientWidth + 1 && el.scrollHeight <= el.clientHeight + 1), true, "long identity remains readable");
    const input = page.getByRole("textbox", { name: "名字", exact: true }); await fits(input); await input.fill("保留未保存名字");
    const form = page.getByText("编辑对外资料", { exact: true }).locator("..").locator("..");
    assert.equal(await form.evaluate(el => getComputedStyle(el).borderRadius), "12px");
    await fits(page.getByRole("button", { name: "保存资料", exact: true }), 50);
    for (const label of ["提取名片", "提取简历", "选择名片图片", "选择简历图片", "选择简历文件"]) await fits(page.getByRole("button", { name: label, exact: true }));
    await page.getByText("资料更新建议", { exact: true }).waitFor();
    const suggestion = page.getByRole("button", { name: /^确认.*建议$/ });
    assert.equal(await suggestion.count(), 1, "resolved suggestions must not offer another confirmation");
    await fits(suggestion, 50);
    await inflate(page); await fits(page.getByRole("button", { name: "选择名片图片", exact: true }));
    await fits(suggestion, 50);
    assert.equal(await input.inputValue(), "保留未保存名字");
    await page.emulateMedia({ colorScheme: theme === "light" ? "dark" : "light" });
    assert.equal(await input.inputValue(), "保留未保存名字", "appearance changes preserve the local profile draft");
    await page.emulateMedia({ colorScheme: theme });
    assert.deepEqual(await page.evaluate(() => (window as any).fixture.requests), []);
    if (process.env.APP_STYLE_SCREENSHOTS) await page.screenshot({ path: `/tmp/orbit-app-wide-profile-${theme}.png`, fullPage: true });
  });

  for (const mode of ["login", "signup"] as const) {
    test(`${theme}: ${mode} keeps editable credentials after a failed attempt`, async t => {
      const page = await open(t, `auth&mode=${mode}`, theme);
      const email = page.getByPlaceholder("输入邮箱地址");
      await email.fill("lin@example.com");
      const password = page.locator("input[type=password]"); await password.fill("safe-fixture-password");
      const submit = page.getByRole("button", { name: mode === "login" ? "登录" : "创建账号", exact: true });
      await fits(submit, 50);
      await page.evaluate(() => (window as any).fixture.update({ ready: false }));
      assert.equal(await submit.isDisabled(), true);
      assert.equal(await page.getByRole("button", { name: "使用 Google 登录", exact: true }).isDisabled(), true);
      assert.deepEqual(await page.evaluate(() => (window as any).fixture.requests), []);
      await page.evaluate(() => (window as any).fixture.update({ ready: true }));
      const form = email.locator("..").locator("..").locator("..").locator("..").locator("..");
      assert.equal(await form.evaluate(el => getComputedStyle(el).borderRadius), "12px", "credentials retain one inset form boundary");
      await page.evaluate(() => (window as any).fixture.update({ pending: true }));
      await submit.click(); assert.equal(await submit.isDisabled(), true);
      assert.equal(await submit.innerText(), mode === "login" ? "登录中..." : "创建中...");
      await page.evaluate(() => (window as any).fixture.resolve());
      await page.getByText("暂时无法完成，请重试", { exact: true }).waitFor();
      assert.equal(await email.inputValue(), "lin@example.com"); assert.equal(await password.inputValue(), "safe-fixture-password");
      assert.deepEqual(await page.evaluate(() => (window as any).fixture.requests), [{ action: mode === "login" ? "signIn" : "register", payload: { email: "lin@example.com", password: "safe-fixture-password", ...(mode === "login" ? { redirectTo: "/profile" } : {}) } }]);
      await fits(page.getByRole("button", { name: "显示密码", exact: true }));
      await page.getByRole("button", { name: "显示密码", exact: true }).click();
      assert.equal(await page.locator("input[type=password]").count(), 0);
      await inflate(page); await fits(submit, 50);
      for (const link of await page.getByRole("link").all()) await fits(link);
      if (process.env.APP_STYLE_SCREENSHOTS) await page.screenshot({ path: `/tmp/orbit-app-wide-auth-${mode}-${theme}.png`, fullPage: true });
    });
  }

  test(`${theme}: permissions show a bounded request and distinct pending control`, async t => {
    const page = await open(t, "permissions", theme);
    const action = page.getByRole("button", { name: "申请日历复核", exact: true }); await fits(action, 50);
    await page.evaluate(() => (window as any).fixture.update({ pending: true }));
    const enabledOpacity = await action.evaluate(el => getComputedStyle(el).opacity);
    await action.click(); assert.equal(await action.isDisabled(), true);
    assert.notEqual(await action.evaluate(el => getComputedStyle(el).opacity), enabledOpacity);
    assert.deepEqual(await page.evaluate(() => (window as any).fixture.requests), [{ action: "POST", payload: { path: "/api/permissions/calendar/request", body: { intent: "connect-event-calendar" } } }]);
    await page.evaluate(() => (window as any).fixture.resolve());
    await page.getByText("暂时无法完成，请重试", { exact: true }).waitFor();
    assert.equal(await action.isEnabled(), true);
    await inflate(page); await fits(action, 50);
    if (process.env.APP_STYLE_SCREENSHOTS) await page.screenshot({ path: `/tmp/orbit-app-wide-permissions-${theme}.png`, fullPage: true });
  });
}

test("forgot mode and signed-out profile/permission/account preserve public boundaries", async t => {
  const forgot = await open(t, "auth&mode=forgot&guest");
  assert.equal(await forgot.getByRole("textbox").count(), 1);
  await forgot.getByRole("textbox").fill("account@example.test");
  assert.equal(await forgot.locator("input[type=password]").count(), 0);
  await fits(forgot.getByRole("button", { name: "发送重置链接", exact: true }), 50);
  const returnAction = forgot.getByRole("button", { name: /返回登录/ }); await fits(returnAction, 44); await returnAction.click();
  assert.deepEqual(await forgot.evaluate(() => (window as any).fixture.requests), []);
  for (const screen of ["profile", "permissions", "account"]) {
    const page = await open(t, `${screen}&guest`); await page.getByText(/登录后查看/).first().waitFor();
    assert.equal(await page.getByText(person, { exact: true }).count(), 0);
    assert.equal(await page.getByRole("button", { name: "退出登录", exact: true }).count(), 0);
    assert.deepEqual(await page.evaluate(() => (window as any).fixture.requests), []);
  }
});

test("server draft and account navigation retain actions without configuration or logout writes", async t => {
  const page = await open(t, "api", "dark");
  await page.getByPlaceholder("http://localhost:3000").fill("https://new.example.com");
  await inflate(page);
  for (const name of ["保存", "检查", "重置"]) await fits(page.getByRole("button", { name, exact: true }), name === "保存" ? 50 : 44);
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.requests), []);
  const account = await open(t, "account"); await fits(account.getByRole("button", { name: "退出登录", exact: true }));
  await account.getByRole("button", { name: /权限中心/ }).click();
  assert.deepEqual(await account.evaluate(() => (window as any).fixture.navigation), ["/account/permissions"]);
  assert.deepEqual(await account.evaluate(() => (window as any).fixture.requests), []);
});

test("admin surfaces and public platform retain readable data and only existing navigation", async t => {
  for (const surface of ["dashboard", "access", "events"]) {
    const page = await open(t, `admin&surface=${surface}`, "dark");
    const nav = page.getByRole("button", { name: "访问管理", exact: true }); await fits(nav);
    await nav.click(); assert.equal(await page.evaluate(() => (window as any).fixture.navigation.at(-1)), "/admin/access");
    if (surface !== "access") { const event = page.getByRole("button", { name: new RegExp(eventTitle) }); await fits(event); await event.click(); assert.equal(await page.evaluate(() => (window as any).fixture.navigation.at(-1)), "/events/event%3A1"); }
    await inflate(page); await fits(nav);
    const clipped = await page.locator("[dir='auto']").evaluateAll(nodes => nodes.filter(n => n.scrollHeight > n.clientHeight + 1 || n.scrollWidth > n.clientWidth + 1).map(n => n.textContent));
    assert.deepEqual(clipped, [], "admin statistics, activity details and access notes remain complete");
    assert.deepEqual(await page.evaluate(() => (window as any).fixture.requests), []);
  }
  const platform = await open(t, "platform"); const title = platform.getByText(eventTitle, { exact: true }); await title.waitFor();
  assert.equal(await title.evaluate(el => el.scrollHeight <= el.clientHeight + 1), true, "public activity title remains complete");
  assert.equal(await platform.getByRole("button", { name: /批准|驳回|发布|认证/ }).count(), 0);
  for (const guest of [true, false]) {
    const login = await open(t, `adminLogin${guest ? "&guest" : ""}`);
    const action = login.getByRole("button", { name: guest ? "登录后检查访问权限" : "打开只读后台", exact: true }); await fits(action, 50); await action.click();
    assert.deepEqual(await login.evaluate(() => (window as any).fixture.navigation), [guest ? "/account/login?next=%2Fadmin" : "/admin"]);
    assert.deepEqual(await login.evaluate(() => (window as any).fixture.requests), []);
  }
});

test("platform public activity and statistics remain complete with large text", async t => {
  const page = await open(t, "platform", "dark");
  const title = page.getByText(eventTitle, { exact: true }); await title.waitFor();
  await inflate(page);
  const clipped = await page.locator("[dir='auto']").evaluateAll(nodes => nodes.filter(n => n.scrollHeight > n.clientHeight + 1 || n.scrollWidth > n.clientWidth + 1).map(n => n.textContent));
  assert.deepEqual(clipped, [], "public source review keeps activity, statistics and explanations readable");
  assert.equal(await page.getByRole("button", { name: /批准|驳回|发布|认证/ }).count(), 0);
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.requests), []);
});

for (const theme of ["light", "dark"] as const) {
  for (const kind of ["account feedback", "auth error", "auth notice", "permission error", "permission safety"] as const) {
    test(`${theme}: ${kind} uses the 12pt feedback inset on the real screen`, async t => {
      const screen = kind === "account feedback" ? "account" : kind === "auth notice" ? "auth&created=1" : kind === "auth error" ? "auth" : "permissions";
      const page = await open(t, screen, theme);
      let message = "暂时无法完成，请重试";
      let expectedRequests: unknown[];
      if (kind === "account feedback") {
        // The fixture rejects sign-out; the real session is never touched.
        await page.getByRole("button", { name: "退出登录", exact: true }).click();
        expectedRequests = [{ action: "signOut", payload: undefined }];
      } else if (kind === "auth error") {
        await page.getByPlaceholder("输入邮箱地址").fill("lin@example.com");
        await page.locator("input[type=password]").fill("safe-fixture-password");
        await page.getByRole("button", { name: "登录", exact: true }).click();
        expectedRequests = [{ action: "signIn", payload: { email: "lin@example.com", password: "safe-fixture-password", redirectTo: "/profile" } }];
      } else if (kind === "auth notice") {
        message = "账号已创建。请用刚才的邮箱继续登录。";
        expectedRequests = [];
      } else {
        if (kind === "permission safety") {
          await page.evaluate(() => (window as any).fixture.update({ calendarSuccess: true }));
          message = "留在 Orbit 里复核，不会打开系统日历或外部账号授权。";
        }
        await page.getByRole("button", { name: "申请日历复核", exact: true }).click();
        expectedRequests = [{ action: "POST", payload: { path: "/api/permissions/calendar/request", body: { intent: "connect-event-calendar" } } }];
      }
      const panel = page.getByText(message, { exact: true }); await panel.waitFor();
      assert.equal(await panel.evaluate(el => getComputedStyle(el).borderRadius), "12px", `${kind} must use the approved feedback inset radius`);
      assert.notEqual(await panel.evaluate(el => getComputedStyle(el).backgroundColor), "rgba(0, 0, 0, 0)");
      await inflate(page); await fits(panel, 0);
      assert.equal(await panel.evaluate(el => el.scrollHeight <= el.clientHeight + 1 && el.scrollWidth <= el.clientWidth + 1), true, "feedback stays complete with enlarged text");
      assert.deepEqual(await page.evaluate(() => (window as any).fixture.requests), expectedRequests);
    });
  }
}
