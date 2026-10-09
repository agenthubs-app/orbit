import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";

// R01 / RD-06 (SC-R01-04): the App speaks only the design's names. The old
// palette keys, radius and type names come from the confirmed mapping
// (docs/designs/redesign-2026-10/sprints/R01-design-tokens/color-mapping.md).
// TypeScript already rejects them on the theme object; this scan also catches
// them in untyped places (string keys, comments that drive codegen, JSX props).
const OLD_COLOR_KEYS = [
  "accentHover", "accentPress", "accentRing", "accentSofter", "amber", "amberSoft", "bgSoft", "bgSunken",
  "border", "border2", "borderStrong", "canvas", "caution", "hairline", "live", "liveSoft", "muted",
  "imageBadgeText", "rose", "roseSoft", "sky", "skySoft", "text", "text2", "text3", "text4", "tint",
];
const OLD_RADIUS = ["card", "control", "input", "xs"];
const OLD_TYPE = ["display", "section", "small", "caption"];

// Colours that must stay fixed regardless of theme; each is listed in the R01 REPORT.
const FIXED_COLOUR_FILES = new Map([
  ["src/screens/events/EventExperienceContent.tsx", "organiser-chosen event accent colours are stored event data"],
  ["src/api/batch-image-compressor.web.ts", "JPEG canvas needs an opaque white background"],
]);

const appRoot = new URL("..", import.meta.url).pathname;

function sourceFiles() {
  const files: string[] = [];
  for (const root of ["src", "app"]) {
    for (const entry of readdirSync(join(appRoot, root), { recursive: true, withFileTypes: true })) {
      if (!entry.isFile() || !/\.tsx?$/.test(entry.name)) continue;
      const path = relative(appRoot, join(entry.parentPath, entry.name));
      // The generated design copy is the one place raw values live.
      if (path.startsWith("src/api/design/")) continue;
      files.push(path);
    }
  }
  return files;
}

test("no source file reads an old palette, radius or type name", () => {
  const colour = new RegExp(`\\b(?:colors|palette|themeColors)\\.(?:${OLD_COLOR_KEYS.join("|")})\\b`, "g");
  const shape = new RegExp(`\\bradius\\.(?:${OLD_RADIUS.join("|")})\\b|\\btypography\\.(?:${OLD_TYPE.join("|")})\\b`, "g");
  const offenders: string[] = [];
  for (const path of sourceFiles()) {
    const text = readFileSync(join(appRoot, path), "utf8");
    for (const match of [...text.matchAll(colour), ...text.matchAll(shape)]) offenders.push(`${path}: ${match[0]}`);
  }
  assert.deepEqual(offenders, []);
});

test("colours come from tokens, not literals, outside the listed fixed-colour files", () => {
  const literal = /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b|rgba?\(/g;
  const offenders: string[] = [];
  for (const path of sourceFiles()) {
    if (path === "src/design/tokens.ts" || FIXED_COLOUR_FILES.has(path)) continue;
    const text = readFileSync(join(appRoot, path), "utf8");
    for (const match of text.matchAll(literal)) offenders.push(`${path}: ${match[0]}`);
  }
  assert.deepEqual(offenders, []);
});
