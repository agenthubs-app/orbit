import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");
const styles = readFileSync(
  join(projectRoot, "app/(app)/app/orbit-reference-styles.tsx"),
  "utf8",
);

test("mobile menu scrim starts below the 56px top navigation", () => {
  const layerRule = [
    ...styles.matchAll(/\.orbit-nav-menu-layer\s*\{([\s\S]*?)\}/gu),
  ]
    .map((match) => match[1])
    .find((rule) => rule?.includes("top: 56px"));
  const panelRule = styles.match(
    /\.orbit-nav-menu-panel\s*\{([\s\S]*?)\}/u,
  )?.[1];

  assert.ok(layerRule, "mobile menu layer rule exists");
  assert.match(layerRule, /top:\s*56px;/u);
  assert.doesNotMatch(layerRule, /inset:\s*0;/u);

  assert.ok(panelRule, "mobile menu panel rule exists");
  assert.match(panelRule, /top:\s*0;/u);
});
