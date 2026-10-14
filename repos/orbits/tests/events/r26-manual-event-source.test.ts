import assert from "node:assert/strict";
import test from "node:test";

import { readEvents } from "../../app/(app)/app/orbit-2026/add/manual-api";
import { eventChips } from "../../app/(app)/app/orbit-2026/add/manual-model";

// R26-06（SC-R26-10）：手入力「出会った場所」候选改读 `GET /api/events/mine`（我的活动），不再读全部活动列表；
// 外部评估与取消的不进候选；chips 仍只留已经开始、30 天内的（R12 复核 M3）。界面不变。
test("出会った場所 chips come from my events only", async (t) => {
  const calls: string[] = [];
  t.mock.method(globalThis, "fetch", async (url: string) => {
    calls.push(url);
    const items = url.includes("range=past")
      ? [{ eventId: "e-past", startsAt: "2026-10-01T19:00:00+09:00", status: "attended", title: "CFO Night" }, { eventId: "e-cancel", startsAt: "2026-10-02T19:00:00+09:00", status: "cancelled", title: "取消" }]
      : [{ eventId: "assessment:evas_1", startsAt: "2026-10-10T19:00:00+09:00", status: "planned", title: "外部" }, { eventId: "e-soon", startsAt: "2026-10-12T19:00:00+09:00", status: "registered", title: "来週" }];
    return new Response(JSON.stringify({ data: { items, range: "past", upcomingCount: 1 } }), { headers: { "content-type": "application/json" } });
  });
  const list = await readEvents();
  assert.deepEqual(calls.sort(), ["/api/events/mine?range=past&limit=20", "/api/events/mine?range=upcoming&limit=20"]);
  assert.deepEqual(list.map((item) => item.id), ["e-past", "e-soon"]);
  const chips = eventChips(list, new Date("2026-10-07T03:00:00.000Z"));
  assert.deepEqual(chips.map((chip) => chip.eventId), ["e-past"], "only events that already started");
});
