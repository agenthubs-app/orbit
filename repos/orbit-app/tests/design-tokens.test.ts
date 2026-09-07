import assert from "node:assert/strict";
import test from "node:test";
import { colors, darkColors, radius, shadows, typography } from "../src/design/tokens";

function luminance(hex: string) {
  const [red = 0, green = 0, blue = 0] = [1, 3, 5].map((offset) => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}

test("both appearances keep body, secondary, semantic and action text readable", () => {
  for (const palette of [colors, darkColors]) {
    for (const [foreground, background] of [
      [palette.text, palette.bg],
      [palette.text2, palette.surface],
      [palette.text3, palette.surface2],
      [palette.accent, palette.accentSofter],
      [palette.accent, palette.accentSoft],
      [palette.onAccent, palette.accent],
      [palette.onAccent, palette.ink],
      [palette.onImage, "#171C2A"],
      [palette.imageBadgeText, "#FFFFFF"],
      [palette.rose, palette.roseSoft],
      [palette.live, palette.liveSoft],
      [palette.amber, palette.amberSoft],
      [palette.sky, palette.skySoft]
    ] as const) {
      const a = luminance(foreground);
      const b = luminance(background);
      assert.ok((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) >= 4.5,
        `${foreground} must be readable on ${background}`);
    }
  }
});

test("shared geometry keeps controls restrained and body copy readable", () => {
  assert.ok(radius.control <= radius.input);
  assert.ok(radius.input <= radius.card);
  assert.ok(typography.body >= 14);
  assert.ok(typography.display > typography.title);
  assert.ok(typography.title > typography.body);
});

test("mobile shadows use current React Native boxShadow tokens", () => {
  for (const shadow of [shadows.card, shadows.subtle]) {
    assert.ok("boxShadow" in shadow);
    assert.ok(!("shadowColor" in shadow));
    assert.ok(!("shadowOffset" in shadow));
    assert.ok(!("shadowOpacity" in shadow));
    assert.ok(!("shadowRadius" in shadow));
  }
});
