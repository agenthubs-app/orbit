import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

// R02 (SC-R02-01): the icon shapes come from orbits/shared/design/icons.json,
// rendered to shared/design/icons.ts there and copied here by
// `npm run sync:contract`. The copy is never edited by hand.
const appRoot = new URL("..", import.meta.url).pathname;

test("the icon copy is byte-identical to the generated source", () => {
  const source = readFileSync(join(appRoot, "..", "orbits", "shared", "design", "icons.ts"), "utf8");
  const copy = readFileSync(join(appRoot, "src", "api", "design", "icons.ts"), "utf8");
  assert.equal(copy, source, "src/api/design/icons.ts was edited by hand or is stale; run npm run sync:contract");
});

test("the copy lists every icon in the source with its shapes", async () => {
  const { designIconNames, designIcons, designIconSources } = await import("../src/api/design/icons");
  const json = JSON.parse(readFileSync(join(appRoot, "..", "orbits", "shared", "design", "icons.json"), "utf8")) as Record<string, { source: string }>;
  assert.deepEqual([...designIconNames], Object.keys(json));
  for (const name of designIconNames) {
    assert.ok(designIcons[name].length > 0, `${name} has no shapes`);
    assert.equal(designIconSources[name], json[name]!.source);
  }
});
