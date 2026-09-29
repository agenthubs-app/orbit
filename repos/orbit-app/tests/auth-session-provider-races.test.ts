import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { build } from "esbuild";
import { chromium, type Browser, type Page } from "playwright";
import { createSyncLifecycle } from "../src/data/sync/sync-lifecycle";

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
  releases: [],
  results: [],
  signOuts: [],
  alerts: [],
  writes: [],
  clears: [],
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
export async function fetchMobileAuthProviders() { return { success: true, data: { providers: state.providerValues ?? [] } }; }
export async function fetchMobileAccountStatus() { return { success: false, error: { code: "UNAUTHENTICATED", message: "no", status: 401 } }; }
export async function signInWithMobileCredentials(input) {
  state.requests.push(input);
  return await new Promise(resolve => {
    state.release = (session = { cookieHeader: "session=first", expiresAt: "2026-09-15T00:00:00Z", user: { id: "actor-first", email: "member@example.test", name: "Member" } }) => resolve({ success: true, data: session });
    state.releases.push(state.release);
  });
}
export async function validateAuthSession({ cookieHeader }) {
  if (state.rejectedCookies?.includes(cookieHeader)) return { success: false, error: { code: "ORBIT_APP_AUTH_SESSION_INVALID", message: "expired", status: 401 } };
  return { success: true, data: { user: { id: state.validationActor || (cookieHeader === "session=first" ? "actor-first" : cookieHeader === "session=second" ? "actor-second" : "restored"), email: "member@example.test", name: "Member", image: null, emailVerified: true } } };
}
export async function createGoogleOAuthAttempt() { return { startUrl: "https://first.example/google", redirectUri: "orbit://callback", state: "test-state", codeVerifier: "test-verifier" }; }
export async function exchangeGoogleOAuthCode(input) { return signInWithMobileCredentials(input); }
export function parseGoogleOAuthBrowserResult() { return { success: true, code: "test-code", state: "test-state" }; }
export const nativeAuthSessionStorage = {
  async read() { return state.storedCookie; },
  async write(baseUrl, cookie) { state.writes.push({ baseUrl, cookie }); state.storedCookie = cookie; },
  async clear(baseUrl) { state.clears.push(baseUrl); state.storedCookie = null; },
  async clearIfMatches(baseUrl, cookie) {
    if (state.storedCookie !== cookie) return false;
    state.clears.push(baseUrl); state.storedCookie = null; return true;
  }
};
export const offlineIdentityStorage = {
  async read() { return state.offlineIdentity ?? null; },
  async write(value) { state.offlineIdentity = value; },
  async clear() { state.offlineIdentity = null; },
  async readLanguage() { return null; },
  async writeLanguage() {},
  key(baseUrl) { return "orbit.offlineIdentity." + baseUrl; }
};
export async function registerOrbitAccount() { return { success: true }; }
export const syncLifecycle = {
  // 0130: the restore suspends (recorded as { suspend }); only another server's open scope is purged there.
  async suspendScope(baseUrl) {
    state.scopeChanges.push({ suspend: baseUrl });
    if (state.sqliteBacked) return window.realSyncLifecycle("suspendScope", baseUrl);
    if (state.currentScope && state.currentScope.baseUrl !== baseUrl) {
      if (state.keyDeleteFails) return false;
      state.currentScope = null;
    }
    return true;
  },
  async setScope(scope) {
    state.scopeChanges.push(scope);
    if (state.sqliteBacked) return window.realSyncLifecycle("setScope", scope);
    if (state.keyDeleteFails) return false;
    state.currentScope = scope;
    return true;
  },
  async pendingWriteSummary(scope) {
    if (state.sqliteBacked) return window.realSyncLifecycle("pendingWriteSummary", scope);
    return { currentAccount: 0, otherAccounts: 0 };
  },
  async withDatabase(_, callback) { return callback({ get: async () => ({ count: 0 }) }); }
};
export async function cancelOrbitManagedNotifications() {
  if (state.holdNotificationCleanup) {
    state.holdNotificationCleanup = false;
    await new Promise(resolve => { state.releaseNotificationCleanup = resolve; });
  }
}
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
    define: { "process.env.NODE_ENV": '"test"', "process.env": "{}", __DEV__: "false" },
    plugins: [{
      name: "auth-provider-boundaries",
      setup(plugin) {
        plugin.onResolve({ filter: /^fixture$|\/ApiBaseUrlProvider$|\/mobile-auth$|\/native-auth-session-storage$|\/offline-identity-storage$|\/sync-lifecycle$/ }, () => ({ path: "fixture", namespace: "auth-race" }));
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
          if (args.path === "native") return { contents: "export const Alert = { alert(title, message, buttons) { const state = window.fixture; state.alerts.push({ title, message, buttons: buttons.map(button => button.text) }); if (state.alertChoice) setTimeout(() => buttons.find(button => button.text === state.alertChoice)?.onPress?.(), 0); } }; export const Platform = { get OS() { return window.initialFixture?.platform ?? 'ios'; } }; export const AppState = { addEventListener() { return { remove() {} }; } };", loader: "js" };
          if (args.path.endsWith("/auth-session")) return { contents: "export { registerOrbitAccount, signOutOrbitSession } from 'fixture';", loader: "js", resolveDir: process.cwd() };
          if (args.path.endsWith("/session-expiry")) return { contents: "export { onSessionExpired } from 'fixture';", loader: "js", resolveDir: process.cwd() };
          if (args.path.endsWith("/client")) return { contents: "export { createOrbitApiClient } from 'fixture';", loader: "js", resolveDir: process.cwd() };
          if (args.path.endsWith("/push-registration-queue")) return { contents: "export async function revokePushDeviceRegistrations() { return true; }", loader: "js" };
          if (args.path.endsWith("/native-notifications")) return { contents: "export { cancelOrbitManagedNotifications } from 'fixture';", loader: "js", resolveDir: process.cwd() };
          return { contents: "export async function clearSnapshots() {} export async function cancelOrbitManagedNotifications() {} export async function revokeNotificationDevice() {} export async function revokeRegisteredPushDevice() {}", loader: "js" };
        });
      }
    }]
  });
  script = result.outputFiles[0]!.text;
  browser = await chromium.launch({ headless: true });
});

