import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { createRequire } from "node:module";
import test from "node:test";
import { build } from "esbuild";
import { chromium, type Browser, type Page } from "playwright";

const require = createRequire(import.meta.url);
const requestMessage = "申请已受理。如果该邮箱支持密码恢复，你将收到重置链接；未收到时请稍后重试。";
const resetMessage = "密码已更新，请使用新密码登录。";
let browser: Browser;
let server: Server;
let url: string;
const hasReset = existsSync(new URL("../src/screens/profile/PasswordResetScreen.tsx", import.meta.url));

// Actual screens, React hooks, useOrbitApiClient, envelope parser and theme.
// Secrets exist only in this in-memory fixture; assertions return booleans/counts.
const fixture = `
import React, { useSyncExternalStore } from "react";
import { View } from "react-native-web";
import { onSessionExpired } from "./src/api/session-expiry";
const listeners = new Set(); let revision = 0;
const observe = () => useSyncExternalStore(fn => { listeners.add(fn); return () => listeners.delete(fn); }, () => revision);
const state = window.fixture = {
  mode: "forgot", actor: "one", baseUrl: "https://orbit.example", ready: true, baseReady: true, mounted: true,
  params: {}, requests: [], replies: [], rejects: [], navigation: [], expirations: 0, presses: {}, holdFragment: false,
  token: "a".repeat(43), password: "A".repeat(12),
  update(patch) { Object.assign(state, patch); revision++; listeners.forEach(fn => fn()); },
  fragment() { state.update({ params: { "#": "token=" + state.token } }); },
  reply(index, kind = "success") {
    if (kind === "network") { state.rejects[index](new Error("Fixture transport failure")); return; }
    const isRequest = state.requests[index].url.pathname.endsWith("/request");
    const data = kind === "missing" ? {} : kind === "object" ? { message: {} } : kind === "null" ? null : { message: kind === "empty" ? "" : isRequest ? ${JSON.stringify(requestMessage)} : ${JSON.stringify(resetMessage)} };
    const failure = kind === "invalid" || kind === "unavailable";
    state.replies[index](new Response(JSON.stringify(failure ? { success: false, error: { code: kind === "invalid" ? "INVALID_TOKEN" : "SERVICE_UNAVAILABLE", message: kind === "invalid" ? "链接已失效或已使用，请重新申请。" : "密码恢复暂不可用，请稍后重试或联系管理员。" } } : { success: true, data }), { status: failure ? (kind === "invalid" ? 400 : 503) : kind === "http-error" ? 503 : isRequest ? 202 : 200, headers: { "content-type": "application/json", "cache-control": "no-store", "referrer-policy": "no-referrer" } }));
  },
  fill(label, kind) {
    const field = document.querySelector('[aria-label="' + label + '"]');
    if (!field) throw new Error("Expected form field missing");
    const value = kind === "link" ? state.baseUrl + "/app/account/reset-password#token=" + state.token : kind === "password" ? state.password : kind === "mismatch" ? "B".repeat(12) : kind;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  }
};
onSessionExpired(() => state.expirations++);
window.fetch = async (path, init) => {
  state.requests.push({ method: init.method, url: new URL(path), body: JSON.parse(init.body) });
  return new Promise((resolve, reject) => { state.replies.push(resolve); state.rejects.push(reject); });
};
export const useFixture = () => { observe(); return state; };
export const useOrbitApiBaseUrl = () => { observe(); return { baseUrl: state.baseUrl, ready: state.baseReady }; };
const authResult = async () => { state.update({ actor: "authenticated" }); return { success: true }; };
export const useOrbitAuthSession = () => { observe(); return { ready: state.ready, user: { id: state.actor }, cookieHeader: "", googleEnabled: true, signIn: authResult, register: authResult, startGoogleSignIn: authResult, expireSession() { state.expirations++; } }; };
export const useLocalSearchParams = () => { observe(); return state.params; };
export const usePathname = () => "/account/" + state.mode;
const router = { canGoBack: () => false, back() {}, push(href) { state.navigation.push(href); }, replace(href) { state.navigation.push(href); state.update({ params: {} }); }, setParams(params) { if (!state.holdFragment) state.update({ params: { ...state.params, ...params } }); } };
export const useRouter = () => router;
export const SafeAreaView = ({ children, edges, ...props }) => <View {...props}>{children}</View>;
export const Ionicons = ({ size }) => <span aria-hidden="true" style={{ display: "inline-block", width: size, height: size }} />;
`;

