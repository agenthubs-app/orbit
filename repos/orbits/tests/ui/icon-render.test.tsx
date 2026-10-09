import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { Icon } from "../../app/(app)/app/orbit-2026/ui/Icon";
import { designIconNames, designIcons, designIconSpec } from "../../shared/design/icons";

// R02: the Web <Icon> draws the generated shapes inline with the kit's stroke spec.
const svg = (html: string) => html.match(/<svg([^>]*)>/u)?.[1] ?? "";

test("every icon renders its shapes with viewBox 0 0 24 24, stroke 1.7, round caps, no fill", () => {
  for (const name of designIconNames) {
    const html = renderToStaticMarkup(<Icon name={name} />);
    const attributes = svg(html);
    assert.match(attributes, /viewBox="0 0 24 24"/u, name);
    assert.match(attributes, /stroke-width="1.7"/u, name);
    assert.match(attributes, /stroke-linecap="round"/u, name);
    assert.match(attributes, /stroke-linejoin="round"/u, name);
    assert.match(attributes, /fill="none"/u, name);
    assert.match(attributes, /width="20" height="20"/u, `${name}: default size 20`);
    assert.equal((html.match(/<(path|circle|rect)\b/gu) ?? []).length, designIcons[name].length, `${name} draws every shape`);
  }
});

test("sizes follow the kit: 16, 20, 21, 24", () => {
  for (const size of designIconSpec.sizes) assert.match(svg(renderToStaticMarkup(<Icon name="home" size={size} />)), new RegExp(`width="${size}" height="${size}"`, "u"));
});

test("the colour defaults to the surrounding text colour; solid dots follow it, so they show in dark too", () => {
  assert.match(svg(renderToStaticMarkup(<Icon name="bell" />)), /stroke="currentColor"/u);
  for (const name of ["target", "more", "nfc", "list"] as const) {
    const html = renderToStaticMarkup(<Icon name={name} />);
    const dots = html.match(/<circle[^>]*fill="[^"]+"/gu) ?? [];
    assert.ok(dots.length > 0, `${name} has solid dots`);
    for (const dot of dots) assert.match(dot, /fill="currentColor"/u, `${name}: dot follows the text colour`);
  }
  assert.match(svg(renderToStaticMarkup(<Icon name="bell" color="var(--accent)" />)), /stroke="var\(--accent\)"/u);
  // a passed colour tints the dots too, not just the strokes
  assert.match(renderToStaticMarkup(<Icon name="more" color="var(--coral)" />), /<circle[^>]*fill="var\(--coral\)"/u);
});

test("decorative icons are hidden from assistive tech; a labelled icon is an image with that label", () => {
  const decorative = svg(renderToStaticMarkup(<Icon name="search" />));
  assert.match(decorative, /aria-hidden="true"/u);
  assert.doesNotMatch(decorative, /aria-label=|role=/u);
  const labelled = svg(renderToStaticMarkup(<Icon name="x" accessibilityLabel="閉じる" />));
  assert.match(labelled, /role="img"/u);
  assert.match(labelled, /aria-label="閉じる"/u);
  assert.doesNotMatch(labelled, /aria-hidden/u);
  assert.doesNotMatch(labelled, /focusable="true"/u);
});

test("the ticket's dashed tear line keeps its dash pattern", () => {
  assert.match(renderToStaticMarkup(<Icon name="ticket" />), /stroke-dasharray="2 2"/u);
});
