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

test("native source is the lease-fed mirror; web source is mirror-first with the network read as fallback; both implement the same interface", () => {
  const native = read("src/screens/tasks/task-list-source.ts");
  const web = read("src/screens/tasks/task-list-source.web.ts");
  const shared = read("src/screens/tasks/task-list-source-mirror.ts");
  assert.match(native, /useSyncedCollection<.*>\(\{ kind: "task" \}\)/);
  assert.doesNotMatch(native, /useApiResource|tasksPath/);
  assert.match(native, /mirrorTaskListSource\(state, input\)/, "native maps the mirror through the shared source");
  assert.match(web, /useWebMirrorStatus\(\)/);
  assert.match(web, /useSyncedCollection<.*>\(\{ kind: "task" \}\)/);
  assert.match(web, /enabled: input\.ready && !mirrorActive/, "the network read is inert while the mirror is the source or identity is not ready");
  assert.match(web, /\/api\/tasks\/page\?/);
  assert.doesNotMatch(web, /tasksPath\(\)/, "online fallback is bounded, not the old full list");
  assert.match(web, /if \(mirrorActive\) return mirrorTaskListSource\(synced, input\)/);
  assert.ok(web.indexOf("useWebMirrorStatus()") < web.indexOf("useSyncedCollection<") && web.indexOf("useSyncedCollection<") < web.indexOf("useApiResource<unknown>"), "hooks run unconditionally, in a fixed order");
  assert.match(shared, /syncLabelKey: `sync\.\$\{/, "the mirror source carries the App's sync labels on both platforms");
  for (const source of [native, web]) assert.match(source, /export function useTaskListSource\(input: TaskListSourceInput\): TaskListSource/);
  const inventory = read("src/data/offline-read/route-domain-inventory.ts");
  assert.match(inventory, /\["src\/screens\/tasks\/task-list-source\.web\.ts","GET","\/api\/tasks\/page"\]/);
  assert.doesNotMatch(inventory, /\["src\/screens\/tasks\/TasksScreen\.tsx","GET","\/api\/tasks"\]/);
});