test.after(async () => { await browser?.close(); });

async function open(
  t: { after(fn: () => Promise<void>): void },
  initial: Record<string, unknown> = {},
  lifecycle?: ReturnType<typeof createSyncLifecycle>,
): Promise<Page> {
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  t.after(async () => { await page.close(); assert.deepEqual(errors, []); });
  if (lifecycle) {
    await page.exposeFunction("realSyncLifecycle", async (method: "suspendScope" | "setScope" | "pendingWriteSummary", input: unknown) => {
      return lifecycle[method](input as never);
    });
  }
  await page.setContent('<div id="root"></div>');
  await page.evaluate(value => { (window as any).initialFixture = value; }, initial);
  await page.addScriptTag({ content: script });
  if (errors.length > 0) throw new Error(errors.join("\n"));
  await page.getByRole("button", { name: "sign in" }).waitFor();
  await page.waitForFunction(() => (window as any).fixture.auth?.ready === true);
  return page;
}

const sqliteScope = { baseUrl: "https://first.example", actorId: "account:sqlite-fixture" };
const sqliteMutation = "sc03-sqlite-provider-mutation";

function sqliteNativeFixture() {
  const keys = new Map<string, string>();
  const files = new Map<string, DatabaseSync>();
  const native = {
    crypto: {
      CryptoDigestAlgorithm: { SHA256: "SHA-256" },
      digestStringAsync: async (_: string, value: string) => createHash("sha256").update(value).digest("hex"),
      getRandomBytesAsync: async (size: number) => randomBytes(size),
    },
    secureStore: {
      AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 7,
      async getItemAsync(key: string) { return keys.get(key) ?? null; },
      async setItemAsync(key: string, value: string) { keys.set(key, value); },
      async deleteItemAsync(key: string) { keys.delete(key); },
    },
    sqlite: {
      async listDatabaseNames() { return [...files.keys()]; },
      async deleteDatabaseAsync(name: string) { files.get(name)?.close(); files.delete(name); },
      async openDatabaseAsync(name: string) {
        const database = files.get(name) ?? new DatabaseSync(":memory:");
        files.set(name, database);
        return {
          async execAsync(sql: string) { if (!sql.startsWith("PRAGMA key")) database.exec(sql); },
          async getFirstAsync(sql: string, params: any[] = []) {
            if (sql === "PRAGMA cipher_version") return { cipher_version: "4.0" };
            return database.prepare(sql).get(...params) ?? null;
          },
          async getAllAsync(sql: string, params: any[] = []) { return database.prepare(sql).all(...params); },
          async runAsync(sql: string, params: any[] = []) { return database.prepare(sql).run(...params); },
          async closeAsync() {},
        };
      },
    },
  };
  const makeLifecycle = () => createSyncLifecycle({ platform: "ios", loadNative: async () => native as any, report: () => undefined });
  return { files, keys, makeLifecycle };
}

