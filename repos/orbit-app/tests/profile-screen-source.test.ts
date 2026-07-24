import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const repoRoot = new URL("..", import.meta.url).pathname;
const screenSource = readFileSync(
  join(repoRoot, "src", "screens", "profile", "ProfileScreen.tsx"),
  "utf8"
);

test("profile screen loads sourced profile update suggestions", () => {
  assert.match(screenSource, /profileUpdateSuggestions/u);
  assert.match(screenSource, /profileUpdateSuggestionsToView/u);
  assert.match(screenSource, /title="资料更新建议"/u);
});

test("profile screen protects personal data behind a validated session", () => {
  assert.match(screenSource, /useOrbitAuthSession/u);
  assert.match(screenSource, /auth\.ready/u);
  assert.match(screenSource, /auth\.signedIn/u);
  assert.match(screenSource, /\/account\/login\?next=%2Fprofile/u);
});
