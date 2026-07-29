import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

function source(path: string): string {
  return readFileSync(join(projectRoot, path), "utf8");
}

const personalHomeRoutes = [
  {
    marker: "app-home-route",
    sourcePath: "app/(app)/app/home/page.tsx",
  },
  {
    marker: "app-home-events-route",
    sourcePath: "app/(app)/app/home/events/page.tsx",
  },
] as const;

test("web root owns the responsive starfield journey", () => {
  const pageSource = source("app/page.tsx");

  assert.match(pageSource, /OrbitStarfieldHome/);
  assert.match(pageSource, /await auth\(\)/);
  assert.match(pageSource, /authenticated=\{Boolean\(session\?\.user\?\.id\)\}/);
  assert.doesNotMatch(pageSource, /OrbitRealLandingPage/);
  assert.doesNotMatch(pageSource, /OrbitRealHome/);
});

test("starfield journey mounts dedicated desktop and mobile trees", () => {
  const shellSource = source("app/(app)/app/orbit-starfield-home.tsx");

  assert.match(shellSource, /MOBILE_QUERY = "\(max-width: 767px\)"/);
  assert.match(shellSource, /OrbitStarfieldDesktop/);
  assert.match(shellSource, /OrbitStarfieldMobile/);
  assert.match(shellSource, /data-orbit-real-page="starfield-home"/);
  assert.match(shellSource, /mq\.addEventListener\("change", apply\)/);
});

test("starfield navigation links to concrete product routes", () => {
  for (const filePath of [
    "app/(app)/app/orbit-starfield-desktop.tsx",
    "app/(app)/app/orbit-starfield-mobile.tsx",
  ]) {
    const starfieldSource = source(filePath);

    assert.match(starfieldSource, /href="\/app\/agent"/);
    assert.match(starfieldSource, /href="\/app\/events"/);
    assert.match(starfieldSource, /href="\/app\/today"/);
    assert.match(starfieldSource, /href="\/app\/contacts"/);
  }
});

