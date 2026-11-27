import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";

import { ORBIT_IOS_INPUT_ZOOM_SCRIPT } from "../../app/(app)/app/orbit-ios-input-zoom";

// iOS 聚焦小字号输入框会自动放大：只在 iOS（含报告成 MacIntel 的 iPad）给 viewport 追加 maximum-scale=1。
function run(userAgent: string, platform = "", maxTouchPoints = 0) {
  const meta = { content: "width=device-width, initial-scale=1", setAttribute(name: string, value: string) { if (name === "content") this.content = value; } };
  const listeners: (() => void)[] = [];
  const document = { querySelector: () => meta, addEventListener: (_: string, fn: () => void) => listeners.push(fn) };
  vm.runInNewContext(ORBIT_IOS_INPUT_ZOOM_SCRIPT, { navigator: { maxTouchPoints, platform, userAgent }, document });
  for (const fn of listeners) fn();
  return meta.content;
}

test("iPhone and iPad (also iPadOS reporting MacIntel with touch) get maximum-scale=1 once", () => {
  assert.equal(run("Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X)"), "width=device-width, initial-scale=1, maximum-scale=1");
  assert.equal(run("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", "MacIntel", 5), "width=device-width, initial-scale=1, maximum-scale=1");
});

test("Android and desktop keep pinch zoom (viewport unchanged)", () => {
  assert.equal(run("Mozilla/5.0 (Linux; Android 15; Pixel 9)", "Linux armv8l", 5), "width=device-width, initial-scale=1");
  assert.equal(run("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", "MacIntel", 0), "width=device-width, initial-scale=1");
});