async function seedSqlitePendingMutation(f: ReturnType<typeof sqliteNativeFixture>) {
  const lifecycle = f.makeLifecycle();
  assert.equal(await lifecycle.setScope(sqliteScope), true);
  const seeded = await lifecycle.withDatabase(sqliteScope, async database => {
    await database.run(`INSERT INTO sync_outbox (
      mutation_id, workspace_id, domain_id, kind, record_id, operation, state,
      request_json, patch_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
      sqliteMutation, "debug-test-workspace", "test-offline-write", "test", "record:sc03", "update", "queued",
      JSON.stringify({ title: "pending" }), JSON.stringify({ title: "pending" }), "2026-09-29T00:00:00.000Z",
    ]);
    await database.run(`INSERT INTO sync_records (
      workspace_id, domain_id, authorization_epoch, kind, record_id, revision, updated_at,
      sync_state, ai_visibility, payload_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
      "debug-test-workspace", "test-offline-write", "epoch:sc03", "test", "record:sc03", "r1",
      "2026-09-29T00:00:00.000Z", "synced", "excluded", JSON.stringify({ title: "mirror-only-sc03-marker" }),
    ]);
    return Number((await database.get<{ count: number }>("SELECT COUNT(*) AS count FROM sync_outbox"))?.count ?? 0);
  });
  assert.equal(seeded, 1);
  const mirrorName = [...f.files.keys()].find(name => name.startsWith("orbit-sync-"));
  assert.ok(mirrorName);
  const mirrorKey = `orbit.sync.key.${mirrorName!.slice("orbit-sync-".length, -".db".length)}`;
  assert.ok(f.keys.has(mirrorKey));
  return { mirrorName: mirrorName!, mirrorKey };
}

function pendingCounts(f: ReturnType<typeof sqliteNativeFixture>) {
  return [...f.files.entries()].map(([name, database]) => {
    const tables = new Set((database.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>).map(row => row.name));
    const outbox = tables.has("sync_outbox")
      ? Number((database.prepare("SELECT COUNT(*) AS count FROM sync_outbox").get() as { count: number }).count)
      : 0;
    const mirrors = tables.has("sync_records")
      ? Number((database.prepare("SELECT COUNT(*) AS count FROM sync_records").get() as { count: number }).count)
      : 0;
    const vaulted = tables.has("pending_write_vault")
      ? Number((database.prepare("SELECT COUNT(*) AS count FROM json_each((SELECT payload_json FROM pending_write_vault WHERE id=1), '$.outbox')").get() as { count: number }).count)
      : 0;
    const mutationIds = tables.has("pending_write_vault")
      ? JSON.parse(String((database.prepare("SELECT payload_json FROM pending_write_vault WHERE id=1").get() as { payload_json?: string } | undefined)?.payload_json ?? "{\"outbox\":[]}"))
        .outbox.map((item: { mutation_id: string }) => item.mutation_id) as string[]
      : [];
    const vaultPayload = tables.has("pending_write_vault")
      ? String((database.prepare("SELECT payload_json FROM pending_write_vault WHERE id=1").get() as { payload_json?: string } | undefined)?.payload_json ?? "")
      : "";
    return { name, outbox, mirrors, vaulted, mutationIds, vaultPayload };
  });
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

test("the browser does not offer the native Google broker", async t => {
  const page = await open(t, { platform: "web", providerValues: ["google"] });

  assert.equal(await page.evaluate(() => (window as any).fixture.auth.googleEnabled), false);
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.auth.providers), []);
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
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.scopeChanges), [{ suspend: "https://first.example" }, { baseUrl: "https://first.example", actorId: "account:canonical" }]);
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
  assert.equal(await page.evaluate(() => (window as any).fixture.scopeChanges.filter((scope: unknown) => scope === null).length), 1);
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
  assert.equal(await page.evaluate(() => (window as any).fixture.scopeChanges.filter((scope: unknown) => scope === null).length), 1);
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

