import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { zh } from "../src/i18n/zh";

const repoRoot = new URL("..", import.meta.url).pathname;
const screenSource = readFileSync(
  join(repoRoot, "src", "screens", "settings", "ApiSettingsScreen.tsx"),
  "utf8"
);

test("API settings screen uses localized product copy with the Chinese contract preserved", () => {
  for (const copy of [
    "settings.apiEyebrow",
    "settings.server",
    "settings.apiCurrent",
    "settings.apiAddress",
    "common.save",
    "settings.apiCheck",
    "settings.apiChecking",
    "settings.apiReset"
  ]) {
    assert.match(screenSource, new RegExp(copy, "u"));
  }
  assert.equal(zh["settings.apiCurrent"], "当前服务器");
  assert.equal(zh["settings.apiAddress"], "服务器地址");
});
