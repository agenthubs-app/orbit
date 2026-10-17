import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const repoRoot = new URL("..", import.meta.url).pathname;
const tasksSource = readFileSync(
  join(repoRoot, "src", "screens", "tasks", "TasksScreen.tsx"),
  "utf8",
);

test("all tasks keeps open and completed history as visible tabs", () => {
  assert.match(tasksSource, /type TaskListMode = "open" \| "completed"/u);
  assert.match(tasksSource, /label: locale\.t\("tasks\.viewOpen"\)/u);
  assert.match(tasksSource, /label: locale\.t\("tasks\.viewCompleted"\)/u);
  assert.match(tasksSource, /accessibilityRole="tablist"/u);
  // Platform transport wiring remains source-checked; task-page-source-lifecycle
  // and tasks-unification-interactions execute the bounded online consumer.
  assert.match(tasksSource, /useTaskListSource\(/u);
  assert.match(readFileSync(join(repoRoot, "src", "screens", "tasks", "task-list-source.web.ts"), "utf8"), /\/api\/tasks\/page\?/u);
  assert.match(tasksSource, /item.status === "completed" \? "reopen" : "complete"/u);
});

test("native Today route remains a private redirect to Task To-do", () => {
  const route = readFileSync(join(repoRoot, "app", "today.tsx"), "utf8");
  // R05: the route is a redirect to /task?seg=todo.
  assert.match(route, /LegacyTaskRedirect/u);
  assert.doesNotMatch(route, /TodayAgentLedgerScreen/u);
});

test("native task detail route points to TaskDetailScreen", () => {
  // Native router wiring is source-checked; task-detail-interactions.test.ts
  // executes the actual editor, mutation payloads and reminder controls.
  const route = readFileSync(join(repoRoot, "app", "tasks", "[id].tsx"), "utf8");
  assert.match(route, /TaskDetailScreen/u);
});
