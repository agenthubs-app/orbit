import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const repoRoot = new URL("..", import.meta.url).pathname;
const source = (...parts: string[]) => readFileSync(join(repoRoot, ...parts), "utf8");

test("the root app coordinates native notification delivery and response routing", () => {
  const layout = source("app", "_layout.tsx");
  const coordinator = source("src", "components", "OrbitNotificationsCoordinator.tsx");
  const lifecycle = source("src", "notifications", "NotificationLifecycle.tsx");
  assert.match(layout, /OrbitNotificationsCoordinator/u);
  assert.match(layout, /OrbitNotificationLifecycle/u);
  assert.match(coordinator, /addNotificationResponseReceivedListener/u);
  assert.match(coordinator, /getLastNotificationResponseAsync/u);
  assert.match(coordinator, /syncReminderNotifications/u);
  assert.match(lifecycle, /registerNotificationDevice/u);
  assert.doesNotMatch(lifecycle, /setNotificationHandler|addNotificationResponseReceivedListener/u);
});

test("notification native module is configured and logout revokes this device", () => {
  const config = source("app.config.ts");
  const auth = source("src", "api", "AuthSessionProvider.tsx");
  assert.match(config, /"expo-notifications"/u);
  assert.match(config, /easProjectId/u);
  assert.match(auth, /revokeNotificationDevice/u);
  assert.match(auth, /revokeRegisteredPushDevice/u);
});
