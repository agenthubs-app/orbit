import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";

import { loadAppEventsRouteViewModel } from "../../app/(app)/app/events/compose-app-events-from-previously-approved-mock-first-capabilities/events-route-view-model";
import { resolveAppEventsRouteServices } from "../../app/(app)/app/events/compose-app-events-from-previously-approved-mock-first-capabilities/events-service-factory";

const liveDatabaseEnvKeys = [
  "ORBIT_EVENT_DATABASE_URL",
  "ORBIT_LIVE_DATABASE_URL",
  "ORBIT_DATABASE_URL",
] as const;
const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

function source(path: string): string {
  return readFileSync(join(projectRoot, path), "utf8");
}

async function withUnconfiguredLiveEvents<T>(
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

test("app events route service bundle resolves all child services in live mode", () => {
  const resolution = resolveAppEventsRouteServices("live");

  assert.equal(
    resolution.success,
    true,
    resolution.success === false ? resolution.error.message : "",
  );
  assert.equal(resolution.mode, "live");
});

test("app events route loader returns a controlled live failure when storage is unconfigured", async () => {
  await withUnconfiguredLiveEvents(async () => {
    const viewModel = await loadAppEventsRouteViewModel();

    assert.equal(viewModel.state, "route-state");

    if (viewModel.state === "route-state") {
      assert.equal(viewModel.routeState.scenario, "failure");
      assert.match(
        viewModel.routeState.errorCode ?? "",
        /EVENTS_LIVE_STORE_UNCONFIGURED|EVENT_RECOMMENDATION_LIVE_STORE_UNCONFIGURED|EVENT_VALUE_RECOMMENDATION_LIVE_STORE_UNCONFIGURED|EVENT_GOAL_READINESS_LIVE_STORE_UNCONFIGURED/,
      );
      assert.match(
        viewModel.routeState.evidence.map((item) => item.id).join(" "),
        /live-store-unconfigured|live-store-empty|LIVE_STORE_UNCONFIGURED/,
      );
    }
  });
});

test("/app/events page renders the live-capable product events UI", async () => {
  const pageSource = source("app/(app)/app/events/page.tsx");

  assert.match(pageSource, /OrbitRealExploreClient/);
  assert.match(pageSource, /eventsRouteToOrbitLandingViewModel/);
  assert.doesNotMatch(pageSource, /AppEventsCommandCenter/);

  await withUnconfiguredLiveEvents(async () => {
    const pageModule = await import("../../app/(app)/app/events/page");
    const Page = pageModule.default;
    const html = renderToStaticMarkup(await Page());

    assert.match(html, /shared-ui-state-view/);
    assert.match(html, /Events could not load/);
  });
});
