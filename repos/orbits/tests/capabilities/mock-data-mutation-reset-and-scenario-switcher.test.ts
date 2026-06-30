/**
 * Mock 数据 reset 与 scenario 切换器测试。
 *
 * 验证共享 mock runtime 的 reset、scenario 激活和 debug-view 状态。
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

async function importProjectModule<TModule>(
  pathFromRoot: string,
): Promise<TModule> {
  const absolutePath = join(projectRoot, pathFromRoot);

  assert.equal(
    existsSync(absolutePath),
    true,
    `${pathFromRoot} must exist for the mock data scenario switcher sprint`,
  );

  return (await import(pathToFileURL(absolutePath).href)) as TModule;
}

const providerFreeSourcePatterns = [
  /\bfetch\s*\(/,
  /Supabase|createClient|OAuth/i,
  /XMLHttpRequest|WebSocket|EventSource/,
  /navigator|mediaDevices|localStorage|indexedDB/,
  /from ["']node:net["']|from ["']node:http/,
  /openai|anthropic/i,
] as const;

test("mock scenario contract exports typed fixtures service interface and errors", async () => {
  const scenarioModule = await importProjectModule<{
    MOCK_SCENARIO_FIXTURE_SOURCE: string;
    MOCK_SCENARIO_IDS: readonly string[];
    MOCK_SCENARIO_ERROR_CODES: readonly string[];
    MOCK_SCENARIO_ERROR_DEFINITIONS: Record<
      string,
      { appCode: string; message: string; recovery: string }
    >;
    mockScenarioFixtures: readonly Array<{
      id: string;
      label: string;
      scenarioKind: string;
      state: string;
      relationshipContext: {
        contactCount: number;
        eventCount: number;
        taskCount: number;
      };
      provenance: {
        source: string;
        generationMethod: string;
        productionSeedManagementReplaced: true;
        persistentUserScenarioStorageReplaced: true;
        externalNetworkRequested: false;
        databaseReadExecuted: false;
        databaseWriteExecuted: false;
        aiProviderRequested: false;
        calendarProviderRequested: false;
        emailProviderRequested: false;
        notificationProviderRequested: false;
        deviceRequested: false;
      };
    }>;
  }>("shared/mock/scenarios.ts");
  const source = readFileSync(
    join(projectRoot, "shared/mock/scenarios.ts"),
    "utf8",
  );

  assert.match(source, /interface MockScenarioService/);
  assert.deepEqual(scenarioModule.MOCK_SCENARIO_IDS, [
    "new-user-demo",
    "active-event-demo",
    "post-event-demo",
    "dormant-network-demo",
    "empty-account-demo",
    "error-demo",
  ]);
  assert.deepEqual(scenarioModule.MOCK_SCENARIO_ERROR_CODES, [
    "MOCK_SCENARIO_NOT_FOUND",
    "MOCK_SCENARIO_CONTROLLED_FAILURE",
  ]);
  assert.equal(
    scenarioModule.MOCK_SCENARIO_ERROR_DEFINITIONS.MOCK_SCENARIO_NOT_FOUND
      .appCode,
    "NOT_FOUND",
  );
  assert.equal(
    scenarioModule.MOCK_SCENARIO_ERROR_DEFINITIONS
      .MOCK_SCENARIO_CONTROLLED_FAILURE.appCode,
    "SERVICE_UNAVAILABLE",
  );
  assert.match(
    scenarioModule.MOCK_SCENARIO_ERROR_DEFINITIONS
      .MOCK_SCENARIO_CONTROLLED_FAILURE.recovery,
    /scenario switcher/i,
  );
  assert.equal(
    scenarioModule.MOCK_SCENARIO_FIXTURE_SOURCE,
    "fixture:shared/mock/scenarios.ts",
  );
  assert.deepEqual(
    scenarioModule.mockScenarioFixtures.map((scenario) => scenario.scenarioKind),
    [
      "new-user",
      "active-event",
      "post-event",
      "dormant-network",
      "empty-account",
      "error",
    ],
  );
  assert.deepEqual(
    scenarioModule.mockScenarioFixtures.map((scenario) => scenario.state),
    ["success", "pending", "success", "success", "empty", "failure"],
  );

  const emptyScenario = scenarioModule.mockScenarioFixtures.find(
    (scenario) => scenario.id === "empty-account-demo",
  );
  const postEventScenario = scenarioModule.mockScenarioFixtures.find(
    (scenario) => scenario.id === "post-event-demo",
  );

  assert.equal(emptyScenario?.relationshipContext.contactCount, 0);
  assert.equal(emptyScenario?.relationshipContext.eventCount, 0);
  assert.equal(emptyScenario?.relationshipContext.taskCount, 0);
  assert.match(postEventScenario?.label ?? "", /post-event/i);

  for (const scenario of scenarioModule.mockScenarioFixtures) {
    assert.equal(
      scenario.provenance.source,
      scenarioModule.MOCK_SCENARIO_FIXTURE_SOURCE,
    );
    assert.equal(scenario.provenance.generationMethod, "fixture");
    assert.equal(scenario.provenance.productionSeedManagementReplaced, true);
    assert.equal(
      scenario.provenance.persistentUserScenarioStorageReplaced,
      true,
    );
    assert.equal(scenario.provenance.externalNetworkRequested, false);
    assert.equal(scenario.provenance.databaseReadExecuted, false);
    assert.equal(scenario.provenance.databaseWriteExecuted, false);
    assert.equal(scenario.provenance.aiProviderRequested, false);
    assert.equal(scenario.provenance.calendarProviderRequested, false);
    assert.equal(scenario.provenance.emailProviderRequested, false);
    assert.equal(scenario.provenance.notificationProviderRequested, false);
    assert.equal(scenario.provenance.deviceRequested, false);
  }
});

test("mock scenario and reset services are deterministic provider-free rules", async () => {
  const scenarioModule = await importProjectModule<{
    createMockScenarioService: () => {
      listScenarios: () => {
        success: true;
        data: {
          activeScenarioId: string;
          scenarios: readonly Array<{ id: string; selected: boolean }>;
        };
      };
      activateScenario: (scenarioId: string) => {
        success: boolean;
        data?: {
          activeScenarioId: string;
          selectedScenario: { id: string; state: string };
          mutation: {
            type: string;
            seedManagement: string;
            persistentStorage: string;
            externalServicesTouched: false;
          };
        };
        error?: { code: string; appCode: string };
      };
    };
  }>("shared/mock/scenarios.ts");
  const resetModule = await importProjectModule<{
    MOCK_RESET_ERROR_CODES: readonly string[];
    createMockDataResetService: () => {
      resetMockData: (input?: { scenarioId?: string | null }) => {
        success: boolean;
        data?: {
          activeScenarioId: string;
          selectedScenario: { id: string; state: string };
          reset: {
            type: string;
            seedManagement: string;
            persistentStorage: string;
            externalServicesTouched: false;
          };
          provenance: {
            generationMethod: string;
            databaseWriteExecuted: false;
            externalNetworkRequested: false;
          };
        };
        error?: { code: string; appCode: string };
      };
    };
  }>("shared/mock/reset.ts");

  const scenarioService = scenarioModule.createMockScenarioService();
  const resetService = resetModule.createMockDataResetService();
  const list = scenarioService.listScenarios();
  const postEvent = scenarioService.activateScenario("post-event-demo");
  const repeatedPostEvent = scenarioService.activateScenario("post-event-demo");
  const missing = scenarioService.activateScenario("missing-demo");
  const controlledFailure = scenarioService.activateScenario("error-demo");
  const resetDefault = resetService.resetMockData();
  const resetEmpty = resetService.resetMockData({
    scenarioId: "empty-account-demo",
  });

  assert.equal(list.success, true);
  assert.equal(list.data.activeScenarioId, "active-event-demo");
  assert.equal(list.data.scenarios.length, 6);
  assert.equal(
    list.data.scenarios.find((scenario) => scenario.id === "active-event-demo")
      ?.selected,
    true,
  );

  assert.deepEqual(postEvent, repeatedPostEvent);
  assert.equal(postEvent.success, true);
  assert.equal(postEvent.data?.activeScenarioId, "post-event-demo");
  assert.equal(postEvent.data?.selectedScenario.state, "success");
  assert.equal(postEvent.data?.mutation.type, "scenario-activation");
  assert.equal(
    postEvent.data?.mutation.seedManagement,
    "deterministic-fixture-switch",
  );
  assert.equal(
    postEvent.data?.mutation.persistentStorage,
    "rule-based-request-scope-selection",
  );
  assert.equal(postEvent.data?.mutation.externalServicesTouched, false);
  assert.equal(missing.success, false);
  assert.equal(missing.error?.code, "MOCK_SCENARIO_NOT_FOUND");
  assert.equal(missing.error?.appCode, "NOT_FOUND");
  assert.equal(controlledFailure.success, false);
  assert.equal(
    controlledFailure.error?.code,
    "MOCK_SCENARIO_CONTROLLED_FAILURE",
  );
  assert.equal(controlledFailure.error?.appCode, "SERVICE_UNAVAILABLE");

  assert.deepEqual(resetModule.MOCK_RESET_ERROR_CODES, [
    "MOCK_RESET_SCENARIO_NOT_FOUND",
    "MOCK_RESET_CONTROLLED_FAILURE",
  ]);
  assert.equal(resetDefault.success, true);
  assert.equal(resetDefault.data?.activeScenarioId, "active-event-demo");
  assert.equal(resetDefault.data?.reset.type, "mock-data-reset");
  assert.equal(
    resetDefault.data?.reset.seedManagement,
    "deterministic-fixture-restore",
  );
  assert.equal(
    resetDefault.data?.reset.persistentStorage,
    "no-persistent-user-scenario-storage",
  );
  assert.equal(resetDefault.data?.reset.externalServicesTouched, false);
  assert.equal(
    resetDefault.data?.provenance.generationMethod,
    "rule-based-reset",
  );
  assert.equal(resetDefault.data?.provenance.databaseWriteExecuted, false);
  assert.equal(resetDefault.data?.provenance.externalNetworkRequested, false);
  assert.equal(resetEmpty.success, true);
  assert.equal(resetEmpty.data?.activeScenarioId, "empty-account-demo");
  assert.equal(resetEmpty.data?.selectedScenario.state, "empty");

  for (const filePath of [
    "shared/mock/scenarios.ts",
    "shared/mock/reset.ts",
    "app/api/mock/scenarios/route.ts",
    "app/api/mock/scenarios/[id]/activate/route.ts",
    "app/api/mock/reset/route.ts",
    "shared/mock/mock-data-mutation-reset-and-scenario-switcher/debug-view.tsx",
  ]) {
    const source = readFileSync(join(projectRoot, filePath), "utf8");

    for (const forbiddenPattern of providerFreeSourcePatterns) {
      assert.doesNotMatch(source, forbiddenPattern);
    }
  }
});

test("mock scenario API routes return stable envelopes with empty and failure paths", async () => {
  const scenariosRoute = await importProjectModule<{
    GET: (request: Request) => Promise<Response>;
  }>("app/api/mock/scenarios/route.ts");
  const activateRoute = await importProjectModule<{
    POST: (
      request: Request,
      context: { params: Promise<{ id: string }> },
    ) => Promise<Response>;
  }>("app/api/mock/scenarios/[id]/activate/route.ts");
  const resetRoute = await importProjectModule<{
    POST: (request: Request) => Promise<Response>;
  }>("app/api/mock/reset/route.ts");

  const scenariosResponse = await scenariosRoute.GET(
    new Request("https://orbit.local/api/mock/scenarios"),
  );
  const postEventResponse = await activateRoute.POST(
    new Request("https://orbit.local/api/mock/scenarios/post-event-demo/activate", {
      method: "POST",
    }),
    { params: Promise.resolve({ id: "post-event-demo" }) },
  );
  const resetResponse = await resetRoute.POST(
    new Request("https://orbit.local/api/mock/reset", { method: "POST" }),
  );
  const emptyResetResponse = await resetRoute.POST(
    new Request("https://orbit.local/api/mock/reset?scenario=empty-account-demo", {
      method: "POST",
    }),
  );
  const controlledFailureResponse = await activateRoute.POST(
    new Request("https://orbit.local/api/mock/scenarios/error-demo/activate", {
      method: "POST",
    }),
    { params: Promise.resolve({ id: "error-demo" }) },
  );
  const unknownScenarioResponse = await activateRoute.POST(
    new Request(
      "https://orbit.local/api/mock/scenarios/unknown-scenario/activate",
      {
        method: "POST",
      },
    ),
    { params: Promise.resolve({ id: "unknown-scenario" }) },
  );

  const scenariosEnvelope = await scenariosResponse.json();
  const postEventEnvelope = await postEventResponse.json();
  const resetEnvelope = await resetResponse.json();
  const emptyResetEnvelope = await emptyResetResponse.json();
  const controlledFailureEnvelope = await controlledFailureResponse.json();
  const unknownScenarioEnvelope = await unknownScenarioResponse.json();

  assert.equal(scenariosResponse.status, 200);
  assert.equal(scenariosResponse.headers.get("cache-control"), "no-store");
  assert.equal(scenariosResponse.headers.get("x-orbit-feature-mode"), "mock");
  assert.equal(scenariosEnvelope.success, true);
  assert.equal(scenariosEnvelope.data.activeScenarioId, "active-event-demo");
  assert.equal(scenariosEnvelope.data.scenarios.length, 6);
  assert.equal(
    scenariosEnvelope.data.scenarios.find(
      (scenario: { id: string }) => scenario.id === "empty-account-demo",
    ).state,
    "empty",
  );

  assert.equal(postEventResponse.status, 200);
  assert.equal(postEventEnvelope.success, true);
  assert.equal(postEventEnvelope.data.activeScenarioId, "post-event-demo");
  assert.equal(
    postEventEnvelope.data.selectedScenario.id,
    "post-event-demo",
  );

  assert.equal(resetResponse.status, 200);
  assert.equal(resetEnvelope.success, true);
  assert.equal(resetEnvelope.data.activeScenarioId, "active-event-demo");
  assert.equal(resetEnvelope.data.reset.type, "mock-data-reset");

  assert.equal(emptyResetResponse.status, 200);
  assert.equal(emptyResetEnvelope.success, true);
  assert.equal(emptyResetEnvelope.data.selectedScenario.state, "empty");

  assert.equal(controlledFailureResponse.status, 503);
  assert.deepEqual(controlledFailureEnvelope, {
    success: false,
    error: {
      code: "SERVICE_UNAVAILABLE",
      message:
        "The mock scenario switcher is pinned to a controlled failure scenario.",
      context: {
        boundary: "developer-admin",
        mode: "mock",
        mockScenarioErrorCode: "MOCK_SCENARIO_CONTROLLED_FAILURE",
        privacy: "no-relationship-data",
        provenance:
          "Mock scenario failure came from deterministic fixture rules.",
        service: "mock-data-mutation-reset-and-scenario-switcher",
      },
    },
  });

  assert.equal(unknownScenarioResponse.status, 404);
  assert.deepEqual(unknownScenarioEnvelope, {
    success: false,
    error: {
      code: "NOT_FOUND",
      message: "The requested mock scenario is not registered.",
      context: {
        boundary: "developer-admin",
        mode: "mock",
        mockScenarioErrorCode: "MOCK_SCENARIO_NOT_FOUND",
        privacy: "no-relationship-data",
        provenance:
          "Mock scenario failure came from deterministic fixture rules.",
        service: "mock-data-mutation-reset-and-scenario-switcher",
      },
    },
  });
});

test("mock data scenario dev route renders state matrix and live handoff", async () => {
  const debugView = await importProjectModule<{
    MOCK_DATA_SCENARIO_SWITCHER_SLUG: string;
    MockDataScenarioSwitcherDemo: React.ComponentType;
  }>("shared/mock/mock-data-mutation-reset-and-scenario-switcher/debug-view.tsx");
  const html = renderToStaticMarkup(
    React.createElement(debugView.MockDataScenarioSwitcherDemo),
  );
  const pageSource = readFileSync(
    join(projectRoot, "app/dev/capabilities/[slug]/page.tsx"),
    "utf8",
  );
  const liveDocPath =
    "shared/mock/mock-data-mutation-reset-and-scenario-switcher/LIVE_IMPLEMENTATION.md";
  const liveDoc = readFileSync(join(projectRoot, liveDocPath), "utf8");

  assert.equal(
    debugView.MOCK_DATA_SCENARIO_SWITCHER_SLUG,
    "mock-data-mutation-reset-and-scenario-switcher",
  );
  assert.match(pageSource, /MOCK_DATA_SCENARIO_SWITCHER_SLUG/);
  assert.match(pageSource, /MockDataScenarioSwitcherDemo/);

  assert.match(html, /Mock data mutation reset and scenario switcher/);
  assert.match(html, /aria-label="Mock scenario operator checkpoint"/);
  assert.match(html, /New user/);
  assert.match(html, /Active event/);
  assert.match(html, /Post-event/);
  assert.match(html, /Dormant network/);
  assert.match(html, /Empty account/);
  assert.match(html, /Error state/);
  assert.match(html, /Evidence records/);
  assert.match(html, /11 evidence records/);
  assert.match(html, /Success state/);
  assert.match(html, /Empty state/);
  assert.match(html, /Pending state/);
  assert.match(html, /Failure state/);
  assert.match(html, /production seed management replaced true/);
  assert.match(html, /persistent user scenario storage replaced true/);
  assert.match(html, /external network requested false/);
  assert.match(html, /database writes false/);
  assert.match(html, /AI provider requested false/);
  assert.match(html, /notification provider requested false/);
  assert.match(html, /device requested false/);
  assert.match(html, /GET \/api\/mock\/scenarios/);
  assert.match(
    html,
    /POST \/api\/mock\/scenarios\/post-event-demo\/activate/,
  );
  assert.match(html, /POST \/api\/mock\/reset/);
  assert.match(
    html,
    /POST \/api\/mock\/scenarios\/unknown-scenario\/activate/,
  );
  assert.match(html, /MOCK_SCENARIO_CONTROLLED_FAILURE/);
  assert.match(html, /MOCK_SCENARIO_NOT_FOUND/);
  assert.match(html, /MOCK_RESET_CONTROLLED_FAILURE/);
  assert.match(html, new RegExp(liveDocPath));
  assert.match(html, /Live service and provider files/);
  assert.match(html, /Switch mechanism/);
  assert.match(html, /Required env vars and permissions/);
  assert.match(html, /Privacy and provenance constraints/);
  assert.match(html, /Replacement tests/);
  assert.match(html, /ORBIT_MOCK_SCENARIO_PROVIDER/);
  assert.match(html, /mock-scenario-workbench/);
  assert.match(
    html,
    /\.mock-scenario-workbench\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)/,
  );

  assert.match(liveDoc, /Live service and provider files/i);
  assert.match(liveDoc, /Switch mechanism/i);
  assert.match(liveDoc, /Required env vars and permissions/i);
  assert.match(liveDoc, /Privacy and provenance constraints/i);
  assert.match(liveDoc, /Replacement tests/i);
  assert.match(liveDoc, /shared\/mock\/scenarios\.ts/);
  assert.match(liveDoc, /shared\/mock\/reset\.ts/);
  assert.match(liveDoc, /ORBIT_MOCK_SCENARIO_PROVIDER/);
  assert.match(liveDoc, /Supabase/i);
  assert.match(liveDoc, /OAuth/i);
  assert.match(liveDoc, /new user/i);
  assert.match(liveDoc, /active event/i);
  assert.match(liveDoc, /post-event/i);
  assert.match(liveDoc, /dormant network/i);
  assert.match(liveDoc, /empty account/i);
  assert.match(liveDoc, /controlled failure/i);
});