test.before(async () => {
  const result = await build({
    stdin: { contents: `import React from "react"; import { createRoot } from "react-dom/client"; import { useFixture } from "fixture"; import { AccountAuthScreen } from "./src/screens/profile/AccountAuthScreen"; ${hasReset ? 'import { PasswordResetScreen } from "./src/screens/profile/PasswordResetScreen";' : 'const PasswordResetScreen = () => null;'} function App() { const s = useFixture(); return s.mounted ? (s.mode === "reset" ? <PasswordResetScreen /> : <AccountAuthScreen mode={s.mode} />) : null; } createRoot(document.getElementById("root")).render(<App />);`, resolveDir: process.cwd(), loader: "tsx" },
    bundle: true, write: false, format: "iife", jsx: "automatic",
    define: { "process.env.NODE_ENV": '"test"', "process.env": "{}", __DEV__: "false" },
    plugins: [{ name: "recovery-boundaries", setup(plugin) {
      plugin.onResolve({ filter: /^react-native$/ }, () => ({ path: "native", namespace: "recovery" }));
      plugin.onResolve({ filter: /^(fixture|expo-router|@expo\/vector-icons|react-native-safe-area-context)$|\/(ApiBaseUrlProvider|AuthSessionProvider)$/ }, () => ({ path: "fixture", namespace: "recovery" }));
      plugin.onLoad({ filter: /.*/, namespace: "recovery" }, args => ({ contents: args.path === "native" ? `import React from "react"; import { Pressable as NativePressable } from "react-native-web"; export * from "react-native-web"; export const Pressable = props => { if (props.accessibilityLabel) window.fixture.presses[props.accessibilityLabel] = props.onPress; return <NativePressable {...props} />; };` : fixture, loader: "jsx", resolveDir: process.cwd() }));
      plugin.onResolve({ filter: /^react-native-web$/ }, () => ({ path: require.resolve("react-native-web") }));
    } }]
  });
  server = createServer((_request, response) => {
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end(`<div id="root"></div><script>${result.outputFiles[0]!.text}</script>`);
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  url = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({ headless: true, ...(process.env.ORBIT_TEST_CHROME_PATH ? { executablePath: process.env.ORBIT_TEST_CHROME_PATH } : {}) });
});
test.after(async () => {
  await browser?.close();
  if (server) await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve()));
});

async function open(t: { after: (fn: () => Promise<void>) => void }, mode = "forgot", patch = {}): Promise<Page> {
  if (mode === "reset") assert.ok(hasReset, "real reset component exists");
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.setDefaultTimeout(2500);
  let errors = 0;
  page.on("pageerror", () => errors++);
  t.after(async () => { await page.close(); assert.equal(errors, 0, "no React/runtime errors"); });
  await page.route("**/*", route => new URL(route.request().url()).origin === url ? route.continue() : route.abort());
  await page.goto(url);
  await page.evaluate(({ mode, patch }) => (window as any).fixture.update({ mode, ...patch }), { mode, patch });
  await settle(page);
  return page;
}
async function settle(page: Page) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}
async function fill(page: Page, label: string, kind: string) {
  await page.evaluate(({ label, kind }) => (window as any).fixture.fill(label, kind), { label, kind });
}
async function reply(page: Page, index: number, kind = "success") {
  await page.evaluate(({ index, kind }) => (window as any).fixture.reply(index, kind), { index, kind });
  await settle(page);
}
async function capture(page: Page) {
  await fill(page, "重置链接", "link");
  await page.getByRole("button", { name: "使用重置链接", exact: true }).click();
}
async function passwords(page: Page, mismatch = false) {
  await fill(page, "新密码", "password");
  await fill(page, "确认新密码", mismatch ? "mismatch" : "password");
}
async function duplicate(page: Page, label: string) {
  await page.evaluate(label => { const fn = (window as any).fixture.presses[label]; fn(); fn(); }, label);
  await settle(page);
}

