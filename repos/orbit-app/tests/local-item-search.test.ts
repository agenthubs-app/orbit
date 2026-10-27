import assert from "node:assert/strict";
import test from "node:test";

import { localItemCount, searchLocalItems, type LocalItemSearchInput } from "../src/screens/search/local-item-search";

// Simulator QA G1: the device-side search over notes, to-dos and schedule items (src/screens/search/local-item-search.ts).
const note = (id: string, title: string, body: string, updatedAt: string) => ({
  id, accountId: "a", ownerUserId: "a", title, body, manualContactIds: [], mentions: [], contactIds: [], eventIds: [], version: 1, createdAt: updatedAt, updatedAt,
}) as unknown as LocalItemSearchInput["notes"][number];
const now = Date.parse("2026-10-26T00:00:00Z");
const input = (query: string, limit = 10): LocalItemSearchInput => ({
  query, now, limit,
  notes: [note("n1", "QA note", "body", "2026-10-01T00:00:00Z"), note("n2", "Lunch", "talked about qa plans", "2026-10-05T00:00:00Z"), note("n3", "Other", "nothing", "2026-10-06T00:00:00Z")],
  tasks: [
    { id: "t1", title: "QA buy stamps", status: "open", dueAt: "2026-11-02", updatedAt: "2026-10-01T00:00:00Z" },
    { id: "t2", title: "QA done", status: "completed", updatedAt: "2026-10-02T00:00:00Z" },
    { id: "t3", title: "QA soon", status: "open", plannedDate: "2026-10-27", updatedAt: "2026-10-01T00:00:00Z" },
    { id: "t4", title: "QA sample", status: "open", sample: true, updatedAt: "2026-10-01T00:00:00Z" },
    { id: "t5", title: "QA cancelled", status: "cancelled", updatedAt: "2026-10-01T00:00:00Z" },
  ],
  schedule: [
    { id: "s1", title: "QA lunch", location: "Ginza", startsAt: "2026-10-28T03:00:00Z", state: "upcoming" },
    { id: "s2", title: "QA review", startsAt: "2026-10-01T03:00:00Z", state: "ended" },
    { id: "s3", title: "Team sync", location: "QA room", startsAt: "2026-10-27T03:00:00Z", state: "upcoming" },
    { id: "s4", title: "QA off", startsAt: "2026-10-29T03:00:00Z", state: "cancelled" },
  ],
});

test("an empty query finds nothing", () => {
  assert.equal(localItemCount(searchLocalItems(input("  ")), "all"), 0);
});

test("notes match title or body, case and width folded, newest first, with the matching line", () => {
  const { notes } = searchLocalItems(input("ＱＡ"));
  assert.deepEqual(notes.items.map((hit) => hit.id), ["n2", "n1"]);
  assert.equal(notes.items[0]!.href, "/notes/n2");
  assert.equal(notes.items[0]!.detail, "talked about qa plans");
});

test("to-dos: open ones soonest first, then done; sample and cancelled rows never show", () => {
  const { todos } = searchLocalItems(input("qa"));
  assert.deepEqual(todos.items.map((hit) => hit.id), ["t3", "t1", "t2"]);
  assert.equal(todos.items[2]!.done, true);
  assert.equal(todos.items[0]!.href, "/tasks/t3");
});

test("schedule: title or place; coming first (soonest), then past; cancelled skipped", () => {
  const { schedule } = searchLocalItems(input("qa"));
  assert.deepEqual(schedule.items.map((hit) => hit.id), ["s3", "s1", "s2"]);
  assert.equal(schedule.items[1]!.href, "/schedule/personal/s1");
});

test("several words must all match; the limit cuts rows but not the count", () => {
  assert.deepEqual(searchLocalItems(input("qa lunch")).schedule.items.map((hit) => hit.id), ["s1"]);
  const limited = searchLocalItems(input("qa", 1));
  assert.equal(limited.todos.items.length, 1);
  assert.equal(limited.todos.total, 3);
  assert.equal(localItemCount(limited, "todos"), 3);
});
