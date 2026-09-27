import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { WEB_MIRROR_DOMAIN_IDS } from "../src/data/sync/web-mirror-storage";

// Sprint 0108 source-level guard, in the style of tasks-screen-source-selection:
// the notes and personal-schedule screens depend on one source interface each;
// the platform modules pick the mirror (native) or the browser behaviour.
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("notes screens read through notes-source; native is the mirror, the browser is mirror-first like tasks (0125)", () => {
  for (const screen of ["NotesScreen", "NoteDetailScreen", "EditNoteScreen", "NewNoteScreen"]) {
    const source = read(`src/screens/notes/${screen}.tsx`);
    assert.match(source, /from "\.\/notes-source"/, screen);
    assert.doesNotMatch(source, /useSyncedCollection|notePath\(noteId\), \(\) => false/, `${screen} reads no transport directly`);
  }
  const mirror = read("src/screens/notes/notes-source-mirror.ts");
  assert.match(mirror, /useSyncedCollection<.*>\(\{ kind: "note" \}\)/);
  assert.doesNotMatch(mirror, /useApiResource|client\.get/);
  const native = read("src/screens/notes/notes-source.ts");
  assert.match(native, /from "\.\/notes-source-mirror"/, "native reads the shared mirror hooks");
  assert.doesNotMatch(native, /useApiResource|client\.get/);
  const web = read("src/screens/notes/notes-source.web.ts");
  assert.match(web, /useWebMirrorStatus\(\)/);
  assert.match(web, /from "\.\/notes-source-mirror"/, "the browser reuses the native mirror hooks, not a second copy");
  assert.match(web, /return mirrorActive \? fromMirror : fromNetwork/);
  assert.ok(WEB_MIRROR_DOMAIN_IDS.includes("notes"), "notes are on the browser mirror whitelist (user decision 2026-09-27)");
  assert.match(read("src/screens/notes/note-source-tasks-mirror.ts"), /useSyncedCollection<.*>\(\{ kind: "task" \}\)/);
  assert.match(read("src/screens/notes/note-source-tasks-source.web.ts"), /return mirrorActive \? fromMirror : fromNetwork/);
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
