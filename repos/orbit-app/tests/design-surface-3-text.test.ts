import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";
import { designContrast } from "../src/api/design/tokens";

// R01 review M1: surface3 is the design's track / divider / skeleton fill and
// carries no body text (orbits/shared/design/README.md). Only the foregrounds
// the source lists against surface3 in its contrast list (ink, ink2) may sit on
// it. The scan is per style object: one that sets a surface3 background and
// also a text colour. A child <Text> on a parent's surface3 is out of its
// reach, so that case stays a review rule in the README.
const ALLOWED = new Set((designContrast as readonly (readonly [string, string])[]).filter(([, bg]) => bg === "surface3").map(([fg]) => fg));

const SURFACE_3_BG = /backgroundColor\s*:\s*[\w.]*\.surface3\b/;
const TEXT_COLOUR = /(?<![\w-])color\s*:\s*[\w.]*\.([A-Za-z0-9]+)\b/g;

function surface3TextOffenders(text: string) {
  const offenders: string[] = [];
  for (const block of text.matchAll(/\{[^{}]*\}/g)) {
    if (!SURFACE_3_BG.test(block[0])) continue;
    for (const match of block[0].matchAll(TEXT_COLOUR)) {
      if (!ALLOWED.has(match[1]!)) offenders.push(`${match[1]}@${text.slice(0, block.index).split("\n").length}`);
    }
  }
  return offenders;
}

const appRoot = new URL("..", import.meta.url).pathname;

test("the token source allows only ink and ink2 as text on surface3", () => {
  assert.deepEqual([...ALLOWED].sort(), ["ink", "ink2"]);
});

test("no style object puts ink3Text, macaron or other light text on surface3", () => {
  const found: string[] = [];
  for (const root of ["src", "app"]) {
    for (const entry of readdirSync(join(appRoot, root), { recursive: true, withFileTypes: true })) {
      if (!entry.isFile() || !/\.tsx?$/.test(entry.name)) continue;
      const path = relative(appRoot, join(entry.parentPath, entry.name));
      if (path.startsWith("src/api/design/")) continue;
      for (const offender of surface3TextOffenders(readFileSync(join(appRoot, path), "utf8"))) found.push(`${path} ${offender}`);
    }
  }
  assert.deepEqual(found, []);
});

test("the scan catches a light text colour on surface3 and lets ink2 through", () => {
  assert.deepEqual(surface3TextOffenders("pill: { backgroundColor: colors.surface3, color: colors.ink3Text },"), ["ink3Text@1"]);
  assert.deepEqual(surface3TextOffenders("pill: { color: c.macBlueText, backgroundColor: c.surface3 },"), ["macBlueText@1"]);
  assert.deepEqual(surface3TextOffenders("pill: { backgroundColor: colors.surface3, color: colors.ink2 },"), []);
  assert.deepEqual(surface3TextOffenders("pill: { backgroundColor: colors.surface2, color: colors.ink3Text },"), []);
});
