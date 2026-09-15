import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { chromium, type Browser, type Page } from "playwright";

let browser: Browser;
let script: string;

const fixture = `
import React, { useSyncExternalStore } from "react";
let revision = 0;
const listeners = new Set();
const state = window.fixture = {
  baseUrl: "https://first.example",
  baseUrlReady: true,
  accountFailure: false,
  accountRequests: [],
  canonicalAccountId: "account:canonical",
  storedCookie: null,
  requests: [],
  results: [],
  signOuts: [],
  writes: [],
  scopeChanges: [],
  keyDeleteFails: false,
  ...window.initialFixture,
  update(patch) { Object.assign(state, patch); revision++; listeners.forEach(listener => listener()); }
};
export function useFixture() {
  useSyncExternalStore(listener => { listeners.add(listener); return () => listeners.delete(listener); }, () => revision);
  return state;
}
export function useOrbitApiBaseUrl() {
  useFixture();
  return { baseUrl: state.baseUrl, ready: state.baseUrlReady };
}
export async function fetchMobileAuthProviders() { return { success: true, data: { providers: [] } }; }
export async function signInWithMobileCredentials(input) {
  state.requests.push(input);
  return await new Promise(resolve => { state.release = () => resolve({ success: true, data: { cookieHeader: "session=first", expiresAt: "2026-09-15T00:00:00Z", user: { id: "actor-first", email: "member@example.test", name: "Member" } } }); });
}
export async function validateAuthSession({ cookieHeader }) {
  return { success: true, data: { user: { id: state.validationActor || (cookieHeader === "session=first" ? "actor-first" : "restored"), email: "member@example.test", name: "Member", image: null, emailVerified: true } } };
}
export async function createGoogleOAuthAttempt() { throw new Error("unused"); }
export async function exchangeGoogleOAuthCode() { throw new Error("unused"); }
export function parseGoogleOAuthBrowserResult() { throw new Error("unused"); }
export const nativeAuthSessionStorage = {
  async read() { return state.storedCookie; },
  async write(baseUrl, cookie) { state.writes.push({ baseUrl, cookie }); },
  async clear() {}
};
export async function registerOrbitAccount() { return { success: true }; }
export const syncLifecycle = {
  async setScope(scope) { state.scopeChanges.push(scope); return !state.keyDeleteFails; }
};
export function onSessionExpired(handler) { state.expire = handler; return () => { state.expire = null; }; }
export async function signOutOrbitSession(input) {
  state.signOuts.push(input);
  if (state.holdSignOut) await new Promise(resolve => { state.releaseSignOut = resolve; });
  return { success: true };
}
export function createOrbitApiClient(input) { return { async get(path) {
  state.accountRequests.push({ ...input, path });
  if (state.accountFailure) return { success: false, status: 503, error: { code: "SERVICE_UNAVAILABLE", message: "账号暂时不可用" } };
  return { success: true, status: 200, data: { account: { id: state.canonicalAccountId }, session: { status: "signed-in" }, user: { id: "profile:one" } } };
} }; }
`;

