import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

// R01 review M1: --surface-3 is the design's track / divider / skeleton fill and
// carries no body text (shared/design/README.md). Only the foregrounds the
// source lists against surface-3 in color.contrast (ink, ink-2) may sit on it.
//
// The scan is per declaration block: a CSS rule body or a JS style object that
// sets a --surface-3 background and also a text colour. It cannot follow the
// cascade (a child element's colour on a parent's surface-3), so that case stays
// a review rule in the README.
const { color } = JSON.parse(readFileSync("shared/design/tokens.json", "utf8")) as { color: { contrast: [string, string][] } };
const ALLOWED = new Set(color.contrast.filter(([, bg]) => bg === "surface-3").map(([fg]) => fg));

const ROOTS = ["app", "features", "shared"];
const EXTRA = ["public/orbit-reference/orbit-reference.generated.css"];

// Blocks the scan cannot judge on their own. Each one must still exist (so the
// list only shrinks) and names what makes it readable.
const KNOWN: { file: string; selector: string; reason: string; override: RegExp }[] = [
  {
    file: "public/orbit-reference/orbit-reference.generated.css",
    selector: ".badge-ended",
    reason: "prototype stylesheet (rebuilt by scripts/build-reference-css.mjs); the product overrides the text to ink-2",
    override: /\[data-orbit-real-page\] \.badge-ended \{ color: var\(--ink-2\); \}/,
  },
];
const OVERRIDES_FILE = "app/(app)/app/orbit-reference-styles.tsx";

const SURFACE_3_BG = /background(?:-color|Color)?\s*:\s*"?var\(--surface-3\)"?/;
const TEXT_COLOUR = /(?<![\w-])color\s*:\s*"?var\(--([\w-]+)\)"?/g;

function surface3TextOffenders(text: string) {
  const offenders: { selector: string; foreground: string; line: number }[] = [];
  for (const block of text.matchAll(/\{[^{}]*\}/g)) {
    if (!SURFACE_3_BG.test(block[0])) continue;
    const before = text.slice(0, block.index);
    const selector = before.slice(Math.max(before.lastIndexOf("}"), before.lastIndexOf(";"), before.lastIndexOf("\n")) + 1).trim();
    // WCAG 1.4.3 exempts inactive controls; disabled buttons also fade to 0.45.
    if (/disabled/.test(selector)) continue;
    for (const match of block[0].matchAll(TEXT_COLOUR)) {
      if (!ALLOWED.has(match[1]!)) offenders.push({ selector, foreground: match[1]!, line: before.split("\n").length });
    }
  }
  return offenders;
}

function productFiles() {
  const files = [...EXTRA];
  for (const root of ROOTS) {
    for (const entry of readdirSync(root, { recursive: true, withFileTypes: true })) {
      if (!entry.isFile() || !/\.(tsx?|css)$/.test(entry.name)) continue;
      const path = join(entry.parentPath, entry.name);
      if (path.startsWith("app/dev/") || path === "app/(app)/app/orbit-2026/tokens.css") continue;
      files.push(path);
    }
  }
  return files;
}

test("the source allows only ink and ink-2 as text on surface-3", () => {
  assert.deepEqual([...ALLOWED].sort(), ["ink", "ink-2"]);
});

test("no product style puts ink-3-text, macaron or other light text on surface-3", () => {
  const found: string[] = [];
  const known = new Set<string>();
  for (const path of productFiles()) {
    for (const offender of surface3TextOffenders(readFileSync(path, "utf8"))) {
      const entry = KNOWN.find((item) => item.file === path && offender.selector.endsWith(item.selector));
      if (entry) known.add(`${entry.file}|${entry.selector}`);
      else found.push(`${path}:${offender.line} ${offender.selector} → --${offender.foreground}`);
    }
  }
  assert.deepEqual(found, []);
  for (const entry of KNOWN) {
    assert.ok(known.has(`${entry.file}|${entry.selector}`), `${entry.file} ${entry.selector} is fixed; drop it from KNOWN`);
    assert.match(readFileSync(OVERRIDES_FILE, "utf8"), entry.override, `${entry.selector}: ${entry.reason}`);
  }
});

test("the scan catches CSS rules and inline style objects, and skips disabled controls", () => {
  assert.deepEqual(surface3TextOffenders(".x { background: var(--surface-3); color: var(--ink-3-text); }").map((o) => o.foreground), ["ink-3-text"]);
  assert.deepEqual(surface3TextOffenders('<span style={{ background: "var(--surface-3)", color: "var(--mac-blue-text)" }} />').map((o) => o.foreground), ["mac-blue-text"]);
  assert.deepEqual(surface3TextOffenders(".x { background-color: var(--surface-3); color: var(--ink-2); }"), []);
  assert.deepEqual(surface3TextOffenders(".btn[disabled] { background: var(--surface-3); color: var(--ink-3-text); }"), []);
  assert.deepEqual(surface3TextOffenders(".x { background: var(--surface-2); color: var(--ink-3-text); }"), []);
});
