import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../../app/(app)/app/${path}`, import.meta.url), "utf8");
const require = createRequire(import.meta.url);
require.extensions[".css"] = (module) => { module.exports = {}; };

function redirectPath(error: unknown): string {
  const digest = typeof error === "object" && error !== null && "digest" in error ? String(error.digest) : "";
  assert.match(digest, /^NEXT_REDIRECT;replace;[^;]+;307;$/u);
  return digest.split(";")[2]!;
}

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

test("profile route executes legacy view and onboarding redirects with a safe next", async () => {
  const module = await import("../../app/(app)/app/profile/page");
  const page = (module.default as typeof module.default & { default?: typeof module.default }).default ?? module.default;
  for (const [query, destination] of [
    [{ view: "connect" }, "/app/settings/integrations"],
    [{ view: "persona" }, "/app/profile?edit=tags"],
    [{ view: "basic" }, "/app/profile?edit=card"],
    [{ onboarding: "1", next: "/app/events?tab=going" }, "/app/profile/onboarding?next=%2Fapp%2Fevents%3Ftab%3Dgoing"],
    [{ onboarding: "1", next: "https://evil.example" }, "/app/profile/onboarding?next=%2Fapp%2Fhome"],
  ] as const) {
    await assert.rejects(page({ searchParams: Promise.resolve(query) }), (error: unknown) => redirectPath(error) === destination);
  }
});

test("settings fallback executes only for deferred sections, not exact static routes", async () => {
  const module = await import("../../app/(app)/app/settings/[section]/page");
  const page = (module.default as typeof module.default & { default?: typeof module.default }).default ?? module.default;
  assert.equal((await page({ params: Promise.resolve({ section: "help" }) })).type.name, "AccountPreparingPage");
  for (const section of ["appearance", "integrations", "iorbit"]) {
    await assert.rejects(page({ params: Promise.resolve({ section }) }), (error: unknown) =>
      typeof error === "object" && error !== null && "digest" in error && error.digest === "NEXT_HTTP_ERROR_FALLBACK;404");
  }
});
