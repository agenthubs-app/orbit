import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const repoRoot = new URL("..", import.meta.url).pathname;
const screenSource = readFileSync(
  join(repoRoot, "src", "screens", "events", "EventAttendeesScreen.tsx"),
  "utf8"
);

test("event attendees screen can save encounter notes through the web API", () => {
  assert.match(screenSource, /TextInput/u);
  assert.match(screenSource, /ORBIT_API_ENDPOINTS\.contactDraftEventAttendeesImport/u);
  assert.match(screenSource, /buildEventAttendeeContactDraftImportRequest/u);
  assert.match(screenSource, /buildEventAttendeeRosterImportRequest/u);
  assert.match(screenSource, /eventEncountersPath/u);
  assert.match(screenSource, /eventEncounterEvidencePath/u);
  assert.match(screenSource, /buildEncounterNoteRequest/u);
  assert.match(screenSource, /eventAttendeeContactDraftImportToView/u);
  assert.match(screenSource, /eventAttendeeRosterImportToView/u);
  assert.match(screenSource, /eventEncounterNoteToView/u);
  assert.match(screenSource, /eventEncounterEvidenceToView/u);
  assert.match(screenSource, /importEventAttendeesIntoRoster/u);
  assert.match(screenSource, /importEventAttendeesAsDrafts/u);
  assert.match(screenSource, /EventAttendeeRosterImportResultCard/u);
  assert.match(screenSource, /EventAttendeeDraftImportResultCard/u);
  assert.match(screenSource, /"导入名册"/u);
  assert.match(screenSource, /"导入为候选"/u);
  assert.match(screenSource, /"去复核候选"/u);
  assert.match(screenSource, /client\.post<unknown>\(\s*request\.request\.endpoint/u);
  assert.match(screenSource, /client\.post<unknown>\(\s*eventEncountersPath/u);
  assert.match(screenSource, /client\.post<unknown>\(\s*eventEncounterEvidencePath/u);
  assert.match(screenSource, /client\.post<unknown>\(\s*ORBIT_API_ENDPOINTS\.contactDraftEventAttendeesImport/u);
  assert.match(screenSource, /pendingEvidenceEncounterId/u);
  assert.match(screenSource, /"保存现场记录"/u);
  assert.match(screenSource, /"生成关系证据"/u);
});

test("event attendee cards include an avatar identity marker", () => {
  assert.match(screenSource, /Image,/u);
  assert.match(screenSource, /useOrbitApiBaseUrl/u);
  assert.match(screenSource, /assetUrl/u);
  assert.match(screenSource, /function AttendeeAvatar/u);
  assert.match(screenSource, /styles\.attendeeAvatar/u);
  assert.match(screenSource, /attendee\.name\.slice\(0,\s*1\)/u);
  assert.match(screenSource, /attendee\.imageUrl/u);
  assert.match(
    screenSource,
    /source=\{\{ uri: assetUrl\(baseUrl, imageUrl\) \}\}/u
  );
  assert.match(screenSource, /styles\.attendeeAvatarImage/u);
  assert.match(screenSource, /<AttendeeAvatar/u);
});