test("request form sends email only, locks same-tick duplicates and stays on generic acceptance", async t => {
  const page = await open(t);
  await fill(page, "邮箱", "  account@example.test  ");
  await duplicate(page, "发送重置链接");
  assert.ok(await page.evaluate(() => { const s = (window as any).fixture; const r = s.requests[0]; return s.requests.length === 1 && r.method === "POST" && r.url.pathname === "/api/auth/password-reset/request" && Object.keys(r.body).join() === "email" && r.body.email === "account@example.test"; }));
  await reply(page, 0);
  await page.getByText(requestMessage, { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => (window as any).fixture.navigation.length), 0);
  assert.equal(await page.getByRole("link", { name: "使用重置链接" }).count(), 1);
});

test("request unavailable and malformed successes stay retryable with visible failures", async t => {
  const page = await open(t);
  await fill(page, "邮箱", "unknown@example.test");
  const failures = ["unavailable", "missing", "object", "null", "empty", "http-error", "network"];
  for (const [index, kind] of failures.entries()) {
    await page.getByRole("button", { name: "发送重置链接", exact: true }).click();
    await reply(page, index, kind);
    await page.getByRole("alert").waitFor();
  }
  await page.getByRole("button", { name: "发送重置链接", exact: true }).click();
  await reply(page, failures.length);
  await page.getByText(requestMessage, { exact: true }).waitFor();
});

test("reset mismatch makes no request; success clears fields/token/fragment without expiring current account", async t => {
  const page = await open(t, "reset");
  await page.evaluate(() => (window as any).fixture.fragment());
  await passwords(page, true);
  await page.getByRole("button", { name: "重置密码", exact: true }).click();
  assert.equal(await page.evaluate(() => (window as any).fixture.requests.length), 0);
  await passwords(page);
  await duplicate(page, "重置密码");
  assert.ok(await page.evaluate(() => { const s = (window as any).fixture; const r = s.requests[0]; return s.requests.length === 1 && r.method === "POST" && r.url.pathname === "/api/auth/password-reset/confirm" && r.url.search === "" && r.url.hash === "" && r.body.token === s.token && r.body.password === s.password && Object.keys(r.body).sort().join() === "password,token"; }));
  await reply(page, 0);
  assert.ok(await page.evaluate(() => { const s = (window as any).fixture; return !s.params["#"] && s.expirations === 0 && Array.from(document.querySelectorAll("input")).every(i => i.value === "") && !document.body.innerText.includes(s.token) && s.navigation.every((h: string) => !h.includes("#") && !h.includes(s.token)); }));
  assert.equal(await page.getByLabel("新密码", { exact: true }).count(), 0);
});

test("reset invalid token offers a new request; service and malformed success preserve secrets for retry", async t => {
  const page = await open(t, "reset");
  await capture(page);
  await passwords(page);
  const failures = ["unavailable", "missing", "object", "null", "empty", "http-error", "network"];
  for (const [index, kind] of failures.entries()) {
    await page.getByRole("button", { name: "重置密码", exact: true }).click();
    await reply(page, index, kind);
    await page.getByRole("alert").waitFor();
    assert.ok(await page.evaluate(() => (document.querySelector('[aria-label="新密码"]') as HTMLInputElement).value === (window as any).fixture.password));
  }
  await page.getByRole("button", { name: "重置密码", exact: true }).click();
  await reply(page, failures.length, "invalid");
  await page.getByRole("link", { name: "重新申请重置链接" }).click();
  assert.ok(await page.evaluate(() => (window as any).fixture.navigation.at(-1) === "/account/forgot-password"));
});

