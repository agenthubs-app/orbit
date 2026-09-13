import assert from "node:assert/strict";
import test from "node:test";
import { buildTaskDatePatch, taskDateDraftFromView, taskDateReceiptMatches } from "../src/view-models/task-dates";

const empty = { plannedDate: "", dueDate: "", dueTime: "" };
const task = { id: "task:edit", accountId: "actor-1", ownerUserId: "actor-1", title: "A task", notes: "A note", status: "open", category: "work", priority: "normal", source: "manual", createdAt: "2026-09-07T00:00:00Z", updatedAt: "2026-09-13T00:00:00Z", plannedDate: "2026-09-15", dueAt: "2026-09-15T00:30:00+09:00" };

// Wrong host timezone or treating date-only as an instant changes these literals.
test("date editor preserves planned day and converts the deadline across Tokyo midnight", () => {
  assert.deepEqual(taskDateDraftFromView({ plannedDate: "2026-09-15", dueAt: "2026-09-14T16:30:00Z" }), { plannedDate: "2026-09-15", dueDate: "2026-09-15", dueTime: "01:30" });
  assert.deepEqual(taskDateDraftFromView({ dueAt: "2026-09-15T00:00:42.123+09:00" }), { plannedDate: "", dueDate: "2026-09-15", dueTime: "00:00" });
});
test("missing or malformed deadline does not invent a time or crash the editor", () => {
  assert.deepEqual(taskDateDraftFromView(null), empty);
  assert.deepEqual(taskDateDraftFromView({ plannedDate: "2026-09-15" }), { ...empty, plannedDate: "2026-09-15" });
  assert.deepEqual(taskDateDraftFromView({ dueAt: "not-a-date" }), empty);
});
test("planned-date-only edit never manufactures a midnight deadline", () => {
  assert.deepEqual(buildTaskDatePatch({}, { ...empty, plannedDate: " 2026-09-15 " }), { kind: "ready", patch: { plannedDate: "2026-09-15" } });
});
test("paired deadline inputs save the explicit Tokyo instant without changing planned date", () => {
  assert.deepEqual(buildTaskDatePatch({ plannedDate: "2026-09-15" }, { plannedDate: "2026-09-15", dueDate: "2026-09-15", dueTime: "00:30" }), { kind: "ready", patch: { dueAt: "2026-09-14T15:30:00.000Z" } });
});
test("unchanged minute display preserves original deadline seconds and offset", () => {
  assert.deepEqual(buildTaskDatePatch({}, empty), { kind: "unchanged" });
  assert.deepEqual(buildTaskDatePatch({ dueAt: "2026-09-14T16:30:42.123Z" }, { ...empty, dueDate: "2026-09-15", dueTime: "01:30" }), { kind: "unchanged" });
  assert.deepEqual(buildTaskDatePatch({ dueAt: "2026-09-14T16:30:42.123Z" }, { plannedDate: "2026-09-16", dueDate: "2026-09-15", dueTime: "01:30" }), { kind: "ready", patch: { plannedDate: "2026-09-16" } });
});
test("valid leap day and both changed fields produce only their date patch", () => {
  assert.deepEqual(buildTaskDatePatch({}, { plannedDate: "2028-02-29", dueDate: "2028-02-29", dueTime: "23:59" }), { kind: "ready", patch: { plannedDate: "2028-02-29", dueAt: "2028-02-29T14:59:00.000Z" } });
});
// Date overflow normalization, permissive parsing, or accidental clearing must fail.
for (const [name, baseline, draft] of [
  ["non-leap day", {}, { ...empty, plannedDate: "2026-02-29" }],
  ["short month", {}, { ...empty, plannedDate: "2026-04-31" }],
  ["invalid month", {}, { ...empty, plannedDate: "2026-13-01" }],
  ["invalid day", {}, { ...empty, plannedDate: "2026-09-00" }],
  ["non-padded day", {}, { ...empty, plannedDate: "2026-9-1" }],
  ["API-unsupported early year", {}, { ...empty, plannedDate: "0099-01-01" }],
  ["non-leap century", {}, { ...empty, plannedDate: "2100-02-29" }],
  ["deadline overflow", {}, { ...empty, dueDate: "2026-02-29", dueTime: "09:00" }],
  ["missing time", {}, { ...empty, dueDate: "2026-09-15" }],
  ["missing date", {}, { ...empty, dueTime: "09:00" }],
  ["24 hour", {}, { ...empty, dueDate: "2026-09-15", dueTime: "24:00" }],
  ["60 minute", {}, { ...empty, dueDate: "2026-09-15", dueTime: "09:60" }],
  ["non-padded time", {}, { ...empty, dueDate: "2026-09-15", dueTime: "9:00" }],
  ["clear planned date", { plannedDate: "2026-09-15" }, empty],
  ["clear deadline", { dueAt: "2026-09-15T09:00:00Z" }, empty],
] as const) test(`invalid ${name} gives an explanation without a writable patch`, () => {
  const result = buildTaskDatePatch(baseline, draft);
  assert.equal(result.kind, "invalid");
  assert.ok("message" in result && typeof result.message === "string" && result.message.length > 0);
  assert.equal("patch" in result, false);
});

test("receipt accepts the correct owner, revision and equivalent server-normalized instant", () => {
  assert.equal(taskDateReceiptMatches({ task }, "task:edit", "actor-1", { plannedDate: "2026-09-15", dueAt: "2026-09-14T15:30:00.000Z" }), true);
});
for (const patch of [
  { id: "task:other" }, { ownerUserId: "actor-2" }, { accountId: "actor-2" }, { title: "" },
  { status: "cancelled" }, { updatedAt: "" }, { updatedAt: "not-a-date" }, { createdAt: undefined },
  { category: "unknown" }, { priority: "unknown" }, { source: undefined }, { notes: 123 },
  { plannedDate: "2026-09-16" }, { dueAt: "2026-09-15T01:30:00+09:00" },
]) test(`receipt cannot acknowledge wrong or incomplete saved data ${JSON.stringify(patch)}`, () => {
  assert.equal(taskDateReceiptMatches({ task: { ...task, ...patch } }, "task:edit", "actor-1", { plannedDate: "2026-09-15", dueAt: "2026-09-14T15:30:00.000Z" }), false);
});
test("missing receipt and missing actor never acknowledge a save", () => {
  for (const data of [null, {}, { task: [] }]) assert.equal(taskDateReceiptMatches(data, "task:edit", "actor-1", { plannedDate: "2026-09-15" }), false);
  assert.equal(taskDateReceiptMatches({ task }, "task:edit", "", { plannedDate: "2026-09-15" }), false);
});
