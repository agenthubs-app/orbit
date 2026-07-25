import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const repoRoot = new URL("..", import.meta.url).pathname;
const homeRouteSource = readFileSync(join(repoRoot, "app", "home.tsx"), "utf8");

test("legacy home route redirects to the single Orbit AI home", () => {
  assert.match(homeRouteSource, /Redirect/u);
  assert.match(homeRouteSource, /href="\/ai"/u);
  assert.doesNotMatch(homeRouteSource, /<HomeScreen/u);
});
