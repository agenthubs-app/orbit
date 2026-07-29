import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  expectedTransportForSurface,
  runtimePathForSurface,
  verifyWebRouteTransport,
} from "../../scripts/verify-web-route-transport.mjs";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const INVENTORY_PATH = path.resolve(
  TEST_DIR,
  "../../../../docs/audits/full-product-functional-audit/inventory.json",
);
const inventory = JSON.parse(readFileSync(INVENTORY_PATH, "utf8"));
const webSurfaces = inventory.surfaces.filter(
  (surface: { client: string }) => surface.client === "web",
);
const webSurfaceByRuntimePath = new Map(
  webSurfaces.map((surface: { access: { policy: string } }) => [
    runtimePathForSurface(surface),
    surface,
  ]),
);

function requiresAuthentication(pathname: string): boolean {
  const surface = webSurfaceByRuntimePath.get(pathname);
  assert.ok(surface, `missing Web surface for runtime path ${pathname}`);

  return (
    surface.access.policy === "authenticated-at-web-boundary" ||
    /^\/app\/events\/[^/]+\/register$/u.test(pathname)
  );
}

test("all dynamic Web routes have an explicit valid runtime sample", () => {
  const runtimePaths = webSurfaces.map(runtimePathForSurface);

  assert.equal(runtimePaths.length, 46);
  assert.equal(new Set(runtimePaths).size, 46);
  assert.equal(runtimePaths.includes("/app/events/EVT01"), true);
  assert.equal(
    runtimePaths.includes(
      "/dev/capabilities/business-card-review-and-confirm-flow",
    ),
    true,
  );
});

test("transport expectations distinguish public event detail from authenticated registration", () => {
  const eventDetail = webSurfaces.find(
    (surface: { route: string }) => surface.route === "/app/events/[id]",
  );
  const registration = webSurfaces.find(
    (surface: { route: string }) =>
      surface.route === "/app/events/[id]/register",
  );

  assert.deepEqual(
    expectedTransportForSurface(eventDetail, "/app/events/EVT01"),
    { status: 200, locationPrefix: null },
  );
  assert.deepEqual(
    expectedTransportForSurface(registration, "/app/events/EVT01/register"),
    {
      status: 307,
      locationPrefix:
        "/app/account/login?next=%2Fapp%2Fevents%2FEVT01%2Fregister",
    },
  );
});

test("whole-Web transport verification reports every route and any mismatch", async () => {
  const report = await verifyWebRouteTransport({
    baseUrl: "https://orbit.test",
    fetchImplementation: async (input: string | URL | Request) => {
      const pathname = new URL(String(input)).pathname;
      const authenticated = requiresAuthentication(pathname);
      return new Response(authenticated ? "" : "<title>Orbit</title>", {
        status: authenticated ? 307 : 200,
        headers: authenticated
          ? {
              location: `/app/account/login?next=${encodeURIComponent(pathname)}`,
            }
          : undefined,
      });
    },
  });

  assert.deepEqual(report.summary, {
    routeSurfaces: 46,
    okResponses: 20,
    authRedirects: 26,
    failures: 0,
  });
  assert.equal(report.results.every((result) => result.conclusion === "pass"), true);

  const failedReport = await verifyWebRouteTransport({
    baseUrl: "https://orbit.test",
    fetchImplementation: async () =>
      new Response("<title>Failure</title>", { status: 500 }),
  });
  assert.equal(failedReport.summary.failures, 46);
});