test("an earlier logout cannot purge a newer accepted login on the same server", async t => {
  const page = await open(t, { storedCookie: "session=restored", holdSignOut: true });
  await page.evaluate(() => { const state = (window as any).fixture; state.logoutPromise = state.auth.signOut(); });
  await page.waitForFunction(() => Boolean((window as any).fixture.releaseSignOut));
  await page.getByRole("button", { name: "sign in" }).click();
  await page.waitForFunction(() => (window as any).fixture.requests.length === 1);
  await page.evaluate(() => { const state = (window as any).fixture; state.canonicalAccountId = "account:new"; state.release(); });
  await page.waitForFunction(() => (window as any).fixture.auth.actorId === "account:new");
  await page.evaluate(() => (window as any).fixture.releaseSignOut());
  assert.equal(await page.evaluate(async () => (await (window as any).fixture.logoutPromise).success), false);
  assert.equal(await page.evaluate(() => (window as any).fixture.auth.actorId), "account:new");
  assert.equal(await page.evaluate(() => (window as any).fixture.storedCookie), "session=first");
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.clears), []);
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.scopeChanges.at(-1)), { baseUrl: "https://first.example", actorId: "account:new" });
});

test("rejecting obsolete login A cannot erase accepted login B's persisted cookie", async t => {
  const page = await open(t);
  await page.getByRole("button", { name: "sign in" }).click();
  await page.waitForFunction(() => (window as any).fixture.requests.length === 1);
  assert.equal(await page.evaluate(async () => (await (window as any).fixture.auth.signOut()).success), true);
  await page.getByRole("button", { name: "sign in" }).click();
  await page.waitForFunction(() => (window as any).fixture.requests.length === 2);
  await page.evaluate(() => {
    const state = (window as any).fixture;
    state.canonicalAccountId = "account:B";
    state.releases[1]({ cookieHeader: "session=second", expiresAt: "2026-09-15T00:00:00Z", user: { id: "actor-second", email: "member@example.test", name: "Member" } });
  });
  await page.waitForFunction(() => (window as any).fixture.auth.actorId === "account:B");
  await page.evaluate(() => (window as any).fixture.releases[0]());
  await page.waitForFunction(() => (window as any).fixture.results.length === 2);
  assert.equal(await page.evaluate(() => (window as any).fixture.auth.actorId), "account:B");
  assert.equal(await page.evaluate(() => (window as any).fixture.storedCookie), "session=second");
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.clears), ["https://first.example"]);
  assert.equal(await page.evaluate(() => (window as any).fixture.results[1].success), false);
});

