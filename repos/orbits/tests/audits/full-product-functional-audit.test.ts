import assert from "node:assert/strict";
import {
  existsSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildFullProductFunctionalAuditInventory,
  writeFullProductFunctionalAudit,
} from "../../scripts/generate-full-product-functional-audit.mjs";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.resolve(TEST_DIR, "../..");
const WORKSPACE_ROOT = path.resolve(WEB_ROOT, "../..");
const WEB_APP_ROOT = path.join(WEB_ROOT, "app");
const MOBILE_APP_ROOT = path.join(WORKSPACE_ROOT, "repos/orbit-app/app");
const OUTPUT_ROOT = path.join(
  WORKSPACE_ROOT,
  "docs/audits/full-product-functional-audit",
);

function listFiles(
  root: string,
  predicate: (filePath: string) => boolean,
): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    if (
      entry.name === ".expo" ||
      entry.name === ".next" ||
      entry.name === "node_modules"
    ) {
      return [];
    }
    const absolutePath = path.join(root, entry.name);
    return entry.isDirectory()
      ? listFiles(absolutePath, predicate)
      : predicate(absolutePath)
        ? [absolutePath]
        : [];
  });
}

function expectedWebPageCount(): number {
  return listFiles(
    WEB_APP_ROOT,
    (filePath) =>
      (path.basename(filePath) === "page.tsx" ||
        path.basename(filePath) === "page.ts") &&
      !filePath.includes(`${path.sep}app${path.sep}api${path.sep}`),
  ).length;
}

function expectedMobileRouteCount(): number {
  return listFiles(
    MOBILE_APP_ROOT,
    (filePath) =>
      /\.(?:ts|tsx)$/u.test(filePath) &&
      path.basename(filePath) !== "_layout.tsx" &&
      path.basename(filePath) !== "_layout.ts",
  ).length;
}

const inventory = buildFullProductFunctionalAuditInventory();

test("inventory derives the full Web and Expo route denominator from both route trees", () => {
  assert.equal(inventory.summary.webRoutes, expectedWebPageCount());
  assert.equal(inventory.summary.mobileRoutes, expectedMobileRouteCount());
  assert.equal(
    inventory.summary.routeSurfaces,
    expectedWebPageCount() + expectedMobileRouteCount(),
  );
  assert.equal(
    new Set(inventory.surfaces.map((surface) => surface.surfaceId)).size,
    inventory.summary.routeSurfaces,
  );

  for (const surfaceId of [
    "web:/",
    "web:/app/agent",
    "web:/dev/capabilities/[slug]",
    "mobile:/",
    "mobile:/events/[id]/attendees",
    "mobile:/settings/api",
  ]) {
    assert.equal(
      inventory.surfaces.some((surface) => surface.surfaceId === surfaceId),
      true,
      `missing ${surfaceId}`,
    );
  }
});

