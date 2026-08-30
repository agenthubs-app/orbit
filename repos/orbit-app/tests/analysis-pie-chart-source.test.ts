import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const repoRoot = new URL("..", import.meta.url).pathname;
const source = readFileSync(
  join(repoRoot, "src", "components", "AnalysisPieChart.tsx"),
  "utf8"
);

test("analysis pie chart renders accessible selectable and activatable slices", () => {
  assert.match(source, /react-native-svg/u);
  assert.match(source, /<Path/u);
  assert.match(source, /selectedId/u);
  assert.match(source, /translateX/u);
  assert.match(source, /translateY/u);
  assert.match(source, /onActivate/u);
  assert.match(source, /accessibilityState=\{\{ selected/u);
});
