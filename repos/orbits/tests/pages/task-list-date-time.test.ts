import assert from "node:assert/strict";
import test from "node:test";
import { taskDateDraft, taskDateChange, taskDatePatchMovesLater } from "../../app/(app)/app/orbit-2026/todo/task-list-date-time";
import type { TaskView } from "../../app/(app)/app/tasks/tasks-view-model";

const task: TaskView = {
  id: "personal", title: "資料を送る", notes: "", status: "open", category: "work",
  priority: "normal", updatedAt: "2026-10-17T00:00:00.000Z", href: "/app/tasks/personal",
  plannedDate: "2026-10-17", dueAt: "2026-10-17T10:30:00.000Z",
};

test("task date draft shows the due instant in the page's time zone", () => {
  assert.deepEqual(taskDateDraft(task, "Asia/Tokyo"), { date: "2026-10-17", time: "19:30" });
  assert.deepEqual(taskDateDraft({ ...task, dueAt: undefined }, "Asia/Tokyo"), { date: "2026-10-17", time: "" });
});

test("changing the date keeps its time and updates both schedule fields", () => {
  const result = taskDateChange(task, { date: "2026-10-18", time: "19:30" }, "Asia/Tokyo");
  assert.deepEqual(result, { kind: "ready", patch: { plannedDate: "2026-10-18", dueAt: "2026-10-18T10:30:00.000Z" } });
  if (result.kind === "ready") assert.equal(taskDatePatchMovesLater(task, result.patch), true);
});

test("changing only the time preserves the due date and does not change plannedDate", () => {
  assert.deepEqual(taskDateChange(task, { date: "2026-10-17", time: "20:00" }, "Asia/Tokyo"),
    { kind: "ready", patch: { dueAt: "2026-10-17T11:00:00.000Z" } });
  assert.deepEqual(taskDateChange(task, { date: "2026-10-17", time: "19:30" }, "Asia/Tokyo"), { kind: "unchanged" });
});

test("moving a distinct due date does not overwrite the planned date", () => {
  const split = { ...task, plannedDate: "2026-10-16" };
  assert.deepEqual(taskDateChange(split, { date: "2026-10-18", time: "19:30" }, "Asia/Tokyo"),
    { kind: "ready", patch: { dueAt: "2026-10-18T10:30:00.000Z" } });
});

test("moving a due-only task does not create a planned date", () => {
  const dueOnly = { ...task, plannedDate: undefined };
  assert.deepEqual(taskDateChange(dueOnly, { date: "2026-10-18", time: "19:30" }, "Asia/Tokyo"),
    { kind: "ready", patch: { dueAt: "2026-10-18T10:30:00.000Z" } });
});

test("clearing time removes the due instant without erasing the scheduled date", () => {
  assert.deepEqual(taskDateChange(task, { date: "2026-10-17", time: "" }, "Asia/Tokyo"),
    { kind: "ready", patch: { dueAt: null } });
  assert.deepEqual(taskDateChange(task, { date: "", time: "" }, "Asia/Tokyo"),
    { kind: "ready", patch: { plannedDate: null, dueAt: null } });
});

test("clearing time keeps the visible date when planned and due dates differ", () => {
  const split = { ...task, plannedDate: "2026-10-16" };
  assert.deepEqual(taskDateDraft(split, "Asia/Tokyo"), { date: "2026-10-17", time: "19:30" });
  assert.deepEqual(taskDateChange(split, { date: "2026-10-17", time: "" }, "Asia/Tokyo"),
    { kind: "ready", patch: { plannedDate: "2026-10-17", dueAt: null } });
});

test("invalid or ambiguous local dates and times never produce a write", () => {
  assert.deepEqual(taskDateChange(task, { date: "2026-02-30", time: "19:30" }, "Asia/Tokyo"), { kind: "invalid", reason: "date" });
  assert.deepEqual(taskDateChange(task, { date: "", time: "19:30" }, "Asia/Tokyo"), { kind: "invalid", reason: "date" });
  assert.deepEqual(taskDateChange({ ...task, plannedDate: "2026-03-08", dueAt: undefined }, { date: "2026-03-08", time: "02:30" }, "America/New_York"), { kind: "invalid", reason: "localTime" });
  assert.deepEqual(taskDateChange({ ...task, plannedDate: "2026-11-01", dueAt: undefined }, { date: "2026-11-01", time: "01:30" }, "America/New_York"), { kind: "invalid", reason: "localTime" });
  assert.deepEqual(taskDateChange(task, { date: "2026-10-17", time: "19:30" }, "Bad/Zone"), { kind: "invalid", reason: "timeZone" });
});
