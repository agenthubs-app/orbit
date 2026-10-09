import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { chromium, type Browser, type Page } from "playwright";

// 0127: the real OrbitAuthSessionProvider, real offline-identity rules and a Playwright clock.
// Replaced boundaries: the HTTP auth calls, SecureStore (in-memory), the sync lifecycle
// (records scope transitions), the router and React Native platform globals.

let browser: Browser;
let script: string;

const day = 24 * 60 * 60 * 1000;
const validatedAt = Date.parse("2026-09-01T09:00:00.000Z");
const baseUrl = "http://127.0.0.1:3100";
const cachedUser = { id: "user:alex", email: "alex@example.test", name: "Alex" };
const record = { version: 1, baseUrl, accountId: "account:alex", user: cachedUser, validatedAt };
const recordScope = { baseUrl, actorId: "account:alex" };
const suspended = { suspend: baseUrl };

const fixture = `
import React, { useSyncExternalStore } from "react";
let revision = 0;
const listeners = new Set();
const state = window.fixture = {
  baseUrl: "${baseUrl}",
  platform: "ios",
  storedCookie: "session=stored",
  identity: null,
  validation: "valid",
  account: "ok",
  validations: 0,
  scopeChanges: [],
  cookieClears: [],
  identityClears: [],
  identityWrites: [],
  replaces: [],
  appStateListeners: [],
  ...window.initialFixture,
  update(patch) { Object.assign(state, patch); revision++; listeners.forEach(listener => listener()); }
};
export function useFixture() {
  useSyncExternalStore(listener => { listeners.add(listener); return () => listeners.delete(listener); }, () => revision);
  return state;
}
export function useOrbitApiBaseUrl() { useFixture(); return { baseUrl: state.baseUrl, ready: true }; }
export async function fetchMobileAuthProviders() { return { success: true, data: { providers: [] } }; }
export async function fetchMobileAccountStatus() { return { success: false, error: { code: "UNAUTHENTICATED", message: "no", status: 401 } }; }
export async function signInWithMobileCredentials() { return { success: false, error: { code: "X", message: "x", status: 0 } }; }
const user = { id: "user:alex", email: "alex@example.test", name: "Alex" };
export async function validateAuthSession() {
  state.validations++;
  switch (state.validation) {
    case "valid": return { success: true, data: { expiresAt: "2026-12-01T00:00:00Z", user } };
    case "network": return { success: false, error: { code: "ORBIT_APP_AUTH_NETWORK_ERROR", message: "offline", status: 0 } };
    case "revoked": return { success: false, error: { code: "ORBIT_APP_AUTH_SESSION_INVALID", message: "invalid", status: 200 } };
    case "401": return { success: false, error: { code: "ORBIT_APP_AUTH_SESSION_INVALID", message: "invalid", status: 401 } };
    case "503": return { success: false, error: { code: "ORBIT_APP_AUTH_SESSION_INVALID", message: "down", status: 503 } };
  }
}
export async function createGoogleOAuthAttempt() { throw new Error("unused"); }
export async function exchangeGoogleOAuthCode() { throw new Error("unused"); }
export function parseGoogleOAuthBrowserResult() { return { success: false }; }
export const nativeAuthSessionStorage = {
  async read() { return state.storedCookie; },
  async write(_, cookie) { state.storedCookie = cookie; },
  async clear(baseUrl) { state.cookieClears.push(baseUrl); state.storedCookie = null; },
  async clearIfMatches() { return false; }
};
export const offlineIdentityStorage = {
  async read(baseUrl) { return state.identity && state.identity.baseUrl === baseUrl ? state.identity : null; },
  async write(value) { state.identityWrites.push(value); state.identity = value; },
  async clear(baseUrl) { state.identityClears.push(baseUrl); state.identity = null; },
  async readLanguage() { return null; },
  async writeLanguage() {},
  key(baseUrl) { return "orbit.offlineIdentity." + baseUrl; }
};
export async function registerOrbitAccount() { return { success: true }; }
// 0130: a restore suspends the open scope (recorded as { suspend }) instead of purging it; setScope(null) is a purge.
export const syncLifecycle = {
  async suspendScope(baseUrl) { state.scopeChanges.push({ suspend: baseUrl }); return true; },
  async setScope(scope) { state.scopeChanges.push(scope); state.currentScope = scope; return true; },
  async pendingWriteSummary() { return { currentAccount: 0, otherAccounts: 0 }; },
  async withDatabase(_, callback) { return callback({ get: async () => ({ count: 0 }) }); }
};
export async function cancelOrbitManagedNotifications() {}
export function onSessionExpired(handler) { state.expire = handler; return () => { state.expire = null; }; }
export async function signOutOrbitSession() { return { success: true }; }
export function createOrbitApiClient() { return { async get() {
  if (state.account === "unavailable") return { success: false, status: 0, error: { code: "ORBIT_APP_NETWORK_ERROR", message: "offline" } };
  if (state.account === "401") return { success: false, status: 401, error: { code: "UNAUTHENTICATED", message: "no" } };
  return { success: true, status: 200, data: { account: { id: "account:alex" }, session: { status: "signed-in" }, user: { id: "profile:alex" } } };
} }; }
`;

