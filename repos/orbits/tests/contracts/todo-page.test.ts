import assert from "node:assert/strict";
import test from "node:test";
import { todoPageQueryObject, todoPageSchema } from "../../shared/api-schema/todo-page";

const item = { key: "task:t1", source: "task", sourceId: "t1", titlePreview: "Follow-up", createdAt: "2026-10-18T00:00:00Z", kind: "task", taskId: "t1", status: "open", overdue: true };
const page = {
  date: "2026-10-18", timeZone: "Asia/Tokyo", asOf: "2026-10-18T00:00:00Z",
  counts: { decisions: 1, nextMoves: 0, followups: 1, overdue: 1 }, countsCapped: { decisions: false, nextMoves: false },
  decisions: { items: [{ ...item, source: "entity_draft", actions: ["open"], conversationId: "conversation1" }], next: {} },
  nextMoves: { items: [], next: {} }, followups: { items: [item], next: {} }, sources: { entity_draft: "ok", task: "ok" },
};

test("todo responses keep readable rows, skip unknown sources/actions, and tolerate future display statuses", () => {
  const actual = todoPageSchema.parse({ ...page, futureField: true,
    decisions: { items: [{ ...page.decisions.items[0], actions: ["open", "future"] }, { ...page.decisions.items[0], source: "future" }], next: { entity_draft: "signed", future: "ignored" } },
    followups: { items: [{ ...item, kind: "future", status: "future", newField: true }, { ...item, source: "future" }, { broken: true }], next: {} },
    sources: { ...page.sources, task: "future", future: "ok" },
  });
  assert.equal(actual.decisions.items.length, 1);
  assert.deepEqual(actual.decisions.items[0].actions, ["open"]);
  assert.deepEqual(actual.decisions.next, { entity_draft: "signed" });
  assert.equal(actual.followups.items.length, 1);
  assert.equal(actual.followups.items[0].kind, "task");
  assert.equal(actual.followups.items[0].status, "open");
  assert.deepEqual(actual.sources, { entity_draft: "ok", task: "unavailable" });
  assert.equal("futureField" in actual, false);
});

test("todo response requires counts and dates and never silently invents a page", () => {
  assert.equal(todoPageSchema.safeParse({}).success, false);
  assert.equal(todoPageSchema.safeParse({ ...page, counts: { ...page.counts, followups: -1 } }).success, false);
  assert.equal(todoPageSchema.safeParse({ ...page, date: "2026-02-30" }).success, false);
});

test("todo paging requires matching section/source/cursor and rejects extra keys or invalid ranges", () => {
  for (const input of [{ actorId: "other" }, { section: "decisions" }, { source: "task" }, { cursor: "signed" },
    { section: "decisions", source: "task", cursor: "signed" }, { limit: "0" }, { limit: "51" }, { date: "2026-02-30" }, { timeZone: "invalid" }]) {
    assert.equal(todoPageQueryObject.safeParse(input).success, false, JSON.stringify(input));
  }
  assert.equal(todoPageQueryObject.safeParse({ section: "followups", source: "task", cursor: "signed", limit: "50" }).success, true);
  assert.equal(todoPageQueryObject.safeParse({ date: "2026-10-18", timeZone: "Asia/Tokyo" }).success, true);
});
