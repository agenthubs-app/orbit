import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const repoRoot = new URL("..", import.meta.url).pathname;
const source = readFileSync(
  join(repoRoot, "src", "components", "AppScreen.tsx"),
  "utf8"
);

test("shared screens use native iOS keyboard-aware scrolling", () => {
  assert.match(source, /automaticallyAdjustKeyboardInsets/u);
  assert.match(source, /keyboardDismissMode="interactive"/u);
  assert.match(source, /keyboardShouldPersistTaps="handled"/u);
});