test.before(async () => {
  const result = await build({
    stdin: {
      contents: `import React from "react"; import { createRoot } from "react-dom/client"; import { OrbitAuthSessionProvider, useOrbitAuthSession } from "./src/api/AuthSessionProvider"; import { useFixture } from "fixture";
function Probe() { const auth = useOrbitAuthSession(); const state = useFixture(); state.auth = auth; return <span>{auth.ready ? "ready" : "loading"}</span>; }
createRoot(document.getElementById("root")).render(<OrbitAuthSessionProvider><Probe /></OrbitAuthSessionProvider>);`,
      loader: "tsx",
      resolveDir: process.cwd()
    },
    bundle: true,
    write: false,
    format: "iife",
    jsx: "automatic",
    define: { __ORBIT_LEGACY_TEST_LANGUAGE__: '"zh"', "process.env.NODE_ENV": '"test"', "process.env": "{}", __DEV__: "false" },
    plugins: [{
      name: "offline-cold-start-boundaries",
      setup(plugin) {
        plugin.onResolve({ filter: /^fixture$|\/ApiBaseUrlProvider$|\/mobile-auth$|\/native-auth-session-storage$|\/offline-identity-storage$|\/sync-lifecycle$/ }, () => ({ path: "fixture", namespace: "offline" }));
        plugin.onResolve({ filter: /^expo-crypto$/ }, () => ({ path: "crypto", namespace: "offline" }));
        plugin.onResolve({ filter: /^expo-router$/ }, () => ({ path: "router", namespace: "offline" }));
        plugin.onResolve({ filter: /^expo-web-browser$/ }, () => ({ path: "browser", namespace: "offline" }));
        plugin.onResolve({ filter: /^react-native$/ }, () => ({ path: "native", namespace: "offline" }));
        plugin.onResolve({ filter: /^(\.\/client|\.\/auth-session|\.\/session-expiry|\.\.\/notifications\/(native-notifications|push-device-session|push-registration-queue))$/ }, args => ({ path: args.path, namespace: "offline" }));
        plugin.onLoad({ filter: /.*/, namespace: "offline" }, args => {
          if (args.path === "fixture") return { contents: fixture, loader: "js", resolveDir: process.cwd() };
          if (args.path === "crypto") return { contents: "export const CryptoDigestAlgorithm = { SHA256: 'SHA256' }; export async function digest(_, value) { return value; } export async function getRandomBytesAsync() { return new Uint8Array(32); }", loader: "js" };
          if (args.path === "router") return { contents: "export const router = { replace(href) { window.fixture.replaces.push(href); } };", loader: "js" };
          if (args.path === "browser") return { contents: "export async function openAuthSessionAsync() { return { type: 'cancel' }; }", loader: "js" };
          if (args.path === "native") return { contents: "export const Alert = { alert() {} }; export const Platform = { get OS() { return window.fixture.platform; } }; export const AppState = { addEventListener(_, listener) { window.fixture.appStateListeners.push(listener); return { remove() { window.fixture.appStateListeners = window.fixture.appStateListeners.filter(item => item !== listener); } }; } };", loader: "js" };
          if (args.path.endsWith("/auth-session")) return { contents: "export { registerOrbitAccount, signOutOrbitSession } from 'fixture';", loader: "js", resolveDir: process.cwd() };
          if (args.path.endsWith("/session-expiry")) return { contents: "export { onSessionExpired } from 'fixture';", loader: "js", resolveDir: process.cwd() };
          if (args.path.endsWith("/client")) return { contents: "export { createOrbitApiClient } from 'fixture';", loader: "js", resolveDir: process.cwd() };
          if (args.path.endsWith("/push-registration-queue")) return { contents: "export async function revokePushDeviceRegistrations() { return true; }", loader: "js" };
          if (args.path.endsWith("/native-notifications")) return { contents: "export { cancelOrbitManagedNotifications } from 'fixture';", loader: "js", resolveDir: process.cwd() };
          return { contents: "export async function revokeRegisteredPushDevice() {}", loader: "js" };
        });
      }
    }]
  });
  script = result.outputFiles[0]!.text;
  browser = await chromium.launch({ headless: true });
});

