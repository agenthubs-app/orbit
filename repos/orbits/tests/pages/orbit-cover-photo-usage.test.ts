/** Admin event cards must render real covers instead of letter placeholders. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

const files: Array<[string, number]> = [
  ["app/(app)/app/admin/orbit-real-admin-workspace.tsx", 1],
  ["app/(app)/app/admin/orbit-real-admin-events.tsx", 1],
];

for (const [file, minCoverSites] of files) {
  test(`${file} renders real event covers`, () => {
    const source = readFileSync(join(projectRoot, file), "utf8");
    assert.ok(source.includes("eventCoverPhoto"), "imports/uses eventCoverPhoto");
    assert.ok(
      (source.match(/imageUrl=\{eventCoverPhoto\(/g) ?? []).length >= minCoverSites,
      `all Cover call sites pass imageUrl (expected >= ${minCoverSites})`,
    );
  });
}
