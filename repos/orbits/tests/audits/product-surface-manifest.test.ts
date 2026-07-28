import assert from "node:assert/strict";
import test from "node:test";

import {
  buildProductSurfaceManifest,
} from "../../scripts/generate-product-surface-manifest.mjs";

const { manifest } = buildProductSurfaceManifest();
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
        action.behaviorEvidence === "present-imperative-static" ||
        action.behaviorEvidence === "delegated-props" ||
        action.behaviorEvidence === "missing-static",
    );
    assert.notEqual(action.confirmation, "verified");
  }
});

test("mock imports distinguish factory and type boundaries from direct production use", () => {
  const directMockImports = manifest.surfaces.flatMap(
    (surface) => surface.data.directMockImports,
  );
  const classifiedMockImports = manifest.surfaces.flatMap(
    (surface) => surface.data.mockBoundaryImports,
  );
  const classifications = new Set(
    classifiedMockImports.map((item) => item.classification),
  );

  assert.equal(manifest.schemaVersion, 2);
  assert.deepEqual(directMockImports, []);
  assert.ok(classifiedMockImports.length > 0);
  assert.equal(classifications.has("factory-mode-registration"), true);
  assert.equal(classifications.has("type-only-contract-reference"), true);
  assert.equal(
    classifications.has("explicit-mock-implementation-internal"),
    true,
  );
  assert.equal(
    classifiedMockImports.every(
      (item) => item.runtimeResultRisk === "resolved-by-static-boundary",
    ),
    true,
  );
});

test("translated and variable JSX labels count as accessible-name evidence", () => {
  const publicShellActions = allActions.filter((action) =>
    action.sourceFile.endsWith("app/orbit-public-shell.tsx"),
  );

  assert.ok(
    publicShellActions.some(
      (action) =>
        action.label === "Sign in" &&
        action.accessibleName === "present-static",
    ),
  );
  assert.equal(
    publicShellActions
      .filter((action) => action.label === "Sign in")
      .some((action) => action.accessibleName === "unresolved-static"),
    false,
  );
  assert.ok(
    allActions.some(
      (action) =>
        action.label === "{label}" &&
        action.accessibleName === "dynamic-runtime",
    ),
  );
  assert.equal(
    allActions
      .filter((action) =>
        action.sourceFile.endsWith("app/orbit-account-shell.tsx"),
      )
      .some(
        (action) =>
          action.line === 161 &&
          action.accessibleName === "unresolved-static",
      ),
    false,
  );
});

test("redirect aliases do not require route loading and error surfaces", () => {
  for (const route of ["/app/dashboard", "/app/followups", "/app/schedule"]) {
    const surface = manifest.surfaces.find((item) => item.route === route);

    assert.equal(surface?.states.sourceSignals.redirect, true);
    assert.equal(
      surface?.knownRisks.some(
        (risk) =>
          risk.type === "loading-state-unproven" ||
          risk.type === "error-state-unproven",
      ),
      false,
    );
  }
});

test("imperative starfield controls retain their static runtime evidence", () => {
  const starfieldActions = manifest.surfaces
    .filter((surface) => surface.route === "/" || surface.route === "/app")
    .flatMap((surface) => surface.actions)
    .filter((action) => action.sourceFile.includes("orbit-starfield-"));

  for (const label of [
    "切换到中文",
    "Switch to English",
    "菜单 / Menu",
    "发送给 iOrbit",
    "我要创业",
    "看看谁能帮我",
    "找金融 AI 方向的人脉",
    "推荐 AI / 出海活动",
  ]) {
    const matching = starfieldActions.filter((action) => action.label === label);
    assert.ok(matching.length > 0, `missing starfield action: ${label}`);
    assert.equal(
      matching.every(
        (action) =>
          action.behaviorEvidence === "present-imperative-static" &&
          action.imperativeBehaviorEvidence.length > 0,
      ),
      true,
      `missing imperative evidence: ${label}`,
    );
  }
});

test("pointer-down resize controls count as static behavior", () => {
  const resizeActions = allActions.filter(
    (action) =>
      action.sourceFile.endsWith("app/agent/orbit-real-agent.tsx") &&
      action.label?.includes("Resize chat history"),
  );

  assert.ok(resizeActions.length > 0);
  assert.equal(
    resizeActions.every(
      (action) =>
        action.behaviorEvidence === "present-static" &&
        action.handlers.includes("onpointerdown"),
    ),
    true,
  );
});

test("manifest generation writes the required repository artifacts", () => {
  assert.ok(manifest.summary.routes > 30);
  assert.ok(manifest.summary.actions > 100);
  assert.equal(
    manifest.summary.risks,
    manifest.surfaces.reduce(
      (total, surface) => total + surface.knownRisks.length,
      0,
    ),
  );
  assert.equal(manifest.summary.p0Candidates, 0);
  assert.equal(manifest.summary.p1Candidates, 0);
});
