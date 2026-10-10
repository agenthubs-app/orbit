import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

// R06 gate (RD-18): the redesigned Web's CSS Modules only use design tokens —
// no literal colours (hex, rgb(), hsl(), named colours other than transparent /
// currentColor / inherit), stacking only through var(--z-*), radius and font size
// only through var(--r-*) / var(--fs-*). Covers orbit-2026 and the component showcase.
const ROOTS = ["app/(app)/app/orbit-2026", "app/showcase/components"];

function moduleCssFiles(): string[] {
  const files: string[] = [];
  for (const root of ROOTS) {
    for (const entry of readdirSync(root, { recursive: true, withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith(".module.css")) files.push(join(entry.parentPath, entry.name));
    }
  }
  return files.sort();
}

type Finding = { file: string; line: number; rule: string; text: string };

export function scanTokenCss(css: string, file = "x.module.css"): Finding[] {
  const findings: Finding[] = [];
  const lines = css.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, " ")).split("\n");
  lines.forEach((raw, index) => {
    const line = raw.trim();
    const push = (rule: string) => findings.push({ file, line: index + 1, rule, text: line });
    if (/#[0-9a-f]{3,8}\b/i.test(line)) push("hex colour");
    if (/\b(rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(/i.test(line)) push("colour function");
    for (const declaration of line.matchAll(/(?:^|[{;\s])([a-z-]+)\s*:\s*([^;{}]+)/gi)) {
      const property = declaration[1]!.toLowerCase();
      const value = declaration[2]!.trim();
      if (/^(color|background(-color)?|border(-[a-z]+)?-color|fill|stroke|outline-color)$/.test(property) && /\b(white|black|red|blue|green|gray|grey|orange|purple|pink|yellow)\b/i.test(value.replace(/var\([^)]*\)/g, ""))) push("named colour");
      if (property === "z-index" && !/^var\(--z-[a-z]+\)$/.test(value)) push("z-index without var(--z-*)");
      if (property === "border-radius" && !/^var\(--r-[a-z-]+\)$/.test(value)) push("radius without var(--r-*)");
      if (property === "font-size" && !/^var\(--fs-[a-z-]+\)$/.test(value)) push("font size without var(--fs-*)");
    }
  });
  return findings;
}

test("orbit-2026 CSS Modules use only design tokens for colour, stacking, radius and type size", () => {
  const files = moduleCssFiles();
  assert.ok(files.length >= 10, `${files.length} module files`);
  const findings = files.flatMap((file) => scanTokenCss(readFileSync(file, "utf8"), file)).map((finding) => `${finding.file}:${finding.line} ${finding.rule}: ${finding.text}`);
  assert.deepEqual(findings, []);
});

test("the scan catches what it must (injection samples)", () => {
  const rules = (css: string) => scanTokenCss(css).map((finding) => finding.rule);
  assert.deepEqual(rules(".a { color: #fff; }"), ["hex colour"]);
  assert.deepEqual(rules(".a { background: rgba(0, 0, 0, 0.2); }"), ["colour function"]);
  assert.deepEqual(rules(".a { color: white; }"), ["named colour"]);
  assert.deepEqual(rules(".a { z-index: 400; }"), ["z-index without var(--z-*)"]);
  assert.deepEqual(rules(".a { border-radius: 12px; }"), ["radius without var(--r-*)"]);
  assert.deepEqual(rules(".a { font-size: 13px; }"), ["font size without var(--fs-*)"]);
  assert.deepEqual(rules(".a { z-index: var(--z-modal); border-radius: var(--r-pill); font-size: var(--fs-meta); color: var(--ink); background: color-mix(in srgb, var(--ok) 45%, transparent); }"), []);
  assert.deepEqual(rules("/* #fff in a comment is fine */ .a { color: currentColor; }"), []);
});
