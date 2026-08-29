import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const repoRoot = new URL("..", import.meta.url).pathname;
const dashboardRoute = readFileSync(
  join(repoRoot, "app", "contacts", "dashboard.tsx"),
  "utf8"
);
const legacyGraphRoute = readFileSync(
  join(repoRoot, "app", "contacts", "graph.tsx"),
  "utf8"
);

test("dashboard and legacy graph routes open the merged relationship analysis", () => {
  assert.match(dashboardRoute, /ContactsDashboardScreen/u);
  assert.match(legacyGraphRoute, /ContactsDashboardScreen/u);
  assert.doesNotMatch(legacyGraphRoute, /ContactsGraphScreen/u);
});
