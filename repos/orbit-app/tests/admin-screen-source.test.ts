import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const repoRoot = new URL("..", import.meta.url).pathname;
const screenSource = readFileSync(
  join(repoRoot, "src", "screens", "admin", "AdminScreen.tsx"),
  "utf8"
);

test("admin events screen does not advertise an unwired creation flow", () => {
  assert.doesNotMatch(screenSource, /createEventDraftOpen/u);
  assert.doesNotMatch(screenSource, /CreateEventDraftCard/u);
  assert.doesNotMatch(screenSource, />新建活动</u);
  assert.doesNotMatch(screenSource, /创建活动草稿/u);
  assert.match(screenSource, /view\.boundary/u);
  assert.doesNotMatch(screenSource, /inviteMember|createEvent|updateRole/u);
});

test("admin events screen uses sourced events in kit cards", () => {
  assert.match(screenSource, /UiPressable/u);
  assert.match(screenSource, /<Card variant="flat"/u);
  assert.match(screenSource, /useOrbitApiBaseUrl/u);
  assert.match(screenSource, /event\.coverPath/u);
  assert.match(screenSource, /assetUrl\(baseUrl, event\.coverPath\)/u);
  assert.match(screenSource, /inset="kit"/u);
  assert.doesNotMatch(
    screenSource,
    /<Text style=\{styles\.eventIconText\}>\{event\.title\.slice\(0,\s*1\)\}<\/Text>/u
  );
});

test("admin profile avoids inferred team roles", () => {
  assert.match(screenSource, /admin\.profile\.emailUnknown/u);
  assert.doesNotMatch(screenSource, /团队成员|邀请成员/u);
  assert.doesNotMatch(screenSource, /后端权限接口|权限接口/u);
});
