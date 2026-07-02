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

test("web root stays on public landing instead of live app home", () => {
  const pageSource = source("app/page.tsx");

  assert.match(pageSource, /OrbitRealLandingPage/);
  assert.doesNotMatch(pageSource, /loadAppHomeRouteViewModel/);
  assert.doesNotMatch(pageSource, /HomeRouteStateBoundary/);
  assert.doesNotMatch(pageSource, /OrbitRealHome/);
  assert.doesNotMatch(pageSource, /web-root-home-route/);
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
      const pageModule = await import(route.importPath);
      const Page =
        typeof pageModule.default === "function"
          ? pageModule.default
          : pageModule.default?.default;
      const html = renderToStaticMarkup(
        await Page({
          searchParams: Promise.resolve({ mode: "live" }),
        }),
      );

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
  assert.doesNotMatch(styleSource, /grid-template-areas: "rail" "events"/);
  assert.doesNotMatch(styleSource, /@media \(max-width: 880px\)/);
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
