import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";

const liveDatabaseEnvKeys = [
  "ORBIT_EVENT_DATABASE_URL",
  "ORBIT_LIVE_DATABASE_URL",
  "ORBIT_DATABASE_URL",
] as const;
const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

function source(path: string): string {
  return readFileSync(join(projectRoot, path), "utf8");
}

type RoutePage = (props: {
  searchParams: Promise<Record<string, string>>;
}) => Promise<Parameters<typeof renderToStaticMarkup>[0]>;

async function renderLiveModePage(importPath: string): Promise<string> {
  const pageModule = (await import(importPath)) as { default: RoutePage };

  return renderToStaticMarkup(
    await pageModule.default({
      searchParams: Promise.resolve({ mode: "live" }),
    }),
  );
}

async function withUnconfiguredLiveStorage<T>(
  run: () => Promise<T>,
): Promise<T> {
  const previousMode = process.env.ORBIT_MODULE_MODE;
  const previousDatabaseEnv = new Map<string, string | undefined>(
    liveDatabaseEnvKeys.map((key) => [key, process.env[key]]),
  );

  try {
    process.env.ORBIT_MODULE_MODE = "live";
    for (const key of liveDatabaseEnvKeys) {
      delete process.env[key];
    }

    return await run();
  } finally {
    if (previousMode === undefined) {
      delete process.env.ORBIT_MODULE_MODE;
    } else {
      process.env.ORBIT_MODULE_MODE = previousMode;
    }

    for (const key of liveDatabaseEnvKeys) {
      const previousValue = previousDatabaseEnv.get(key);

      if (previousValue === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previousValue;
      }
    }
  }
}

const homeRoutes = [
  {
    importPath: "../../app/(app)/app/page",
    marker: "app-root-home-route",
    sourcePath: "app/(app)/app/page.tsx",
  },
  {
    importPath: "../../app/(app)/app/home/page",
    marker: "app-home-route",
    sourcePath: "app/(app)/app/home/page.tsx",
  },
  {
    importPath: "../../app/(app)/app/home/events/page",
    marker: "app-home-events-route",
    sourcePath: "app/(app)/app/home/events/page.tsx",
  },
] as const;

test("web root owns the integrated Orbit Agent landing route", () => {
  const pageSource = source("app/page.tsx");

  assert.match(pageSource, /OrbitRealLandingPage/);
  assert.match(pageSource, /getOrbitLandingViewModel/);
  assert.doesNotMatch(pageSource, /\.\/\(app\)\/app\/page/);
  assert.doesNotMatch(pageSource, /OrbitRealHome/);
});

