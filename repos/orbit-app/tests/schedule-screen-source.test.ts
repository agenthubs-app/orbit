import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const repoRoot = new URL("..", import.meta.url).pathname;
const screenSource = readFileSync(
  join(repoRoot, "src", "screens", "schedule", "ScheduleScreen.tsx"),
  "utf8"
);

test("schedule screen renders event timeline items as compact event modules", () => {
  assert.match(screenSource, /ImageBackground/u);
  assert.match(screenSource, /useOrbitApiBaseUrl/u);
  assert.match(screenSource, /function EventTimelineModule/u);
  assert.match(screenSource, /styles\.eventTimelineMediaColumn/u);
  assert.match(screenSource, /styles\.eventTimelineThumbFrame/u);
  assert.match(screenSource, /item\.coverPath/u);
  assert.match(screenSource, /item\.participantCountLabel/u);
  assert.match(
    screenSource,
    /eventTimelineThumbFrame:\s*\{[^}]*height:\s*72[^}]*width:\s*72/su
  );
  assert.doesNotMatch(screenSource, /isEvent \? "calendar-outline"/u);
});

test("schedule screen surfaces upcoming events before the full timeline", () => {
  assert.match(screenSource, /function ScheduleEventHighlights/u);
  assert.match(screenSource, /view\.eventHighlights/u);
  assert.match(screenSource, /title="待准备活动"/u);

  const highlightsIndex = screenSource.indexOf("<ScheduleEventHighlights");
  const sectionsIndex = screenSource.indexOf("view.sections.map");

  assert.notEqual(highlightsIndex, -1);
  assert.notEqual(sectionsIndex, -1);
  assert.ok(
    highlightsIndex < sectionsIndex,
    "schedule event highlights should render before the full timeline sections"
  );
});

test("schedule screen can render partial timeline data while one source is pending", () => {
  assert.match(
    screenSource,
    /const hasAnyData =\s*usable\(tasksState\) \|\| usable\(eventsState\)/u
  );
  assert.match(
    screenSource,
    /tasks:\s*usable\(tasksState\)\s*\?\s*tasksState\.data\s*:\s*\{\s*tasks:\s*\[\]\s*\}/u
  );
  assert.match(
    screenSource,
    /events:\s*usable\(eventsState\)\s*\?\s*eventsState\.data\s*:\s*\{\s*events:\s*\[\]\s*\}/u
  );
  assert.doesNotMatch(
    screenSource,
    /usable\(tasksState\) && usable\(eventsState\)\s*\?/u
  );
});