test.after(async () => { await browser?.close(); });

async function open(t: { after(fn: () => Promise<void>): void }, initial: Record<string, unknown>, now: number): Promise<Page> {
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  t.after(async () => { await page.close(); assert.deepEqual(errors, []); });
  await page.clock.install({ time: now });
  await page.setContent('<div id="root"></div>');
  await page.evaluate(value => { (window as any).initialFixture = value; }, initial);
  await page.addScriptTag({ content: script });
  if (errors.length > 0) throw new Error(errors.join("\n"));
  await page.waitForFunction(() => (window as any).fixture.auth?.ready === true, undefined, { timeout: 5000 });
  return page;
}

const state = (page: Page) => page.evaluate(() => {
  const s = (window as any).fixture;
  return {
    signedIn: s.auth.signedIn, offline: s.auth.offline, actorId: s.auth.actorId, user: s.auth.user, cookieHeader: s.auth.cookieHeader,
    storedCookie: s.storedCookie, identity: s.identity, scopeChanges: s.scopeChanges, cookieClears: s.cookieClears,
    identityClears: s.identityClears, replaces: s.replaces, validations: s.validations,
  };
});

test("network error at cold start within 29 days enters the cached account offline and opens its mirror", async t => {
  const page = await open(t, { validation: "network", identity: record }, validatedAt + 29 * day);
  const s = await state(page);
  assert.equal(s.signedIn, true);
  assert.equal(s.offline, true);
  assert.equal(s.actorId, "account:alex");
  assert.deepEqual(s.user, cachedUser);
  assert.equal(s.cookieHeader, "session=stored", "the stored cookie is kept for the reconnect check");
  assert.deepEqual(s.scopeChanges, [suspended, recordScope]);
  assert.deepEqual(s.cookieClears, []);
  assert.deepEqual(s.identity, record, "an offline start does not extend the 30-day window");
});

test("a 5xx or an unreachable account/me also counts as offline, not as a rejection", async t => {
  const five = await open(t, { validation: "503", identity: record }, validatedAt + day);
  assert.equal((await state(five)).offline, true);
  const account = await open(t, { validation: "valid", account: "unavailable", identity: record }, validatedAt + day);
  const s = await state(account);
  assert.equal(s.offline, true);
  assert.equal(s.actorId, "account:alex");
});

test("after 31 days without online validation a cold start shows the login page but erases nothing", async t => {
  const page = await open(t, { validation: "network", identity: record }, validatedAt + 31 * day);
  const s = await state(page);
  assert.equal(s.signedIn, false);
  assert.equal(s.actorId, null);
  assert.deepEqual(s.scopeChanges, [suspended], "no mirror is opened and nothing is purged");
  assert.equal(s.storedCookie, "session=stored");
  assert.deepEqual(s.identity, record, "not a rejection: the same account can come back online");
});

test("no validation record means no offline entry", async t => {
  const page = await open(t, { validation: "network", identity: null }, validatedAt);
  assert.equal((await state(page)).signedIn, false);
});

for (const answer of ["401", "revoked"]) {
  test(`an explicit rejection (${answer}) at cold start erases the cached account's mirror, key, cookie and record`, async t => {
    const page = await open(t, { validation: answer, identity: record }, validatedAt + 2 * day);
    const s = await state(page);
    assert.equal(s.signedIn, false);
    assert.deepEqual(s.scopeChanges, [suspended, recordScope, null], "open-then-purge through the account-switch path");
    assert.deepEqual(s.cookieClears, [baseUrl]);
    assert.deepEqual(s.identityClears, [baseUrl]);
    assert.equal(s.identity, null);
  });
}