test("starfield account actions branch only on server-owned authentication", () => {
  const desktopSource = source(
    "app/(app)/app/orbit-starfield-desktop.tsx",
  );
  const mobileSource = source(
    "app/(app)/app/orbit-starfield-mobile.tsx",
  );

  for (const starfieldSource of [desktopSource, mobileSource]) {
    assert.match(starfieldSource, /authenticated \? \(/);
    assert.match(starfieldSource, /href="\/app\/profile"/);
    assert.match(starfieldSource, /href="\/app\/account\/login\?next=%2Fapp%2Fhome"/);
    assert.match(starfieldSource, /href="\/app\/account\/signup\?next=%2Fapp%2Fhome"/);
  }
});

test("/app mirrors the authenticated starfield entry", () => {
  const appPageSource = source("app/(app)/app/page.tsx");

  assert.match(appPageSource, /OrbitStarfieldHome/);
  assert.match(appPageSource, /await auth\(\)/);
  assert.match(appPageSource, /authenticated=\{Boolean\(session\?\.user\?\.id\)\}/);
  assert.doesNotMatch(appPageSource, /loadAppHomeRouteViewModel/);
});

test("root home routing documentation records the public and personal route boundary", () => {
  const docSource = source("docs/architecture/root-home-routing.md");

  assert.match(docSource, /`\/`/);
  assert.match(docSource, /Orbit Agent/);
  assert.match(docSource, /`\/app\/home`/);
  assert.match(docSource, /`\/app\/home\/events`/);
  assert.match(docSource, /no-write live safety/);
});

for (const route of personalHomeRoutes) {
  test(`${route.marker} composes actor-scoped home payloads`, () => {
    const pageSource = source(route.sourcePath);

    assert.match(pageSource, /loadAppHomeRouteViewModel/);
    assert.match(pageSource, /HomeRouteStateBoundary/);
    assert.match(pageSource, /OrbitRealHome/);
    assert.match(pageSource, /await auth\(\)/);
    assert.match(pageSource, /redirect\("\/app\/account\/login/);
    assert.match(pageSource, /id: session\.user\.id/);
    assert.match(pageSource, /loadAppHomeRouteViewModel\(undefined,/);
    assert.doesNotMatch(pageSource, /searchParams/);
    assert.doesNotMatch(pageSource, /getOrbitHomeViewModel/);
    assert.doesNotMatch(pageSource, /OrbitRealLandingPage/);
  });
}

test("app home keeps separate desktop and mobile hub layouts", () => {
  const homeUiSource = source("app/(app)/app/home/orbit-real-home.tsx");

  assert.match(homeUiSource, /function HubDesktop/);
  assert.match(homeUiSource, /function HubMobile/);
  assert.match(homeUiSource, /className="orbit-desktop-only"/);
  assert.match(homeUiSource, /className="orbit-mobile-only"/);
  assert.match(homeUiSource, /gridTemplateColumns: "1fr 320px"/);
});

test("app home does not relabel event records as registrations", () => {
  const homeRouteSource = source(
    "app/(app)/app/home/compose-app-home-from-previously-approved-mock-first-capabilities/home-route-view-model.tsx",
  );
  const homeUiSource = source("app/(app)/app/home/orbit-real-home.tsx");

  assert.doesNotMatch(homeRouteSource, /youRsvped: true/);
  assert.doesNotMatch(homeRouteSource, /function eventChoiceToLandingEvent/);
  assert.match(homeRouteSource, /import \{ eventChoiceToLandingEvent \}/);
  assert.doesNotMatch(homeUiSource, /报名活动/);
  assert.match(homeUiSource, /en: "Events", zh: "活动"/);
});

test("app home mobile event rows keep long event titles readable", () => {
  const homeUiSource = source("app/(app)/app/home/orbit-real-home.tsx");

  assert.match(homeUiSource, /className="card-hover orbit-home-event-row"/);
  assert.match(homeUiSource, /className="orbit-home-event-row-copy"/);
  assert.match(homeUiSource, /className="h-section orbit-home-event-row-title"/);
  assert.match(homeUiSource, /className="orbit-home-event-row-action"/);
  assert.match(homeUiSource, /\.orbit-home-event-row-title[\s\S]*-webkit-line-clamp:2/);
  assert.match(homeUiSource, /\.orbit-home-event-row-action[\s\S]*flex-basis:100%/);
});

test("app home hub entry cards link to live app routes", () => {
  const homeUiSource = source("app/(app)/app/home/orbit-real-home.tsx");

  assert.match(homeUiSource, /href: "\/app\/profile"/);
  assert.match(homeUiSource, /href: "\/app\/contacts"/);
  assert.match(homeUiSource, /href: "\/app\/today"/);
  assert.match(homeUiSource, /title: t\(\{ en: "Universal profile", zh: "通用画像" \}\)/);
  assert.match(homeUiSource, /sub: t\(\{ en: "Meetings and interaction log", zh: "约见与交往记录" \}\)/);
  assert.match(homeUiSource, /<h3 className="h-section"[^>]*>\{item\.title\}<\/h3>/);
  assert.match(homeUiSource, /<span style=\{\{ color: "var\(--text-3\)".*>\{item\.sub\}<\/span>/);
  assert.doesNotMatch(homeUiSource, /mobileTitle:/);
  assert.doesNotMatch(homeUiSource, /mobileSub:/);
  assert.doesNotMatch(homeUiSource, /href: "\/home\/(?:profile|cards|schedule)"/);
});

test("product route href mapping is idempotent for concrete app paths", async () => {
  const { productHref } = await import("../../app/(app)/app/orbit-public-shell");

  assert.equal(productHref("/app/profile"), "/app/profile");
  assert.equal(productHref("/app/contacts"), "/app/contacts");
  assert.equal(productHref("/app/schedule"), "/app/schedule");
  assert.equal(productHref("/app/events/EVT01"), "/app/events/EVT01");
  assert.equal(productHref("/home/schedule"), "/app/today");
  assert.equal(productHref("/home/cards"), "/app/contacts");
});

test("shared home navigation keeps Orbit home on the integrated web root", async () => {
  const shellSource = source("app/(app)/app/orbit-public-shell.tsx");
  const { productHref } = await import("../../app/(app)/app/orbit-public-shell");

  assert.equal(productHref("/"), "/");
  assert.match(shellSource, /href=\{preserveHref\("\/"\)\}/);
  assert.doesNotMatch(shellSource, /href=\{preserveHref\("\/app"\)\}/);
});

test("app home live storage providers reuse the configured postgres record store", () => {
  const providerSources = [
    source("features/contacts/storage/contact-live-record-provider.ts"),
    source("features/profile/storage/profile-live-record-provider.ts"),
    source("features/profile/storage/profile-signal-live-record-provider.ts"),
  ];

  for (const providerSource of providerSources) {
    assert.match(providerSource, /createConfiguredPostgresLiveRecordStore/);
    assert.doesNotMatch(providerSource, /createPgLiveRecordSqlClient/);
    assert.doesNotMatch(
      providerSource,
      /from "\.\.\/\.\.\/\.\.\/shared\/storage\/postgres-live-record-store"/,
    );
  }
});
