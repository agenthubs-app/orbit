import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../../app/(app)/app/${path}`, import.meta.url), "utf8");

test("profile and settings routes use the new account surface and preserve legacy view redirects", () => {
  const profile = read("profile/page.tsx");
  const settings = read("settings/page.tsx");
  assert.match(profile, /AccountProfilePage/);
  assert.match(profile, /profileLegacyDestination/);
  assert.match(profile, /redirect\(/);
  assert.match(settings, /AccountProfilePage/);
  assert.doesNotMatch(profile, /ProfileScreens/);
  assert.doesNotMatch(settings, /ProfileScreens/);
});
