import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { loadAppDashboardRouteViewModel } from "../../app/(app)/app/dashboard/compose-app-dashboard-from-previously-approved-mock-first-capabilities/dashboard-route-view-model";
import { resolveAppDashboardRouteServices } from "../../app/(app)/app/dashboard/compose-app-dashboard-from-previously-approved-mock-first-capabilities/dashboard-service-factory";

const liveDatabaseEnvKeys = [
  "ORBIT_EVENT_DATABASE_URL",
  "ORBIT_LIVE_DATABASE_URL",
  "ORBIT_DATABASE_URL",
] as const;
const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

function source(path: string): string {
  return readFileSync(join(projectRoot, path), "utf8");
}

async function withUnconfiguredLiveDashboard<T>(
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

async function withModuleMode<T>(
  mode: "mock" | "hybrid" | "live",
  run: () => Promise<T>,
): Promise<T> {
  const previousMode = process.env.ORBIT_MODULE_MODE;

  try {
    process.env.ORBIT_MODULE_MODE = mode;

    return await run();
  } finally {
    if (previousMode === undefined) {
      delete process.env.ORBIT_MODULE_MODE;
    } else {
      process.env.ORBIT_MODULE_MODE = previousMode;
    }
  }
}

test("app dashboard route service bundle resolves all child services in live mode", () => {
  const resolution = resolveAppDashboardRouteServices("live");

  assert.equal(
    resolution.success,
    true,
    resolution.success === false ? resolution.error.message : "",
  );
  assert.equal(resolution.mode, "live");
});

test("app dashboard route loader returns a controlled live failure when storage is unconfigured", async () => {
  await withUnconfiguredLiveDashboard(async () => {
    const viewModel = await loadAppDashboardRouteViewModel();

    assert.equal(viewModel.state, "route-state");

    if (viewModel.state === "route-state") {
      assert.equal(viewModel.routeState.scenario, "failure");
      assert.equal(
        viewModel.routeState.errorCode,
        "DASHBOARD_AGGREGATE_LIVE_STORE_UNCONFIGURED",
      );
      assert.match(
        viewModel.routeState.evidenceIds.join(" "),
        /evidence:dashboard-live-store-unconfigured/,
      );
    }
  });
});

test("/app/dashboard page renders the real dashboard route adapter", async () => {
  const pageSource = source("app/(app)/app/dashboard/page.tsx");

  assert.match(pageSource, /loadAppDashboardRouteViewModel/);
  assert.match(pageSource, /dashboardRouteToOrbitDashboardViewModel/);
  assert.match(pageSource, /OrbitRealDashboard/);
  assert.match(pageSource, /StateView/);
  assert.doesNotMatch(pageSource, /AppDashboardCommandCenter/);
  assert.doesNotMatch(pageSource, /OrbitRealParty|getOrbitPartyViewModel/);

  await withUnconfiguredLiveDashboard(async () => {
    const Page = (await import("../../app/(app)/app/dashboard/page")).default;
    const html = renderToStaticMarkup(await Page());

    assert.match(html, /app-dashboard-route-state/);
    assert.match(html, /Dashboard could not load/);
  });
});

test("real dashboard success UI hides command-center provenance details", async () => {
  const pageSource = source("app/(app)/app/dashboard/page.tsx");

  assert.match(pageSource, /OrbitRealDashboard/);

  await withModuleMode("mock", async () => {
    const { loadAppDashboardRouteViewModel } = await import(
      "../../app/(app)/app/dashboard/compose-app-dashboard-from-previously-approved-mock-first-capabilities/dashboard-route-view-model"
    );
    const { dashboardRouteToOrbitDashboardViewModel } = await import(
      "../../app/(app)/app/dashboard/compose-app-dashboard-from-previously-approved-mock-first-capabilities/dashboard-view-model-adapter"
    );
    const { OrbitRealDashboard } = await import(
      "../../app/(app)/app/dashboard/orbit-real-dashboard"
    );
    const routeModel = await loadAppDashboardRouteViewModel();

    assert.equal(routeModel.state, "success");

    if (routeModel.state !== "success") {
      return;
    }

    const html = renderToStaticMarkup(
      React.createElement(OrbitRealDashboard, {
        viewModel: dashboardRouteToOrbitDashboardViewModel(routeModel),
      }),
    );

    assert.match(html, /data-orbit-real-page="dashboard"/);
    assert.match(html, /关系健康/);
    assert.match(html, /关系资产/);
    assert.doesNotMatch(html, /Relationship assets/);
    assert.doesNotMatch(html, /app-dashboard-route/);
    assert.doesNotMatch(html, /data-state-boundary="app-dashboard-success"/);
    assert.doesNotMatch(html, /<details(?:\s|>)/i);
    assert.doesNotMatch(html, /Evidence source trail/);
    assert.doesNotMatch(html, /Technical provenance/);
  });
});