test("cold-start rejection through the real provider archives a queued SQLite write before deleting its mirror and key", async t => {
  const native = sqliteNativeFixture();
  t.after(() => { for (const database of native.files.values()) database.close(); });
  const { mirrorName, mirrorKey } = await seedSqlitePendingMutation(native);
  const lifecycle = native.makeLifecycle();
  const page = await open(t, {
    sqliteBacked: true,
    storedCookie: "session=restored",
    rejectedCookies: ["session=restored"],
    canonicalAccountId: sqliteScope.actorId,
    offlineIdentity: { version: 1, baseUrl: sqliteScope.baseUrl, accountId: sqliteScope.actorId, user: { id: "restored", email: "member@example.test", name: "Member" }, validatedAt: Date.now() },
  }, lifecycle);

  await page.waitForFunction(() => (window as any).fixture.auth?.ready === true && (window as any).fixture.auth?.signedIn === false);
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.clears), [sqliteScope.baseUrl]);
  assert.equal(await page.evaluate(() => (window as any).fixture.offlineIdentity), null);
  assert.equal(native.files.has(mirrorName), false, "the rejected actor's local mirror file is deleted");
  assert.equal(native.keys.has(mirrorKey), false, "the rejected actor's mirror key is deleted");
  assert.equal(native.files.size, 1, "only the encrypted pending-write vault remains");
  const vault = pendingCounts(native).find(row => row.vaulted === 1);
  assert.deepEqual(vault && { outbox: vault.outbox, mirrors: vault.mirrors, vaulted: vault.vaulted, mutationIds: vault.mutationIds }, {
    outbox: 0, mirrors: 0, vaulted: 1, mutationIds: [sqliteMutation],
  });
  assert.equal(vault?.vaultPayload.includes("mirror-only-sc03-marker"), false, "the server mirror is not copied into the pending-write vault");
});

test("a runtime 401 through the real provider archives a queued SQLite write before clearing the session", async t => {
  const native = sqliteNativeFixture();
  t.after(() => { for (const database of native.files.values()) database.close(); });
  const { mirrorName, mirrorKey } = await seedSqlitePendingMutation(native);
  const lifecycle = native.makeLifecycle();
  const page = await open(t, {
    sqliteBacked: true,
    storedCookie: "session=restored",
    canonicalAccountId: sqliteScope.actorId,
  }, lifecycle);
  await page.waitForFunction(() => (window as any).fixture.auth?.signedIn === true);
  await page.evaluate(() => (window as any).fixture.expire());
  await page.waitForFunction(() => (window as any).fixture.auth?.signedIn === false);

  assert.deepEqual(await page.evaluate(() => (window as any).fixture.clears), [sqliteScope.baseUrl]);
  assert.equal(native.files.has(mirrorName), false);
  assert.equal(native.keys.has(mirrorKey), false);
  assert.equal(native.files.size, 1);
  const vault = pendingCounts(native).find(row => row.vaulted === 1);
  assert.deepEqual(vault && { outbox: vault.outbox, mirrors: vault.mirrors, vaulted: vault.vaulted, mutationIds: vault.mutationIds }, {
    outbox: 0, mirrors: 0, vaulted: 1, mutationIds: [sqliteMutation],
  });
  assert.equal(vault?.vaultPayload.includes("mirror-only-sc03-marker"), false, "the server mirror is not copied into the pending-write vault");
});

