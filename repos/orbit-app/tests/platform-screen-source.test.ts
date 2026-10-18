import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const repoRoot = new URL("..", import.meta.url).pathname;
const screenSource = readFileSync(
  join(repoRoot, "src", "screens", "platform", "PlatformScreen.tsx"),
  "utf8"
);

test("platform screen is a public-catalogue source review without fake decisions", () => {
  assert.match(screenSource, /ORBIT_API_ENDPOINTS\.publicEvents/u);
  assert.match(screenSource, /admin\.platform\.title/u);
  assert.match(screenSource, /view\.boundary/u);
  assert.doesNotMatch(screenSource, /decidedReviewIds|decisionFeedback/u);
  assert.doesNotMatch(screenSource, />批准并发布|>驳回/u);
  assert.doesNotMatch(
    screenSource,
    /ORBIT_API_ENDPOINTS\.profile|dashboardAggregatePath/u
  );
  assert.doesNotMatch(
    screenSource,
    /onOpenEvent|router\.push|accessibilityRole="button"/u
  );
});

test("platform public activities render as source cards", () => {
  assert.match(screenSource, /<Card key=\{item\.id\} variant="flat"/u);
  assert.match(screenSource, /useOrbitApiBaseUrl/u);
  assert.match(screenSource, /item\.coverPath/u);
  assert.match(screenSource, /assetUrl\(baseUrl, item\.coverPath\)/u);
  assert.match(screenSource, /inset="kit"/u);
  assert.doesNotMatch(
    screenSource,
    /<Text style=\{styles\.eventIconText\}>\{item\.title\.slice\(0,\s*1\)\}<\/Text>/u
  );
});

test("platform offline state describes the public catalogue", () => {
  assert.match(screenSource, /eventsState\.kind === "offline" \? t\("admin\.platform\.offline"\)/u);
  assert.doesNotMatch(screenSource, /eventsState\.kind === "offline" \? t\("admin\.state\.offline"\)/u);
  for (const language of ["en", "ja", "zh"]) {
    const copy = readFileSync(join(repoRoot, "src", "i18n", language, "admin.ts"), "utf8");
    assert.match(copy, /"admin\.platform\.offline":/u);
  }
});