test("an online cold start records the validation time from the injected clock", async t => {
  const now = validatedAt + 10 * day;
  const page = await open(t, { validation: "valid", identity: record }, now);
  const s = await state(page);
  assert.equal(s.offline, false);
  assert.ok(s.identity.validatedAt >= now && s.identity.validatedAt < now + 5_000, "validatedAt comes from the page clock");
  assert.equal(s.identity.accountId, "account:alex");
  assert.equal("cookie" in s.identity || JSON.stringify(s.identity).includes("session="), false);
});

test("on reconnect the session is revalidated at once and the 30-day window restarts", async t => {
  const start = validatedAt + 29 * day;
  const page = await open(t, { validation: "network", identity: record }, start);
  assert.equal((await state(page)).offline, true);
  await page.evaluate(() => (window as any).fixture.update({ validation: "valid" }));
  await page.clock.runFor(15_000);
  await page.waitForFunction(() => (window as any).fixture.auth.offline === false);
  const s = await state(page);
  assert.equal(s.signedIn, true);
  assert.equal(s.actorId, "account:alex");
  assert.ok(s.identity.validatedAt >= start + 10_000, "validatedAt moved to the reconnect time");
  assert.deepEqual(s.scopeChanges, [suspended, recordScope], "same mirror stays open");
});

test("returning to the foreground re-checks immediately while offline", async t => {
  const page = await open(t, { validation: "network", identity: record }, validatedAt + day);
  const before = (await state(page)).validations;
  await page.evaluate(() => { const s = (window as any).fixture; s.update({ validation: "valid" }); s.appStateListeners.forEach((listener: (value: string) => void) => listener("active")); });
  await page.waitForFunction(() => (window as any).fixture.auth.offline === false);
  assert.equal((await state(page)).validations, before + 1);
});

test("if the server rejects the session on reconnect, local data, key, cookie and record are erased and login opens", async t => {
  const page = await open(t, { validation: "network", identity: record }, validatedAt + 3 * day);
  await page.evaluate(() => (window as any).fixture.update({ validation: "revoked" }));
  await page.clock.runFor(15_000);
  await page.waitForFunction(() => (window as any).fixture.auth.signedIn === false);
  const s = await state(page);
  assert.deepEqual(s.scopeChanges, [suspended, recordScope, null]);
  assert.deepEqual(s.cookieClears, [baseUrl]);
  assert.equal(s.identity, null);
  assert.deepEqual(s.replaces, ["/account/login"]);
});

test("a still-unreachable server keeps the offline session until the 30 days run out, then asks for login without erasing", async t => {
  const page = await open(t, { validation: "network", identity: record }, validatedAt + 30 * day - 20_000);
  assert.equal((await state(page)).offline, true);
  await page.clock.runFor(15_000);
  assert.equal((await state(page)).signedIn, true);
  await page.clock.runFor(15_000);
  await page.waitForFunction(() => (window as any).fixture.auth.signedIn === false);
  const s = await state(page);
  assert.deepEqual(s.scopeChanges.filter((scope: unknown) => scope === null).length, 0, "no purge");
  assert.equal(s.storedCookie, "session=stored");
  assert.deepEqual(s.replaces, ["/account/login"]);
});

test("signing out while offline removes the cached identity so the next offline start shows login", async t => {
  const page = await open(t, { validation: "network", identity: record }, validatedAt + day);
  assert.equal(await page.evaluate(async () => (await (window as any).fixture.auth.signOut()).success), true);
  const s = await state(page);
  assert.equal(s.identity, null);
  assert.equal(s.signedIn, false);
});

test("the browser build uses the same rules for its cached identity", async t => {
  const page = await open(t, { platform: "web", storedCookie: null, validation: "network", identity: record }, validatedAt + day);
  const s = await state(page);
  assert.equal(s.offline, true);
  assert.equal(s.actorId, "account:alex");
  assert.equal(s.cookieHeader, "", "the browser never handles the HttpOnly cookie");
});