for (const [branch, alertChoice] of [["continue", "继续此账号"], ["cancel", "返回登录"]] as const) {
  test(`a real SQLite pending write follows the provider's other-account ${branch} branch`, async t => {
    const native = sqliteNativeFixture();
    t.after(() => { for (const database of native.files.values()) database.close(); });
    const { mirrorName, mirrorKey } = await seedSqlitePendingMutation(native);
    const lifecycle = native.makeLifecycle();
    const page = await open(t, {
      sqliteBacked: true,
      storedCookie: "session=restored",
      canonicalAccountId: sqliteScope.actorId,
      alertChoice,
    }, lifecycle);
    await page.waitForFunction(() => (window as any).fixture.auth?.signedIn === true);
    await page.evaluate(() => (window as any).fixture.update({ canonicalAccountId: "account:other-sqlite-fixture" }));
    await page.getByRole("button", { name: "sign in" }).click();
    await page.waitForFunction(() => (window as any).fixture.requests.length === 1);
    await page.evaluate(() => (window as any).fixture.release());
    await page.waitForFunction(() => (window as any).fixture.results.length === 1);

    const result = await page.evaluate(() => (window as any).fixture.results[0]);
    const alerts = await page.evaluate(() => (window as any).fixture.alerts);
    assert.equal(alerts.length, 1);
    assert.deepEqual(alerts[0].buttons, ["返回登录", "继续此账号"]);
    assert.match(alerts[0].message, /^有 1 项修改已加密保存在本机/u);
    if (branch === "continue") {
      assert.equal(result.success, true);
      assert.equal(await page.evaluate(() => (window as any).fixture.auth.actorId), "account:other-sqlite-fixture");
      assert.equal(await page.evaluate(() => (window as any).fixture.storedCookie), "session=first");
      assert.equal(native.files.has(mirrorName), false, "accepted switch removes the old account mirror");
      assert.equal(native.keys.has(mirrorKey), false, "accepted switch removes the old account key");
      const counts = pendingCounts(native);
      const vault = counts.find(row => row.vaulted === 1);
      assert.deepEqual(vault && { outbox: vault.outbox, mirrors: vault.mirrors, vaulted: vault.vaulted, mutationIds: vault.mutationIds }, {
        outbox: 0, mirrors: 0, vaulted: 1, mutationIds: [sqliteMutation],
      });
      assert.equal(vault?.vaultPayload.includes("mirror-only-sc03-marker"), false, "the server mirror is not copied into the pending-write vault");
      assert.deepEqual(counts.filter(row => row.name !== vault?.name).map(({ outbox, mirrors, vaulted }) => ({ outbox, mirrors, vaulted })), [
        { outbox: 0, mirrors: 0, vaulted: 0 },
      ]);
    } else {
      assert.equal(result.success, false);
      assert.equal(result.message, "已取消切换账号，原有待同步修改仍保留在本机。");
      assert.equal(await page.evaluate(() => (window as any).fixture.auth.actorId), sqliteScope.actorId);
      assert.equal(await page.evaluate(() => (window as any).fixture.storedCookie), "session=restored");
      assert.equal(native.files.has(mirrorName), true, "cancel leaves the old account mirror in place");
      assert.equal(native.keys.has(mirrorKey), true, "cancel leaves the old account key in place");
      assert.deepEqual(pendingCounts(native).map(({ outbox, mirrors, vaulted, mutationIds }) => ({ outbox, mirrors, vaulted, mutationIds })), [
        { outbox: 1, mirrors: 1, vaulted: 0, mutationIds: [] },
      ]);
    }
  });
}

for (const method of ["credentials", "google"] as const) {
  test(`obsolete ${method} login held at notification cleanup cannot overwrite accepted login B`, async t => {
    const page = await open(t, { storedCookie: "session=restored", holdNotificationCleanup: true });
    await page.evaluate(method => {
      const state = (window as any).fixture;
      state.canonicalAccountId = "account:A";
      const action = method === "google"
        ? state.auth.signInWithGoogle()
        : state.auth.signIn({ email: "member@example.test", password: "secret" });
      state.loginA = action;
    }, method);
    await page.waitForFunction(() => (window as any).fixture.releases.length === 1);
    await page.evaluate(() => (window as any).fixture.releases[0]());
    await page.waitForFunction(() => Boolean((window as any).fixture.releaseNotificationCleanup));
    await page.getByRole("button", { name: "sign in" }).click();
    await page.waitForFunction(() => (window as any).fixture.releases.length === 2);
    await page.evaluate(() => {
      const state = (window as any).fixture;
      state.canonicalAccountId = "account:B";
      state.releases[1]({ cookieHeader: "session=second", expiresAt: "2026-09-15T00:00:00Z", user: { id: "actor-second", email: "member@example.test", name: "Member" } });
    });
    await page.waitForFunction(() => (window as any).fixture.auth.actorId === "account:B");
    await page.evaluate(() => (window as any).fixture.releaseNotificationCleanup());
    assert.equal(await page.evaluate(async () => (await (window as any).fixture.loginA).success), false);
    assert.deepEqual(await page.evaluate(() => {
      const state = (window as any).fixture;
      return { actorId: state.auth.actorId, userId: state.auth.user.id, cookieHeader: state.auth.cookieHeader, storedCookie: state.storedCookie, scope: state.currentScope, writes: state.writes, clears: state.clears };
    }), {
      actorId: "account:B", userId: "actor-second", cookieHeader: "session=second", storedCookie: "session=second",
      scope: { baseUrl: "https://first.example", actorId: "account:B" },
      writes: [{ baseUrl: "https://first.example", cookie: "session=second" }], clears: [],
    });
  });
}
