import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const repoRoot = new URL("..", import.meta.url).pathname;
const screenPath = join(
  repoRoot,
  "src",
  "screens",
  "profile",
  "AccountPermissionsScreen.tsx"
);
const routePath = join(repoRoot, "app", "account", "permissions.tsx");
const accountScreenSource = readFileSync(
  join(repoRoot, "src", "screens", "profile", "AccountScreen.tsx"),
  "utf8"
);

test("account screen links to the native permissions center", () => {
  assert.match(accountScreenSource, /\/account\/permissions/u);
  assert.match(accountScreenSource, /权限中心/u);
});

test("account screen links to the server settings screen for local testing", () => {
  const settingsIndex = accountScreenSource.indexOf('title="服务器设置"');
  const authEntryIndex = accountScreenSource.indexOf('title="账号入口"');

  assert.match(accountScreenSource, /\/settings\/api/u);
  assert.match(accountScreenSource, /服务器设置/u);
  assert.ok(settingsIndex > -1);
  assert.ok(authEntryIndex > settingsIndex);
});

test("account permissions route renders a native staged permission center", () => {
  assert.equal(existsSync(screenPath), true);
  assert.equal(existsSync(routePath), true);

  const screenSource = readFileSync(screenPath, "utf8");
  const routeSource = readFileSync(routePath, "utf8");

  assert.match(routeSource, /AccountPermissionsScreen/u);
  assert.match(screenSource, /ORBIT_API_ENDPOINTS\.permissions/u);
  assert.match(screenSource, /calendarPermissionRequestPath/u);
  assert.match(screenSource, /permissionStatesToView/u);
  assert.match(screenSource, /calendarPermissionRequestToView/u);
  assert.match(screenSource, /title="权限中心"/u);
  assert.match(screenSource, /\.post<unknown>\(/u);
  assert.match(screenSource, /申请日历复核/u);
});
