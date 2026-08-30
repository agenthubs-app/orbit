import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const projectRoot = join(new URL("..", import.meta.url).pathname, "..");
const routePath = join(
  projectRoot,
  "app/api/dashboard/structure/[dimension]/[bucketId]/route.ts",
);

test("structure detail route is actor scoped and validates route identifiers in the service", () => {
  assert.equal(existsSync(routePath), true);
  const source = readFileSync(routePath, "utf8");

  assert.match(source, /resolveAuthenticatedApiActor/u);
  assert.match(source, /createActorScopedNetworkDistributionAnalyticsService/u);
  assert.match(source, /getStructureDetail/u);
  assert.match(source, /dimension/u);
  assert.match(source, /bucketId/u);
  assert.doesNotMatch(source, /searchParams\.get\(["']actorId/u);
});
