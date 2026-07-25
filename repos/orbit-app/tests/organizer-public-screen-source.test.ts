import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const repoRoot = new URL("..", import.meta.url).pathname;
const screenSource = readFileSync(
  join(repoRoot, "src", "screens", "organizer", "OrganizerPublicScreen.tsx"),
  "utf8"
);

test("organizer public screen mirrors the web image-led host page", () => {
  assert.match(screenSource, /ImageBackground/u);
  assert.match(screenSource, /function OrganizerHero/u);
  assert.match(screenSource, /function OrganizerEventCard/u);
  assert.match(screenSource, /view\.stats\.participants/u);
  assert.match(screenSource, /event\.coverPath/u);
  assert.match(screenSource, /event\.participantCountLabel/u);
  assert.match(screenSource, /已认证主办方/u);
});
