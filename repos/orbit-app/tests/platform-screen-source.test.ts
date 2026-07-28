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
  assert.match(screenSource, /公开活动来源核对/u);
  assert.match(screenSource, /没有具备身份校验的平台审核写接口/u);
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

test("platform review activities render as image-backed event modules", () => {
  assert.match(screenSource, /ImageBackground/u);
  assert.match(screenSource, /useOrbitApiBaseUrl/u);
  assert.match(screenSource, /item\.coverPath/u);
  assert.match(screenSource, /styles\.eventThumbFrame/u);
  assert.match(screenSource, /styles\.eventMetaLine/u);
  assert.doesNotMatch(
    screenSource,
    /<Text style=\{styles\.eventIconText\}>\{item\.title\.slice\(0,\s*1\)\}<\/Text>/u
  );
});
