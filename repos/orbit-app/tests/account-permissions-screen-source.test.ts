import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { zh } from "../src/i18n/zh";

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
  assert.match(accountScreenSource, /account\.permissions/u);
  assert.equal(zh["account.permissions"], "权限中心");
});

// Server-settings availability, order before login and its actual destination
// are exercised on the rendered guest screen in ink-signal-settings-account.

test("R18a account permissions route redirects to inline settings permissions", () => {
  assert.equal(existsSync(screenPath), false);
  assert.equal(existsSync(routePath), true);

  const routeSource = readFileSync(routePath, "utf8");
  assert.match(routeSource, /Redirect/u);
  assert.match(routeSource, /href="\/settings"/u);
});
