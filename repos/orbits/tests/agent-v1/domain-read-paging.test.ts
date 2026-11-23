import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_MAX_PAGES, readMaxPages, readPages } from "../../features/agent-v1/domains/registry";
import { occurrenceIn } from "../../features/agent-v1/domains/schedule/read";
import { A, pagedWorld, readKit, scopeOf, smallWorld, todo } from "./read-kit";

/**
 * agent-design AG05-3 (PLANNER 易错边界 3): at most 10 records a read, a cursor for the next page, a
 * page limit per subgoal (5 by default, configurable), and the coverage — pages read, records seen,
 * how many there are — so an answer never passes a part off as the whole.
 */

test("10 a page, newest first, the cursor continues without repeats; total counts all", async () => {
  const { registry } = readKit(pagedWorld(23));
  const first = await registry.read("memo", scopeOf(A), { contactId: "contact:c17" });
  assert.equal(first.items.length, 10);
  assert.equal(first.total, 23);
  assert.equal(first.items[0].id, "note:gen022", "newest first");
  const second = await registry.read("memo", scopeOf(A), { contactId: "contact:c17", cursor: first.nextCursor });
  const third = await registry.read("memo", scopeOf(A), { contactId: "contact:c17", cursor: second.nextCursor });
  const ids = [...first.items, ...second.items, ...third.items].map((item) => item.id);
  assert.equal(new Set(ids).size, 23);
  assert.equal(third.nextCursor, undefined);
});

test("oldest first, with words: the earliest matching note comes first", async () => {
  const { registry } = readKit(pagedWorld(40));
  const read = await registry.read("memo", scopeOf(A), { contactId: "contact:c17", order: "oldest", text: "灰釉" });
  assert.deepEqual(read.items.slice(0, 2).map((item) => item.id), ["note:gen003", "note:gen010"]);
  assert.equal(read.total, 6);
});

test("readPages stops at the page limit and reports how far it got", async () => {
  const { registry } = readKit(pagedWorld(64));
  const limited = await readPages(registry, "memo", scopeOf(A), { contactId: "contact:c17" }, 3);
  assert.deepEqual({ complete: limited.complete, pagesRead: limited.pagesRead, seen: limited.items.length, total: limited.total }, { complete: false, pagesRead: 3, seen: 30, total: 64 });
  const all = await readPages(registry, "memo", scopeOf(A), { contactId: "contact:c17" }, 10);
  assert.deepEqual({ complete: all.complete, pagesRead: all.pagesRead, seen: all.items.length }, { complete: true, pagesRead: 7, seen: 64 });
  assert.equal(DEFAULT_MAX_PAGES, 5);
  assert.equal(readMaxPages({}), 5);
  assert.equal(readMaxPages({ ORBIT_AGENT_READ_MAX_PAGES: "2" }), 2);
});

test("open to-dos of a contact: soonest due first, completed ones and other people's left out", async () => {
  const world = smallWorld();
  world.records.push(
    todo(A, "task:late", "过期的一条", { dueAt: "2026-11-10T09:00:00.000Z", relatedContactId: "contact:c17" }),
    todo(A, "task:done", "完成的一条", { completedAt: "2026-11-12T07:00:00.000Z", relatedContactId: "contact:c17", status: "completed" }),
    todo(A, "task:other", "别人的一条", { dueAt: "2026-11-09T09:00:00.000Z", relatedContactId: "contact:c30" }),
    todo(A, "task:nodate", "没有日期", { relatedContactId: "contact:c17" }),
  );
  const { registry } = readKit(world);
  const read = await registry.read("todo", scopeOf(A), { contactId: "contact:c17", status: "open" });
  assert.deepEqual(read.items.map((item) => item.id), ["task:late", "task:t42", "task:nodate"]);
  assert.equal(read.total, 3);
});

test("a schedule range keeps a weekly series that falls inside it", async () => {
  const { registry } = readKit();
  const tomorrow = await registry.read("schedule", scopeOf(A), { from: "2026-11-15T15:00:00.000Z", to: "2026-11-16T15:00:00.000Z" });
  assert.deepEqual(tomorrow.items.map((item) => item.id), ["personal:s10"]);
  assert.equal(occurrenceIn("2026-11-16T01:00:00.000Z", "weekly", "2026-11-22T15:00:00.000Z", "2026-11-23T15:00:00.000Z"), "2026-11-23T01:00:00.000Z");
  assert.equal(occurrenceIn("2026-11-16T01:00:00.000Z", "weekly", "2026-11-17T15:00:00.000Z", "2026-11-18T15:00:00.000Z"), null);
  assert.equal(occurrenceIn("2026-11-19T03:00:00.000Z", undefined, "2026-11-15T15:00:00.000Z", "2026-11-16T15:00:00.000Z"), null);
});