for (const mode of ["forgot", "reset"]) {
  for (const change of ["server", "account", "unmount"]) {
    test(`${mode} ignores deferred results after ${change}, including while replacement submit is pending`, async t => {
      const page = await open(t, mode);
      if (mode === "reset") { await page.evaluate(() => (window as any).fixture.fragment()); await passwords(page); }
      else await fill(page, "邮箱", "old@example.test");
      const submit = mode === "reset" ? "重置密码" : "发送重置链接";
      await page.getByRole("button", { name: submit, exact: true }).click();
      await page.evaluate(change => { const s = (window as any).fixture; s.update(change === "server" ? { baseUrl: "https://new.example" } : change === "account" ? { actor: "two" } : { mounted: false }); }, change);
      await settle(page);
      if (change === "unmount") await page.evaluate(() => (window as any).fixture.update({ mounted: true, params: {} }));
      if (mode === "reset") {
        await page.getByLabel("重置链接", { exact: true }).waitFor();
        assert.equal(await page.getByLabel("新密码", { exact: true }).count(), 0, "old fragment was not recaptured");
        await capture(page); await passwords(page);
      } else {
        assert.ok(await page.evaluate(() => (document.querySelector('[aria-label="邮箱"]') as HTMLInputElement).value === ""));
        await fill(page, "邮箱", "new@example.test");
      }
      await page.getByRole("button", { name: submit, exact: true }).click();
      await reply(page, 0);
      assert.equal(await page.getByText(mode === "reset" ? resetMessage : requestMessage, { exact: true }).count(), 0);
      assert.equal(await page.getByRole("button", { name: submit, exact: true }).isDisabled(), true, "old finally cannot unlock new submit");
      await reply(page, 1);
      await page.getByText(mode === "reset" ? resetMessage : requestMessage, { exact: true }).waitFor();
    });
  }
}

test("provider initialization defers fragment capture to accepted server and account", async t => {
  const page = await open(t, "reset", { ready: false, baseReady: false });
  await page.evaluate(() => (window as any).fixture.fragment());
  assert.equal(await page.getByLabel("新密码", { exact: true }).count(), 0);
  await page.evaluate(() => (window as any).fixture.update({ baseUrl: "https://accepted.example", actor: "accepted", ready: true, baseReady: true }));
  await passwords(page);
  await page.getByRole("button", { name: "重置密码", exact: true }).click();
  assert.ok(await page.evaluate(() => (window as any).fixture.requests[0].url.origin === "https://accepted.example"));
  await reply(page, 0);
});

test("server or account change clears an unaccepted pasted link", async t => {
  for (const patch of [{ actor: "two" }, { baseUrl: "https://new.example" }]) {
    const page = await open(t, "reset");
    await fill(page, "重置链接", "link");
    await page.evaluate(patch => (window as any).fixture.update(patch), patch);
    await settle(page);
    assert.ok(await page.evaluate(() => (document.querySelector('[aria-label="重置链接"]') as HTMLInputElement).value === ""));
  }
});

test("still-present fragment cannot be recaptured after server/account switches or reset success", async t => {
  for (const change of ["server", "account", "success"]) {
    const page = await open(t, "reset", { holdFragment: true });
    await page.evaluate(() => (window as any).fixture.fragment());
    await passwords(page);
    if (change === "success") {
      await page.getByRole("button", { name: "重置密码", exact: true }).click();
      await reply(page, 0);
    } else {
      await page.evaluate(change => (window as any).fixture.update(change === "server" ? { baseUrl: "https://new.example" } : { actor: "two" }), change);
    }
    await settle(page);
    assert.equal(await page.getByLabel("新密码", { exact: true }).count(), 0);
    await page.evaluate(() => (window as any).fixture.update({}));
    await settle(page);
    assert.equal(await page.getByLabel("新密码", { exact: true }).count(), 0);
  }
});

