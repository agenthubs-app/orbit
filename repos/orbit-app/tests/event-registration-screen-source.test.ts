import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const repoRoot = new URL("..", import.meta.url).pathname;
const screenSource = readFileSync(
  join(repoRoot, "src", "screens", "events", "EventRegistrationScreen.tsx"),
  "utf8"
);

test("event registration screen uses the web adaptive interview routes", () => {
  const personaSlice = screenSource.slice(
    screenSource.indexOf("async function generateAdaptivePersona"),
    // The independent registration readback helper follows the persona method;
    // it is not part of the persona request and must not widen this slice.
    screenSource.indexOf("async function verifyRegistrationReadback")
  );

  assert.match(screenSource, /eventRegistrationInterviewPath/u);
  assert.match(screenSource, /eventRegistrationPersonaPath/u);
  assert.match(screenSource, /buildEventRegistrationAdaptiveBody/u);
  assert.match(screenSource, /eventRegistrationAdaptiveStepToView/u);
  assert.match(screenSource, /eventRegistrationPersonaToView/u);
  assert.match(screenSource, /requestAdaptiveQuestion/u);
  assert.match(screenSource, /generateAdaptivePersona/u);
  assert.match(screenSource, /活动画像/u);
  assert.match(screenSource, /下一题/u);
  assert.match(screenSource, /生成活动画像/u);
  assert.doesNotMatch(
    personaSlice,
    /eventRegistrationPath\(eventId\)|eventRegistrationCancelPath\(eventId\)/u
  );
});
