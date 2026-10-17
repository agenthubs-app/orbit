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

test("To-do reevaluates the local date while the page remains open", () => {
  const source = readFileSync(join(import.meta.dirname, "../src/screens/todo/TodoScreen.tsx"), "utf8");
  assert.match(source, /setInterval\(\(\) => setNow\(new Date\(\)\), 60_000\)/u);
  assert.match(source, /localParts\(now, timeZone\)\.date/u);
});

test("To-do page copy network response is scoped to account session and server origin", () => {
  const source = readFileSync(join(import.meta.dirname, "../src/screens/todo/useTodoPage.ts"), "utf8");
  assert.match(source, /auth\.notificationSessionRevision/u);
  assert.match(source, /server\.baseUrl/u);
  assert.match(source, /auth\.cookieHeader/u);
});

test("manual handoff scope is revoked when account or server readiness changes", () => {
  const source = readFileSync(join(import.meta.dirname, "../src/screens/todo/TodoScreen.tsx"), "utf8");
  assert.match(source, /auth\.ready, auth\.signedIn, server\.baseUrl, server\.ready/u);
  assert.match(source, /!auth\.ready \|\| !auth\.signedIn \|\| !server\.ready/u);
});

test("a not-implemented aggregate suppresses the page and its old offline copy", () => {
  const hook = readFileSync(join(import.meta.dirname, "../src/screens/todo/useTodoPage.ts"), "utf8");
  const screen = readFileSync(join(import.meta.dirname, "../src/screens/todo/TodoScreen.tsx"), "utf8");
  assert.match(hook, /dropCopyOnErrorCodes: \["NOT_IMPLEMENTED"\]/u);
  assert.match(screen, /if \(!page && todoAggregateHidden\(todo\.state\)\) return null/u);
});
