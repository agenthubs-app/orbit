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

test("prop-gated DataCard pressables are counted only on routes that pass onPress", () => {
  const dataCardPressableSurfaces = inventory.surfaces
    .filter((surface) =>
      surface.interactions.some(
        (interaction) =>
          interaction.sourceFile ===
            "repos/orbit-app/src/components/DataCard.tsx" &&
          interaction.tag === "Pressable",
      ),
    )
    .map((surface) => surface.surfaceId)
    .sort();

  assert.deepEqual(dataCardPressableSurfaces, [
    "mobile:/account",
    "mobile:/contacts/pipeline",
    "mobile:/followups",
    "mobile:/home/events",
    "mobile:/profile",
    "mobile:/settings",
  ]);
});

test("route query parameters come from route-local URL consumers, not transitive get/set calls", () => {
  const routeParameters = (surfaceId: string): string[] => {
    const surface = inventory.surfaces.find(
      (candidate) => candidate.surfaceId === surfaceId,
    );
    assert.ok(surface, surfaceId);
    return surface.routeParameters.queryParameters;
  };

  assert.deepEqual(routeParameters("mobile:/account"), []);
  assert.deepEqual(routeParameters("mobile:/contacts/list"), [
    "q",
    "query",
    "refreshToken",
    "source",
    "status",
    "tag",
    "value",
  ]);
  assert.deepEqual(routeParameters("mobile:/ai/[id]"), [
    "initialMessage",
    "source",
  ]);
  assert.deepEqual(routeParameters("web:/app/account/login"), [
    "created",
    "email",
    "next",
    "orbitVisualSeed",
  ]);
  assert.deepEqual(routeParameters("web:/app/contacts/dashboard"), [
    "orbitVisualSeed",
  ]);

  const allRouteQueryParameters = inventory.surfaces.flatMap(
    (surface) => surface.routeParameters.queryParameters,
  );
  for (const falsePositive of [
    "Content-Type",
    "Set-Cookie",
    "X-Orbit-Feature-Mode",
    "X-Orbit-Privacy",
    "X-Orbit-Runtime-Boundary",
    "4636af91-bda9-4959-bb19-8ab1c003d4e6",
  ]) {
    assert.equal(
      allRouteQueryParameters.includes(falsePositive),
      false,
      falsePositive,
    );
  }
});

test("route UI inventory follows imported exports instead of sibling components", () => {
  const adminAccess = inventory.surfaces.find(
    (surface) => surface.surfaceId === "web:/app/admin/access",
  );
  const adminDashboard = inventory.surfaces.find(
    (surface) => surface.surfaceId === "web:/app/admin",
  );

  assert.ok(adminAccess);
  assert.deepEqual(
    adminAccess.interactions.map((interaction) => interaction.sourceFile),
    ["repos/orbits/app/(app)/app/admin/orbit-real-admin-login.tsx"],
  );
  assert.ok(adminDashboard);
  assert.equal(
    adminDashboard.interactions.some(
      (interaction) =>
        interaction.sourceFile ===
        "repos/orbits/app/(app)/app/orbit-reference-primitives.tsx",
    ),
    false,
  );
  assert.equal(
    adminDashboard.interactions.some(
      (interaction) =>
        interaction.sourceFile === "repos/orbits/shared/ui/primitives.tsx",
    ),
    false,
  );
  assert.equal(
    adminDashboard.interactions.some(
      (interaction) =>
        interaction.sourceFile === "repos/orbits/shared/ui/state-view.tsx",
    ),
    true,
  );
});

