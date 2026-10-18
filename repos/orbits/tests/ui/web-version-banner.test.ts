import assert from "node:assert/strict";
import test from "node:test";

import { shouldShowWebVersionBanner } from "../../app/(app)/app/orbit-2026/auth-public/web-version-banner";

test("new-version banner requires both build IDs and compares identity, not SHA order", () => {
  const oldBuild = "ffffffffffffffffffffffffffffffffffffffff";
  const newBuild = "0000000000000000000000000000000000000001";
  assert.equal(shouldShowWebVersionBanner(oldBuild, { webBuildId: newBuild }), true);
  assert.equal(shouldShowWebVersionBanner(oldBuild, { webBuildId: oldBuild }), false);
  assert.equal(shouldShowWebVersionBanner(undefined, { webBuildId: newBuild }), false);
  assert.equal(shouldShowWebVersionBanner(oldBuild, {}), false);
  assert.equal(shouldShowWebVersionBanner(oldBuild, null), false);
});

test("dismissed build stays hidden until the announced build changes", () => {
  const current = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const dismissed = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
  assert.equal(shouldShowWebVersionBanner(current, { webBuildId: dismissed }, dismissed), false);
  assert.equal(shouldShowWebVersionBanner(current, { webBuildId: dismissed.toUpperCase() }, dismissed), false);
  assert.equal(shouldShowWebVersionBanner(current, { webBuildId: "cccccccccccccccccccccccccccccccccccccccc" }, dismissed), true);
});
