import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildFullProductFunctionalAuditInventory,
  accessForSurface,
  collectInteractions,
  getHistoricalWebRuntimeEvidence,
  lookupWebInteractionRuntimeEvidence,
  lookupWebSurfaceRuntimeEvidence,
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
const historicalWebEvidence = getHistoricalWebRuntimeEvidence();
const runtimeVerifiedInteractions = inventory.surfaces.flatMap((surface) =>
  surface.interactions.filter(
    (interaction) => interaction.conclusion === "runtime-verified-exercised-case",
  ),
);
const retiredWebCases = [
  ["web:/app/events", [
    "web-public-event-catalogue-query-isolation-2026-07-29",
    "web-public-event-catalogue-controls-2026-07-29",
  ]],
  ["web:/app/events/[id]", [
    "web-public-event-detail-lifecycle-2026-07-29",
    "web-public-organizer-navigation-2026-07-29",
  ]],
  ["web:/app/o/[slug]", [
    "web-public-organizer-query-control-boundary-2026-07-29",
    "web-public-organizer-navigation-2026-07-29",
    "web-public-organizer-unknown-slug-boundary-2026-07-29",
  ]],
  ["web:/app/party", [
    "web-party-source-context-boundaries-2026-07-29",
    "web-public-event-detail-lifecycle-2026-07-29",
  ]],
  ["web:/app/party/checkin", ["web-party-source-context-boundaries-2026-07-29"]],
  ["web:/app/party/graph", ["web-party-source-context-boundaries-2026-07-29"]],
] as const;
const retiredGenericSmokeCase = "web-production-route-transport-smoke-2026-07-28";

for (const [surfaceId, retiredCases] of retiredWebCases) {
  test(`current eligibility rejects retired evidence and smoke fallback: ${surfaceId}`, () => {
    assert.equal(lookupWebSurfaceRuntimeEvidence(surfaceId), undefined);
    const surface = inventory.surfaces.find((candidate) => candidate.surfaceId === surfaceId);
    assert.ok(surface);
    assert.equal(surface.verificationConclusion, "inventory-complete-runtime-verification-pending");
    assert.equal(surface.entryBehavior, "not-runtime-verified");
    assert.equal(surface.layout, "source-inventoried; rendered structure requires viewport verification");
    assert.equal(surface.responsive.desktop, "not-runtime-verified");
    assert.equal(surface.responsive.mobile, "not-runtime-verified");
    assert.deepEqual(surface.runtimeEvidence, []);
    assert.deepEqual(surface.interactions.filter((interaction) =>
      interaction.testEvidence.some((id) => [...retiredCases, retiredGenericSmokeCase].includes(id)),
    ), []);
  });

  test(`current eligibility fixtures cannot revive historical interactions: ${surfaceId}`, () => {
    // Fixture cases exercise lookup policy only; they are never added to inventory evidence.
    const fresh = {
      verificationCase: "fixture-only-fresh-case",
      entryBehavior: "fixture-only",
      runtimeEvidence: [],
      verificationConclusion: "fixture-only-not-runtime-evidence",
    };
    assert.equal(lookupWebSurfaceRuntimeEvidence(surfaceId, new Map([[surfaceId, fresh]])), fresh);
    for (const verificationCase of retiredCases) {
      const retired = { ...fresh, verificationCase };
      assert.equal(lookupWebSurfaceRuntimeEvidence(surfaceId, new Map([[surfaceId, retired]])), undefined);
      const oldKey = `${surfaceId}|source#onclick:() => oldAction()#Old`;
      const laterKey = `${surfaceId}|source#onclick:() => freshAction()#Fresh`;
      const fixture = new Map([[oldKey, retired], [laterKey, fresh]]);
      assert.equal(lookupWebInteractionRuntimeEvidence([oldKey], fixture), undefined);
      assert.equal(lookupWebInteractionRuntimeEvidence([oldKey, laterKey], fixture), fresh);
      assert.equal(lookupWebInteractionRuntimeEvidence([
        oldKey.replace("() =>", "()  =>"), laterKey.replace("() =>", "()  =>"),
      ], fixture), fresh);
      const relatedRoute = `${surfaceId}/fixture-child`;
      assert.equal(lookupWebSurfaceRuntimeEvidence(relatedRoute, new Map([[relatedRoute, retired]])), retired);
      const relatedKey = `${relatedRoute}|source#onclick:oldAction#Old`;
      assert.equal(lookupWebInteractionRuntimeEvidence([relatedKey], new Map([[relatedKey, retired]])), retired);
    }
    for (const [key, record] of historicalWebEvidence.interactions) {
      if (key.startsWith(`${surfaceId}|`) && retiredCases.some((id) => id === record.verificationCase)) {
        assert.equal(lookupWebInteractionRuntimeEvidence([key]), undefined, key);
      }
    }
  });

  test(`required fresh documented runtime case: ${surfaceId}`, () => {
    const record = lookupWebSurfaceRuntimeEvidence(surfaceId);
    assert.ok(record, `${surfaceId} needs executed current-route evidence, not a historical case or fixture`);
    assert.ok(record.verificationCase);
    assert.equal([...retiredCases, retiredGenericSmokeCase].includes(record.verificationCase), false);
    assert.doesNotMatch(record.verificationCase, /fixture|placeholder|pending|tests\/|\.(?:ts|tsx)$/iu);
    const documented = inventory.verificationCases.find((entry) => entry.id === record.verificationCase);
    assert.ok(documented, `${surfaceId}: case identity must resolve to documented evidence`);
    assert.ok(documented.evidence.trim());
    assert.doesNotMatch(documented.evidence, /^(?:pending|not-runtime-verified|placeholder|fixture-only)/iu);
    assert.doesNotMatch(documented.evidence.trim(), /^(?:(?:node|npm|pnpm|yarn)\s[^\n]*|(?:repos\/orbits\/)?tests\/[^\n]*)$/u);
    assert.ok(documented.actual.trim());
    assert.match(documented.conclusion, /pass|verified/iu);
    assert.doesNotMatch(documented.conclusion, /pass-static|fixture-only|placeholder/iu);
    assert.ok(record.runtimeEvidence.length > 0);
    const surface = inventory.surfaces.find((candidate) => candidate.surfaceId === surfaceId);
    assert.ok(surface);
    assert.ok(record.runtimeEvidence.every((evidence) => surface.runtimeEvidence.includes(evidence)));
    assert.match(surface.verificationConclusion, /^runtime-partially-verified/u);
  });
}

