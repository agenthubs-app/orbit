import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { transformSync } from "esbuild";

import * as notificationModel from "../../src/notifications/notification-model";
import * as pushPolicy from "../../src/notifications/push-policy";

const root = new URL("../..", import.meta.url).pathname;
const require = createRequire(import.meta.url);
type Response = { actionIdentifier: string; notification: { request: { identifier: string; content: { data: Record<string, unknown> } } } };
const response = (id: string, data: Record<string, unknown>): Response => ({
  actionIdentifier: "default",
  notification: { request: { identifier: id, content: { data } } },
});

// Only native/platform boundaries are replaced. The two production lifecycle
// components and the production payload/permission policies execute unchanged.
function harness(input: { optedIn?: boolean; signedIn?: boolean; lastResponse?: Response } = {}) {
  const handlers: any[] = [];
  const listeners = new Set<(value: Response) => void>();
  const navigations: any[] = [];
  const calls: string[] = [];
  const cleanup: Array<() => void> = [];
  const state: any[] = [];
  let cursor = 0;
  let optedIn = input.optedIn ?? false;
  const auth = { ready: true, signedIn: input.signedIn ?? true, cookieHeader: "test-cookie", user: { id: "actor-a" } };
  const api = {
    async post(path: string) { calls.push(`post:${path}`); return { success: true, data: {} }; },
    async delete(path: string) { calls.push(`delete:${path}`); return { success: true, data: {} }; },
  };
  const notifications = {
    setNotificationHandler(handler: unknown) { handlers.push(handler); },
    addNotificationResponseReceivedListener(listener: (value: Response) => void) {
      listeners.add(listener);
      return { remove() { listeners.delete(listener); } };
    },
    addPushTokenListener() { return { remove() {} }; },
    async getLastNotificationResponseAsync() { return input.lastResponse ?? null; },
    async getPermissionsAsync() { return { status: "granted" }; },
    async requestPermissionsAsync() { calls.push("request-permission"); return { status: "granted" }; },
    async getExpoPushTokenAsync(options?: { projectId?: string }) { calls.push(`project:${options?.projectId}`); return { data: "test-push-token" }; },
  };
  const native = {
    getReminderNotificationGeneration: () => 0,
    async syncReminderNotifications() { calls.push("sync-local-reminders"); },
    async registerNotificationDevice() { calls.push("register-legacy-device"); return true; },
    async revokeNotificationDevice() { calls.push("revoke-legacy-device"); return true; },
    async cancelOrbitManagedNotifications() { calls.push("cancel-local-reminders"); },
    onReminderPlansChanged() { return () => {}; },
  };
  const pushSession = {
    ...pushPolicy,
    async isPushNotificationsOptedIn() { return optedIn; },
    async readOrCreatePushDeviceId() { return "test-installation"; },
    onPushNotificationsOptInChanged() { return () => {}; },
    async setPushNotificationsOptIn(value: boolean) { optedIn = value; calls.push(`opt-in:${value}`); },
    async revokeRegisteredPushDevice() { calls.push("revoke-durable-device"); return true; },
  };
  const react = {
    useCallback: (callback: unknown) => callback,
    useEffect(callback: () => void | (() => void)) { const stop = callback(); if (stop) cleanup.push(stop); },
    useState(initial: unknown) {
      const index = cursor++;
      if (!(index in state)) state[index] = initial;
      return [state[index], (value: unknown) => { state[index] = value; }];
    },
  };
  const router = { push(href: unknown) { navigations.push(href); } };
  const modules = new Map<string, any>();
  function load(path: string) {
    if (modules.has(path)) return modules.get(path);
    const source = readFileSync(join(root, path), "utf8");
    const code = transformSync(source, { format: "cjs", jsx: "automatic", loader: "tsx", target: "es2015", supported: { "dynamic-import": false } }).code;
    const module = { exports: {} as any };
    const nativeRequire = (id: string): any => {
      if (id === "react") return react;
      if (id === "react/jsx-runtime") return { jsx: (type: unknown, props: unknown) => ({ type, props }), jsxs: (type: unknown, props: unknown) => ({ type, props }) };
      if (id === "react-native") return { Platform: { OS: "ios" }, AppState: { addEventListener() { return { remove() {} }; } }, StyleSheet: { create: (value: unknown) => value }, Pressable: "Pressable", Text: "Text", View: "View", useColorScheme: () => "light" };
      if (id === "expo-notifications") return notifications;
      if (id === "expo-router") return { router, useRouter: () => router };
      if (id === "expo-constants") return { expoConfig: { extra: { easProjectId: "test-project" } } };
      if (id === "expo-linking") return { addEventListener() { return { remove() {} }; }, async getInitialURL() { return null; } };
      if (id === "@expo/vector-icons") return { Ionicons: "Icon" };
      if (id.endsWith("/AuthSessionProvider")) return { useOrbitAuthSession: () => auth };
      if (id.endsWith("/ApiBaseUrlProvider")) return { useOrbitApiBaseUrl: () => ({ baseUrl: "http://localhost" }) };
      if (id.endsWith("/useOrbitApiClient")) return { useOrbitApiClient: () => api };
      if (id.endsWith("/api/client")) return { createOrbitApiClient: () => api };
      if (id.endsWith("/notification-model")) return notificationModel;
      if (id.endsWith("/native-notifications")) return native;
      if (id.endsWith("/push-device-session")) return pushSession;
      if (id.endsWith("/push-registration-queue")) return load("src/notifications/push-registration-queue.ts");
      if (id.endsWith("/endpoints")) return { ORBIT_API_ENDPOINTS: { pushTokens: "/api/devices/push-tokens" } };
      if (id.endsWith("/AppScreen")) return { AppScreen: "AppScreen" };
      if (id.endsWith("/DataCard")) return { DataCard: "DataCard" };
      if (id.endsWith("/design/theme")) return load("src/design/theme.ts");
      if (id.endsWith("/design/tokens") || id === "./tokens") return load("src/design/tokens.ts");
      return require(id);
    };
    runInNewContext("(function(require,module,exports){" + code + "\n})", { console })(nativeRequire, module, module.exports);
    modules.set(path, module.exports);
    return module.exports;
  }
  const Coordinator = load("src/components/OrbitNotificationsCoordinator.tsx").OrbitNotificationsCoordinator;
  const Lifecycle = load("src/notifications/NotificationLifecycle.tsx").OrbitNotificationLifecycle;
  return {
    auth, calls, handlers, listeners, navigations,
    mount() { Coordinator(); Lifecycle(); },
    emit(value: Response) { listeners.forEach(listener => listener(value)); },
    close() { cleanup.splice(0).forEach(stop => stop()); },
    settings() { cursor = 0; return load("src/screens/settings/SettingsScreen.tsx").SettingsScreen(); },
  };
}

