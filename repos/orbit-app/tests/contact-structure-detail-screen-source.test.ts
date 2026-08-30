import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const repoRoot = new URL("..", import.meta.url).pathname;
const source = readFileSync(
  join(repoRoot, "src", "screens", "contacts", "ContactStructureDetailScreen.tsx"),
  "utf8"
);

test("structure detail screen loads one actor-scoped bucket and opens contacts", () => {
  assert.match(source, /contactStructureDetailPath/u);
  assert.match(source, /contactStructureDetailToView/u);
  assert.match(source, /关系质量/u);
  assert.match(source, /常见标签/u);
  assert.match(source, /相关联系人/u);
  assert.match(source, /router\.push/u);
});
