import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = new URL("..", import.meta.url).pathname;
const read = (path: string) => readFileSync(join(root, path), "utf8");

test("notes collection/detail read the mirror and confirmed creates/edits invalidate it", () => {
  const list = read("src/screens/notes/NotesScreen.tsx");
  const detail = read("src/screens/notes/NoteDetailScreen.tsx");
  const create = read("src/screens/notes/NewNoteScreen.tsx");
  const edit = read("src/screens/notes/EditNoteScreen.tsx");

  assert.match(list, /useSyncedCollection[^\n]*kind: "note"/u);
  assert.match(detail, /useSyncedCollection[^\n]*kind: "note"/u);
  assert.doesNotMatch(list, /useApiResource/);
  assert.doesNotMatch(detail, /useApiResource<unknown>\(notePath/u);
  assert.doesNotMatch(detail, /useApiResource<unknown>\(ORBIT_API_ENDPOINTS\.tasks/u);
  assert.match(create, /useSyncedCollection[^\n]*kind: "note"/u);
  assert.match(edit, /useSyncedCollection[^\n]*kind: "note"/u);
  assert.match(create, /confirmedNote[\s\S]*await [^;]*\.invalidate\(\)/u);
  assert.match(edit, /confirmedNote[\s\S]*await [^;]*\.invalidate\(\)/u);
});

test("tasks and personal schedule use mirror reads while online-only side resources stay separate", () => {
  const tasks = read("src/screens/tasks/TasksScreen.tsx");
  const detail = read("src/screens/tasks/TaskDetailScreen.tsx");
  const scheduleList = read("src/screens/schedule/PersonalScheduleList.tsx");
  const scheduleEditor = read("src/screens/schedule/PersonalScheduleScreen.tsx");

  assert.match(tasks, /useSyncedCollection[^\n]*kind: "task"/u);
  assert.doesNotMatch(tasks, /useApiResource<unknown>\(tasksPath/u);
  assert.match(detail, /useSyncedCollection[^\n]*kind: "task"/u);
  assert.match(detail, /useApiResource<unknown>\(activitiesPath/u);
  assert.match(detail, /useApiResource<unknown>\(reminderResourcePath/u);
  const reminderSection = detail.slice(detail.indexOf("async function addReminder"));
  assert.doesNotMatch(reminderSection, /taskSync\.invalidate/u);
  assert.match(scheduleList, /useSyncedCollection[^\n]*kind: "personal_schedule"/u);
  assert.match(scheduleEditor, /useSyncedCollection[^\n]*kind: "personal_schedule"/u);
  assert.match(scheduleEditor, /personalScheduleReceiptMatches[\s\S]*await [^;]*\.invalidate\(\)/u);
});

test("snapshot retirement is exact and freshness copy exists in all three languages", () => {
  const nativeStore = read("src/data/snapshot-store.ts");
  const webStore = read("src/data/snapshot-store.web.ts");
  assert.match(nativeStore, /export async function retireSnapshot\(/u);
  assert.match(nativeStore, /DELETE FROM legacy_api_snapshots WHERE path = \?/u);
  assert.match(webStore, /export async function retireSnapshot\(/u);
  for (const file of ["zh.ts", "ja.ts", "en.ts"]) {
    const locale = read(`src/i18n/${file}`);
    for (const key of ["sync.localReady", "sync.syncing", "sync.fresh", "sync.stale", "sync.failure", "sync.lastSynced"]) {
      assert.match(locale, new RegExp(`"${key}"`));
    }
  }
});
