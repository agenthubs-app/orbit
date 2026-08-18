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
    marker: "app-home-events-route",
    sourcePath: "app/(app)/app/home/events/page.tsx",
  },
] as const;

// iOrbit 工作台合并：hub 页收窄为 /app/agent 重定向，hub 数据（同一个
// loadAppHomeRouteViewModel）改由 agent route adapter 组合进 dashboard 首屏。
test("app-home-route redirects into the iOrbit workspace which composes home data", () => {
  const hubSource = source("app/(app)/app/home/page.tsx");
  assert.match(hubSource, /redirect\("\/app\/agent"\)/);
  assert.doesNotMatch(hubSource, /OrbitRealHome|HomeRouteStateBoundary/);

  const agentPageSource = source("app/(app)/app/agent/page.tsx");
  assert.match(agentPageSource, /loadAppHomeRouteViewModel\(undefined,/);
  assert.match(agentPageSource, /presentOrbitEvents/);
  assert.match(agentPageSource, /readRuntimeEventRegistrationStates/);
  assert.match(agentPageSource, /resolveConfiguredActorEventCanonicalIds/);
  assert.match(agentPageSource, /registrationAvailabilityByEventId=/);
  assert.match(agentPageSource, /youRsvped: registered/);

  const agentUiSource = source("app/(app)/app/agent/orbit-real-agent.tsx");
  assert.match(agentUiSource, /OrbitAgentDashboard/);
});

test("web root owns the responsive starfield journey", () => {
  const pageSource = source("app/page.tsx");

  assert.match(pageSource, /OrbitStarfieldHome/);
  assert.match(pageSource, /auth\(\)/);
  assert.match(pageSource, /SessionProvider/);
  assert.match(pageSource, /OrbitLanguageProvider/);
  assert.match(pageSource, /OrbitReferenceStyles/);
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
  const shellSource = source("app/(app)/app/orbit-public-shell.tsx");
  const starfieldHome = source("app/(app)/app/orbit-starfield-home.tsx");

  assert.match(starfieldHome, /<OrbitTopNav/);
  assert.match(starfieldHome, /tone="starfield"/);
  assert.match(shellSource, /href=\{preserveHref\("\/app\/agent"\)\}/);
  assert.match(shellSource, /\["\/events"/);
  assert.match(shellSource, /\["\/today"/);
  assert.match(shellSource, /\["\/contacts"/);
});

test("starfield account actions branch only on server-owned authentication", () => {
  const rootSource = source("app/page.tsx");
  const shellSource = source("app/(app)/app/orbit-public-shell.tsx");
  const starfieldHome = source("app/(app)/app/orbit-starfield-home.tsx");

  assert.match(rootSource, /SessionProvider[^]*session=\{session\}/);
  assert.match(starfieldHome, /authenticatedFallback=\{authenticated\}/);
  assert.match(shellSource, /useContext\(SessionContext\)/);
  assert.match(shellSource, /href=\{preserveHref\("\/app\/profile"\)\}/);
  assert.match(shellSource, /\/app\/account\/login\?next=/);
  assert.match(shellSource, /\/app\/account\/signup\?next=/);
});

test("/app mirrors the authenticated starfield entry", () => {
  const appPageSource = source("app/(app)/app/page.tsx");

  assert.match(appPageSource, /OrbitStarfieldHome/);
  assert.match(appPageSource, /await auth\(\)/);
  // Signed-in members are redirected to the personal console; the starfield
  // stays the anonymous-only entry.
  assert.match(appPageSource, /redirect\("\/app\/home"\)/);
  assert.match(appPageSource, /authenticated=\{false\}/);
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

test("iOrbit dashboard presents registration state from the shared runtime snapshot", () => {
  const dashboardSource = source(
    "app/(app)/app/agent/orbit-agent-dashboard.tsx",
  );

  assert.match(dashboardSource, /registrationAvailabilityByEventId/);
  assert.match(dashboardSource, /nextEventRegistrationAvailability === "open"/);
  assert.match(dashboardSource, /报名已截止/);
  assert.match(dashboardSource, /报名资料已锁定/);
  assert.doesNotMatch(
    dashboardSource,
    /浏览可报名的活动，回答两题即可完成报名/,
  );
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
