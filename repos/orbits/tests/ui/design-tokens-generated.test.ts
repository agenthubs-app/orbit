import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DESIGN_TOKEN_OUTPUTS, camelTokenName, renderDesignTokenOutputs } from "../../scripts/design-tokens/generate.mjs";

type Tokens = {
  color: {
    usage: Record<string, string>;
    light: Record<string, string>;
    dark: Record<string, string>;
    contrast: [string, string][];
  };
  radius: Record<string, number>;
  font: { family: Record<string, string>; size: Record<string, number> };
  motion: { ease: string; duration: Record<string, number> };
};

const tokens = JSON.parse(readFileSync("shared/design/tokens.json", "utf8")) as Tokens;
const outputs = renderDesignTokenOutputs(tokens) as Record<string, string>;

function luminance(hex: string) {
  const channels = [1, 3, 5].map((offset) => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
}

function contrast(a: string, b: string) {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

// The design kit's own colour list (kit/tokens.css + ui.css scrim). The source
// must carry every one of them, under the design's name, in both themes.
const DESIGN_KIT_COLORS = [
  "bg", "fog-a", "fog-b", "fog-c", "surface", "surface-2", "surface-3", "line", "glass", "glass-line",
  "ink", "ink-2", "ink-3", "ink-4",
  "plum-900", "plum-700", "plum-500", "plum-300", "plum-100",
  "rose-700", "rose-500", "rose-300", "rose-100",
  "accent", "accent-soft", "on-accent",
  "mac-pink", "mac-apricot", "mac-blue", "mac-teal", "mac-lav",
  "mac-pink-ink", "mac-apricot-ink", "mac-blue-ink", "mac-teal-ink", "mac-lav-ink",
  "coral", "coral-soft", "ok", "scrim", "scrim-web",
];

test("the token source carries every design-kit colour in both themes, each with a stated use", () => {
  const light = Object.keys(tokens.color.light);
  assert.deepEqual(Object.keys(tokens.color.dark), light, "light and dark must declare the same colours in the same order");
  assert.deepEqual(Object.keys(tokens.color.usage), light, "every colour needs a usage note");
  for (const name of DESIGN_KIT_COLORS) assert.ok(light.includes(name), `missing design colour ${name}`);
  for (const [name, use] of Object.entries(tokens.color.usage)) assert.ok(use.trim().length > 0, `${name} has an empty usage note`);
});

test("every text colour clears 4.5:1 on the surfaces it is used on, in light and dark", () => {
  for (const theme of ["light", "dark"] as const) {
    const palette = tokens.color[theme];
    for (const [fg, bg] of tokens.color.contrast) {
      const a = fg.startsWith("#") ? fg : palette[fg];
      const b = bg.startsWith("#") ? bg : palette[bg];
      assert.ok(a && b, `${theme}: unknown pair ${fg} / ${bg}`);
      assert.ok(contrast(a, b) >= 4.5, `${theme}: ${fg} ${a} on ${bg} ${b} is ${contrast(a, b).toFixed(2)}:1`);
    }
  }
});

test("the contrast list covers every text variant and every macaron pair", () => {
  const pairs = new Set(tokens.color.contrast.map(([fg, bg]) => `${fg}|${bg}`));
  const textColours = Object.keys(tokens.color.light).filter((name) => name.endsWith("-text"));
  assert.ok(textColours.length >= 9);
  for (const name of textColours) assert.ok([...pairs].some((pair) => pair.startsWith(`${name}|`)), `${name} is never contrast-checked`);
  for (const mac of ["pink", "apricot", "blue", "teal", "lav"]) assert.ok(pairs.has(`mac-${mac}-text|mac-${mac}`));
  for (const fg of ["ink", "ink-2", "ink-3-text"]) {
    for (const bg of ["bg", "surface", "surface-2"]) assert.ok(pairs.has(`${fg}|${bg}`), `${fg} on ${bg} not checked`);
  }
  assert.ok(pairs.has("on-accent|accent"));
  assert.ok(pairs.has("coral-text|coral-soft"));
  assert.ok(pairs.has("on-ok|ok"));
});

test("surface-3 is a track / divider / skeleton fill: only ink and ink-2 may sit on it as text", () => {
  // R01 review M1: the design names surface-3 "轨道 / 分隔"; it never carries body text.
  const onSurface3 = tokens.color.contrast.filter(([, bg]) => bg === "surface-3").map(([fg]) => fg).sort();
  assert.deepEqual(onSurface3, ["ink", "ink-2"]);
});

test("the TS output carries the one contrast list, camelCased, for the App's contrast test", () => {
  // R01 review M6: one list in tokens.json; the App reads it from the synced copy.
  const ts = outputs["shared/design/tokens.ts"]!;
  const expected = tokens.color.contrast.map(([fg, bg]) => [fg.startsWith("#") ? fg : camelTokenName(fg), bg.startsWith("#") ? bg : camelTokenName(bg)]);
  const match = ts.match(/export const designContrast = (\[[\s\S]*?\]) as const;/);
  assert.ok(match, "designContrast missing from shared/design/tokens.ts");
  assert.deepEqual(JSON.parse(match[1]!), expected);
  assert.ok(expected.some(([fg, bg]) => fg === "ink2" && bg === "surface3"));
});

test("radius, type and motion scales are the ones the plan fixed", () => {
  // R06 added menu 18 (context menu), tile 16 (mac tiles, steps) and tag 6 (key caps, sample tags).
  assert.deepEqual(tokens.radius, { xl: 24, lg: 20, md: 14, sm: 10, sheet: 34, dialog: 28, "card-web": 22, bubble: 18, pill: 999, menu: 18, tile: 16, tag: 6 });
  assert.deepEqual(Object.keys(tokens.font.family), ["ja", "zh", "en", "num"]);
  assert.ok(!JSON.stringify(tokens.font.family).includes("Serif"), "no serif face in any stack (RD-09)");
  assert.match(tokens.font.family.ja!, /^"Hiragino Sans"/);
  assert.match(tokens.font.family.zh!, /^"PingFang SC"/);
  for (const key of ["press", "expand", "swipe", "count", "enter", "sheet", "dialog", "toast-in", "toast-out"]) {
    assert.equal(typeof tokens.motion.duration[key], "number", `motion.duration.${key}`);
  }
});

test("generated files are byte-identical to what the source renders (no hand edits)", () => {
  assert.deepEqual(Object.keys(outputs).sort(), [...DESIGN_TOKEN_OUTPUTS].sort());
  for (const [path, content] of Object.entries(outputs)) {
    assert.equal(readFileSync(path, "utf8"), content, `${path} is stale or hand-edited; run npm run design:tokens`);
    assert.match(content.split("\n")[0]!, /由 shared\/design\/tokens\.json 生成，禁止手改/);
  }
});

test("rendering is deterministic: two runs produce the same bytes", () => {
  assert.deepEqual(renderDesignTokenOutputs(tokens), outputs);
});

test("the TS output is import-free constants with camelCase names", () => {
  const ts = outputs["shared/design/tokens.ts"]!;
  assert.doesNotMatch(ts, /^\s*import\s/m);
  assert.match(ts, /export const designColors = \{/);
  assert.match(ts, /ink3Text: "#6F6778"/);
  assert.match(ts, /macPinkText:/);
  assert.match(ts, /plum700:/);
  assert.doesNotMatch(ts, /"[a-z]+-[a-z0-9-]+":/, "keys must be camelCase, not kebab-case");
});

test("the CSS output follows the system theme until the user picks one", () => {
  const css = outputs["app/(app)/app/orbit-2026/tokens.css"]!;
  const light = css.slice(css.indexOf(":root {"));
  assert.match(light, /--ink-3-text: #6F6778;/);
  assert.match(css, /@media \(prefers-color-scheme: dark\) \{\s*:root:not\(\[data-theme="light"\]\) \{[^}]*--ink-3-text: #9A959F;/);
  assert.match(css, /:root\[data-theme="dark"\] \{[^}]*--bg: #19181C;/);
  assert.match(css, /--r-card-web: 22px;/);
  assert.match(css, /--font: var\(--font-ja\);/);
  assert.match(css, /:root:lang\(zh\) \{\s*--font: var\(--font-zh\);/);
  assert.match(css, /:root:lang\(en\) \{\s*--font: var\(--font-en\);/);
  assert.doesNotMatch(css, /Serif/);
});
