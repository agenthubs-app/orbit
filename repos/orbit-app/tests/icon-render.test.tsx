import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { Appearance } from "react-native";

import { designIconNames, designIcons, designIconSpec } from "../src/api/design/icons";
import { Icon } from "../src/components/ui/Icon";
import { colors, darkColors } from "../src/design/tokens";
import { renderToHtml } from "./helpers/render";

// R02: the App <Icon> draws the generated shapes with the kit's stroke spec.
function luminance(hex: string) {
  const [red = 0, green = 0, blue = 0] = [1, 3, 5].map((offset) => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}
const contrast = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
const svgAttributes = (html: string) => html.match(/<svg([^>]*)>/u)?.[1] ?? "";

test("every icon renders its shapes with viewBox 0 0 24 24, stroke 1.7, round caps, no fill", () => {
  assert.ok(designIconNames.length >= 53);
  for (const name of designIconNames) {
    const html = renderToHtml(<Icon name={name} />);
    const svg = svgAttributes(html);
    assert.match(svg, /viewBox="0 0 24 24"/u, name);
    assert.match(svg, /stroke-width="1.7"|strokeWidth="1.7"/u, name);
    assert.match(svg, /stroke-linecap="round"|strokeLinecap="round"/u, name);
    assert.match(svg, /fill="none"/u, name);
    assert.match(svg, /width="20"/u, `${name}: default size 20`);
    const shapes = html.match(/<(path|circle|rect)\b/gu) ?? [];
    assert.equal(shapes.length, designIcons[name].length, `${name} draws every shape`);
  }
  assert.equal(designIconSpec.strokeWidth, 1.7);
});

test("sizes follow the kit: 16, 20, 21, 24", () => {
  for (const size of designIconSpec.sizes) {
    assert.match(svgAttributes(renderToHtml(<Icon name="home" size={size} />)), new RegExp(`width="${size}"[^>]*height="${size}"|height="${size}"[^>]*width="${size}"`, "u"));
  }
});

test("solid dots (target, more, nfc, list) take the icon colour and stay visible in dark", (t) => {
  t.mock.method(Appearance, "getColorScheme", () => "dark");
  for (const name of ["target", "more", "nfc", "list"] as const) {
    const html = renderToHtml(<Icon name={name} />);
    assert.match(svgAttributes(html), new RegExp(`stroke="${darkColors.ink}"`, "u"), `${name}: default colour is the dark theme ink`);
    const solid = html.match(/<circle[^>]*fill="([^"]+)"/gu) ?? [];
    assert.ok(solid.length > 0, `${name} has solid dots`);
    for (const dot of solid) assert.match(dot, new RegExp(`fill="${darkColors.ink}"`, "u"), `${name}: dot fill follows the colour`);
  }
  // graphics need 3:1 against the surface (WCAG 1.4.11)
  assert.ok(contrast(darkColors.ink, darkColors.bg) >= 3);
  assert.ok(contrast(darkColors.ink, darkColors.surface) >= 3);
});

test("the default colour is the theme's ink; a passed colour wins", (t) => {
  t.mock.method(Appearance, "getColorScheme", () => "light");
  assert.match(svgAttributes(renderToHtml(<Icon name="bell" />)), new RegExp(`stroke="${colors.ink}"`, "u"));
  const html = renderToHtml(<Icon name="dot" color={colors.coral} />);
  assert.match(svgAttributes(html), new RegExp(`stroke="${colors.coral}"`, "u"));
  assert.match(html, new RegExp(`<circle[^>]*fill="${colors.coral}"`, "u"));
});

test("decorative icons are hidden from assistive tech; a labelled icon is an image with that label", () => {
  const decorative = svgAttributes(renderToHtml(<Icon name="search" />));
  assert.match(decorative, /aria-hidden="true"/u);
  assert.doesNotMatch(decorative, /aria-label=/u);
  const labelled = svgAttributes(renderToHtml(<Icon name="x" accessibilityLabel="閉じる" />));
  assert.match(labelled, /aria-label="閉じる"/u);
  assert.match(labelled, /role="img"/u);
  assert.doesNotMatch(labelled, /aria-hidden="true"/u);
});

test("the ticket's dashed tear line keeps its dash pattern", () => {
  assert.match(renderToHtml(<Icon name="ticket" />), /stroke-dasharray="2 2"|strokeDasharray="2 2"/u);
});