test.before(async () => {
  const result = await build({
    stdin: {
      contents: `import React from "react"; import { createRoot } from "react-dom/client"; import { OrbitAuthSessionProvider, useOrbitAuthSession } from "./src/api/AuthSessionProvider"; import { useFixture } from "fixture";
function Probe() { const auth = useOrbitAuthSession(); const state = useFixture(); state.auth = auth; return <button disabled={!auth.ready} onClick={() => auth.signIn({ email: "member@example.test", password: "secret" }).then(result => state.results.push(result))}>sign in</button>; }
const root = createRoot(document.getElementById("root")); window.fixture.unmountProvider = () => root.unmount(); root.render(<OrbitAuthSessionProvider><Probe /></OrbitAuthSessionProvider>);`,
      loader: "tsx",
      resolveDir: process.cwd()
    },
    bundle: true,
    write: false,
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"test"', __DEV__: "false" },
    plugins: [{
      name: "auth-provider-boundaries",
      setup(plugin) {
        plugin.onResolve({ filter: /^fixture$|\/ApiBaseUrlProvider$|\/mobile-auth$|\/native-auth-session-storage$|\/sync-lifecycle$/ }, () => ({ path: "fixture", namespace: "auth-race" }));
        plugin.onResolve({ filter: /^expo-crypto$/ }, () => ({ path: "crypto", namespace: "auth-race" }));
        plugin.onResolve({ filter: /^expo-router$/ }, () => ({ path: "router", namespace: "auth-race" }));
        plugin.onResolve({ filter: /^expo-web-browser$/ }, () => ({ path: "browser", namespace: "auth-race" }));
        plugin.onResolve({ filter: /^react-native$/ }, () => ({ path: "native", namespace: "auth-race" }));
        plugin.onResolve({ filter: /^(\.\/client|\.\/auth-session|\.\/session-expiry|\.\/native-auth-session-storage|\.\/mobile-auth|\.\.\/data\/snapshot-store|\.\.\/notifications\/(native-notifications|push-device-session|push-registration-queue))$/ }, args => ({ path: args.path, namespace: "auth-race" }));
        plugin.onLoad({ filter: /.*/, namespace: "auth-race" }, args => {
          if (args.path === "fixture") return { contents: fixture, loader: "js", resolveDir: process.cwd() };
          if (args.path === "crypto") return { contents: "export const CryptoDigestAlgorithm = { SHA256: 'SHA256' }; export async function digest(_, value) { return value; } export async function getRandomBytesAsync() { return new Uint8Array(32); }", loader: "js" };
          if (args.path === "router") return { contents: "export const router = { replace() {} };", loader: "js" };
          if (args.path === "browser") return { contents: "export async function openAuthSessionAsync() { return { type: 'cancel' }; }", loader: "js" };
          if (args.path === "native") return { contents: "export const Platform = { OS: 'ios' };", loader: "js" };
          if (args.path.endsWith("/auth-session")) return { contents: "export { registerOrbitAccount, signOutOrbitSession } from 'fixture';", loader: "js", resolveDir: process.cwd() };
          if (args.path.endsWith("/session-expiry")) return { contents: "export { onSessionExpired } from 'fixture';", loader: "js", resolveDir: process.cwd() };
          if (args.path.endsWith("/client")) return { contents: "export { createOrbitApiClient } from 'fixture';", loader: "js", resolveDir: process.cwd() };
          if (args.path.endsWith("/push-registration-queue")) return { contents: "export async function revokePushDeviceRegistrations() { return true; }", loader: "js" };
          return { contents: "export async function clearSnapshots() {} export async function cancelOrbitManagedNotifications() {} export async function revokeNotificationDevice() {} export async function revokeRegisteredPushDevice() {}", loader: "js" };
        });
      }
    }]
  });
  script = result.outputFiles[0]!.text;
  browser = await chromium.launch({ headless: true });
});

test.after(async () => { await browser?.close(); });

async function open(t: { after(fn: () => Promise<void>): void }, initial: Record<string, unknown> = {}): Promise<Page> {
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  t.after(async () => { await page.close(); assert.deepEqual(errors, []); });
  await page.setContent('<div id="root"></div>');
  await page.evaluate(value => { (window as any).initialFixture = value; }, initial);
  await page.addScriptTag({ content: script });
  await page.getByRole("button", { name: "sign in" }).waitFor();
  await page.waitForFunction(() => (window as any).fixture.auth?.ready === true);
  return page;
}

test("a login completed for an obsolete server cannot replace or persist the current session", async t => {
  const page = await open(t);
  await page.getByRole("button", { name: "sign in" }).click();
  await page.waitForFunction(() => (window as any).fixture.requests.length === 1);
  await page.evaluate(() => (window as any).fixture.update({ baseUrl: "https://second.example" }));
  await page.waitForFunction(() => (window as any).fixture.auth?.ready === true && (window as any).fixture.auth?.signedIn === false);
  await page.evaluate(() => (window as any).fixture.release());
  await page.waitForFunction(() => (window as any).fixture.results.length === 1);
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.results), [{
    message: "登录服务器已切换，请重新登录。",
    success: false
  }]);
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.writes), []);
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.signOuts), [{
    baseUrl: "https://first.example",
    cookieHeader: "session=first"
  }]);
  assert.equal(await page.evaluate(() => (window as any).fixture.auth.user), null);
});