test("a superseding fragment invalidates the old reset response and its synchronous lock", async t => {
  const page = await open(t, "reset");
  await page.evaluate(() => (window as any).fixture.fragment());
  await passwords(page);
  await page.getByRole("button", { name: "重置密码", exact: true }).click();
  await page.evaluate(() => { const s = (window as any).fixture; s.token = "b".repeat(43); s.fragment(); });
  await settle(page);
  const submit = page.getByRole("button", { name: "重置密码", exact: true });
  assert.equal(await submit.isDisabled(), false, "new capture supersedes pending mutation");
  assert.ok(await page.evaluate(() => (document.querySelector('[aria-label="新密码"]') as HTMLInputElement).value === ""));
  await passwords(page);
  await duplicate(page, "重置密码");
  await reply(page, 0);
  assert.equal(await submit.isDisabled(), true, "old finally cannot unlock the superseding request");
  assert.equal(await page.getByText(resetMessage, { exact: true }).count(), 0);
  assert.ok(await page.evaluate(() => { const s = (window as any).fixture; return s.requests.length === 2 && s.requests[1].body.token === s.token; }));
  await reply(page, 1);
  await page.getByText(resetMessage, { exact: true }).waitFor();
});

test("invalid and query-carried tokens never expose password controls or send requests", async t => {
  const page = await open(t, "reset");
  await page.getByRole("button", { name: "使用重置链接", exact: true }).click();
  await page.getByRole("alert").waitFor();
  await page.evaluate(() => { const s = (window as any).fixture; s.update({ params: { token: s.token } }); });
  await settle(page);
  assert.equal(await page.getByLabel("新密码", { exact: true }).count(), 0);
  await page.evaluate(() => (window as any).fixture.update({ params: { "#": "token=invalid" } }));
  await page.getByRole("alert").waitFor();
  assert.equal(await page.getByLabel("新密码", { exact: true }).count(), 0);
  assert.equal(await page.evaluate(() => (window as any).fixture.requests.length), 0);
});

test("recovery controls fit narrow and wide screens with masked reset inputs", async t => {
  for (const mode of ["forgot", "reset"]) {
    const page = await open(t, mode);
    if (mode === "reset") await capture(page);
    for (const width of [320, 390, 1024]) {
      await page.setViewportSize({ width, height: 844 });
      await settle(page);
      const controls = page.locator('input, [role="button"], [role="link"]');
      for (const [index, control] of (await controls.all()).entries()) {
        const box = await control.boundingBox();
        assert.ok(box && box.height >= 44 && box.x >= 0 && box.x + box.width <= width, `${mode} width=${width} control=${index} geometry=${JSON.stringify(box)}`);
      }
    }
    if (mode === "reset") assert.ok(await page.evaluate(() => Array.from(document.querySelectorAll("input")).every(i => i.type === "password")));
  }
});

test("existing login, signup and Google still navigate after intentional auth identity changes", async t => {
  for (const mode of ["login", "signup", "google"]) {
    const page = await open(t, mode === "google" ? "login" : mode);
    await fill(page, "邮箱", "account@example.test");
    await fill(page, mode === "signup" ? "设置密码" : "密码", "password");
    await page.getByRole("button", { name: mode === "google" ? "使用 Google 登录" : mode === "signup" ? "创建账号" : "登录", exact: true }).click();
    await settle(page);
    assert.ok(await page.evaluate(mode => { const s = (window as any).fixture; return s.actor === "authenticated" && s.navigation.length === 1 && s.navigation[0].startsWith(mode === "signup" ? "/account/login?created=1" : "/dashboard"); }, mode));
  }
});
