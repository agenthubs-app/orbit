import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const repoRoot = new URL("..", import.meta.url).pathname;
const errorStateSource = readFileSync(
  join(repoRoot, "src", "components", "ErrorState.tsx"),
  "utf8"
);

test("ErrorState default title is Chinese across native screens", () => {
  assert.match(errorStateSource, /title = "页面暂时无法加载"/u);
  assert.doesNotMatch(errorStateSource, /Could not load this view/u);
});
