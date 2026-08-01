/**
 * 顶部导航链接完整性测试。
 *
 * 「真实导航」是硬性产品决定：导航里的每个 href 都必须解析到一个真实存在的
 * App Router 页面。这条测试是防止死链回归的闸门。
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { productHref } from "../../app/(app)/app/orbit-public-shell";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

const shellSource = readFileSync(
  join(projectRoot, "app/(app)/app/orbit-public-shell.tsx"),
  "utf8",
);
const starfieldSources = [
  readFileSync(
    join(projectRoot, "app/(app)/app/orbit-starfield-desktop.tsx"),
    "utf8",
  ),
  readFileSync(
    join(projectRoot, "app/(app)/app/orbit-starfield-mobile.tsx"),
    "utf8",
  ),
];
const starfieldHomeSource = readFileSync(
  join(projectRoot, "app/(app)/app/orbit-starfield-home.tsx"),
  "utf8",
);

function navHrefs(): readonly string[] {
  const start = shellSource.indexOf("const links = [");
  assert.ok(
    start >= 0,
    "could not locate the links array in orbit-public-shell.tsx — the nav shape changed and this gate is blind",
  );

  const end = shellSource.indexOf("] as const;", start);
  assert.ok(end > start, "could not locate the end of the links array");

  const hrefs = [...shellSource.slice(start, end).matchAll(/\["(\/[^"]*)"/g)].map(
    (match) => match[1],
  );
  assert.ok(
    hrefs.length > 0,
    "nav href extraction returned nothing — the links array shape changed and this gate is blind",
  );

  return hrefs;
}

test("the nav order is always iOrbit, events, schedule, contacts", () => {
  assert.deepEqual(navHrefs(), ["/events", "/today", "/contacts"]);
});

test("starfield desktop and mobile trees delegate navigation to the shared product order", () => {
  assert.match(starfieldHomeSource, /<OrbitTopNav/);
  assert.match(starfieldHomeSource, /tone="starfield"/);

  for (const starfieldSource of starfieldSources) {
    assert.doesNotMatch(
      starfieldSource,
      /id="skNav"|href="\/app\/(?:agent|events|today|contacts)"/,
    );
  }
});

test("every nav href resolves to a real App Router page", () => {
  for (const href of navHrefs()) {
    const resolved = productHref(href);
    const pagePath = join(
      projectRoot,
      "app/(app)/app",
      resolved.replace(/^\/app\/?/, ""),
      "page.tsx",
    );

    assert.ok(
      existsSync(pagePath),
      `nav href ${href} resolves to ${resolved} but ${pagePath} does not exist`,
    );
  }
});

// The nav no longer links to /schedule (T3), but the two retired route
// entry points still exist as page.tsx redirect shells (deep-link
// preservation, design doc §1/§7) — a page.tsx that redirects is still a
// "real" page for the dead-href gate above and for direct/bookmarked visits.
test("the retired /schedule and /followups routes still have a page.tsx (redirect shells, not 404s)", () => {
  for (const route of ["schedule", "followups"]) {
    const pagePath = join(projectRoot, "app/(app)/app", route, "page.tsx");
    assert.ok(existsSync(pagePath), `${route}/page.tsx should still exist as a redirect shell`);
  }
});

test("the nav label for the merged entry is 日程/Schedule, not the old Today wording", () => {
  assert.match(
    shellSource,
    /const links = \[\s*\["\/events", t\(\{ en: "Events", zh: "活动" \}\), "events"\],\s*\["\/today", t\(\{ en: "Schedule", zh: "日程" \}\), "today"\]/,
  );
});

test("the retired prototype hrefs are gone", () => {
  for (const dead of ["/explore", "/home/schedule", "/home/cards"]) {
    assert.ok(
      !navHrefs().includes(dead),
      `${dead} is a known 404 and must not return to the nav`,
    );
  }
});

test("today is a member of the OrbitNavActive union", () => {
  const declaration = /export type OrbitNavActive =[^;]*;/.exec(shellSource)?.[0];

  assert.ok(declaration, "OrbitNavActive declaration not found");
  assert.ok(
    declaration.includes('"today"'),
    `OrbitNavActive must include "today": ${declaration}`,
  );
});
