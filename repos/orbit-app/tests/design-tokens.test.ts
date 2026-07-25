import assert from "node:assert/strict";
import test from "node:test";
import { colors, radius, shadows, typography } from "../src/design/tokens";

test("mobile design tokens track the web Orbit reference defaults", () => {
  assert.equal(colors.accent, "#6359E9");
  assert.equal(colors.accentSoft, "#EEEDFC");
  assert.equal(colors.accentSofter, "#F6F5FD");
  assert.equal(colors.bgSoft, "#F6F6F8");
  assert.equal(colors.surface, "#FFFFFF");
  assert.equal(colors.border, "#ECECEF");
  assert.equal(colors.text3, "#73737B");
  assert.equal(radius.card, 18);
  assert.equal(radius.control, 10);
  assert.equal(typography.display, 24);
  assert.equal(typography.title, 20);
  assert.equal(typography.body, 15);
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
