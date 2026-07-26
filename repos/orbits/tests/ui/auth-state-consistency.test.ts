import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

function source(path: string): string {
  return readFileSync(join(projectRoot, path), "utf8");
}

test("proxy protects personal routes with the same NextAuth session used by the UI", () => {
  const proxySource = source("proxy.ts");

  assert.match(proxySource, /export const proxy = auth/);
  assert.match(proxySource, /isOrbitPrivateAppPath/);
  assert.match(proxySource, /request\.auth\?\.user\?\.id/);
  assert.match(proxySource, /\/app\/account\/login/);
});

test("/app layout injects the server session and the shared nav does not refetch it", () => {
  const layoutSource = source("app/(app)/app/layout.tsx");
  const navSource = source("app/(app)/app/orbit-public-shell.tsx");

  assert.match(layoutSource, /const session = await auth\(\)/);
  assert.match(layoutSource, /<SessionProvider[^>]*session=\{session\}/);
  assert.match(navSource, /useSession\(\)/);
  assert.doesNotMatch(navSource, /fetch\("\/api\/auth\/session"\)/);
});

test("starfield homepage uses account signup for guests and the personal home for members", () => {
  const homeSource = source("app/(app)/app/orbit-starfield-home.tsx");
  const desktopSource = source("app/(app)/app/orbit-starfield-desktop.tsx");
  const mobileSource = source("app/(app)/app/orbit-starfield-mobile.tsx");

  assert.match(homeSource, /authenticated=\{authenticated\}/);
  for (const starfieldSource of [desktopSource, mobileSource]) {
    assert.match(starfieldSource, /authenticated \? "\/app\/home"/);
    assert.match(starfieldSource, /\/app\/account\/signup\?next=%2Fapp%2Fhome/);
    assert.doesNotMatch(starfieldSource, /href="\/app\/register"/);
    assert.match(starfieldSource, /enterStarfield/);
  }
});

test("all home-page sign-out controls clear the NextAuth session", () => {
  const homeSource = source("app/(app)/app/home/orbit-real-home.tsx");

  assert.equal((homeSource.match(/signOut\(\{ callbackUrl: "\/app" \}\)/g) ?? []).length, 2);
  assert.doesNotMatch(homeSource, /onClick=\{\(\) => orbitNavigate\("\/"\)\}/);
});
