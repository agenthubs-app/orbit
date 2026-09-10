import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { transformSync } from "esbuild";

const root = new URL("../..", import.meta.url).pathname;
const require = createRequire(import.meta.url);
const durablePath = "/api/devices/push-tokens";
const localPath = "/api/devices/push-token";
const settle = () => new Promise<void>((done) => setImmediate(done));

async function waitFor(check: () => boolean, message: string) {
  const deadline = Date.now() + 2000;
  while (!check()) {
    assert.ok(Date.now() < deadline, message);
    await settle();
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

type Frame = { slots: any[]; cursor: number; effects: Array<() => void> };

// Execute production registration/revocation and the two UI consumers together.
// Only platform/storage/network boundaries and React's hook host are replaced.
function harness(input: { blockedPost?: string; optedIn?: boolean; failFirstToken?: boolean; rejectPost?: boolean; failedDelete?: string; failPostOnce?: string; throwPostFailure?: boolean; failLogout?: boolean } = {}) {
  const calls: string[] = [];
  const warnings: unknown[][] = [];
  const registry = { [durablePath]: false, [localPath]: false };
  const scheduled = new Map<string, any>();
  const clientScopes: string[] = [];
  const postEntered = deferred<void>();
  const releasePost = deferred<void>();
  const tokenListeners = new Set<(token: { data: string }) => void>();
  const foregroundListeners = new Set<(state: string) => void>();
  const linkingListeners = new Set<unknown>();
  const storage = new Map<string, string>([
    ["orbit.pushDeviceId", "durable-device"],
    ["orbit.notifications.device-id.v1", "ios:local-device"],
    ...(input.optedIn === false ? [] : [["orbit.pushNotificationsEnabled", "true"] as [string, string]]),
  ]);
  let tokenAttempts = 0;
  let failedPost = false;
  const notifications = {
    async getPermissionsAsync() { return { status: "granted", granted: true }; },
    async requestPermissionsAsync() { calls.push("permission-request"); return { status: "granted", granted: true }; },
    async getExpoPushTokenAsync() {
      tokenAttempts++;
      if (input.failFirstToken && tokenAttempts === 1) throw new Error("offline");
      return { data: "ExponentPushToken[test]" };
    },
    addPushTokenListener(listener: (token: { data: string }) => void) {
      tokenListeners.add(listener);
      return { remove() { tokenListeners.delete(listener); } };
    },
    setNotificationHandler() {},
    addNotificationResponseReceivedListener() { return { remove() {} }; },
    async getLastNotificationResponseAsync() { return null; },
    async getAllScheduledNotificationsAsync() { return [...scheduled.values()]; },
    async cancelScheduledNotificationAsync(id: string) { scheduled.delete(id); },
    async scheduleNotificationAsync(request: any) {
      const id = request.content.data.orbitReminderPlanId;
      scheduled.set(id, { ...request, identifier: id });
      return id;
    },
    SchedulableTriggerInputTypes: { DATE: "date" },
  };
  const api = {
    baseUrl: "http://localhost",
    async get(_path: string): Promise<any> { return { success: true, data: { reminders: [] } }; },
    async post(path: string, options: { body: { deviceId: string; token: string } }) {
      assert.ok(path === durablePath || path === localPath);
      assert.equal(options.body.deviceId, path === durablePath ? "durable-device" : "ios:local-device");
      calls.push(`POST-start:${path}`);
      if (path === input.blockedPost) {
        postEntered.resolve();
        await releasePost.promise;
      }
      if (input.rejectPost) throw new Error("registration failed");
      if (path === input.failPostOnce && !failedPost) {
        failedPost = true;
        calls.push(`POST-rejected:${path}`);
        if (input.throwPostFailure) throw new Error("private-payload test-cookie ExponentPushToken[test]");
        return { success: false, error: { code: "SERVICE_UNAVAILABLE", message: "private-payload test-cookie ExponentPushToken[test]" } };
      }
      registry[path] = true;
      calls.push(`POST-commit:${path}`);
      return { success: true, data: {} };
    },
    async delete(path: string) {
      const registryPath = path === localPath ? localPath : durablePath;
      assert.ok(path === localPath || path === `${durablePath}/durable-device`);
      calls.push(`DELETE:${registryPath}`);
      if (input.failedDelete === registryPath) return { success: false, error: { message: "offline" } };
      registry[registryPath] = false;
      return { success: true, data: {} };
    },
  };
  const frames = new Map<string, Frame>();
  let frame: Frame;
  function memo(factory: () => unknown, deps: unknown[]) {
    const index = frame.cursor++;
    const previous = frame.slots[index];
    if (!previous || deps.some((value, i) => !Object.is(value, previous.deps[i]))) {
      frame.slots[index] = { deps, value: factory() };
    }
    return frame.slots[index].value;
  }
  const react = {
    createContext: () => ({ Provider: "Provider" }),
    useCallback: (callback: unknown, deps: unknown[]) => memo(() => callback, deps),
    useMemo: memo,
    useState(initial: unknown) {
      const owner = frame;
      const index = owner.cursor++;
      if (!(index in owner.slots)) owner.slots[index] = typeof initial === "function" ? initial() : initial;
      return [owner.slots[index], (value: unknown) => {
        owner.slots[index] = typeof value === "function" ? value(owner.slots[index]) : value;
      }];
    },
    useEffect(callback: () => void | (() => void), deps: unknown[]) {
      const owner = frame;
      const index = owner.cursor++;
      const previous = owner.slots[index];
      if (!previous || deps.some((value, i) => !Object.is(value, previous.deps[i]))) {
        owner.effects.push(() => {
          previous?.cleanup?.();
          owner.slots[index] = { deps, cleanup: callback() };
        });
      }
    },
  };
  function render(key: string, component: () => any) {
    frame = frames.get(key) ?? { slots: [], cursor: 0, effects: [] };
    frames.set(key, frame);
    frame.cursor = 0;
    const tree = component();
    frame.effects.splice(0).forEach((effect) => effect());
    return tree;
  }
  function unmount(key: string) {
    frames.get(key)?.slots.forEach((slot) => slot?.cleanup?.());
    frames.delete(key);
  }
  let auth: any;
  const scopedClients = new Map<string, typeof api>();
  const cache = new Map<string, any>();
  function load(path: string): any {
    const absolute = resolve(root, path);
    if (cache.has(absolute)) return cache.get(absolute);
    const module = { exports: {} as any };
    cache.set(absolute, module.exports);
    const code = transformSync(readFileSync(absolute, "utf8"), {
      format: "cjs", jsx: "automatic", loader: "tsx", target: "es2015", supported: { "dynamic-import": false },
    }).code;
    const nativeRequire = (id: string): any => {
      if (id === "react") return react;
      if (id === "react/jsx-runtime") return { jsx: (type: unknown, props: unknown) => ({ type, props }), jsxs: (type: unknown, props: unknown) => ({ type, props }) };
      if (id === "react-native") return {
        Platform: { OS: "ios" }, StyleSheet: { create: (value: unknown) => value }, Pressable: "Pressable", Text: "Text", View: "View", useColorScheme: () => "light",
        AppState: { addEventListener(_event: string, listener: (state: string) => void) {
          foregroundListeners.add(listener);
          return { remove() { foregroundListeners.delete(listener); } };
        } },
      };
      if (id === "expo-notifications") return notifications;
      if (id === "expo-device") return { isDevice: true };
      if (id === "expo-constants") return { expoConfig: { extra: { easProjectId: "test-project" } } };
      if (id === "expo-crypto") return {};
      if (id === "expo-web-browser") return {};
      if (id === "expo-router") return { router: {}, useRouter: () => ({}) };
      if (id === "expo-linking") return {
        addEventListener(_event: string, listener: unknown) { linkingListeners.add(listener); return { remove() { linkingListeners.delete(listener); } }; },
        async getInitialURL() { return null; },
      };
      if (id === "@react-native-async-storage/async-storage") return {
        getItem: async (key: string) => storage.get(key) ?? null,
        setItem: async (key: string, value: string) => { storage.set(key, value); },
      };
      if (id === "expo-secure-store") return {
        getItemAsync: async (key: string) => storage.get(key) ?? null,
        setItemAsync: async (key: string, value: string) => { storage.set(key, value); },
        deleteItemAsync: async (key: string) => { calls.push(`storage-delete:${key}`); storage.delete(key); },
      };
      if (id === "@expo/vector-icons") return { Ionicons: "Icon" };
      if (id.endsWith("/AuthSessionProvider")) return { useOrbitAuthSession: () => auth };
      if (id.endsWith("/ApiBaseUrlProvider")) return { useOrbitApiBaseUrl: () => ({ baseUrl: "http://localhost", ready: true }) };
      if (id.endsWith("/useOrbitApiClient")) return { useOrbitApiClient: () => {
        if (!scopedClients.has(auth.cookieHeader)) scopedClients.set(auth.cookieHeader, Object.create(api));
        return scopedClients.get(auth.cookieHeader);
      } };
      if (id === "./client" || id.endsWith("/api/client")) return { createOrbitApiClient: (options: { authCookieHeader: string }) => { clientScopes.push(options.authCookieHeader); return api; } };
      if (id === "./native-auth-session-storage") return { nativeAuthSessionStorage: { read: async () => "test-cookie", write: async () => { calls.push("write-auth"); }, clear: async () => { calls.push("clear-auth"); } } };
      if (id === "./mobile-auth") return {
        validateAuthSession: async (options: { cookieHeader: string }) => ({ success: true, data: { user: { id: options.cookieHeader === "next-cookie" ? "actor-b" : "actor-a" } } }),
        signInWithMobileCredentials: async () => ({ success: true, data: { cookieHeader: "next-cookie" } }),
        fetchMobileAuthProviders: async () => ({ success: true, data: { providers: [] } }),
      };
      if (id === "./auth-session") return { signOutOrbitSession: async () => {
        calls.push("logout");
        return input.failLogout ? { success: false, error: { message: "logout unavailable" } } : { success: true };
      } };
      if (id.endsWith("/snapshot-store")) return { clearSnapshots: async () => { calls.push("clear-snapshots"); } };
      if (id.endsWith("/AppScreen")) return { AppScreen: "AppScreen" };
      if (id.endsWith("/DataCard")) return { DataCard: "DataCard" };
      if (id.startsWith(".")) {
        const target = resolve(dirname(absolute), id);
        return load([`${target}.ts`, `${target}.tsx`].find(existsSync) ?? target);
      }
      return require(id);
    };
    runInNewContext("(function(require,module,exports){" + code + "\n})", {
      console: { ...console, warn: (...args: unknown[]) => warnings.push(args) }, URL,
    })(nativeRequire, module, module.exports);
    cache.set(absolute, module.exports);
    return module.exports;
  }
  const Provider = load("src/api/AuthSessionProvider.tsx").OrbitAuthSessionProvider;
  const Lifecycle = load("src/notifications/NotificationLifecycle.tsx").OrbitNotificationLifecycle;
  const Coordinator = load("src/components/OrbitNotificationsCoordinator.tsx").OrbitNotificationsCoordinator;
  const Settings = load("src/screens/settings/SettingsScreen.tsx").SettingsScreen;
  const settingsIdle = () => waitFor(
    () => render("settings", Settings).props.children[0].props.children[1].props.disabled === false,
    "settings notification action did not finish",
  );
  return {
    calls, warnings, registry, notifications, storage, tokenListeners, foregroundListeners, linkingListeners, postEntered, releasePost, api, scheduled, clientScopes,
    async mount() {
      render("auth", () => Provider({}));
      await settle();
      auth = render("auth", () => Provider({})).props.value;
      assert.equal(auth.signedIn, true);
      render("lifecycle", Lifecycle);
    },
    async toggleOptIn() {
      render("settings", Settings);
      await settle();
      const tree = render("settings", Settings);
      tree.props.children[0].props.children[1].props.onPress();
      await settingsIdle();
    },
    logout: () => auth.signOut(),
    authState: () => ({ signedIn: auth.signedIn, cookieHeader: auth.cookieHeader, userId: auth.user?.id }),
    switchAccount: () => auth.signIn({ email: "other@example.test", password: "test" }),
    mountReminders: () => render("coordinator", Coordinator),
    refreshAuth() {
      auth = render("auth", () => Provider({})).props.value;
      render("coordinator", Coordinator);
      render("lifecycle", Lifecycle);
    },
    settingsTree: () => render("settings", Settings),
    settingsIdle,
    foreground: () => foregroundListeners.forEach((listener) => listener("active")),
    closeLifecycle: () => unmount("lifecycle"),
    close: () => [...frames.keys()].forEach(unmount),
  };
}

for (const action of ["opt-out", "logout"] as const) {
  for (const blockedPost of [durablePath, localPath]) {
    test(`${action} leaves both registries revoked after in-flight ${blockedPost} commits`, { timeout: 5000 }, async () => {
      const app = harness({ blockedPost });
      try {
        await app.mount();
        await app.postEntered.promise;
        const completion = action === "logout" ? app.logout() : app.toggleOptIn();
        await settle();
        if (action === "opt-out") assert.equal(app.storage.has("orbit.pushNotificationsEnabled"), false);
        // A foreground event during logout must not enqueue a fresh registration.
        app.foreground();
        app.releasePost.resolve();
        await completion;
        await settle();
        assert.deepEqual(app.registry, { [durablePath]: false, [localPath]: false });
        for (const path of [durablePath, localPath]) {
          assert.ok(app.calls.lastIndexOf(`DELETE:${path}`) > app.calls.lastIndexOf(`POST-commit:${path}`), app.calls.join("\n"));
        }
        if (action === "logout") {
          assert.ok(app.calls.indexOf("logout") > app.calls.indexOf(`DELETE:${durablePath}`));
          assert.ok(app.calls.indexOf("logout") > app.calls.indexOf(`DELETE:${localPath}`));
          app.foreground();
          await settle();
          assert.deepEqual(app.registry, { [durablePath]: false, [localPath]: false });
        }
      } finally {
        app.releasePost.resolve();
        app.close();
      }
    });
  }
}

test("foreground retries both registrations after token acquisition recovers", { timeout: 5000 }, async () => {
  const app = harness({ failFirstToken: true });
  try {
    await app.mount();
    await settle();
    assert.deepEqual(app.registry, { [durablePath]: false, [localPath]: false });
    app.foreground();
    await settle();
    assert.deepEqual(app.registry, { [durablePath]: true, [localPath]: true });
  } finally { app.close(); }
});

test("failed logout preserves auth and restores both push registries and local reminders on foreground", { timeout: 5000 }, async () => {
  const app = harness({ failLogout: true });
  let reminderReads = 0;
  app.api.get = async () => {
    reminderReads++;
    return { success: true, data: { reminders: [{ id: "current-plan", status: "scheduled", fireAt: "2099-01-01T00:00:00Z", deepLink: "/tasks/current", title: "Current account", body: "Reminder" }] } };
  };
  try {
    await app.mount();
    app.mountReminders();
    await waitFor(() => app.registry[durablePath] && app.registry[localPath] && app.scheduled.has("current-plan"), "initial notifications did not synchronize");
    assert.equal((await app.logout()).success, false);
    assert.deepEqual(app.registry, { [durablePath]: false, [localPath]: false });
    assert.equal(app.scheduled.size, 0);
    assert.equal(app.calls.includes("clear-auth"), false);
    assert.equal(app.calls.includes("clear-snapshots"), false);

    app.refreshAuth();
    assert.deepEqual(app.authState(), { signedIn: true, cookieHeader: "test-cookie", userId: "actor-a" });
    await settle();
    const postsBeforeForeground = app.calls.filter((call) => call.startsWith("POST-start:")).length;
    const readsBeforeForeground = reminderReads;
    app.foreground();
    await waitFor(() =>
      app.registry[durablePath] && app.registry[localPath]
      && app.scheduled.has("current-plan")
      && reminderReads > readsBeforeForeground
      && app.calls.filter((call) => call.startsWith("POST-start:")).length >= postsBeforeForeground + 2,
    "failed logout left the retained account's notification sessions stopped");
    assert.equal(app.tokenListeners.size, 1);
    assert.equal(app.foregroundListeners.size, 2);
  } finally { app.close(); }
});

for (const [failedPath, description, throwPostFailure] of [
  [durablePath, "durable failure envelope", false],
  [localPath, "local registration false result", false],
  [durablePath, "durable thrown failure", true],
] as const) {
  test(`${description} emits a sanitized warning and recovers on foreground`, { timeout: 5000 }, async () => {
    const app = harness({ failPostOnce: failedPath, throwPostFailure });
    try {
      await app.mount();
      await settle();
      assert.ok(app.calls.includes(`POST-rejected:${failedPath}`));
      assert.equal(app.registry[failedPath], false);
      assert.equal(app.registry[failedPath === durablePath ? localPath : durablePath], true);
      assert.equal(app.warnings.length, 1);
      assert.match(JSON.stringify(app.warnings), /注册.*未|未.*注册/);
      assert.doesNotMatch(JSON.stringify(app.warnings), /private-payload|test-cookie|ExponentPushToken|SERVICE_UNAVAILABLE/);
      app.foreground();
      await waitFor(() => app.registry[durablePath] && app.registry[localPath], "foreground did not retry the failed registration");
      assert.equal(app.warnings.length, 1);
    } finally { app.close(); }
  });
}

test("cleanup during registration cannot leave late listeners or request permissions", { timeout: 5000 }, async () => {
  const app = harness();
  const permission = deferred<{ status: string; granted: boolean }>();
  app.notifications.getPermissionsAsync = () => permission.promise;
  try {
    await app.mount();
    await settle();
    app.closeLifecycle();
    permission.resolve({ status: "denied", granted: false });
    await settle();
    assert.equal(app.tokenListeners.size, 0);
    assert.equal(app.foregroundListeners.size, 0);
    assert.equal(app.linkingListeners.size, 0);
    assert.equal(app.calls.includes("permission-request"), false);
    assert.deepEqual(app.registry, { [durablePath]: false, [localPath]: false });
  } finally { permission.resolve({ status: "denied", granted: false }); app.close(); }
});

test("foreground after opt-out neither requests permission nor registers devices", { timeout: 5000 }, async () => {
  const app = harness({ optedIn: false });
  try {
    await app.mount();
    await settle();
    app.foreground();
    await settle();
    assert.equal(app.calls.includes("permission-request"), false);
    assert.equal(app.calls.some((call) => call.startsWith("POST")), false);
  } finally { app.close(); }
});

test("a rejected in-flight registration does not skip either logout revocation", { timeout: 5000 }, async () => {
  const app = harness({ blockedPost: durablePath, rejectPost: true });
  try {
    await app.mount();
    await app.postEntered.promise;
    const completion = app.logout();
    app.releasePost.resolve();
    assert.equal((await completion).success, true);
    assert.ok(app.calls.includes(`DELETE:${localPath}`));
    assert.ok(app.calls.includes(`DELETE:${durablePath}`));
  } finally { app.releasePost.resolve(); app.close(); }
});

for (const failedDelete of [localPath, durablePath]) {
  test(`logout warns on failed ${failedDelete} revocation but attempts both and clears the local session`, { timeout: 5000 }, async () => {
    const app = harness({ failedDelete });
    try {
      await app.mount();
      await settle();
      const result = await app.logout();
      assert.equal(result.success, true);
      assert.ok(app.calls.includes(`DELETE:${localPath}`));
      assert.ok(app.calls.includes(`DELETE:${durablePath}`));
      assert.equal(app.calls.includes("logout"), true);
      assert.equal(app.calls.includes("clear-auth"), true);
      assert.equal(app.calls.includes("clear-snapshots"), true);
      assert.equal(app.warnings.length, 1);
      assert.match(JSON.stringify(app.warnings), /通知.*未|未.*通知/);
      assert.doesNotMatch(JSON.stringify(app.warnings), /test-cookie|ExponentPushToken|durable-device|local-device/);
      assert.deepEqual(app.clientScopes, ["test-cookie", "test-cookie"]);
    } finally { app.close(); }
  });
}

test("failed opt-out remains locally disabled but exposes an error and retry action", { timeout: 5000 }, async () => {
  const app = harness({ failedDelete: durablePath });
  try {
    await app.mount();
    await settle();
    await app.toggleOptIn();
    await settle();
    assert.equal(app.storage.has("orbit.pushNotificationsEnabled"), false);
    const tree = app.settingsTree();
    assert.match(JSON.stringify(tree), /解绑.*未|未.*解绑/);
    const before = app.calls.filter((call) => call.startsWith("DELETE:")).length;
    tree.props.children[0].props.children[1].props.onPress();
    await app.settingsIdle();
    assert.equal(app.calls.filter((call) => call.startsWith("DELETE:")).length, before + 2);
    assert.equal(app.storage.has("orbit.pushNotificationsEnabled"), false);
  } finally { app.close(); }
});

test("account switch warns on unlink failure but still clears old reminders and accepts the new session", { timeout: 5000 }, async () => {
  const app = harness({ failedDelete: localPath });
  try {
    await app.mount();
    await settle();
    app.scheduled.set("old-plan", { identifier: "old-plan", content: { data: { orbitReminderPlanId: "old-plan" } } });
    assert.equal((await app.switchAccount()).success, true);
    assert.ok(app.calls.includes(`DELETE:${localPath}`));
    assert.ok(app.calls.includes(`DELETE:${durablePath}`));
    assert.ok(app.calls.includes("write-auth"));
    assert.ok(app.calls.includes("clear-snapshots"));
    assert.equal(app.scheduled.size, 0);
    assert.equal(app.warnings.length, 1);
    assert.doesNotMatch(JSON.stringify(app.warnings), /test-cookie|ExponentPushToken|durable-device|local-device/);
    assert.deepEqual(app.clientScopes, ["test-cookie", "test-cookie"]);
  } finally { app.close(); }
});

test("account switch drains the old reminder sync and revokes with the old auth scope", { timeout: 5000 }, async () => {
  const app = harness();
  const plans = deferred<any>();
  const entered = deferred<void>();
  try {
    await app.mount();
    await settle();
    app.api.get = async () => { entered.resolve(); return plans.promise; };
    app.mountReminders();
    await entered.promise;
    const switching = app.switchAccount();
    await settle();
    plans.resolve({ success: true, data: { reminders: [{ id: "old-plan", status: "scheduled", fireAt: "2099-01-01T00:00:00Z", deepLink: "/tasks/old", title: "Old account", body: "Private" }] } });
    assert.equal((await switching).success, true);
    await settle();
    assert.equal(app.scheduled.size, 0);
    assert.deepEqual(app.clientScopes, ["test-cookie", "test-cookie"]);
    assert.deepEqual(app.registry, { [durablePath]: false, [localPath]: false });
    assert.ok(app.calls.indexOf("write-auth") > app.calls.indexOf(`DELETE:${durablePath}`));
    app.api.get = async () => ({ success: true, data: { reminders: [] } });
    app.refreshAuth();
    await settle();
    assert.equal(app.scheduled.size, 0);
  } finally { plans.resolve({ success: true, data: { reminders: [] } }); app.close(); }
});

for (const action of ["logout", "account-switch"] as const) {
  test(`${action} rejects old reminder syncs after local clear while push revocation is still waiting`, { timeout: 5000 }, async () => {
    const app = harness({ blockedPost: durablePath });
    const oldPlans = deferred<any>();
    const getEntered = deferred<void>();
    const result = { success: true, data: { reminders: [{ id: "old-plan", status: "scheduled", fireAt: "2099-01-01T00:00:00Z", deepLink: "/tasks/old", title: "Old account", body: "Private" }] } };
    let reads = 0;
    try {
      await app.mount();
      await app.postEntered.promise;
      app.api.get = async () => {
        reads++;
        getEntered.resolve();
        return reads === 1 ? oldPlans.promise : result;
      };
      app.mountReminders();
      await getEntered.promise;
      const transition = action === "logout" ? app.logout() : app.switchAccount();
      await settle();
      oldPlans.resolve(result);
      await settle();
      assert.equal(app.scheduled.size, 0);
      // The old auth context is still mounted until the push POST can finish.
      app.foreground();
      await settle();
      app.releasePost.resolve();
      assert.equal((await transition).success, true);
      assert.equal(app.scheduled.size, 0);
      assert.equal(reads, 1);
    } finally {
      oldPlans.resolve(result);
      app.releasePost.resolve();
      app.close();
    }
  });
}
