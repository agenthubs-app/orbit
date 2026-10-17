import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { legacyTaskRedirect } from "../src/view-models/app-navigation";

const root = new URL("..", import.meta.url).pathname;

test("/today remains a private Task To-do redirect after its old screen is retired", () => {
  assert.equal(legacyTaskRedirect("/today"), "/task?seg=todo");
  const route = readFileSync(join(root, "app/today.tsx"), "utf8");
  assert.match(route, /withOrbitPrivateRoute\(LegacyTaskRedirect\)/u);
  assert.equal(existsSync(join(root, "src/screens/today/TodayScreen.tsx")), false);
});
