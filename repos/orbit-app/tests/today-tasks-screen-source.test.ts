import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const repoRoot = new URL("..", import.meta.url).pathname;
const todaySource = readFileSync(
  join(repoRoot, "src", "screens", "today", "TodayScreen.tsx"),
  "utf8",
);
const tasksSource = readFileSync(
  join(repoRoot, "src", "screens", "tasks", "TasksScreen.tsx"),
  "utf8",
);
const detailSource = readFileSync(
  join(repoRoot, "src", "screens", "tasks", "TaskDetailScreen.tsx"),
  "utf8",
);

test("Today is a compact task-first workspace with schedule kept distinct", () => {
  assert.match(todaySource, /title="今天"/u);
  assert.doesNotMatch(todaySource, /eyebrow=/u);
  assert.match(todaySource, /placeholder="添加待办"/u);
  assert.match(todaySource, /title="待办"/u);
  assert.match(todaySource, /completedLabel/u);
  assert.match(todaySource, /title="Orbit 建议"/u);
  assert.match(todaySource, /title="日程"/u);
  assert.match(todaySource, /router\.push\("\/schedule" as Href\)/u);
  assert.doesNotMatch(todaySource, /DataCard|MetricPill/u);
});

test("Today mutations use canonical task and suggestion endpoints", () => {
  assert.match(todaySource, /client\.post<unknown>\(ORBIT_API_ENDPOINTS\.tasks/u);
  assert.match(todaySource, /client\.patch<unknown>\(taskPath\(taskId\)/u);
  assert.match(todaySource, /action: "complete"/u);
  assert.match(todaySource, /client\.post<unknown>\(taskSuggestionAcceptPath\(suggestionId\)/u);
  assert.match(todaySource, /todayState\.refresh\(\)/u);
});

test("all tasks keeps open and completed history as a visible segmented control", () => {
  assert.match(tasksSource, /type TaskListMode = "open" \| "completed"/u);
  assert.match(tasksSource, /label: "待办"/u);
  assert.match(tasksSource, /label: "已完成"/u);
  assert.match(tasksSource, /accessibilityRole="tablist"/u);
  assert.match(tasksSource, /tasksPath\(mode\)/u);
  assert.match(tasksSource, /action: mode === "open" \? "complete" : "reopen"/u);
});

test("native Today route points to the task and schedule workspace", () => {
  const route = readFileSync(join(repoRoot, "app", "today.tsx"), "utf8");
  assert.match(route, /TodayScreen/u);
  assert.doesNotMatch(route, /TodayAgentLedgerScreen/u);
});

test("task detail keeps the note visible and moves metadata out of the main surface", () => {
  assert.match(detailSource, /expectedUpdatedAt/u);
  assert.match(detailSource, /action: "update"/u);
  assert.match(detailSource, /client\.delete<unknown>\(taskPath\(taskId\)/u);
  assert.match(detailSource, /remindersPath\("task", taskId\)/u);
  assert.match(detailSource, /requestNotificationPermission/u);
  assert.match(detailSource, /notifyReminderPlansChanged/u);
  assert.match(detailSource, /action: "cancel"/u);
  assert.match(detailSource, /accessibilityLabel="备注"/u);
  assert.match(detailSource, /onBlur=\{save/u);
  assert.match(detailSource, /accessibilityLabel="更多待办操作"/u);
  assert.match(detailSource, /"标记完成"/u);
  assert.doesNotMatch(detailSource, /const categories/u);
  assert.doesNotMatch(detailSource, />类别</u);
  assert.doesNotMatch(detailSource, />记录</u);
  const route = readFileSync(join(repoRoot, "app", "tasks", "[id].tsx"), "utf8");
  assert.match(route, /TaskDetailScreen/u);
});