test("current eligibility blocks smoke only for the three ruled exact routes", () => {
  const record = {
    verificationCase: retiredGenericSmokeCase,
    entryBehavior: "fixture-only",
    runtimeEvidence: [],
    verificationConclusion: "fixture-only-not-runtime-evidence",
  };
  for (const surfaceId of ["web:/app/events", "web:/app/events/[id]", "web:/app/o/[slug]"]) {
    assert.equal(lookupWebSurfaceRuntimeEvidence(surfaceId, new Map([[surfaceId, record]])), undefined);
    const key = `${surfaceId}|source#onclick:open#Open`;
    assert.equal(lookupWebInteractionRuntimeEvidence([key], new Map([[key, record]])), undefined);
  }
  for (const surfaceId of ["web:/app/events/[id]/register", "web:/app/events-other", "web:/app/party", "mobile:/events"]) {
    assert.equal(lookupWebSurfaceRuntimeEvidence(surfaceId, new Map([[surfaceId, record]])), record);
  }
  const unrelated = historicalWebEvidence.surfaces.find(([id]) => id === "web:/app/today");
  assert.ok(unrelated);
  assert.deepEqual(lookupWebSurfaceRuntimeEvidence(unrelated[0]), unrelated[1]);
});

test("historical runtime adapter returns detached records", () => {
  const copy = getHistoricalWebRuntimeEvidence();
  copy.browserSmokeRoutes.length = 0;
  copy.surfaces[0][1].verificationCase = "fixture-only-mutated";
  copy.interactions[0][1].verificationCase = "fixture-only-mutated";
  assert.deepEqual(getHistoricalWebRuntimeEvidence(), historicalWebEvidence);
});

function withSourceFixture(source: string, check: (filePath: string) => void) {
  const root = mkdtempSync(path.join(os.tmpdir(), "orbit-functional-fixture-"));
  const filePath = path.join(root, "screen.tsx");
  try {
    writeFileSync(filePath, source);
    check(filePath);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
}

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
    "mobile:/followups",
    "mobile:/profile",
    "mobile:/settings",
  ]);
  const pipeline = inventory.surfaces.find(
    (surface) => surface.surfaceId === "mobile:/contacts/pipeline",
  );
  assert.ok(pipeline);
  const rows = pipeline.interactions.filter(
    (interaction) =>
      interaction.sourceFile ===
        "repos/orbit-app/src/screens/contacts/ContactPipelineScreen.tsx" &&
      interaction.tag === "Pressable",
  );
  assert.equal(rows.length, 7);
  assert.ok(rows.some((row) => row.handlers.some(
    (handler) => handler.expression === "() => onSelect(stage.id)",
  )));
  assert.ok(rows.some((row) => row.visibleName === "`${task.contactName}，${task.title}，${task.dueLabel}`"));
});

