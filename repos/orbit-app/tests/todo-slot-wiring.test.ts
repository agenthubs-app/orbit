import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

test("Task keeps quick add and mounts the new To-do first page with the preserved task-list view", () => {
  const source = readFileSync(join(import.meta.dirname, "../src/screens/task/TaskScreen.tsx"), "utf8");
  assert.match(source, /<TaskQuickAdd ref=\{quickAdd\} onCreated=\{onCreated\} \/>/u);
  assert.match(source, /<TodoTaskSlot key=\{revision\} \/>/u);
  assert.doesNotMatch(source, /<TasksScreen key=\{revision\} \/>/u);
});

test("Task mounts the unified calendar in its frozen calendar slot", () => {
  const source = readFileSync(join(import.meta.dirname, "../src/screens/task/TaskScreen.tsx"), "utf8");
  assert.match(source, /import \{ CalendarScreen \} from "\.\.\/calendar\/CalendarScreen";/u);
  assert.match(source, /calendar: \(\) => <CalendarScreen \/>/u);
  assert.doesNotMatch(source, /calendar: \(\) => <ScheduleScreen \/>/u);
});