const settle = () => new Promise<void>(resolve => setImmediate(resolve));

test("merged roots share one native handler and response listener while local reminders keep syncing", { timeout: 5000 }, async () => {
  const app = harness();
  app.mount();
  await settle();
  assert.equal(app.handlers.length, 1);
  assert.equal(app.listeners.size, 1);
  assert.equal(app.calls.filter(call => call === "sync-local-reminders").length, 1);
  app.close();
  assert.equal(app.listeners.size, 0);
});

test("OS permission alone does not register either push device before explicit app opt-in", { timeout: 5000 }, async () => {
  const app = harness();
  app.mount();
  await settle();
  assert.deepEqual(app.calls.filter(call => call.includes("register") || call.startsWith("post:")), []);
  app.close();
});

test("opted-in sessions register both reminder and durable delivery backends once", { timeout: 5000 }, async () => {
  const app = harness({ optedIn: true });
  app.mount();
  await settle();
  assert.equal(app.calls.filter(call => call === "register-legacy-device").length, 1);
  assert.equal(app.calls.filter(call => call === "post:/api/devices/push-tokens").length, 1);
  assert.ok(app.calls.includes("project:test-project"));
  app.close();
});

test("foreground presentation preserves audible task reminders and quiet durable summaries", { timeout: 5000 }, async () => {
  const app = harness();
  app.mount();
  await settle();
  const handler = app.handlers[0];
  const local = await handler.handleNotification(response("local", { orbitReminderPlanId: "plan" }).notification);
  const durable = await handler.handleNotification(response("durable", { deliveryId: "delivery" }).notification);
  assert.equal(local.shouldPlaySound, true);
  assert.equal(durable.shouldPlaySound, false);
  assert.equal(durable.shouldSetBadge, true);
  app.close();
});

test("notification routing preserves local task links and authenticated opaque delivery links without replay", { timeout: 5000 }, async () => {
  const app = harness();
  app.mount();
  await settle();
  const task = response("local-1", { deepLink: "/tasks/task%3A1", orbitReminderPlanId: "plan-1" });
  const delivery = response("push-1", { deliveryId: "delivery:1" });
  app.emit(task);
  app.emit(task);
  app.emit(delivery);
  app.emit(delivery);
  assert.equal(app.navigations.length, 2);
  assert.equal(app.navigations[0], "/tasks/task%3A1");
  assert.equal(app.navigations[1].pathname, "/inbox");
  assert.equal(app.navigations[1].params.deliveryId, "delivery:1");
  app.close();
});

test("a cold-start local notification is not consumed before authentication", { timeout: 5000 }, async () => {
  const lastResponse = response("cold-1", { deepLink: "/tasks/task%3A1" });
  const app = harness({ signedIn: false, lastResponse });
  app.mount();
  await settle();
  assert.equal(app.navigations.length, 0);
  app.close();
  app.auth.signedIn = true;
  app.mount();
  await settle();
  assert.deepEqual(app.navigations, ["/tasks/task%3A1"]);
  app.close();
});

test("turning off critical reminders revokes both device registrations", { timeout: 5000 }, async () => {
  const app = harness({ optedIn: true });
  app.settings();
  await settle();
  const tree = app.settings();
  tree.props.children[0].props.children[1].props.onPress();
  await settle();
  assert.ok(app.calls.includes("opt-in:false"));
  assert.ok(app.calls.includes("revoke-durable-device"));
  assert.ok(app.calls.includes("revoke-legacy-device"));
  app.close();
});
