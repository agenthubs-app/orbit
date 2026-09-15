import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const source = (...parts: string[]) => readFileSync(path.join(process.cwd(), ...parts), "utf8");

test("owner-scoped task, schedule, and note routes use canonical auth actor", () => {
  const files = [
    ["src", "screens", "tasks", "TasksScreen.tsx"],
    ["src", "screens", "tasks", "TaskDetailScreen.tsx"],
    ["src", "screens", "schedule", "PersonalScheduleList.tsx"],
    ["src", "screens", "schedule", "PersonalScheduleScreen.tsx"],
    ["app", "notes", "index.tsx"],
    ["app", "notes", "[id].tsx"],
    ["app", "notes", "new.tsx"],
    ["app", "notes", "[id]", "edit.tsx"],
  ];

  for (const file of files) {
    const value = source(...file);
    assert.match(value, /auth\.actorId/u, file.join("/"));
    assert.doesNotMatch(value, /const actor(?:Id)? = auth\.user\?\.id/u, file.join("/"));
  }
});

test("task AI intent producer and consumer share canonical auth actor", () => {
  for (const file of [
    ["src", "screens", "tasks", "RelationshipTaskTools.tsx"],
    ["app", "ai", "[id].tsx"],
  ]) {
    const value = source(...file);
    assert.match(value, /auth\.actorId/u, file.join("/"));
  }
});