test("literal route props exclude unreachable component branches", () => {
  const homeEvents = inventory.surfaces.find(
    (surface) => surface.surfaceId === "mobile:/home/events",
  );
  assert.ok(homeEvents);
  assert.equal(
    homeEvents.interactions.some(
      (interaction) =>
        interaction.sourceFile ===
          "repos/orbit-app/src/screens/home/HomeScreen.tsx" &&
        interaction.tag === "HomeHubContent",
    ),
    false,
  );
  assert.equal(
    homeEvents.interactions.some(
      (interaction) =>
        interaction.sourceFile ===
          "repos/orbit-app/src/screens/home/HomeScreen.tsx" &&
        interaction.ownerSymbol === "HomeHubContent",
    ),
    false,
  );
  assert.equal(
    homeEvents.interactions.some(
      (interaction) =>
        interaction.sourceFile ===
          "repos/orbit-app/src/screens/home/HomeScreen.tsx" &&
        interaction.tag === "HomeEventsContent",
    ),
    true,
  );

  const contactsOverview = inventory.surfaces.find(
    (surface) => surface.surfaceId === "mobile:/contacts",
  );
  const contactsList = inventory.surfaces.find(
    (surface) => surface.surfaceId === "mobile:/contacts/list",
  );
  assert.ok(contactsOverview);
  assert.ok(contactsList);
  assert.equal(
    contactsOverview.interactions.some(
      (interaction) => interaction.tag === "ContactsListContent",
    ),
    false,
  );
  assert.equal(
    contactsList.interactions.some(
      (interaction) => interaction.tag === "ContactsOverviewContent",
    ),
    false,
  );
  assert.equal(
    contactsList.routeParameters.queryParameters.includes("refreshToken"),
    true,
  );
});

test("navigation replay credits only its 27 exact route occurrences", () => {
  const replayEvidence =
    "navigation-nonpass-runtime-replay-2026-07-30";
  const credited = inventory.surfaces.flatMap((surface) =>
    surface.interactions.filter((interaction) =>
      interaction.testEvidence.includes(replayEvidence),
    ),
  );
  const settingsSignOut = inventory.surfaces
    .find((surface) => surface.surfaceId === "web:/app/settings")
    ?.interactions.find(
      (interaction) =>
        interaction.sourceFile ===
          "repos/orbits/app/(app)/app/orbit-public-shell.tsx" &&
        interaction.visibleName === "Sign out / 退出登录",
    );
  const siblingSignOuts = inventory.surfaces.flatMap((surface) =>
    surface.interactions.filter(
      (interaction) =>
        surface.surfaceId !== "web:/app/settings" &&
        interaction.sourceFile ===
          "repos/orbits/app/(app)/app/orbit-public-shell.tsx" &&
        interaction.visibleName === "Sign out / 退出登录",
    ),
  );

  assert.equal(credited.length, 27);
  assert.equal(settingsSignOut?.conclusion, "runtime-verified-exercised-case");
  assert.equal(siblingSignOuts.length, 32);
  assert.equal(
    siblingSignOuts.every(
      (interaction) => interaction.conclusion === "inventoried-static-only",
    ),
    true,
  );
});