test("web root renders Orbit Agent before activity and event context", async () => {
  const pageModule = (await import("../../app/page")) as { default: RoutePage };

  await withUnconfiguredLiveStorage(async () => {
    const html = renderToStaticMarkup(
      await pageModule.default({
        searchParams: Promise.resolve({ mode: "live" }),
      }),
    );

    const heroIndex = html.indexOf('data-orbit-agent-hero="root"');
    const activityIndex = html.indexOf('data-orbit-activity-overview="root"');
    const eventsIndex = html.indexOf('data-orbit-event-context="root"');

    assert.notEqual(heroIndex, -1);
    assert.notEqual(activityIndex, -1);
    assert.notEqual(eventsIndex, -1);
    assert.ok(heroIndex < activityIndex);
    assert.ok(activityIndex < eventsIndex);
    assert.match(html, /href="\/app\/events/);
    assert.match(html, /href="\/app\/contacts/);
    assert.doesNotMatch(html, /app-root-home-route/);
    assert.doesNotMatch(html, /Home could not load/);
    assert.doesNotMatch(html, /data-orbit-real-page="home-events"/);
  });
});

test("web root event cards link to distinct event detail ids", async () => {
  const pageModule = (await import("../../app/page")) as { default: RoutePage };
  const viewModelModule = await import("../../app/(app)/app/orbit-landing-route-view-model");

  await withUnconfiguredLiveStorage(async () => {
    const html = renderToStaticMarkup(
      await pageModule.default({
        searchParams: Promise.resolve({ mode: "live" }),
      }),
    );
    const expectedHrefs = viewModelModule
      .getOrbitLandingViewModel()
      .events.slice(0, 3)
      .map((event) => `/app/events/${event.id}`);
    const cardHrefs = Array.from(
      html.matchAll(/<a(?=[^>]*class="orbit-root-event-card")[^>]*href="([^"]+)"/g),
      (match) => match[1],
    );

    assert.equal(cardHrefs.length, expectedHrefs.length);
    assert.deepEqual(cardHrefs, expectedHrefs);
    assert.equal(new Set(cardHrefs).size, cardHrefs.length);
  });
});

test("web root contact links name the relationship context action", async () => {
  const pageModule = (await import("../../app/page")) as { default: RoutePage };
  const viewModelModule = await import("../../app/(app)/app/orbit-landing-route-view-model");

  await withUnconfiguredLiveStorage(async () => {
    const html = renderToStaticMarkup(
      await pageModule.default({
        searchParams: Promise.resolve({ mode: "live" }),
      }),
    );
    const [primaryConnection] = viewModelModule.getOrbitLandingViewModel().connections;

    assert.ok(primaryConnection);
    assert.match(
      html,
      new RegExp(`aria-label="查看${primaryConnection.displayName}的人脉上下文"`),
    );
  });
});

test("web root event summaries render only the active language copy", async () => {
  const pageModule = (await import("../../app/page")) as { default: RoutePage };

  await withUnconfiguredLiveStorage(async () => {
    const html = renderToStaticMarkup(
      await pageModule.default({
        searchParams: Promise.resolve({ mode: "live" }),
      }),
    );

    assert.doesNotMatch(html, /JA:/);
    assert.doesNotMatch(html, /ZH:/);
    assert.doesNotMatch(html, /EN:/);
  });
});

test("root home routing documentation records the public and personal route boundary", () => {
  const docSource = source("docs/architecture/root-home-routing.md");

  assert.match(docSource, /`\/`/);
  assert.match(docSource, /Orbit Agent/);
  assert.match(docSource, /`\/app\/home`/);
  assert.match(docSource, /`\/app\/home\/events`/);
  assert.match(docSource, /no-write live safety/);
});

for (const route of homeRoutes) {
  test(`${route.marker} composes home from live route payloads`, async () => {
    const pageSource = source(route.sourcePath);

    assert.match(pageSource, /loadAppHomeRouteViewModel/);
    assert.match(pageSource, /HomeRouteStateBoundary/);
    assert.match(pageSource, /OrbitRealHome/);
    assert.doesNotMatch(pageSource, /getOrbitHomeViewModel/);
    assert.doesNotMatch(pageSource, /OrbitRealLandingPage/);

    await withUnconfiguredLiveStorage(async () => {
      const html = await renderLiveModePage(route.importPath);

      assert.match(html, new RegExp(route.marker));
      assert.match(html, /Home could not load/);
    });
  });
}

test("app home desktop grid preserves web rail beside events on medium-width screens", () => {
  const homeUiSource = source("app/(app)/app/home/orbit-real-home.tsx");
  const styleSource = source("app/(app)/app/orbit-reference-styles.tsx");

  assert.match(homeUiSource, /className="orbit-home-main-grid"/);
  assert.match(homeUiSource, /className="orbit-home-events-pane"/);
  assert.match(homeUiSource, /className="orbit-home-hub-rail"/);
  assert.doesNotMatch(homeUiSource, /gridTemplateColumns: "minmax\(0, 1fr\) 320px"/);
  assert.match(styleSource, /\.orbit-home-main-grid/);
  assert.match(styleSource, /grid-template-areas: "events rail"/);
  assert.match(styleSource, /grid-template-columns: minmax\(0, 1fr\) clamp\(220px, 30vw, 320px\)/);
  assert.match(styleSource, /@media \(min-width: 641px\) and \(max-width: 820px\)/);
  assert.match(styleSource, /grid-template-columns: minmax\(0, 1fr\) clamp\(180px, 28vw, 220px\)/);
  assert.doesNotMatch(styleSource, /"rail"\s+"events"/);
  assert.doesNotMatch(styleSource, /repeat\(auto-fit, minmax\(180px, 1fr\)\)/);
  assert.doesNotMatch(styleSource, /@media \(max-width: 880px\)/);
});

test("app home mobile event rows keep long event titles readable", () => {
  const homeUiSource = source("app/(app)/app/home/orbit-real-home.tsx");
  const styleSource = source("app/(app)/app/orbit-reference-styles.tsx");

  assert.match(homeUiSource, /className="card-hover orbit-home-event-row"/);
  assert.match(homeUiSource, /className="orbit-home-event-row-copy"/);
  assert.match(homeUiSource, /className="h-section orbit-home-event-row-title"/);
  assert.match(homeUiSource, /className="orbit-home-event-row-action"/);
  assert.match(
    styleSource,
    /@media \(max-width: 640px\)[\s\S]*\.orbit-home-event-row-title[\s\S]*-webkit-line-clamp: 2[\s\S]*white-space: normal/,
  );
  assert.match(
    styleSource,
    /@media \(max-width: 640px\)[\s\S]*\.orbit-home-event-row-action[\s\S]*flex-basis: 100%/,
  );
});

test("app home hub entry cards link to live app routes", () => {
  const homeUiSource = source("app/(app)/app/home/orbit-real-home.tsx");

  assert.match(homeUiSource, /href: "\/app\/profile"/);
  assert.match(homeUiSource, /href: "\/app\/contacts"/);
  assert.match(homeUiSource, /href: "\/app\/schedule"/);
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
  assert.equal(productHref("/home/schedule"), "/app/schedule");
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
