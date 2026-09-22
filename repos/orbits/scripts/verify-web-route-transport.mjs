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

// iOrbit 任务 6b：这张表与 inventory.json 的动态路由集合必须一一对应，否则
// `runtimePathForSurface` 会抛。审计产物此前长期未重生成，表里既留着任务 6a 删掉的
// /app/schedule/events/[id]，又缺了更早批次就已上线的 11 条动态路由；本次一并对齐。
const ROUTE_SAMPLES = new Map([
  [
    "/app/contacts/analysis/[dimension]/[bucketId]",
    "/app/contacts/analysis/industry/demo-bucket-1",
  ],
  ["/app/contacts/[id]", "/app/contacts/demo-contact-1"],
  ["/app/events/[id]", "/app/events/EVT01"],
  ["/app/events/[id]/analytics", "/app/events/EVT01/analytics"],
  ["/app/events/[id]/live", "/app/events/EVT01/live"],
  ["/app/events/[id]/operations", "/app/events/EVT01/operations"],
  [
    "/app/events/[id]/operations/admission",
    "/app/events/EVT01/operations/admission",
  ],
  [
    "/app/events/[id]/operations/check-in",
    "/app/events/EVT01/operations/check-in",
  ],
  [
    "/app/events/[id]/operations/experience",
    "/app/events/EVT01/operations/experience",
  ],
  ["/app/events/[id]/register", "/app/events/EVT01/register"],
  ["/app/inbox/sources/[id]", "/app/inbox/sources/demo-source-1"],
  ["/app/invitations/[token]", "/app/invitations/demo-invitation-token-1"],
  ["/app/o/[slug]", "/app/o/demo-event-1"],
  ["/app/tasks/[id]", "/app/tasks/demo-task-1"],
  [
    "/app/tasks/relationship/[id]",
    "/app/tasks/relationship/demo-relationship-1",
  ],
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