test("visible controls do not rely on missing static behavior evidence", () => {
  const missingHandlers = inventory.surfaces.flatMap((surface) =>
    surface.interactions.filter(
      (interaction) => interaction.conclusion === "candidate-missing-handler",
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

test("browser base-state evidence is scoped to the 20 currently direct Web surfaces", () => {
  const browserEvidenceSurfaces = inventory.surfaces.filter((surface) =>
    surface.runtimeEvidence.includes("in-app browser base-state at 1440x900"),
  );

  assert.equal(browserEvidenceSurfaces.length, 20);
  for (const route of ["/app/admin", "/app/admin/events", "/app/platform"]) {
    const surface = inventory.surfaces.find(
      (candidate) => candidate.surfaceId === `web:${route}`,
    );
    assert.ok(surface, route);
    assert.equal(
      surface.runtimeEvidence.includes("in-app browser base-state at 1440x900"),
      false,
      route,
    );
    assert.equal(surface.access.policy, "authenticated-at-web-boundary", route);
  }
  for (const route of ["/app/admin/access", "/app/login-admin"]) {
    const surface = inventory.surfaces.find(
      (candidate) => candidate.surfaceId === `web:${route}`,
    );
    assert.ok(surface, route);
    assert.equal(
      surface.runtimeEvidence.includes("in-app browser base-state at 1440x900"),
      true,
      route,
    );
    assert.equal(surface.access.policy, "public-admin-auth-entry", route);
  }
  assert.equal(
    inventory.summary.surfacesWithRuntimeEvidence,
    inventory.summary.routeSurfaces,
  );
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
  const publicOrganizerNavigationInteractions =
    runtimeVerifiedInteractions.filter((interaction) =>
      interaction.testEvidence.includes(
        "web-public-organizer-navigation-2026-07-29",
      ),
    );
  const publicOrganizerUnknownSlugInteractions =
    runtimeVerifiedInteractions.filter((interaction) =>
      interaction.testEvidence.includes(
        "web-public-organizer-unknown-slug-boundary-2026-07-29",
      ),
    );

  assert.equal(
    inventory.summary.interactionsRuntimeVerified,
    runtimeVerifiedInteractions.length,
  );
  assert.equal(inventory.summary.uniqueInteractionSourceLocations, 1254);
  assert.equal(inventory.summary.normalizedStaticBehaviorImplementations, 924);
  assert.equal(inventory.summary.renderedLeafControls, null);
  assert.match(
    inventory.summary.renderedLeafControlStatus,
    /unresolved-runtime-denominator/u,
  );
  assert.equal(inventory.summary.renderedLeafObservedOccurrences, 3001);
  assert.equal(inventory.summary.renderedLeafObservedStates, 279);
  assert.equal(inventory.summary.renderedLeafObservedUniqueStateKeys, 273);
  assert.equal(inventory.renderedLeafObservations.manifestCount, 13);
  assert.equal(
    inventory.renderedLeafObservations.manifests.reduce(
      (sum, manifest) => sum + manifest.leafControlOccurrences,
      0,
    ),
    inventory.summary.renderedLeafObservedOccurrences,
  );
  assert.equal(
    inventory.renderedLeafObservations.status,
    "state-local-observation-not-final-denominator",
  );
  assert.match(
    inventory.sourceState,
    /^(clean-head|head-plus-uncommitted-authoritative-inputs)$/u,
  );
  assert.equal(
    Number.isInteger(inventory.uncommittedAuthoritativeInputChanges),
    true,
  );
  assert.equal(
    runtimeVerifiedInteractions.some(
      (interaction) =>
        interaction.surfaceId === "mobile:/account/login" &&
        interaction.sourceFile ===
          "repos/orbit-app/src/screens/profile/AccountAuthScreen.tsx" &&
        interaction.tag === "AuthField" &&
        interaction.handlers.some(
          (handler) =>
            handler.event === "onchange" &&
            handler.expression === "(value) => updateValue(field, value)",
        ),
    ),
    true,
    "mobile auth runtime evidence must survive unrelated source-line shifts",
  );
  const memorySettingsInteractions = runtimeVerifiedInteractions.filter(
    (interaction) =>
      interaction.surfaceId === "web:/app/settings" &&
      interaction.sourceFile ===
        "repos/orbits/app/(app)/app/settings/orbit-agent-memory-settings.tsx",
  );
  assert.equal(memorySettingsInteractions.length, 11);
  assert.match(
    memorySettingsInteractions.find((interaction) =>
      interaction.visibleName?.includes("Use memory in Agent replies"),
    )?.actualResult ?? "",
    /^Use memory changed/u,
  );
  assert.match(
    memorySettingsInteractions.find((interaction) =>
      interaction.visibleName?.includes(
        "Allow approved learning from conversations",
      ),
    )?.actualResult ?? "",
    /^Approved conversation learning changed/u,
  );
  assert.equal(
    runtimeVerifiedInteractions.some(
      (interaction) =>
        interaction.surfaceId === "web:/app/today" &&
        interaction.sourceFile ===
          "repos/orbits/app/(app)/app/today/orbit-today-time-spine.tsx" &&
        interaction.visibleName === "Got it / 知道了" &&
        interaction.handlers.some(
          (handler) =>
            handler.event === "onclick" && handler.expression === "onClose",
        ),
    ),
    true,
    "Today dialog runtime evidence must survive unrelated source-line shifts",
  );
  const currentAgentRetryInteraction = runtimeVerifiedInteractions.find(
    (interaction) =>
      interaction.surfaceId === "web:/app/agent" &&
      interaction.sourceFile ===
        "repos/orbits/app/(app)/app/agent/orbit-real-agent.tsx" &&
      interaction.visibleName === "重新提交请求 / Retry request" &&
      interaction.handlers.some(
        (handler) =>
          handler.event === "onclick" &&
          handler.expression ===
            "() => void ask(message.retryRequest!, index)",
      ),
  );
  assert.equal(
    currentAgentRetryInteraction?.testEvidence.includes(
      "web-agent-retry-idempotent-current-handler-2026-07-30",
    ),
    true,
    "changed handlers require runtime evidence bound to the current stable handler key",
  );
  assert.equal(
    runtimeVerifiedInteractions.some(
      (interaction) =>
        interaction.surfaceId === "web:/app/agent" &&
        interaction.sourceFile ===
          "repos/orbits/app/(app)/app/agent/orbit-real-agent.tsx" &&
        interaction.visibleName === "重新提交请求 / Retry request" &&
        interaction.handlers.some(
          (handler) =>
            handler.event === "onclick" &&
            handler.expression !==
              "() => void ask(message.retryRequest!, index)",
        ),
    ),
    false,
    "a matching label or source line must not promote any other retry handler",
  );
  const homeEventRuntimeInteractions = runtimeVerifiedInteractions.filter(
    (interaction) =>
      interaction.sourceFile ===
        "repos/orbits/app/(app)/app/home/orbit-real-home.tsx" &&
      interaction.visibleName === "{content}" &&
      interaction.testEvidence.some((evidence) =>
        [
          "web-home-private-event-boundaries-2026-07-29",
          "home-party-event-identity-repair-2026-07-30",
        ].includes(evidence),
      ),
  );
  assert.equal(homeEventRuntimeInteractions.length, 3);
  assert.equal(
    homeEventRuntimeInteractions.some((interaction) =>
      interaction.testEvidence.includes(
        "home-party-event-identity-repair-2026-07-30",
      ),
    ),
    true,
    "Home event evidence must be keyed by owner plus behavior, not source line",
  );
  assert.equal(publicEventDetailInteractions.length, 20);
  assert.equal(publicOrganizerNavigationInteractions.length, 3);
  assert.equal(publicOrganizerUnknownSlugInteractions.length, 2);
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
    inventory.surfaces.find((surface) => surface.surfaceId === "web:/app/home")
      ?.verificationConclusion,
    "runtime-partially-verified-web-actor-scoped-home-event",
  );
  assert.equal(
    inventory.surfaces.find(
      (surface) => surface.surfaceId === "web:/app/home/events",
    )?.verificationConclusion,
    "runtime-partially-verified-web-home-events-filter-and-detail",
  );
  assert.equal(
    inventory.surfaces.find((surface) => surface.surfaceId === "web:/app/today")
      ?.verificationConclusion,
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
    ["mobile:/ai", "runtime-partially-verified-expo-ai-history-persistence"],
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
    ["mobile:/events/[id]", "runtime-partially-verified-expo-live-event-chain"],
    [
      "mobile:/events/[id]/attendees",
      "runtime-partially-verified-expo-live-event-chain",
    ],
    [
      "mobile:/events/[id]/register",
      "runtime-partially-verified-expo-live-event-chain",
    ],
    [
      "mobile:/party",
      "runtime-partially-verified-expo-party-truthful-boundary",
    ],
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
  const agentRuntimeEvidence = inventory.surfaces.find(
    (surface) => surface.surfaceId === "web:/app/agent",
  )?.runtimeEvidence;
  assert.equal(agentRuntimeEvidence?.length, 19);
  assert.equal(
    agentRuntimeEvidence?.includes(
      "deletion opened an accessible irreversible-action confirmation, its keep action preserved the conversation, and confirmed deletion survived refresh",
    ),
    true,
  );
  assert.equal(
    agentRuntimeEvidence?.includes(
      "the focusable history separator exposed min, max, current value, and orientation; ArrowRight, Home, and End changed the rendered width to the exact announced values",
    ),
    true,
  );
  assert.equal(
    agentRuntimeEvidence?.includes(
      "a live event recommendation disclosed four unique source records from orbit-ai and events with exact evidence ids and source time; refresh retained the same count",
    ),
    true,
  );
  assert.equal(
    agentRuntimeEvidence?.includes(
      "at 390x844 the Agent top bar exposed Chat history and Open menu while keeping the global inbox trigger hidden",
    ),
    true,
  );
  assert.equal(
    agentRuntimeEvidence?.includes(
      "the mobile drawer restored the actor-owned Undo Audit transcript and session URL after reload; New chat removed only active state and kept all six history rows",
    ),
    true,
  );
  assert.equal(
    agentRuntimeEvidence?.includes(
      "one actor-owned internal task proposal moved from awaiting confirmation to deferred to rejected while task storage, outbox, and receipts stayed unchanged",
    ),
    true,
  );
  assert.equal(
    agentRuntimeEvidence?.includes(
      "a repeated Later control on the deferred action exposed a conflict and raw English error; shared ledger presentation rules removed the invalid control and localized stale-state errors across Agent Chat and Today",
    ),
    true,
  );
  assert.equal(
    agentRuntimeEvidence?.includes(
      "two actor-owned awaiting-confirmation task proposals each moved both Run and action to canceled while outbox, receipts, and matching task records remained zero for actor A and both Runs were absent for actor B",
    ),
    true,
  );
  assert.equal(
    agentRuntimeEvidence?.includes(
      "the cancellation control used request-language copy and a pending label, disappeared after completion, survived exact-session reload, and both temporary sessions were removed from the provider",
    ),
    true,
  );
  assert.equal(
    inventory.surfaces.find((surface) => surface.surfaceId === "web:/app/chat")
      ?.runtimeEvidence.length,
    4,
  );
  assert.equal(
    inventory.surfaces.find(
      (surface) => surface.surfaceId === "web:/app/contacts/all-actions",
    )?.runtimeEvidence.length,
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
        (interaction) => interaction.actualResult !== "not-runtime-verified",
      ).length,
    18,
  );
});

test("overlay implementation and route-instance denominators are internally consistent", () => {
  const routeInstances = inventory.surfaces.flatMap(
    (surface) => surface.overlays,
  );
  assert.equal(routeInstances.length, inventory.summary.overlayRouteInstances);
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
    const surfaces = readFileSync(path.join(outputRoot, "surfaces.md"), "utf8");
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
      new RegExp(
        `当前分母为 ${written.summary.interactionRouteInstances}`,
        "u",
      ),
    );
    assert.equal(
      surfaces
        .split("\n")
        .filter(
          (line) => line.startsWith("| `web:") || line.startsWith("| `mobile:"),
        ).length,
      written.summary.routeSurfaces,
    );
  } finally {
    rmSync(outputRoot, { force: true, recursive: true });
  }
});
