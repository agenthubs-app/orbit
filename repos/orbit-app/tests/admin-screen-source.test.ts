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
  assert.match(screenSource, /移动端这里只做核对和跳转/u);
});

test("admin events screen renders managed events as image-backed modules", () => {
  assert.match(screenSource, /ImageBackground/u);
  assert.match(screenSource, /useOrbitApiBaseUrl/u);
  assert.match(screenSource, /event\.coverPath/u);
  assert.match(screenSource, /styles\.eventThumbFrame/u);
  assert.match(screenSource, /styles\.eventMetaLine/u);
  assert.doesNotMatch(
    screenSource,
    /<Text style=\{styles\.eventIconText\}>\{event\.title\.slice\(0,\s*1\)\}<\/Text>/u
  );
});

test("admin access copy avoids backend implementation wording", () => {
  assert.match(screenSource, /邀请成员、调整角色和撤销访问都需要再次确认。/u);
  assert.match(screenSource, /当前不会推断或生成成员信息/u);
  assert.doesNotMatch(screenSource, /后端权限接口|权限接口/u);
});