test("a validated cookie cannot accept a different actor than the login envelope", async t => {
  const page = await open(t);
  await page.evaluate(() => (window as any).fixture.update({ validationActor: "actor-other" }));
  await page.getByRole("button", { name: "sign in" }).click();
  await page.waitForFunction(() => (window as any).fixture.requests.length === 1);
  await page.evaluate(() => (window as any).fixture.release());
  await page.waitForFunction(() => (window as any).fixture.results.length === 1);
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.results), [{
    message: "登录身份校验失败，请重新登录。",
    success: false
  }]);
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.writes), []);
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.signOuts), [{
    baseUrl: "https://first.example",
    cookieHeader: "session=first"
  }]);
  assert.equal(await page.evaluate(() => (window as any).fixture.auth.user), null);
});

test("an unmounted auth provider rejects and discards a late login session", async t => {
  const page = await open(t);
  await page.getByRole("button", { name: "sign in" }).click();
  await page.waitForFunction(() => (window as any).fixture.requests.length === 1);
  await page.evaluate(() => (window as any).fixture.unmountProvider());
  await page.evaluate(() => (window as any).fixture.release());
  await page.waitForFunction(() => (window as any).fixture.results.length === 1);
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.results), [{
    message: "登录服务器已切换，请重新登录。",
    success: false
  }]);
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.writes), []);
  assert.equal(await page.evaluate(() => (window as any).fixture.signOuts.length), 1);
});

test("an accepted session exposes the raw login principal and canonical account separately", async t => {
  const page = await open(t);
  await page.getByRole("button", { name: "sign in" }).click();
  await page.waitForFunction(() => (window as any).fixture.requests.length === 1);
  await page.evaluate(() => (window as any).fixture.release());
  await page.waitForFunction(() =>
    (window as any).fixture.results.length === 1
    && (window as any).fixture.auth?.user?.id === "actor-first"
  );
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.results), [{ success: true }]);
  assert.equal(await page.evaluate(() => (window as any).fixture.auth.user.id), "actor-first");
  assert.equal(await page.evaluate(() => (window as any).fixture.auth.accountId), "account:canonical");
  assert.equal(await page.evaluate(() => (window as any).fixture.auth.actorId), "account:canonical");
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.writes), [{
    baseUrl: "https://first.example",
    cookie: "session=first"
  }]);
});

test("account identity failure rejects the new session without raw-id fallback", async t => {
  const page = await open(t);
  await page.evaluate(() => (window as any).fixture.update({ accountFailure: true }));
  await page.getByRole("button", { name: "sign in" }).click();
  await page.waitForFunction(() => (window as any).fixture.requests.length === 1);
  await page.evaluate(() => (window as any).fixture.release());
  await page.waitForFunction(() => (window as any).fixture.results.length === 1);
  assert.equal(await page.evaluate(() => (window as any).fixture.auth.user), null);
  assert.equal(await page.evaluate(() => (window as any).fixture.auth.actorId ?? null), null);
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.writes), []);
  assert.equal(await page.evaluate(() => (window as any).fixture.signOuts.length), 1);
});

test("restoring a stored session waits for and exposes its canonical account", async t => {
  const page = await open(t, { storedCookie: "session=restored" });
  await page.waitForFunction(() => (window as any).fixture.auth?.ready === true);
  assert.equal(await page.evaluate(() => (window as any).fixture.auth.user.id), "restored");
  assert.equal(await page.evaluate(() => (window as any).fixture.auth.actorId), "account:canonical");
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.accountRequests), [{
    authCookieHeader: "session=restored",
    baseUrl: "https://first.example",
    path: "/api/account/me"
  }]);
});

