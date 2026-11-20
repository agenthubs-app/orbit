// 2026-11-21 活动图片：private Blob 对象名 ↔ 站内读取地址；格式不对的读取请求一律不放行。
import assert from "node:assert/strict";
import test from "node:test";

import { eventCoverObjectFromRoute, eventCoverObjectName, eventCoverRoutePath } from "../../features/events/host/cover-image";
import { normalizeEventCoverUrl } from "../../shared/compute/event-cover";

test("stored cover maps to a site path the cover rule accepts, and back", () => {
  const name = eventCoverObjectName("ws", "ev", Buffer.from("webp"));
  const path = eventCoverRoutePath(name);
  assert.match(path, /^\/api\/event-covers\/[0-9a-f]{20}\/[0-9a-f]{24}\.webp$/u);
  assert.equal(normalizeEventCoverUrl(path), path);
  const [, , , scope, file] = path.split("/");
  assert.equal(eventCoverObjectFromRoute(scope!, file!), name);
});

test("route rejects anything that is not a content-addressed cover", () => {
  for (const [scope, file] of [["..", "x.webp"], ["a".repeat(20), "b".repeat(24) + ".png"], ["A".repeat(20), "b".repeat(24) + ".webp"], ["a".repeat(20), "../" + "b".repeat(21) + ".webp"]]) {
    assert.equal(eventCoverObjectFromRoute(scope!, file!), null);
  }
});