test("Settings sign-out historical evidence is handler-bound across line shifts", () => {
  const sourceFile = "repos/orbits/app/(app)/app/orbit-public-shell.tsx";
  const stableKey = `web:/app/settings|${sourceFile}#owner:OrbitNavAccountControl#onclick:() => { setMenuOpen(false); void signOut({ callbackUrl: preserveHref("/app") }); }#Sign out / 退出登录`;
  const expected = {
    actualResult:
      "The exact authenticated Settings account menu exposed one Sign out / 退出登录 control. Activation preserved lang=ja in the callback, terminated the session, and browser Back did not restore it.",
    idempotency:
      "Session navigation only; business records stayed byte-identical and the disposable actor cleanup ended at activeAfter=0.",
    testData:
      "Disposable authenticated actor at /app/settings?lang=ja and a measured 1440x900 viewport",
    verificationCase: "navigation-nonpass-runtime-replay-2026-07-30",
  };
  for (const line of [178, 205, 999]) {
    assert.deepEqual(lookupWebInteractionRuntimeEvidence([
      stableKey.replace("setMenuOpen(false); ", "setMenuOpen(false);\n    "),
      `web:/app/settings|${sourceFile}:${line}`,
    ]), expected);
  }
  for (const wrongKey of [
    stableKey.replace('preserveHref("/app")', 'preserveHref("/app/today")'),
    stableKey.replace("setMenuOpen(false); ", ""),
    stableKey.replace("owner:OrbitNavAccountControl", "owner:OtherControl"),
    stableKey.replace("web:/app/settings|", "web:/app/today|"),
    stableKey.replace("Sign out / 退出登录", "Sign out"),
    stableKey.replace("orbit-public-shell.tsx", "other-shell.tsx"),
  ]) {
    assert.equal(lookupWebInteractionRuntimeEvidence([wrongKey]), undefined);
  }
  for (const line of [178, 205]) {
    assert.equal(lookupWebInteractionRuntimeEvidence([
      stableKey.replace('preserveHref("/app")', 'preserveHref("/app/today")'),
      `web:/app/settings|${sourceFile}:${line}`,
    ]), undefined, "a changed handler must not fall back to line evidence");
  }
  const settings = inventory.surfaces.find((surface) => surface.surfaceId === "web:/app/settings");
  const signOut = settings?.interactions.find((interaction) =>
    interaction.sourceFile === sourceFile && interaction.visibleName === "Sign out / 退出登录",
  );
  assert.ok(signOut);
  assert.equal(signOut.actualResult, expected.actualResult);
  assert.equal(signOut.idempotency, expected.idempotency);
  assert.equal(signOut.testData, expected.testData);
  assert.deepEqual(signOut.testEvidence, [expected.verificationCase]);
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
  assert.deepEqual(routeParameters("web:/app/home"), []);
  assert.deepEqual(routeParameters("web:/app/home/events"), [
    "orbitVisualSeed",
  ]);
  assert.deepEqual(routeParameters("web:/dev/capabilities/[slug]"), []);

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
        interaction.accessibleNameEvidence === "missing-static",
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

test("accessible-name summary counts missing evidence independently of behavior conclusions", () => {
  const missing = inventory.surfaces.flatMap((surface) => surface.interactions)
    .filter((interaction) => interaction.accessibleNameEvidence === "missing-static");
  assert.equal(inventory.summary.accessibleNameCandidates, missing.length);
  withSourceFixture('export default function Screen() { return <button onClick={act}><Icon /></button>; }', (filePath) => {
    const [control] = collectInteractions(filePath, "web", new Map());
    assert.equal(control.accessibleNameEvidence, "missing-static");
    assert.equal(control.conclusion, "inventoried-static-only");
    assert.deepEqual(control.handlers, [{ event: "onclick", expression: "act" }]);
  });
});

for (const [props, hidden] of [
  ["hidden", true],
  ["hidden={true}", true],
  ["hidden={false}", false],
  ["hidden={isHidden}", false],
  ["disabled", false],
  ["hidden={true} {...props}", false],
] as const) {
  test(`Web file input accessibility requires proven static hiding: ${props}`, () => {
    withSourceFixture(`export default function Screen() { return <><input type="file" ${props} onChange={choose} /><button onClick={openPicker}>Choose file</button></>; }`, (filePath) => {
      const controls = collectInteractions(filePath, "web", new Map());
      assert.equal(controls.length, 2);
      assert.equal(controls[0].accessibleNameEvidence,
        hidden ? "intentionally-hidden-pointer-target" : props.includes("...props") ? "delegated-props" : "missing-static");
      assert.deepEqual(controls[0].handlers, [{ event: "onchange", expression: "choose" }]);
      assert.equal(controls[0].sourceFile.endsWith("screen.tsx"), true);
      assert.equal(controls[1].visibleName, "Choose file");
      assert.equal(controls[1].accessibleNameEvidence, "present-static");
    });
  });
}

for (const [props, hidden] of [
  ['accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"', true],
  ['accessible={false} accessibilityElementsHidden={true} importantForAccessibility={"no-hide-descendants"}', true],
  ['accessible={false} accessibilityElementsHidden={false} importantForAccessibility="no-hide-descendants"', false],
  ['accessible={unknown} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"', false],
  ['accessible={false} accessibilityElementsHidden={unknown} importantForAccessibility="no-hide-descendants"', false],
  ['accessible="false" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"', false],
  ['accessible={false} accessibilityElementsHidden importantForAccessibility={mode}', false],
  ['accessible={false} accessibilityElementsHidden', false],
  ['accessibilityElementsHidden importantForAccessibility="no-hide-descendants"', false],
  ['disabled', false],
  ['disabled={true}', false],
  ['aria-hidden={true}', false],
  ['accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" {...props}', false],
] as const) {
  test(`native decorative target requires explicit cross-platform accessibility hiding: ${props}`, () => {
    withSourceFixture(`export default function Screen() { return <><Pressable ${props} onPress={close} /><Pressable accessibilityLabel="Close menu" onPress={close} /></>; }`, (filePath) => {
      const controls = collectInteractions(filePath, "mobile", new Map());
      assert.equal(controls.length, 2);
      assert.equal(controls[0].accessibleNameEvidence,
        hidden ? "intentionally-hidden-pointer-target" : props.includes("...props") ? "delegated-props" : "missing-static");
      assert.deepEqual(controls[0].handlers, [{ event: "onpress", expression: "close" }]);
      assert.equal(controls[1].accessibleNameEvidence, "present-static");
    });
  });
}

test("hidden batch file inputs retain handler records and accessible picker triggers", () => {
  for (const [surfaceId, inputCount] of [
    ["web:/app/contacts/new/batch2", 1],
    ["web:/app/contacts/new/batch2/[id]", 2],
  ] as const) {
    const surface = inventory.surfaces.find((surface) => surface.surfaceId === surfaceId);
    assert.ok(surface);
    const inputs = surface.interactions.filter((interaction) => interaction.tag === "input" && interaction.visibleName === null);
    assert.equal(inputs.length, inputCount);
    for (const input of inputs) {
      assert.equal(input.accessibleNameEvidence, "intentionally-hidden-pointer-target");
      assert.equal(input.handlers.some((handler) => handler.event === "onchange"), true);
    }
    const pickers = surface.interactions.filter((interaction) =>
      interaction.tag === "button" && interaction.handlers.some((handler) => handler.expression.includes(".click()")),
    );
    assert.ok(pickers.length > 0);
    assert.equal(pickers.every((picker) => picker.visibleName && picker.accessibleNameEvidence === "present-static"), true);
  }
});

test("native private route wrappers are static wiring, not runtime authorization evidence", () => {
  for (const surfaceId of ["mobile:/events/[id]/analytics", "mobile:/tasks", "mobile:/tasks/[id]"]) {
    const surface = inventory.surfaces.find((surface) => surface.surfaceId === surfaceId);
    assert.ok(surface);
    assert.deepEqual(surface.access.roles, ["authenticated-user"]);
    assert.match(surface.access.policy, /statically-wired-to-native-auth-boundary/u);
    assert.match(surface.access.policy, /runtime authorization requires verification/u);
    assert.deepEqual(surface.runtimeEvidence, []);
    assert.equal(surface.verificationConclusion, "inventory-complete-runtime-verification-pending");
  }
});

for (const [entry, protectedRoute] of [
  ['import { withOrbitPrivateRoute } from "@/components/OrbitRouteAccessBoundary"; export default withOrbitPrivateRoute(Screen);', true],
  ['import { withOrbitPrivateRoute as guard } from "@/components/OrbitRouteAccessBoundary"; export default guard(Screen);', true],
  ['import { withOrbitPrivateRoute } from "@/components/OrbitRouteAccessBoundary"; export default Screen;', false],
  ['import { withOrbitPrivateRoute } from "@/components/OrbitRouteAccessBoundary-decoy"; export default withOrbitPrivateRoute(Screen);', false],
  ['function withOrbitPrivateRoute(value) { return value; } export default withOrbitPrivateRoute(Screen);', false],
  ['import { withOrbitPrivateRoute as unused } from "@/components/OrbitRouteAccessBoundary"; function withOrbitPrivateRoute(value) { return value; } export default withOrbitPrivateRoute(Screen);', false],
  ['import { withOrbitPrivateRoute } from "@/components/OrbitRouteAccessBoundary"; export default (() => { const withOrbitPrivateRoute = (value) => value; return withOrbitPrivateRoute(Screen); })();', false],
  ['import type { withOrbitPrivateRoute } from "@/components/OrbitRouteAccessBoundary"; export default withOrbitPrivateRoute(Screen);', false],
  ['import { OtherBoundary as withOrbitPrivateRoute } from "@/components/OrbitRouteAccessBoundary"; export default withOrbitPrivateRoute(Screen);', false],
] as const) {
  test(`native guard detection resolves the invoked import: ${entry}`, () => {
    withSourceFixture(entry, (filePath) => {
      const access = accessForSurface("mobile", "/tasks", [], [], filePath);
      if (protectedRoute) {
        assert.deepEqual(access.roles, ["authenticated-user"]);
        assert.match(access.policy, /statically-wired-to-native-auth-boundary/u);
      } else {
        assert.deepEqual(access.roles, ["role-requires-runtime-verification"]);
        assert.match(access.policy, /unknown/u);
      }
      assert.match(access.policy, /runtime authorization requires verification/u);
      assert.doesNotMatch(access.policy, /no central route guard found/u);
    });
  });
}

test("current home redirect does not inherit the obsolete actor-owned home runtime case", () => {
  const homeSurface = inventory.surfaces.find((surface) => surface.surfaceId === "web:/app/home");
  assert.ok(homeSurface);
  assert.equal(homeSurface.runtimeEvidence.some((value) => value.includes("rendered the authenticated actor's one private event")), false);
  assert.deepEqual(homeSurface.runtimeEvidence, []);
  assert.equal(homeSurface.entryBehavior, "not-runtime-verified");
  assert.equal(homeSurface.verificationConclusion, "inventory-complete-runtime-verification-pending");
  assert.equal(inventory.verificationCases.some((record) => record.id === "web-home-private-event-boundaries-2026-07-29"), true);
});

test("current static interaction denominators are deduplicated separately from historical runtime leaves", () => {
  const interactions = inventory.surfaces.flatMap((surface) => surface.interactions);
  const locations = new Set<string>();
  const implementations = new Map<string, Set<string>>();
  for (const interaction of interactions) {
    locations.add(`${interaction.sourceFile}:${interaction.line}`);
    const identities = implementations.get(interaction.sourceFile) ?? new Set<string>();
    identities.add(JSON.stringify([
      interaction.controlType, interaction.tag, interaction.handlers, interaction.href ?? "",
    ]));
    implementations.set(interaction.sourceFile, identities);
  }
  assert.equal(inventory.summary.interactionRouteInstances, interactions.length);
  assert.equal(inventory.summary.uniqueInteractionSourceLocations, locations.size);
  assert.equal(inventory.summary.normalizedStaticBehaviorImplementations,
    [...implementations.values()].reduce((sum, identities) => sum + identities.size, 0));
});

test("every route surface requires runtime coverage", () => {
  const missing = inventory.surfaces
    .filter((surface) => !surface.verificationConclusion.startsWith("runtime-"))
    .map((surface) => surface.surfaceId);
  assert.equal(inventory.summary.surfacesWithRuntimeEvidence, inventory.summary.routeSurfaces,
    `Missing runtime surfaces (${missing.length}): ${missing.join(", ")}`);
});

test("historical browser smoke retains all 20 original route memberships", () => {
  assert.equal(historicalWebEvidence.browserSmokeRoutes.length, 20);
  assert.deepEqual(historicalWebEvidence.browserSmokeRoutes, [
    "/", "/app", "/app/account/forgot-password", "/app/account/login",
    "/app/account/mobile-google", "/app/account/signup", "/app/admin/access",
    "/app/events", "/app/events/[id]", "/app/login-admin", "/app/o/[slug]",
    "/app/register", "/dev/agent-test-report", "/dev/capabilities",
    "/dev/capabilities/[slug]", "/dev/foundation/domain",
    "/dev/foundation/mock-registry", "/dev/foundation/style",
    "/dev/knowledge", "/dev/orbit-ai/trace",
  ]);
});

for (const [verificationCase, recordCount] of [
  ["web-public-event-detail-lifecycle-2026-07-29", 20],
  ["web-public-organizer-navigation-2026-07-29", 3],
  ["web-public-organizer-unknown-slug-boundary-2026-07-29", 2],
] as const) {
  test(`historical interaction records remain intact: ${verificationCase}`, () => {
    assert.equal(historicalWebEvidence.interactions.filter(([, record]) =>
      record.verificationCase === verificationCase,
    ).length, recordCount);
    assert.ok(inventory.verificationCases.find((record) => record.id === verificationCase));
  });
}

test("current browser base-state credits exclude retired exact routes", () => {
  const browserEvidenceSurfaces = inventory.surfaces.filter((surface) =>
    surface.runtimeEvidence.includes("in-app browser base-state at 1440x900"),
  );

  assert.deepEqual(browserEvidenceSurfaces.map((surface) => surface.route).sort(),
    historicalWebEvidence.browserSmokeRoutes.filter((route) =>
      !["/app/events", "/app/events/[id]", "/app/o/[slug]"].includes(route),
    ).sort());
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
});

test("admin browser evidence respects public entry boundaries", () => {
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
});

test("runtime interaction summary counts only current credited occurrences", () => {
  assert.equal(
    inventory.summary.interactionsRuntimeVerified,
    runtimeVerifiedInteractions.length,
  );
});

test("historical rendered leaf observations retain their unresolved denominator", () => {
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
});

test("inventory records authoritative source state independently of runtime evidence", () => {
  assert.match(
    inventory.sourceState,
    /^(clean-head|head-plus-uncommitted-authoritative-inputs)$/u,
  );
  assert.equal(
    Number.isInteger(inventory.uncommittedAuthoritativeInputChanges),
    true,
  );
});

test("mobile auth retains exact handler-bound runtime evidence through line shifts", () => {
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
});

test("memory settings retain their eleven exercised interactions", () => {
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
});

test("Today dialog retains its exact exercised close handler", () => {
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
});

test("Agent retry evidence applies only to the current exercised handler", () => {
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
});

test("only the reachable exercised Home Events occurrence retains historical evidence", () => {
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
  assert.deepEqual(homeEventRuntimeInteractions.map((interaction) => ({
    surfaceId: interaction.surfaceId,
    handlers: interaction.handlers,
    testEvidence: interaction.testEvidence,
  })), [{
    surfaceId: "web:/app/home/events",
    handlers: [{ event: "onclick", expression: "(clickEvent) => { clickEvent.preventDefault(); orbitNavigate(`/events/${event.code}`); }" }],
    testEvidence: ["web-home-private-event-boundaries-2026-07-29"],
  }], "only the still-reachable, originally exercised Home Events occurrence retains evidence");
});

test("specialized profile and contact runtime cases remain credited", () => {
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
});

test("native auth and acquisition runtime cases remain credited", () => {
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
});

test("Web home and scheduling runtime cases remain scoped to their exercised routes", () => {
  assert.equal(
    inventory.surfaces.find((surface) => surface.surfaceId === "web:/app/home")
      ?.verificationConclusion,
    "inventory-complete-runtime-verification-pending",
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
});

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
  test(`native runtime conclusion retains its exercised case: ${surfaceId}`, () => {
    assert.equal(
      inventory.surfaces.find((surface) => surface.surfaceId === surfaceId)
        ?.verificationConclusion,
      verificationConclusion,
    );
  });
}

test("contact detail retains its exercised runtime conclusion", () => {
  assert.equal(
    inventory.surfaces.find(
      (surface) => surface.surfaceId === "web:/app/contacts/[id]",
    )?.verificationConclusion,
    "runtime-partially-verified-live-contact-detail",
  );
});

test("historical catalogue record retains its original entry and observed result", () => {
  const publicEventCatalogue = historicalWebEvidence.surfaces.find(
    ([surfaceId]) => surfaceId === "web:/app/events",
  )?.[1];
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
  assert.ok(historicalWebEvidence.browserSmokeRoutes.includes("/app/events"));
});

test("Agent runtime case retains its recorded observations", () => {
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
});

test("chat and all-actions retain their recorded observations", () => {
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
});

for (const [surfaceId, evidenceCount] of [
    ["web:/app/contacts/dashboard", 3],
    ["web:/app/contacts/graph", 4],
    ["web:/app/contacts/intros", 6],
    ["web:/app/contacts/pipeline", 3],
  ] as const) {
  test(`relationship runtime observations remain retained: ${surfaceId}`, () => {
    assert.equal(
      inventory.surfaces.find((surface) => surface.surfaceId === surfaceId)
        ?.runtimeEvidence.length,
      evidenceCount,
    );
  });
}

test("profile retains actor isolation and eighteen exercised interactions", () => {
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
