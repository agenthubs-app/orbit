import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = path.resolve(SCRIPT_DIR, "../../..");
const INVENTORY_PATH = path.join(
  WORKSPACE_ROOT,
  "docs/audits/full-product-functional-audit/inventory.json",
);
const DEFAULT_BASE_URL = "http://127.0.0.1:3110";

const ROUTE_SAMPLES = new Map([
  ["/app/contacts/[id]", "/app/contacts/demo-contact-1"],
  ["/app/events/[id]", "/app/events/EVT01"],
  ["/app/events/[id]/register", "/app/events/EVT01/register"],
  ["/app/o/[slug]", "/app/o/demo-event-1"],
  ["/app/schedule/events/[id]", "/app/schedule/events/demo-event-1"],
  [
    "/dev/capabilities/[slug]",
    "/dev/capabilities/business-card-review-and-confirm-flow",
  ],
]);

const PAGE_AUTHENTICATED_ROUTES = new Set(["/app/events/[id]/register"]);

export function runtimePathForSurface(surface) {
  if (surface.routeKind === "static") {
    return surface.route;
  }

  const sample = ROUTE_SAMPLES.get(surface.route);
  if (!sample) {
    throw new Error(`Missing runtime sample for dynamic Web route ${surface.route}`);
  }
  return sample;
}

export function expectedTransportForSurface(surface, runtimePath) {
  const requiresAuthentication =
    surface.access.policy === "authenticated-at-web-boundary" ||
    PAGE_AUTHENTICATED_ROUTES.has(surface.route);

  return requiresAuthentication
    ? {
        status: 307,
        locationPrefix: `/app/account/login?next=${encodeURIComponent(runtimePath)}`,
      }
    : { status: 200, locationPrefix: null };
}

export async function verifyWebRouteTransport({
  baseUrl = DEFAULT_BASE_URL,
  fetchImplementation = fetch,
} = {}) {
  const inventory = JSON.parse(await readFile(INVENTORY_PATH, "utf8"));
  const webSurfaces = inventory.surfaces.filter(
    (surface) => surface.client === "web",
  );
  const results = [];

  for (const surface of webSurfaces) {
    const runtimePath = runtimePathForSurface(surface);
    const expected = expectedTransportForSurface(surface, runtimePath);
    const response = await fetchImplementation(`${baseUrl}${runtimePath}`, {
      headers: { accept: "text/html" },
      redirect: "manual",
    });
    const body = await response.text();
    const location = response.headers.get("location");
    const statusMatches = response.status === expected.status;
    const locationMatches =
      expected.locationPrefix === null
        ? location === null
        : location?.startsWith(expected.locationPrefix) === true;
    const bodyMatches =
      response.status === 200 ? body.includes("<title>Orbit</title>") : true;

    results.push({
      surfaceId: surface.surfaceId,
      runtimePath,
      expectedStatus: expected.status,
      actualStatus: response.status,
      location,
      responseBytes: body.length,
      conclusion:
        statusMatches && locationMatches && bodyMatches ? "pass" : "fail",
    });
  }

  return {
    baseUrl,
    generatedAt: new Date().toISOString(),
    summary: {
      routeSurfaces: results.length,
      okResponses: results.filter((result) => result.actualStatus === 200).length,
      authRedirects: results.filter((result) => result.actualStatus === 307)
        .length,
      failures: results.filter((result) => result.conclusion === "fail").length,
    },
    results,
  };
}

async function main() {
  const report = await verifyWebRouteTransport({
    baseUrl: process.env.ORBIT_AUDIT_BASE_URL ?? DEFAULT_BASE_URL,
  });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (report.summary.failures > 0) {
    process.exitCode = 1;
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  void main();
}
