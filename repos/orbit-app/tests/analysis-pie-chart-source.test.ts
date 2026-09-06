import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const repoRoot = new URL("..", import.meta.url).pathname;
const source = readFileSync(
  join(repoRoot, "src", "components", "AnalysisPieChart.tsx"),
  "utf8"
);
const orbitSource = readFileSync(
  join(repoRoot, "src", "components", "AnalysisPieOrbitChart.tsx"),
  "utf8"
);

test("analysis pie chart keeps slice selection visible without activating navigation", () => {
  assert.match(source, /react-native-svg/u);
  assert.match(source, /<Path/u);
  assert.match(source, /selectedId/u);
  assert.match(source, /translateX/u);
  assert.match(source, /translateY/u);
  assert.match(source, /onPress=\{\(\) => onSelect\(item\.id\)\}/u);
  assert.doesNotMatch(source, /onActivate/u);
  assert.match(source, /numberOfLines=\{2\}/u);
  assert.match(
    source,
    /allowFontScaling=\{false\}[\s\S]{0,100}style=\{styles\.centerValue\}/u
  );
  assert.match(
    source,
    /allowFontScaling=\{false\}[\s\S]{0,180}style=\{\[styles\.centerCaption/u
  );
  assert.match(source, /size\?: number/u);
  assert.match(source, /accessibilityElementsHidden/u);
  assert.match(source, /importantForAccessibility="no-hide-descendants"/u);
  assert.match(source, /accessible=\{false\}/u);
  assert.doesNotMatch(source, /accessibilityRole="image"/u);
  assert.doesNotMatch(source, /accessibilityRole="imagebutton"/u);
  assert.match(
    source,
    /<Path[\s\S]{0,200}accessible=\{false\}[\s\S]{0,300}onPress=\{\(\) => onSelect\(item\.id\)\}/u
  );
  assert.doesNotMatch(source, /<Path[\s\S]{0,200}accessibilityRole/u);
});

test("the larger industry ring is opt-in and does not resize other structure donuts", () => {
  assert.match(source, /const DEFAULT_RADIUS = 78;/u);
  assert.match(source, /const DEFAULT_SELECTED_OFFSET = 9;/u);
  assert.match(source, /plotRadius = DEFAULT_RADIUS/u);
  assert.match(source, /selectedOffset = DEFAULT_SELECTED_OFFSET/u);
  assert.match(orbitSource, /plotRadius=\{88\}/u);
  assert.match(orbitSource, /selectedOffset=\{7\}/u);
});
