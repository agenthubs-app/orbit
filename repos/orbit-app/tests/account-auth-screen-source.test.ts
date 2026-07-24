import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const repoRoot = new URL("..", import.meta.url).pathname;
const screenSource = readFileSync(
  join(repoRoot, "src", "screens", "profile", "AccountAuthScreen.tsx"),
  "utf8"
);

test("account auth screen renders helper links such as forgot password", () => {
  assert.match(screenSource, /view\.helperLinks/u);
  assert.match(screenSource, /helperLink/u);
});