test("every route-reachable interaction has a stable identity and audit fields", () => {
  const interactions = inventory.surfaces.flatMap(
    (surface) => surface.interactions,
  );
  assert.equal(
    interactions.length,
    inventory.summary.interactionRouteInstances,
  );
  assert.ok(interactions.length > 0);
  assert.equal(
    new Set(interactions.map((interaction) => interaction.interactionId)).size,
    interactions.length,
  );

  for (const interaction of interactions) {
    assert.match(interaction.interactionId, /#interaction-\d+$/u);
    assert.match(interaction.sourceFile, /^repos\/(?:orbits|orbit-app)\//u);
    assert.ok(interaction.line > 0);
    assert.ok(interaction.controlType.length > 0);
    assert.ok(interaction.actualResult.length > 0);
    assert.ok(interaction.conclusion.length > 0);
    assert.ok(Array.isArray(interaction.testEvidence));
  }
});

test("visible controls do not rely on missing static behavior evidence", () => {
  const missingHandlers = inventory.surfaces.flatMap((surface) =>
    surface.interactions.filter(
      (interaction) =>
        interaction.conclusion === "candidate-missing-handler",
    ),
  );

  assert.deepEqual(
    missingHandlers.map((interaction) => ({
      interactionId: interaction.interactionId,
      source: `${interaction.sourceFile}:${interaction.line}`,
      visibleName: interaction.visibleName,
    })),
    [],
  );
});

test("visible controls have static accessible-name evidence", () => {
  const missingAccessibleNames = inventory.surfaces.flatMap((surface) =>
    surface.interactions.filter(
      (interaction) =>
        interaction.conclusion === "candidate-missing-accessible-name",
    ),
  );

  assert.deepEqual(
    missingAccessibleNames.map((interaction) => ({
      interactionId: interaction.interactionId,
      source: `${interaction.sourceFile}:${interaction.line}`,
      controlType: interaction.controlType,
    })),
    [],
  );
});

test("browser base-state evidence is scoped to the 23 directly rendered Web surfaces", () => {
  const browserEvidenceSurfaces = inventory.surfaces.filter(
    (surface) =>
      surface.runtimeEvidence.includes(
        "in-app browser base-state at 1440x900",
      ),
  );

  assert.equal(browserEvidenceSurfaces.length, 23);
  assert.equal(inventory.summary.surfacesWithRuntimeEvidence, 33);
  assert.equal(inventory.summary.interactionsRuntimeVerified, 26);
  assert.equal(
    inventory.surfaces.find(
      (surface) => surface.surfaceId === "web:/app/events/[id]/register",
    )?.verificationConclusion,
    "runtime-partially-verified-live-event-registration",
  );
  assert.equal(
    inventory.surfaces.find(
      (surface) => surface.surfaceId === "web:/app/contacts/new",
    )?.verificationConclusion,
    "runtime-partially-verified-external-capability-restricted",
  );
  assert.equal(
    inventory.surfaces.find(
      (surface) => surface.surfaceId === "web:/app/contacts",
    )?.verificationConclusion,
    "runtime-partially-verified-live-contact-list",
  );
  for (const surfaceId of [
    "mobile:/account",
    "mobile:/account/login",
    "mobile:/profile",
  ]) {
    assert.equal(
      inventory.surfaces.find((surface) => surface.surfaceId === surfaceId)
        ?.verificationConclusion,
      "runtime-partially-verified-expo-web-auth-profile-account",
    );
  }
  assert.equal(
    inventory.surfaces.find(
      (surface) => surface.surfaceId === "mobile:/account/permissions",
    )?.verificationConclusion,
    "runtime-partially-verified-expo-web-permission-persistence",
  );
  assert.equal(
    inventory.surfaces.find(
      (surface) => surface.surfaceId === "mobile:/contacts/new",
    )?.verificationConclusion,
    "runtime-partially-verified-expo-contact-acquisition-live-boundaries",
  );
  assert.equal(
    inventory.surfaces.find(
      (surface) => surface.surfaceId === "web:/app/contacts/[id]",
    )?.verificationConclusion,
    "runtime-partially-verified-live-contact-detail",
  );
  assert.equal(
    browserEvidenceSurfaces.every(
      (surface) =>
        surface.client === "web" &&
        surface.entryBehavior ===
          "browser-base-state-rendered-with-non-empty-content" &&
        surface.responsive.desktop.includes("1440x900") &&
        surface.responsive.mobile.includes("390x844") &&
        surface.verificationConclusion.startsWith("runtime-partially-verified"),
    ),
    true,
  );
  assert.equal(
    inventory.surfaces
      .find((surface) => surface.surfaceId === "web:/app/agent")
      ?.runtimeEvidence.length,
    0,
  );
  assert.equal(
    inventory.surfaces
      .find((surface) => surface.surfaceId === "web:/app/profile")
      ?.runtimeEvidence.includes("two-account isolation"),
    true,
  );
});

test("overlay implementation and route-instance denominators are internally consistent", () => {
  const routeInstances = inventory.surfaces.flatMap(
    (surface) => surface.overlays,
  );
  assert.equal(
    routeInstances.length,
    inventory.summary.overlayRouteInstances,
  );
  assert.equal(
    new Set(
      inventory.overlayImplementations.map(
        (overlay) => overlay.implementationId,
      ),
    ).size,
    inventory.summary.overlayImplementations,
  );
  for (const instance of routeInstances) {
    assert.equal(
      inventory.overlayImplementations.some(
        (implementation) =>
          implementation.implementationId === instance.implementationId,
      ),
      true,
    );
  }
});

test("generated documents and machine inventory share the same denominators", () => {
  const written = writeFullProductFunctionalAudit();
  for (const name of [
    "README.md",
    "surfaces.md",
    "interaction-matrix.md",
    "verification.md",
    "remediation.md",
    "inventory.json",
  ]) {
    assert.equal(existsSync(path.join(OUTPUT_ROOT, name)), true, `missing ${name}`);
  }

  const json = JSON.parse(
    readFileSync(path.join(OUTPUT_ROOT, "inventory.json"), "utf8"),
  );
  const readme = readFileSync(path.join(OUTPUT_ROOT, "README.md"), "utf8");
  const surfaces = readFileSync(path.join(OUTPUT_ROOT, "surfaces.md"), "utf8");
  const interactions = readFileSync(
    path.join(OUTPUT_ROOT, "interaction-matrix.md"),
    "utf8",
  );

  assert.equal(json.summary.routeSurfaces, written.summary.routeSurfaces);
  assert.equal(
    json.summary.interactionRouteInstances,
    written.summary.interactionRouteInstances,
  );
  assert.match(
    readme,
    new RegExp(`路由界面分母：${written.summary.routeSurfaces}`, "u"),
  );
  assert.match(
    interactions,
    new RegExp(`当前分母为 ${written.summary.interactionRouteInstances}`, "u"),
  );
  assert.equal(
    surfaces
      .split("\n")
      .filter((line) => line.startsWith("| `web:") || line.startsWith("| `mobile:"))
      .length,
    written.summary.routeSurfaces,
  );
});
