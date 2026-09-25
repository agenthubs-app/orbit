import assert from "node:assert/strict";
import test from "node:test";
import { homeTaskPagePath, homeTaskPageToView, homeTaskWindow } from "../src/view-models/home-task-page";

test("home task cutoff follows local midnight including 23/25-hour days", () => {
  assert.deepEqual(homeTaskWindow("2026-09-25", "Asia/Tokyo"), { plannedThrough: "2026-09-25", dueBefore: "2026-09-25T15:00:00.000Z" });
  assert.equal(homeTaskWindow("2026-03-08", "America/New_York").dueBefore, "2026-03-09T04:00:00.000Z");
  assert.equal(homeTaskWindow("2026-11-01", "America/New_York").dueBefore, "2026-11-02T05:00:00.000Z");
  const params = new URL(homeTaskPagePath("2026-09-25", "Asia/Tokyo"), "https://orbit.test").searchParams;
  assert.equal(params.get("limit"), "5"); assert.equal(params.get("status"), "open");
});

test("home keeps global count, server order and rejects wrong actor/window or incomplete pages", () => {
  const date = "2026-09-25", zone = "Asia/Tokyo", now = new Date("2026-09-25T00:00:00Z");
  const page = { actorId: "a", status: "open", scope: "all", query: "", dueWindow: homeTaskWindow(date, zone),
    items: Array.from({ length: 5 }, (_, n) => ({ id: "t" + n, titlePreview: "Task " + n, locationPreview: null, status: "open", category: "work", priority: "normal",
      plannedDate: date, dueAt: null, updatedAt: now.toISOString(), relatedContact: null })),
    total: 10000, counts: { open: 10000, completed: 0 }, hasMore: true, nextCursor: "signed", asOf: now.toISOString() };
  const view = (payload: unknown) => homeTaskPageToView(payload, "a", date, now, zone, "zh");
  assert.equal(view(page)?.total, 10000); assert.deepEqual(view(page)?.items.map(item => item.id), page.items.map(item => item.id));
  for (const patch of [{ actorId: "b" }, { dueWindow: undefined }, { dueWindow: homeTaskWindow(date, "UTC") }, { items: page.items.slice(0, 4) }, { hasMore: false, nextCursor: null }])
    assert.equal(view({ ...page, ...patch }), null);
});
