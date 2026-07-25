import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const repoRoot = new URL("..", import.meta.url).pathname;
const screenSource = readFileSync(
  join(repoRoot, "src", "screens", "platform", "PlatformScreen.tsx"),
  "utf8"
);

test("platform screen supports mobile event review decisions like the web platform", () => {
  assert.match(screenSource, /decidedReviewIds/u);
  assert.match(screenSource, /decisionFeedback/u);
  assert.match(screenSource, /onDecideReviewItem/u);
  assert.match(screenSource, />批准并发布</u);
  assert.match(screenSource, />驳回</u);
  assert.match(screenSource, /"审核队列已清空"/u);
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
