import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { WEB_MIRROR_DOMAIN_IDS } from "../src/data/sync/web-mirror-storage";

// Sprint 0108 source-level guard, in the style of tasks-screen-source-selection:
// the notes and personal-schedule screens depend on one source interface each;
// the platform modules pick the mirror (native) or the browser behaviour.
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("notes screens read through notes-source; native is the mirror, the browser stays online-only", () => {
  for (const screen of ["NotesScreen", "NoteDetailScreen", "EditNoteScreen", "NewNoteScreen"]) {
    const source = read(`src/screens/notes/${screen}.tsx`);
    assert.match(source, /from "\.\/notes-source"/, screen);
    assert.doesNotMatch(source, /useSyncedCollection|notePath\(noteId\), \(\) => false/, `${screen} reads no transport directly`);
  }
  const native = read("src/screens/notes/notes-source.ts");
  assert.match(native, /useSyncedCollection<.*>\(\{ kind: "note" \}\)/);
  assert.doesNotMatch(native, /useApiResource|client\.get/);
  const web = read("src/screens/notes/notes-source.web.ts");
  assert.doesNotMatch(web, /useSyncedCollection/, "the browser does not mirror notes");
  assert.ok(!WEB_MIRROR_DOMAIN_IDS.includes("notes"), "notes stay off the browser mirror whitelist (PLANNER 0077)");
  assert.match(read("src/screens/notes/note-source-tasks-source.ts"), /useSyncedCollection<.*>\(\{ kind: "task" \}\)/);
});

test("personal-schedule screens read through personal-schedule-source; the browser is mirror-first like tasks", () => {
  for (const screen of ["PersonalScheduleList", "PersonalScheduleDetailScreen", "PersonalScheduleScreen"]) {
    assert.match(read(`src/screens/schedule/${screen}.tsx`), /from "\.\/personal-schedule-source"/, screen);
  }
  assert.doesNotMatch(read("src/screens/schedule/PersonalScheduleList.tsx"), /client\.get/);
  assert.doesNotMatch(read("src/screens/schedule/PersonalScheduleDetailScreen.tsx"), /client\.get/);
  const native = read("src/screens/schedule/personal-schedule-source.ts");
  assert.match(native, /useSyncedCollection<.*>\(\{ kind: "personal_schedule" \}\)/);
  assert.doesNotMatch(native, /useOrbitApiClient|client\.get/);
  const web = read("src/screens/schedule/personal-schedule-source.web.ts");
  assert.match(web, /useWebMirrorStatus\(\)/);
  assert.match(web, /if \(mirrorActive\) return fromMirror/);
  assert.ok(WEB_MIRROR_DOMAIN_IDS.includes("personal-schedule"));
});
