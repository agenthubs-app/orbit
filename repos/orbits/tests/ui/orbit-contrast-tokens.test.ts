/**
 * WCAG contrast gate for the product palette (R01 / RD-05, SC-R01-03).
 *
 * Reads the stylesheet the browser actually receives —
 * app/(app)/app/orbit-2026/tokens.css, generated from shared/design/tokens.json —
 * and checks every text colour against every surface it is used on, in the
 * light (:root) and dark ([data-theme="dark"]) blocks. The raw design values
 * (ink-3, ink-4, accent, mac-*-ink, coral, ok) are decoration-only and are
 * deliberately absent from the foreground list.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const AA_TEXT = 4.5;
const css = readFileSync("app/(app)/app/orbit-2026/tokens.css", "utf8");

function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  assert.notEqual(start, -1, `${selector} block missing from tokens.css`);
  const body = css.slice(css.indexOf("{", start) + 1, css.indexOf("}", start));
  return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((match) => [match[1], match[2]!.trim()]));
}

function luminance(hex: string) {
  const channels = [1, 3, 5].map((offset) => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
}

function contrastRatio(a: string, b: string) {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

const TEXT_ON_SURFACE: [string, string[]][] = [
  ["ink", ["bg", "surface", "surface-2"]],
  ["ink-2", ["bg", "surface", "surface-2"]],
  ["ink-3-text", ["bg", "surface", "surface-2"]],
  ["accent-text", ["bg", "surface", "surface-2", "accent-soft"]],
  ["on-accent", ["accent", "accent-text", "ink", "coral-text"]],
  ["mac-pink-text", ["mac-pink", "surface"]],
  ["mac-apricot-text", ["mac-apricot", "surface"]],
  ["mac-blue-text", ["mac-blue", "surface"]],
  ["mac-teal-text", ["mac-teal", "surface"]],
  ["mac-lav-text", ["mac-lav", "surface"]],
  ["coral-text", ["coral-soft", "bg", "surface", "surface-2"]],
  ["ok-text", ["ok-soft", "bg", "surface", "surface-2"]],
  ["on-ok", ["ok"]],
];

for (const [themeName, palette] of [
  ["light", block(":root")],
  ["dark", block(':root[data-theme="dark"]')],
] as const) {
  test(`${themeName}: every text colour reads at >=4.5:1 on each surface it is used on`, () => {
    for (const [foreground, backgrounds] of TEXT_ON_SURFACE) {
      for (const background of backgrounds) {
        const fg = palette[foreground];
        const bg = palette[background];
        assert.ok(fg && bg, `${themeName}: --${foreground} / --${background} missing`);
        const ratio = contrastRatio(fg, bg);
        assert.ok(ratio >= AA_TEXT, `${themeName} --${foreground} ${fg} vs --${background} ${bg} = ${ratio.toFixed(2)}, need >= ${AA_TEXT}`);
      }
    }
  });
}

test("the system-dark fallback block carries the same dark values", () => {
  const media = css.slice(css.indexOf("@media (prefers-color-scheme: dark)"));
  const fallback = Object.fromEntries([...media.slice(0, media.indexOf("}\n}")).matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2]!.trim()]));
  assert.deepEqual(fallback, block(':root[data-theme="dark"]'));
});

test("every *-text variant in the palette is checked", () => {
  const checked = new Set(TEXT_ON_SURFACE.map(([foreground]) => foreground));
  for (const name of Object.keys(block(":root"))) {
    if (name.endsWith("-text")) assert.ok(checked.has(name), `--${name} is never checked`);
  }
});
