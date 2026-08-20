import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const repoRoot = new URL("..", import.meta.url).pathname;
const screenSource = readFileSync(
  join(
    repoRoot,
    "src",
    "screens",
    "schedule",
    "ScheduleEventPreviewScreen.tsx"
  ),
  "utf8"
);

test("schedule event previews use the same public event boundary as the list", () => {
  assert.match(screenSource, /publicEventDetailPath/u);
  assert.match(screenSource, /publicEventDetailPath\(eventId\)/u);
  assert.doesNotMatch(screenSource, /\beventDetailPath\(eventId\)/u);
});
