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

async function withUnconfiguredLiveAdminPlatform<T>(
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

async function withMockAdminPlatform<T>(run: () => Promise<T>): Promise<T> {
  const previousMode = process.env.ORBIT_MODULE_MODE;

  try {
    process.env.ORBIT_MODULE_MODE = "mock";

    return await run();
  } finally {
    if (previousMode === undefined) {
      delete process.env.ORBIT_MODULE_MODE;
    } else {
      process.env.ORBIT_MODULE_MODE = previousMode;
    }
  }
}

test("/app/admin and /app/platform routes use a live-capable admin-platform loader", () => {
  const adminSource = source("app/(app)/app/admin/page.tsx");
  const adminEventsSource = source("app/(app)/app/admin/events/page.tsx");
  const platformSource = source("app/(app)/app/platform/page.tsx");

  for (const pageSource of [adminSource, adminEventsSource, platformSource]) {
    assert.match(pageSource, /loadAppAdminPlatformRouteViewModel/);
    assert.match(pageSource, /StateView/);
    assert.doesNotMatch(pageSource, /getOrbitAdminViewModel/);
    assert.doesNotMatch(pageSource, /getOrbitPlatformViewModel/);
  }
});

test("app admin-platform route loader returns admin and platform models in mock mode", async () => {
  await withMockAdminPlatform(async () => {
    const { loadAppAdminPlatformRouteViewModel } = await import(
      "../../app/(app)/app/admin/compose-app-admin-platform-from-previously-approved-mock-first-capabilities/admin-platform-route-view-model"
    );
    const routeModel = await loadAppAdminPlatformRouteViewModel({
      searchParams: { mode: "mock" },
    });

    assert.equal(routeModel.state, "success");

    if (routeModel.state === "success") {
      assert.equal(routeModel.admin.adminEvents[0]?.name, "Climate founders dinner");
      assert.ok(routeModel.admin.adminStats.length > 0);
      assert.ok(routeModel.admin.adminMembers.length > 0);
      assert.equal(routeModel.platform.reviewQueue[0]?.name, "Climate founders dinner");
      assert.ok(routeModel.platform.orgAccounts.length > 0);
    }
  });
});

test("app admin page renders a controlled live failure when storage is unconfigured", async () => {
  await withUnconfiguredLiveAdminPlatform(async () => {
    const Page = (await import("../../app/(app)/app/admin/page"))
      .default as (props?: {
      searchParams?: Promise<Record<string, string | undefined>>;
    }) => Promise<React.ReactElement>;
    const html = renderToStaticMarkup(
      await Page({
        searchParams: Promise.resolve({ mode: "live" }),
      }),
    );

    assert.match(html, /Admin workspace could not load/);
    assert.match(html, /data-state-boundary="shared-ui-state-view"/);
    assert.match(html, /app-admin-route-state/);
  });
});

test("app admin events page renders the same controlled live failure", async () => {
  await withUnconfiguredLiveAdminPlatform(async () => {
    const Page = (await import("../../app/(app)/app/admin/events/page"))
      .default as (props?: {
      searchParams?: Promise<Record<string, string | undefined>>;
    }) => Promise<React.ReactElement>;
    const html = renderToStaticMarkup(
      await Page({
        searchParams: Promise.resolve({ mode: "live" }),
      }),
    );

    assert.match(html, /Admin workspace could not load/);
    assert.match(html, /data-state-boundary="shared-ui-state-view"/);
    assert.match(html, /app-admin-events-route-state/);
  });
});

test("app platform page renders the same controlled live failure", async () => {
  await withUnconfiguredLiveAdminPlatform(async () => {
    const Page = (await import("../../app/(app)/app/platform/page"))
      .default as (props?: {
      searchParams?: Promise<Record<string, string | undefined>>;
    }) => Promise<React.ReactElement>;
    const html = renderToStaticMarkup(
      await Page({
        searchParams: Promise.resolve({ mode: "live" }),
      }),
    );

    assert.match(html, /Platform workspace could not load/);
    assert.match(html, /data-state-boundary="shared-ui-state-view"/);
    assert.match(html, /app-platform-route-state/);
  });
});
