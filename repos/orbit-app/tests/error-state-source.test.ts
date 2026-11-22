import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const repoRoot = new URL("..", import.meta.url).pathname;
const errorStateSource = readFileSync(
  join(repoRoot, "src", "components", "ErrorState.tsx"),
  "utf8"
);

// 2026-11-21 language audit: the default title follows the screen language.
test("ErrorState default title comes from the dictionary, not a fixed language", () => {
  assert.match(errorStateSource, /t\("common\.loadFailedTitle"\)/u);
  assert.doesNotMatch(errorStateSource, /Could not load this view/u);
});
