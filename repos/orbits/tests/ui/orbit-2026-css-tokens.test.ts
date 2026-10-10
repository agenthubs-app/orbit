import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

// R06 gate (RD-18): the redesigned Web's CSS Modules only use design tokens —
// no literal colours (hex, colour functions, CSS colour names, in any property or
// shorthand), stacking only through var(--z-*), radius (incl. longhands) only
// var(--r-*), type size (incl. the `font` shorthand) only var(--fs-*). Declarations
// are read across lines; `!important` is ignored. Covers orbit-2026 and the showcase.
const ROOTS = ["app/(app)/app/orbit-2026", "app/showcase/components"];

// All CSS named colours (CSS Color 4) except transparent / currentColor.
const COLOR_NAMES = "aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen".split(" ");
const COLOR_NAME = new RegExp(`(^|[\\s,(])(${COLOR_NAMES.join("|")})(?=$|[\\s,)])`, "i");
const COLOR_PROPS = /^(color|background|background-color|border|border-(top|right|bottom|left|block|inline)(-(start|end))?|border(-[a-z]+)?-color|outline|outline-color|box-shadow|text-shadow|fill|stroke|caret-color|column-rule|text-decoration(-color)?|accent-color)$/;

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
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, " "));
  const lineOf = (index: number) => clean.slice(0, index).split("\n").length;
  // Declarations: `property: value` up to ; or }, across lines, outside selectors.
  for (const match of clean.matchAll(/(?<=[{;]\s*)([a-z-]+)\s*:\s*([^;{}]+)/gi)) {
    const property = match[1]!.toLowerCase();
    const raw = match[2]!.trim();
    const value = raw.replace(/!important/i, "").trim();
    const push = (rule: string) => findings.push({ file, line: lineOf(match.index!), rule, text: `${property}: ${raw}` });
    const literal = value.replace(/var\([^)]*\)/g, "");
    if (/#[0-9a-f]{3,8}\b/i.test(value)) push("hex colour");
    if (/\b(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/i.test(literal)) push("colour function");
    if ((COLOR_PROPS.test(property) || property.startsWith("--")) && COLOR_NAME.test(literal)) push("named colour");
    if (property === "z-index" && !/^var\(--z-[a-z]+\)$/.test(value)) push("z-index without var(--z-*)");
    if (/^border(-(top|bottom|start|end)-(left|right|start|end))?-radius$/.test(property) && !/^var\(--r-[a-z-]+\)$/.test(value)) push("radius without var(--r-*)");
    if (property === "font-size" && !/^var\(--fs-[a-z-]+\)$/.test(value)) push("font size without var(--fs-*)");
    if (property === "font" && !/^inherit$/.test(value) && !/var\(--fs-[a-z-]+\)/.test(value)) push("font shorthand without var(--fs-*)");
  }
  return findings;
}

test("orbit-2026 CSS Modules use only design tokens for colour, stacking, radius and type size", () => {
  const files = moduleCssFiles();
  assert.ok(files.length >= 10, `${files.length} module files`);
  const findings = files.flatMap((file) => scanTokenCss(readFileSync(file, "utf8"), file)).map((finding) => `${finding.file}:${finding.line} ${finding.rule}: ${finding.text}`);
  assert.deepEqual(findings, []);
});

test("the scan catches what it must (injection samples, incl. the review's bypasses)", () => {
  const rules = (css: string) => scanTokenCss(css).map((finding) => finding.rule);
  assert.deepEqual(rules(".a { color: #fff; }"), ["hex colour"]);
  assert.deepEqual(rules(".a { background: rgba(0, 0, 0, 0.2); }"), ["colour function"]);
  assert.deepEqual(rules(".a { color: white; }"), ["named colour"]);
  assert.deepEqual(rules(".a { color: navy; }"), ["named colour"]);
  assert.deepEqual(rules(".a { border: 1px solid red; }"), ["named colour"]);
  assert.deepEqual(rules(".a { outline: 2px solid black; }"), ["named colour"]);
  assert.deepEqual(rules(".a { box-shadow: 0 1px 2px gray; }"), ["named colour"]);
  assert.deepEqual(rules(".a {\n  color:\n    teal;\n}"), ["named colour"]);
  assert.deepEqual(rules(".a { z-index: 400; }"), ["z-index without var(--z-*)"]);
  assert.deepEqual(rules(".a { border-radius: 12px; }"), ["radius without var(--r-*)"]);
  assert.deepEqual(rules(".a { border-top-left-radius: 12px; }"), ["radius without var(--r-*)"]);
  assert.deepEqual(rules(".a { font-size: 13px; }"), ["font size without var(--fs-*)"]);
  assert.deepEqual(rules(".a { font: 700 13px/1.4 sans-serif; }"), ["font shorthand without var(--fs-*)"]);
  // Legal token use, also with !important, transparent and currentColor.
  assert.deepEqual(rules(".a { z-index: var(--z-modal) !important; border-radius: var(--r-pill); font-size: var(--fs-meta) !important; color: var(--ink); background: color-mix(in srgb, var(--ok) 45%, transparent); border: 1px solid currentColor; font: inherit; }"), []);
  assert.deepEqual(rules("/* #fff and red in a comment are fine */ .a { color: currentColor; }"), []);
  assert.deepEqual(rules(".a { animation: shimmer var(--dur-shimmer) linear infinite; grid-template-areas: \"tan\"; }"), [], "colour names only matter in colour properties");
});
