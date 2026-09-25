import assert from "node:assert/strict";
import test from "node:test";
import { profileContactSummaryCount, profileTaskDayCount, profileTaskDayPath } from "../src/view-models/profile-statistic-counts";

test("profile statistics use bounded summaries and preserve zero versus unavailable", () => {
  assert.equal(profileContactSummaryCount({ total: 10000, sources: {}, statuses: {}, values: {}, tags: [], hasMoreTags: false, asOf: "2026-09-25T00:00:00.000Z" }), 10000);
  assert.equal(profileContactSummaryCount({ contacts: [] }), null);
  assert.equal(profileContactSummaryCount({ total: -1 }), null);
  const dueWindow = { plannedThrough: "2026-09-25", dueBefore: "2026-09-25T15:00:00.000Z" };
  const empty = { actorId: "a", status: "open", scope: "all", query: "", dueWindow, items: [], total: 0, counts: { open: 0, completed: 0 }, hasMore: false, nextCursor: null, asOf: "2026-09-25T00:00:00.000Z" };
  const count = (data: unknown) => profileTaskDayCount(data, "a", "2026-09-25", "Asia/Tokyo");
  assert.equal(count(empty), 0);
  const card = { id: "task", titlePreview: "Task", locationPreview: null, category: "work", status: "open", priority: "normal", plannedDate: "2026-09-25", dueAt: null, updatedAt: empty.asOf, relatedContact: null };
  const many = { ...empty, items: [card], total: 10000, counts: { open: 10000, completed: 0 }, hasMore: true, nextCursor: "signed" };
  assert.equal(count(many), 10000);
  for (const patch of [{ actorId: "b" }, { dueWindow: undefined }, { dueWindow: { ...dueWindow, plannedThrough: "2026-09-26" } }, { items: [] }, { hasMore: false, nextCursor: null }])
    assert.equal(count({ ...many, ...patch }), null);
  const url = new URL(profileTaskDayPath("2026-09-25", "Asia/Tokyo"), "https://orbit.test");
  assert.equal(url.pathname, "/api/tasks/page"); assert.equal(url.searchParams.get("limit"), "1");
  assert.equal(url.searchParams.get("dueBefore"), dueWindow.dueBefore);
});
