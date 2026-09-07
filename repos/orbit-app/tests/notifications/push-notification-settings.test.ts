import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const repoRoot = new URL("../..", import.meta.url).pathname;
const source = readFileSync(
  join(repoRoot, "src", "screens", "settings", "SettingsScreen.tsx"),
  "utf8"
);

test("push settings expose an explicit enable/disable action and revoke on opt-out", () => {
  assert.match(source, /disablePushNotifications/u);
  assert.match(source, /revokeRegisteredPushDevice/u);
  assert.match(source, /pushOptIn === true\s*\?\s*disablePushNotifications/u);
  assert.match(source, /disabled=\{pushOptInBusy\}/u);
  assert.match(source, /setPushNotificationsOptIn\(false\)/u);
});
