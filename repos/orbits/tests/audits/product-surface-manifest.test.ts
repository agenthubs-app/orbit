import assert from "node:assert/strict";
import test from "node:test";

import {
  writeProductSurfaceManifest,
} from "../../scripts/generate-product-surface-manifest.mjs";

const manifest = writeProductSurfaceManifest();
const allActions = manifest.surfaces.flatMap((surface) =>
  surface.actions.map((action) => ({ route: surface.route, ...action })),
);

test("surface scanner covers every production page and excludes API/dev routes", () => {
  const routes = new Set(manifest.surfaces.map((surface) => surface.route));

  for (const route of [
    "/",
    "/app",
    "/app/account/login",
    "/app/agent",
    "/app/chat",
    "/app/contacts",
    "/app/contacts/[id]",
    "/app/contacts/all-actions",
    "/app/contacts/dashboard",
    "/app/contacts/graph",
    "/app/contacts/intros",
    "/app/contacts/new",
    "/app/contacts/pipeline",
    "/app/events",
    "/app/events/[id]",
    "/app/events/[id]/register",
    "/app/party",
    "/app/party/checkin",
    "/app/party/graph",
    "/app/platform",
    "/app/profile",
    "/app/schedule",
    "/app/settings",
    "/app/today",
  ]) {
    assert.equal(routes.has(route), true, `missing ${route}`);
  }

  assert.equal(
    manifest.surfaces.some(
      (surface) =>
        surface.route.startsWith("/api") || surface.route.startsWith("/dev"),
    ),
    false,
  );
  assert.equal(manifest.summary.routes, manifest.surfaces.length);
});

test("surface scanner derives private routes from the production auth boundary", () => {
  const byRoute = new Map(
    manifest.surfaces.map((surface) => [surface.route, surface]),
  );

  assert.equal(byRoute.get("/app/agent")?.access.policy, "authenticated");
  assert.equal(byRoute.get("/app/contacts/[id]")?.access.policy, "authenticated");
  assert.equal(byRoute.get("/app/account/login")?.access.policy, "public-auth-entry");
  assert.equal(byRoute.get("/app/events")?.access.policy, "public-at-proxy");
  assert.match(
    byRoute.get("/app/agent")?.access.anonymousBehavior ?? "",
    /redirect:\/app\/account\/login/,
  );
});

test("action coverage records source evidence and honest unresolved runtime fields", () => {
  assert.ok(allActions.length > 0);
  assert.equal(
    manifest.summary.actions,
    manifest.surfaces.reduce(
      (total, surface) => total + surface.actions.length,
      0,
    ),
  );

  for (const action of allActions) {
    assert.match(action.actionId, /^\/.*#\d+$/);
    assert.match(action.sourceFile, /^repos\/orbits\//);
    assert.ok(action.line > 0);
    assert.ok(
      action.behaviorEvidence === "present-static" ||
        action.behaviorEvidence === "delegated-props" ||
        action.behaviorEvidence === "missing-static",
    );
    assert.notEqual(action.confirmation, "verified");
  }
});

test("manifest generation writes the required repository artifacts", () => {
  assert.ok(manifest.summary.routes > 30);
  assert.ok(manifest.summary.actions > 100);
  assert.ok(manifest.summary.risks > 0);
});
