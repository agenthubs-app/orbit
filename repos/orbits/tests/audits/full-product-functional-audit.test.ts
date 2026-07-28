import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import os from "node:os";
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
  assert.equal(inventory.summary.surfacesWithRuntimeEvidence, 94);
  const runtimeVerifiedInteractions = inventory.surfaces.flatMap((surface) =>
    surface.interactions.filter(
      (interaction) =>
        interaction.conclusion === "runtime-verified-exercised-case",
    ),
  );
  const publicEventDetailInteractions = runtimeVerifiedInteractions.filter(
    (interaction) =>
      interaction.testEvidence.includes(
        "web-public-event-detail-lifecycle-2026-07-29",
      ),
  );

  assert.equal(
    inventory.summary.interactionsRuntimeVerified,
    runtimeVerifiedInteractions.length,
  );
  assert.equal(publicEventDetailInteractions.length, 21);
  assert.equal(
    inventory.surfaces.find(
      (surface) => surface.surfaceId === "web:/app/profile",
    )?.verificationConclusion,
    "runtime-partially-verified-web-profile-complete-lifecycle",
  );
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
      (surface) => surface.surfaceId === "web:/app/home",
    )?.verificationConclusion,
    "runtime-partially-verified-web-actor-scoped-home-event",
  );
  assert.equal(
    inventory.surfaces.find(
      (surface) => surface.surfaceId === "web:/app/home/events",
    )?.verificationConclusion,
    "runtime-partially-verified-web-home-events-filter-and-detail",
  );
  assert.equal(
    inventory.surfaces.find(
      (surface) => surface.surfaceId === "web:/app/today",
    )?.verificationConclusion,
    "runtime-partially-verified-web-today-meeting-service-boundary",
  );
  assert.equal(
    inventory.surfaces.find(
      (surface) => surface.surfaceId === "web:/app/dashboard",
    )?.verificationConclusion,
    "runtime-partially-verified-web-actor-scoped-relationship-dashboard",
  );
  assert.equal(
    inventory.surfaces.find(
      (surface) => surface.surfaceId === "web:/app/followups",
    )?.verificationConclusion,
    "runtime-partially-verified-web-followups-today-compatibility-route",
  );
  assert.equal(
    inventory.surfaces.find(
      (surface) => surface.surfaceId === "web:/app/schedule",
    )?.verificationConclusion,
    "runtime-partially-verified-web-schedule-today-compatibility-route",
  );
  assert.equal(
    inventory.surfaces.find(
      (surface) => surface.surfaceId === "web:/app/schedule/events/[id]",
    )?.verificationConclusion,
    "runtime-partially-verified-web-schedule-dynamic-event-identity",
  );
  for (const [surfaceId, verificationConclusion] of [
    [
      "web:/app/party",
      "runtime-partially-verified-web-party-source-context-boundary",
    ],
    [
      "web:/app/party/checkin",
      "runtime-partially-verified-web-party-checkin-source-context-boundary",
    ],
    [
      "web:/app/party/graph",
      "runtime-partially-verified-web-party-graph-source-context-boundary",
    ],
  ] as const) {
    assert.equal(
      inventory.surfaces.find((surface) => surface.surfaceId === surfaceId)
        ?.verificationConclusion,
      verificationConclusion,
    );
  }
  for (const [surfaceId, verificationConclusion] of [
    [
      "mobile:/ai",
      "runtime-partially-verified-expo-ai-history-persistence",
    ],
    [
      "mobile:/ai/[id]",
      "runtime-partially-verified-expo-ai-conversation-readback",
    ],
    ["mobile:/chat", "runtime-partially-verified-expo-chat-empty-boundary"],
    [
      "mobile:/chat/[id]",
      "runtime-partially-verified-expo-chat-missing-boundary",
    ],
    [
      "mobile:/contacts/[id]",
      "runtime-partially-verified-expo-contact-missing-boundary",
    ],
    ["mobile:/events", "runtime-partially-verified-expo-live-event-chain"],
    [
      "mobile:/events/[id]",
      "runtime-partially-verified-expo-live-event-chain",
    ],
    [
      "mobile:/events/[id]/attendees",
      "runtime-partially-verified-expo-live-event-chain",
    ],
    [
      "mobile:/events/[id]/register",
      "runtime-partially-verified-expo-live-event-chain",
    ],
    ["mobile:/party", "runtime-partially-verified-expo-party-truthful-boundary"],
    [
      "mobile:/party/checkin",
      "runtime-partially-verified-expo-party-truthful-boundary",
    ],
    [
      "mobile:/party/graph",
      "runtime-partially-verified-expo-party-truthful-boundary",
    ],
    [
      "mobile:/o/[slug]",
      "runtime-partially-verified-expo-organizer-public-isolation",
    ],
    [
      "mobile:/register",
      "runtime-partially-verified-expo-register-missing-context",
    ],
    [
      "mobile:/register/[code]",
      "runtime-partially-verified-expo-register-live-preview",
    ],
    ["mobile:/schedule", "runtime-partially-verified-expo-live-schedule"],
    [
      "mobile:/schedule/events/[id]",
      "runtime-partially-verified-expo-live-schedule-preview",
    ],
    [
      "mobile:/settings",
      "runtime-partially-verified-expo-settings-destinations",
    ],
    [
      "mobile:/settings/api",
      "runtime-partially-verified-expo-api-settings-persistence",
    ],
    [
      "mobile:/account/signup",
      "runtime-partially-verified-expo-signup-validation",
    ],
    [
      "mobile:/account/forgot-password",
      "runtime-partially-verified-expo-password-reset-restricted",
    ],
    [
      "mobile:/account/mobile-google",
      "runtime-partially-verified-expo-mobile-google-fallback",
    ],
  ] as const) {
    assert.equal(
      inventory.surfaces.find((surface) => surface.surfaceId === surfaceId)
        ?.verificationConclusion,
      verificationConclusion,
    );
  }
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
        surface.entryBehavior !== "not-runtime-verified" &&
        surface.responsive.desktop.includes("1440x900") &&
        surface.responsive.mobile.includes("390x844") &&
        surface.verificationConclusion.startsWith("runtime-partially-verified"),
    ),
    true,
  );
  const publicEventCatalogue = inventory.surfaces.find(
    (surface) => surface.surfaceId === "web:/app/events",
  );
  assert.equal(
    publicEventCatalogue?.entryBehavior,
    "authenticated-browser-public-event-catalogue-search-filter-map-verified",
  );
  assert.equal(
    publicEventCatalogue?.runtimeEvidence.includes(
      "the public catalogue rendered all 13 approved events before filtering",
    ),
    true,
  );
  assert.equal(
    publicEventCatalogue?.runtimeEvidence.includes(
      "in-app browser base-state at 1440x900",
    ),
    true,
  );
  assert.equal(
    inventory.surfaces
      .find((surface) => surface.surfaceId === "web:/app/agent")
      ?.runtimeEvidence.length,
    4,
  );
  assert.equal(
    inventory.surfaces
      .find((surface) => surface.surfaceId === "web:/app/chat")
      ?.runtimeEvidence.length,
    4,
  );
  assert.equal(
    inventory.surfaces
      .find(
        (surface) => surface.surfaceId === "web:/app/contacts/all-actions",
      )
      ?.runtimeEvidence.length,
    3,
  );
  for (const [surfaceId, evidenceCount] of [
    ["web:/app/contacts/dashboard", 3],
    ["web:/app/contacts/graph", 4],
    ["web:/app/contacts/intros", 6],
    ["web:/app/contacts/pipeline", 3],
  ] as const) {
    assert.equal(
      inventory.surfaces.find((surface) => surface.surfaceId === surfaceId)
        ?.runtimeEvidence.length,
      evidenceCount,
    );
  }
  assert.equal(
    inventory.surfaces
      .find((surface) => surface.surfaceId === "web:/app/profile")
      ?.runtimeEvidence.includes("two-account isolation"),
    true,
  );
  assert.equal(
    inventory.surfaces
      .find((surface) => surface.surfaceId === "web:/app/profile")
      ?.interactions.filter(
        (interaction) =>
          interaction.actualResult !== "not-runtime-verified",
      ).length,
    18,
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
  const outputRoot = mkdtempSync(
    path.join(os.tmpdir(), "orbit-full-product-audit-"),
  );

  try {
    const written = writeFullProductFunctionalAudit(outputRoot);
    for (const name of [
      "README.md",
      "surfaces.md",
      "interaction-matrix.md",
      "verification.md",
      "remediation.md",
      "inventory.json",
    ]) {
      assert.equal(
        existsSync(path.join(outputRoot, name)),
        true,
        `missing ${name}`,
      );
    }

    const json = JSON.parse(
      readFileSync(path.join(outputRoot, "inventory.json"), "utf8"),
    );
    const readme = readFileSync(path.join(outputRoot, "README.md"), "utf8");
    const surfaces = readFileSync(
      path.join(outputRoot, "surfaces.md"),
      "utf8",
    );
    const interactions = readFileSync(
      path.join(outputRoot, "interaction-matrix.md"),
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
        .filter(
          (line) =>
            line.startsWith("| `web:") || line.startsWith("| `mobile:"),
        ).length,
      written.summary.routeSurfaces,
    );
  } finally {
    rmSync(outputRoot, { force: true, recursive: true });
  }
});
