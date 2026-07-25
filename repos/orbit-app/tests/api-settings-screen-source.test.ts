import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const repoRoot = new URL("..", import.meta.url).pathname;
const screenSource = readFileSync(
  join(repoRoot, "src", "screens", "settings", "ApiSettingsScreen.tsx"),
  "utf8"
);

test("API settings screen uses Chinese product copy", () => {
  for (const copy of [
    'eyebrow="开发设置"',
    'title="服务器"',
    'title="当前服务器"',
    'title="服务器地址"',
    "保存",
    "检查",
    "检查中",
    "重置"
  ]) {
    assert.match(screenSource, new RegExp(copy, "u"));
  }

  assert.doesNotMatch(
    screenSource,
    /"Development"|"Current server"|"Server address"|"Loading saved address"|"Server address saved\."|"Server address reset\."|"Use localhost|"Save"|"Checking"|"Check"|"Reset"|"Could not check this server\."/u
  );
});
