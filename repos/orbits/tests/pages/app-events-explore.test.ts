/**
 * /app/events（Orbit_0918 discover + 我的活动）壳层契约测试。
 *
 * R27 起旧的 events-0918/events-list.tsx 已删除（活动列表 / 详情改由 orbit-2026 新屏渲染），
 * 原本针对列表的渲染与搜索断言随文件一并移除；这里只保留仍在使用的壳（events-shell.tsx）的页头与页签断言。
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const appRoot = path.join(process.cwd(), "app/(app)/app/events/events-0918");

test("the Orbit_0918 discover header and tabs are present in the events shell", () => {
  const shell = fs.readFileSync(path.join(appRoot, "events-shell.tsx"), "utf8");
  assert.match(shell, /发现活动/u);
  assert.match(shell, /我的活动/u);
  assert.match(shell, /主办管理/u);
  assert.match(shell, /创建活动/u);
  assert.match(shell, /href=\{preserveHref\("\/app\/events\/center"\)\}/u);
});
