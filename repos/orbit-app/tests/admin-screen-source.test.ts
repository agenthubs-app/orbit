import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const repoRoot = new URL("..", import.meta.url).pathname;
const screenSource = readFileSync(
  join(repoRoot, "src", "screens", "admin", "AdminScreen.tsx"),
  "utf8"
);

test("admin events screen includes a mobile event setup draft flow", () => {
  assert.match(screenSource, /createEventDraftOpen/u);
  assert.match(screenSource, /CreateEventDraftCard/u);
  assert.match(screenSource, />新建活动</u);
  assert.match(screenSource, /活动名称/u);
  assert.match(screenSource, /时间地点/u);
  assert.match(screenSource, /报名表单/u);
  assert.match(screenSource, /流程自动化/u);
  assert.match(screenSource, /开放签到/u);
  assert.match(screenSource, /创建活动草稿/u);
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
  assert.doesNotMatch(screenSource, /后端权限接口|权限接口/u);
});