test("a stored session stays closed when account/me cannot establish an owner", async t => {
  const page = await open(t, { accountFailure: true, storedCookie: "session=restored" });
  await page.waitForFunction(() => (window as any).fixture.auth?.ready === true);
  assert.equal(await page.evaluate(() => (window as any).fixture.auth.signedIn), false);
  assert.equal(await page.evaluate(() => (window as any).fixture.auth.actorId), null);
});

test("restoring canonical identity activates the encrypted server/actor scope", async t => {
  const page = await open(t, { storedCookie: "session=restored" });
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.scopeChanges), [null, { baseUrl: "https://first.example", actorId: "account:canonical" }]);
});

test("key deletion failure blocks accepting a replacement account before persisting its cookie", async t => {
  const page = await open(t, { storedCookie: "session=restored" });
  await page.evaluate(() => (window as any).fixture.update({ keyDeleteFails: true, canonicalAccountId: "account:other" }));
  await page.getByRole("button", { name: "sign in" }).click();
  await page.waitForFunction(() => (window as any).fixture.requests.length === 1);
  await page.evaluate(() => (window as any).fixture.release());
  await page.waitForFunction(() => (window as any).fixture.results.length === 1);
  assert.equal(await page.evaluate(() => (window as any).fixture.results[0].success), false);
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.writes), []);
  assert.equal(await page.evaluate(() => (window as any).fixture.auth.actorId), "account:canonical");
});

test("logout purges encrypted storage once and prevents a pending login from resurrecting the session", async t => {
  const page = await open(t, { storedCookie: "session=restored" });
  await page.getByRole("button", { name: "sign in" }).click();
  await page.waitForFunction(() => (window as any).fixture.requests.length === 1);
  assert.equal(await page.evaluate(async () => (await (window as any).fixture.auth.signOut()).success), true);
  await page.evaluate(() => (window as any).fixture.release());
  await page.waitForFunction(() => (window as any).fixture.results.length === 1);
  assert.equal(await page.evaluate(() => (window as any).fixture.results[0].success), false);
  await page.waitForFunction(() => (window as any).fixture.auth.signedIn === false);
  assert.equal(await page.evaluate(() => (window as any).fixture.auth.signedIn), false);
  assert.equal(await page.evaluate(() => (window as any).fixture.scopeChanges.filter((scope: unknown) => scope === null).length), 2);
});

test("logout key deletion failure is visible and keeps the current session from switching", async t => {
  const page = await open(t, { storedCookie: "session=restored" });
  await page.evaluate(() => (window as any).fixture.update({ keyDeleteFails: true }));
  assert.equal(await page.evaluate(async () => (await (window as any).fixture.auth.signOut()).success), false);
  assert.equal(await page.evaluate(() => (window as any).fixture.auth.actorId), "account:canonical");
});

test("session expiry uses one lifecycle purge", async t => {
  const page = await open(t, { storedCookie: "session=restored" });
  await page.evaluate(() => (window as any).fixture.expire());
  await page.waitForFunction(() => (window as any).fixture.auth.signedIn === false);
  assert.equal(await page.evaluate(() => (window as any).fixture.scopeChanges.filter((scope: unknown) => scope === null).length), 2);
});

test("an old server logout response cannot purge or clear the newly restored server session", async t => {
  const page = await open(t, { storedCookie: "session=restored", holdSignOut: true });
  await page.evaluate(() => { const state = (window as any).fixture; state.logoutPromise = state.auth.signOut(); });
  await page.waitForFunction(() => Boolean((window as any).fixture.releaseSignOut));
  await page.evaluate(() => (window as any).fixture.update({ baseUrl: "https://second.example", canonicalAccountId: "account:second" }));
  await page.waitForFunction(() => (window as any).fixture.auth.ready && (window as any).fixture.auth.actorId === "account:second");
  await page.evaluate(() => (window as any).fixture.releaseSignOut());
  assert.equal(await page.evaluate(async () => (await (window as any).fixture.logoutPromise).success), false);
  assert.equal(await page.evaluate(() => (window as any).fixture.auth.actorId), "account:second");
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.scopeChanges.at(-1)), { baseUrl: "https://second.example", actorId: "account:second" });
});
