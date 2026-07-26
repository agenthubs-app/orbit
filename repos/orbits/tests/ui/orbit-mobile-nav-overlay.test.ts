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

test("mobile menu starts below the top bar and uses a compact homepage-style panel", () => {
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
  assert.match(panelRule, /top:\s*8px;/u);
  assert.match(panelRule, /right:\s*14px;/u);
  assert.match(panelRule, /width:\s*220px;/u);
  assert.match(panelRule, /border-radius:\s*16px;/u);
  assert.doesNotMatch(panelRule, /left:\s*0;/u);
});

test("the mobile menu preserves page color tokens and does not dim the header", () => {
  const scrimRule = styles.match(
    /\.orbit-nav-menu-scrim\s*\{([\s\S]*?)\}/u,
  )?.[1];
  const panelRule = styles.match(
    /\.orbit-nav-menu-panel\s*\{([\s\S]*?)\}/u,
  )?.[1];

  assert.ok(scrimRule);
  assert.match(scrimRule, /background:\s*transparent;/u);
  assert.ok(panelRule);
  assert.match(panelRule, /background:\s*var\(--surface\);/u);
  assert.match(panelRule, /border:\s*1px solid var\(--border\);/u);
});
