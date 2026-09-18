import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Source-level guard: the tasks screen depends on one data-source interface, and
// the platform modules pick the mirror (native) or the network (Web) beneath it.
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("TasksScreen reads through useTaskListSource and never imports a transport directly", () => {
  const screen = read("src/screens/tasks/TasksScreen.tsx");
  assert.match(screen, /from "\.\/task-list-source"/);
  assert.doesNotMatch(screen, /useSyncedCollection/);
  assert.doesNotMatch(screen, /useApiResource<unknown>\(tasksPath\(\)/);
  assert.match(screen, /confirmMutation\(item\.id, action\)/, "mutations are confirmed against the authoritative source");
  assert.match(screen, /sync\.mutationPending/);
});

test("native source is the lease-fed mirror; web source is the network read; both implement the same interface", () => {
  const native = read("src/screens/tasks/task-list-source.ts");
  const web = read("src/screens/tasks/task-list-source.web.ts");
  assert.match(native, /useSyncedCollection<.*>\(\{ kind: "task" \}\)/);
  assert.doesNotMatch(native, /useApiResource|tasksPath/);
  assert.match(web, /useApiResource<unknown>\(tasksPath\(\)/);
  assert.doesNotMatch(web, /useSyncedCollection/);
  for (const source of [native, web]) assert.match(source, /export function useTaskListSource\(input: TaskListSourceInput\): TaskListSource/);
  const inventory = read("src/data/offline-read/route-domain-inventory.ts");
  assert.match(inventory, /\["src\/screens\/tasks\/task-list-source\.web\.ts","GET","\/api\/tasks"\]/);
  assert.doesNotMatch(inventory, /\["src\/screens\/tasks\/TasksScreen\.tsx","GET","\/api\/tasks"\]/);
});
