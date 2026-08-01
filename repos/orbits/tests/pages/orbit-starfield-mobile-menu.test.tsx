import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { fileURLToPath } from "node:url";

import { OrbitStarfieldHome } from "../../app/(app)/app/orbit-starfield-home";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

function source(path: string): string {
  return readFileSync(join(projectRoot, path), "utf8");
}

test("starfield renders the shared responsive navigation disclosure", () => {
  const html = renderToStaticMarkup(
    <OrbitStarfieldHome authenticated={false} />,
  );

  assert.match(html, /data-orbit-nav-tone="starfield"/);
  assert.match(html, /class="orbit-nav-menu-btn hit-44"/);
  assert.match(html, /aria-label="打开菜单"/);
  assert.doesNotMatch(html, /id="skNav"|id="skMenu"|id="skBurger"/);
});

test("shared navigation owns mobile disclosure state and focus behavior", () => {
  const shell = source("app/(app)/app/orbit-public-shell.tsx");

  assert.match(shell, /setMenuOpen\(\(open\) => !open\)/);
  assert.match(shell, /event\.key === "Escape"/);
  assert.match(shell, /className="orbit-nav-menu-scrim"/);
  assert.match(shell, /className="orbit-nav-menu-panel"/);
});

test("legacy starfield mobile menu implementation is removed", () => {
  const mobile = source("app/(app)/app/orbit-starfield-mobile.tsx");
  const runtime = source("app/(app)/app/orbit-starfield-mobile-logic.ts");

  assert.doesNotMatch(mobile, /id="skNav"|id="skMenu"|id="skBurger"/);
  assert.doesNotMatch(runtime, /bindStarfieldMobileMenu|_menuCleanup/);
});
