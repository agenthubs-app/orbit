import assert from "node:assert/strict";
import test from "node:test";
import { designContrast } from "../src/api/design/tokens";
import { colors, darkColors, radius, shadows, textStyles, typography, type OrbitColors } from "../src/design/tokens";

function luminance(hex: string) {
  const [red = 0, green = 0, blue = 0] = [1, 3, 5].map((offset) => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}

function contrast(a: string, b: string) {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

type Key = keyof OrbitColors;

// R01 / RD-05: every colour the App uses for text, on every surface it sits on.
// The pairs come from the one list in orbits/shared/design/tokens.json
// (color.contrast), synced here as designContrast (R01 review M6). The raw
// design values (ink3, ink4, accent, mac*Ink, coral, ok) are for icons and
// decoration only, so they never appear as a foreground.
const pairs = designContrast as readonly (readonly [string, string])[];
const value = (palette: OrbitColors, name: string) => (name.startsWith("#") ? name : palette[name as Key]);

for (const [name, palette] of [["light", colors], ["dark", darkColors]] as const) {
  test(`${name}: every text colour clears 4.5:1 on each surface it is used on`, () => {
    for (const [foreground, background] of pairs) {
      const fg = value(palette, foreground);
      const bg = value(palette, background);
      assert.ok(fg && bg, `${name}: unknown pair ${foreground} / ${background}`);
      const ratio = contrast(fg, bg);
      assert.ok(ratio >= 4.5, `${foreground} ${fg} on ${background} ${bg} is ${ratio.toFixed(2)}:1`);
    }
  });
}

test("every *Text variant is contrast-checked", () => {
  const checked = new Set(pairs.map(([foreground]) => foreground));
  for (const key of Object.keys(colors) as Key[]) {
    if (key.endsWith("Text")) assert.ok(checked.has(key), `${key} is never checked`);
  }
  for (const pair of ["onAccent|ink", "onImage|#171C2A", "onImageBadge|#FFFFFF", "ink2|surface3"]) {
    assert.ok(pairs.some(([fg, bg]) => `${fg}|${bg}` === pair), `${pair} not checked`);
  }
});

test("geometry and type follow the design scale", () => {
  assert.deepEqual(
    { xl: radius.xl, lg: radius.lg, md: radius.md, sm: radius.sm, sheet: radius.sheet, dialog: radius.dialog, pill: radius.pill },
    { xl: 24, lg: 20, md: 14, sm: 10, sheet: 34, dialog: 28, pill: 999 },
  );
  assert.ok(typography.body >= 14);
  assert.ok(typography.title > typography.titleSm);
  assert.ok(typography.titleSm > typography.body);
  assert.equal(textStyles.pageTitle.fontSize, typography.title);
  assert.equal(textStyles.body.fontSize, typography.body);
});

test("mobile shadows use current React Native boxShadow tokens", () => {
  for (const shadow of [shadows.card, shadows.subtle, shadows.float, shadows.floatDark]) {
    assert.ok("boxShadow" in shadow);
    assert.ok(!("shadowColor" in shadow));
    assert.ok(!("shadowOffset" in shadow));
    assert.ok(!("shadowOpacity" in shadow));
    assert.ok(!("shadowRadius" in shadow));
  }
});
