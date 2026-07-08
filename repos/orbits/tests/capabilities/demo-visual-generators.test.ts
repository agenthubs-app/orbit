import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveAnimatedAvatar,
  resolveEventCover,
} from "../../shared/demo-visual-generators";

function decode(src: string): string {
  assert.match(src, /^data:image\/svg\+xml,/);
  return decodeURIComponent(src.replace(/^data:image\/svg\+xml,/, ""));
}

test("event cover picks a distinct palette per category", () => {
  const finance = resolveEventCover({ industry: "Finance", name: "IPO Forum" });
  const tech = resolveEventCover({ industry: "SaaS", name: "AI Builders" });

  assert.equal(finance.generated, true);
  assert.equal(tech.generated, true);
  assert.notEqual(finance.src, tech.src);
  assert.match(decode(finance.src), /#0b3d5c/); // finance gradient anchor
  assert.match(decode(tech.src), /#6359e9/); // technology gradient anchor
});

test("event cover is deterministic for the same input", () => {
  const a = resolveEventCover({ industry: "Consumer", tags: ["retail"], name: "D2C Night" });
  const b = resolveEventCover({ industry: "Consumer", tags: ["retail"], name: "D2C Night" });
  assert.equal(a.src, b.src);
});

test("event cover falls back to the default theme when nothing is known", () => {
  const cover = resolveEventCover({});
  assert.equal(cover.generated, true);
  const svg = decode(cover.src);
  assert.match(svg, /<svg/);
  assert.match(svg, /viewBox='0 0 1200 480'/);
});

test("animated avatar is animated, deterministic and carries initials", () => {
  const first = resolveAnimatedAvatar({ displayName: "Mina Tanaka" });
  const second = resolveAnimatedAvatar({ displayName: "Mina Tanaka" });

  assert.equal(first.animated, true);
  assert.equal(first.generated, true);
  assert.equal(first.src, second.src);

  const svg = decode(first.src);
  assert.match(svg, /animateTransform/);
  assert.match(svg, /type='rotate'/);
  assert.match(svg, />MT</); // initials from first+last name
});

test("animated avatar uses a single leading glyph for CJK names", () => {
  const svg = decode(resolveAnimatedAvatar({ displayName: "山田 健太" }).src);
  assert.match(svg, />山</);
});

test("animated avatar tolerates fully sparse input", () => {
  const avatar = resolveAnimatedAvatar({});
  assert.equal(avatar.animated, true);
  assert.match(decode(avatar.src), />·</);
});
