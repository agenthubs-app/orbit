import assert from "node:assert/strict";
import test from "node:test";
import { groupTaskRows } from "../../app/(app)/app/orbit-2026/todo/task-list-groups";
import type { TaskRowView } from "../../app/(app)/app/tasks/tasks-view-model";

const row = (id: string, patch: Partial<TaskRowView> = {}): TaskRowView => ({
  id, title: id, status: "open", category: "work", href: `/app/tasks/${id}`, ...patch,
});

test("task list groups by the selected day in the device zone, with due instants taking precedence", () => {
  const rows = [
    row("tomorrow", { dueAt: "2026-10-17T15:30:00Z", plannedDate: "2026-10-17" }),
    row("late", { dueAt: "2026-10-16T14:59:00Z", plannedDate: "2026-10-18" }),
    row("today", { plannedDate: "2026-10-17" }),
    row("undated"),
    row("done", { status: "completed", plannedDate: "2026-10-16" }),
  ];
  const groups = groupTaskRows(rows, "2026-10-17", "Asia/Tokyo", "all");
  assert.deepEqual(groups.map(group => [group.key, group.items.map(item => item.id)]), [
    ["overdue", ["late"]], ["today", ["today"]], ["upcoming", ["tomorrow"]],
    ["undated", ["undated"]], ["completed", ["done"]],
  ]);
});

test("connection filter includes a linked contact even if category is work; personal is its complement", () => {
  const rows = [
    row("linked", { relatedContact: { id: "contact:1", namePreview: "彩", organizationPreview: "" } }),
    row("category", { category: "relationship" }),
    row("hidden-contact", { relationship: true }),
    row("personal", { category: "personal" }),
  ];
  assert.deepEqual(groupTaskRows(rows, "2026-10-17", "Asia/Tokyo", "relationship").flatMap(group => group.items.map(item => item.id)), ["category", "hidden-contact", "linked"]);
  assert.deepEqual(groupTaskRows(rows, "2026-10-17", "Asia/Tokyo", "personal").flatMap(group => group.items.map(item => item.id)), ["personal"]);
});

test("invalid time zone fails visibly instead of silently grouping against a guessed date", () => {
  assert.throws(() => groupTaskRows([row("one")], "2026-10-17", "bad/zone", "all"));
});
