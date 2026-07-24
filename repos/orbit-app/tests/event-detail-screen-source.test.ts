import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const repoRoot = new URL("..", import.meta.url).pathname;
const screenSource = readFileSync(
  join(repoRoot, "src", "screens", "events", "EventDetailScreen.tsx"),
  "utf8"
);

test("event detail screen loads readiness and recommendation modules", () => {
  assert.match(screenSource, /eventReadinessPath/u);
  assert.match(screenSource, /eventRecommendationsPath/u);
  assert.match(screenSource, /eventReadinessToView/u);
  assert.match(screenSource, /eventRecommendationsToView/u);
  assert.match(screenSource, /title="会前准备度"/u);
  assert.match(screenSource, /title="推荐认识的人"/u);
});
