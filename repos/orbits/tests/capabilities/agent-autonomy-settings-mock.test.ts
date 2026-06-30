/**
 * Agent 自主级别设置 capability 的契约测试。
 *
 * 锁住读取/更新自主级别、非法 level、debug-view 和 API envelope 行为。
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as agentSettingsFixtures from "../../features/agent/settings-fixtures";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

async function importProjectModule<TModule>(
  pathFromRoot: string,
): Promise<TModule> {
  const absolutePath = join(projectRoot, pathFromRoot);

  assert.equal(
    existsSync(absolutePath),
    true,
    `${pathFromRoot} must exist for the agent autonomy settings mock sprint`,
  );

  return (await import(pathToFileURL(absolutePath).href)) as TModule;
}

test("agent autonomy settings contract exports levels fixtures service interface and errors", async () => {
  const contract = await importProjectModule<{
    AGENT_AUTONOMY_LEVELS: readonly string[];
    AGENT_AUTONOMY_SETTINGS_ERROR_CODES: readonly string[];
    AGENT_AUTONOMY_SETTINGS_ERROR_DEFINITIONS: Record<
      string,
      { appCode: string; message: string; recovery: string }
    >;
    AGENT_AUTONOMY_SETTINGS_FIXTURE_SOURCE: string;
    mockAgentAutonomySettingsFixture: {
      state: string;
      currentLevel: string;
      levels: readonly Array<{
        level: string;
        label: string;
        boundary: string;
        autonomousExecutionAllowed: false;
        scheduledLiveAgentJobsAllowed: false;
        confirmationRequiredBeforeExternalAction: boolean;
        rules: readonly string[];
        blockedLiveCapabilities: readonly string[];
      }>;
      confirmationRules: readonly Array<{
        ruleId: string;
        level: string;
        actionType: string;
        requiresConfirmation: boolean;
        consequence: string;
      }>;
      relationshipWorkflowProtections: readonly Array<{
        workflowId: string;
        label: string;
        protectedContext: string;
        confirmationReason: string;
        blockedUntilConfirmed: readonly string[];
      }>;
      provenance: {
        source: string;
        generationMethod: string;
        autonomousExecutionPolicyEvaluated: false;
        scheduledLiveAgentJobRegistered: false;
        externalNetworkRequested: false;
        databaseReadExecuted: false;
        databaseWriteExecuted: false;
        aiProviderRequested: false;
        calendarProviderRequested: false;
        emailProviderRequested: false;
        notificationProviderRequested: false;
        deviceRequested: false;
      };
    };
    mockEmptyAgentAutonomySettingsFixture: {
      state: string;
      levels: readonly unknown[];
      nextAction: string;
    };
    mockPendingAgentAutonomySettingsFixture: {
      state: string;
      nextAction: string;
    };
    mockUpdatedHighAgentAutonomySettingsFixture: {
      state: string;
      currentLevel: string;
      requestedLevel: string;
      confirmationSummary: string;
      provenance: { generationMethod: string };
    };
  }>("features/agent/settings-contract.ts");
  const contractSource = readFileSync(
    join(projectRoot, "features/agent/settings-contract.ts"),
    "utf8",
  );

  assert.match(contractSource, /interface AgentAutonomySettingsService/);
  assert.match(contractSource, /getSettings/);
  assert.match(contractSource, /updateSettings/);
  assert.deepEqual(contract.AGENT_AUTONOMY_LEVELS, ["low", "medium", "high"]);
  assert.deepEqual(contract.AGENT_AUTONOMY_SETTINGS_ERROR_CODES, [
    "AGENT_AUTONOMY_SETTINGS_INVALID_LEVEL",
    "AGENT_AUTONOMY_SETTINGS_EMPTY",
    "AGENT_AUTONOMY_SETTINGS_PENDING",
    "AGENT_AUTONOMY_SETTINGS_MOCK_FAILED",
  ]);
  assert.equal(
    contract.AGENT_AUTONOMY_SETTINGS_ERROR_DEFINITIONS
      .AGENT_AUTONOMY_SETTINGS_MOCK_FAILED.appCode,
    "SERVICE_UNAVAILABLE",
  );
  assert.match(
    contract.AGENT_AUTONOMY_SETTINGS_ERROR_DEFINITIONS
      .AGENT_AUTONOMY_SETTINGS_INVALID_LEVEL.recovery,
    /low, medium, or high/i,
  );
  assert.equal(
    agentSettingsFixtures.AGENT_AUTONOMY_SETTINGS_FIXTURE_SOURCE,
    "fixture:features/agent/settings-fixtures.ts",
  );
  assert.equal(agentSettingsFixtures.mockAgentAutonomySettingsFixture.state, "success");
  assert.equal(
    agentSettingsFixtures.mockAgentAutonomySettingsFixture.provenance.source,
    agentSettingsFixtures.AGENT_AUTONOMY_SETTINGS_FIXTURE_SOURCE,
  );
  assert.deepEqual(
    agentSettingsFixtures.mockAgentAutonomySettingsFixture.levels.map(
      (level) => level.level,
    ),
    ["low", "medium", "high"],
  );
  assert.deepEqual(
    agentSettingsFixtures.mockAgentAutonomySettingsFixture.levels.map(
      (level) => level.autonomousExecutionAllowed,
    ),
    [false, false, false],
  );
  assert.deepEqual(
    agentSettingsFixtures.mockAgentAutonomySettingsFixture.levels.map(
      (level) => level.scheduledLiveAgentJobsAllowed,
    ),
    [false, false, false],
  );
  assert.equal(
    agentSettingsFixtures.mockAgentAutonomySettingsFixture.levels[2]
      .confirmationRequiredBeforeExternalAction,
    true,
  );
  assert.match(
    agentSettingsFixtures.mockAgentAutonomySettingsFixture.levels[2].boundary,
    /drafts and staged recommendations only/i,
  );
  assert.match(
    agentSettingsFixtures.mockAgentAutonomySettingsFixture.levels[2]
      .blockedLiveCapabilities.join(" "),
    /calendar|email|notification|AI provider|database/i,
  );
  assert.deepEqual(
    agentSettingsFixtures.mockAgentAutonomySettingsFixture.confirmationRules.map(
      (rule) => rule.level,
    ),
    ["low", "medium", "high"],
  );
  assert.deepEqual(
    agentSettingsFixtures.mockAgentAutonomySettingsFixture.relationshipWorkflowProtections.map(
      (workflow) => workflow.workflowId,
    ),
    [
      "participant-facing-followup",
      "relationship-reminder",
      "relationship-data-workflow",
    ],
  );
  assert.match(
    agentSettingsFixtures.mockAgentAutonomySettingsFixture.relationshipWorkflowProtections
      .map((workflow) => workflow.protectedContext)
      .join(" "),
    /participant-facing follow-up|reminder timing|relationship evidence/i,
  );
  assert.match(
    agentSettingsFixtures.mockAgentAutonomySettingsFixture.relationshipWorkflowProtections
      .flatMap((workflow) => workflow.blockedUntilConfirmed)
      .join(" "),
    /email send|calendar write|database mutation|notification delivery/i,
  );
  assert.equal(
    agentSettingsFixtures.mockAgentAutonomySettingsFixture.confirmationRules[2]
      .requiresConfirmation,
    true,
  );
  assert.equal(
    agentSettingsFixtures.mockAgentAutonomySettingsFixture.provenance
      .autonomousExecutionPolicyEvaluated,
    false,
  );
  assert.equal(
    agentSettingsFixtures.mockAgentAutonomySettingsFixture.provenance
      .scheduledLiveAgentJobRegistered,
    false,
  );
  assert.equal(
    agentSettingsFixtures.mockAgentAutonomySettingsFixture.provenance
      .externalNetworkRequested,
    false,
  );
  assert.equal(
    agentSettingsFixtures.mockAgentAutonomySettingsFixture.provenance.databaseReadExecuted,
    false,
  );
  assert.equal(
    agentSettingsFixtures.mockAgentAutonomySettingsFixture.provenance.databaseWriteExecuted,
    false,
  );
  assert.equal(
    agentSettingsFixtures.mockAgentAutonomySettingsFixture.provenance.aiProviderRequested,
    false,
  );
  assert.equal(
    agentSettingsFixtures.mockAgentAutonomySettingsFixture.provenance.calendarProviderRequested,
    false,
  );
  assert.equal(
    agentSettingsFixtures.mockAgentAutonomySettingsFixture.provenance.emailProviderRequested,
    false,
  );
  assert.equal(
    agentSettingsFixtures.mockAgentAutonomySettingsFixture.provenance
      .notificationProviderRequested,
    false,
  );
  assert.equal(
    agentSettingsFixtures.mockAgentAutonomySettingsFixture.provenance.deviceRequested,
    false,
  );
  assert.equal(agentSettingsFixtures.mockEmptyAgentAutonomySettingsFixture.state, "empty");
  assert.match(
    agentSettingsFixtures.mockEmptyAgentAutonomySettingsFixture.nextAction,
    /choose an autonomy level/i,
  );
  assert.equal(agentSettingsFixtures.mockPendingAgentAutonomySettingsFixture.state, "pending");
  assert.equal(
    agentSettingsFixtures.mockUpdatedHighAgentAutonomySettingsFixture.currentLevel,
    "high",
  );
  assert.equal(
    agentSettingsFixtures.mockUpdatedHighAgentAutonomySettingsFixture.requestedLevel,
    "high",
  );
  assert.match(
    agentSettingsFixtures.mockUpdatedHighAgentAutonomySettingsFixture.confirmationSummary,
    /explicit confirmation/i,
  );
  assert.equal(
    agentSettingsFixtures.mockUpdatedHighAgentAutonomySettingsFixture.provenance
      .generationMethod,
    "rule-based-settings-update",
  );
});

test("mock agent autonomy settings service is deterministic provider-free and side-effect-free", async () => {
  const serviceModule = await importProjectModule<{
    createMockAgentAutonomySettingsService: () => {
      getSettings: (input?: { scenario?: string | null }) => {
        success: boolean;
        data?: {
          state: string;
          currentLevel: string;
          levels: readonly Array<{
            level: string;
            autonomousExecutionAllowed: false;
            scheduledLiveAgentJobsAllowed: false;
          }>;
          provenance: {
            autonomousExecutionPolicyEvaluated: false;
            scheduledLiveAgentJobRegistered: false;
            externalNetworkRequested: false;
            databaseWriteExecuted: false;
            aiProviderRequested: false;
            calendarProviderRequested: false;
            emailProviderRequested: false;
            notificationProviderRequested: false;
            deviceRequested: false;
          };
        };
        error?: { code: string; appCode: string };
      };
      updateSettings: (input: {
        requestedLevel?: string | null;
        scenario?: string | null;
        actorLabel?: string | null;
      }) => {
        success: boolean;
        data?: {
          state: string;
          currentLevel: string;
          requestedLevel: string;
          actorLabel: string;
          externalSideEffectExecuted: false;
          autonomousExecutionStarted: false;
          scheduledLiveAgentJobRegistered: false;
          confirmationSummary: string;
          provenance: {
            generationMethod: string;
            externalNetworkRequested: false;
            databaseWriteExecuted: false;
          };
        };
        error?: { code: string; appCode: string };
      };
    };
  }>("features/agent/mock-settings-service.ts");

  const service = serviceModule.createMockAgentAutonomySettingsService();
  const settings = service.getSettings();
  const empty = service.getSettings({ scenario: "empty" });
  const pending = service.getSettings({ scenario: "pending" });
  const failure = service.getSettings({ scenario: "failure" });
  const updatedLow = service.updateSettings({
    requestedLevel: "low",
    actorLabel: "Sprint evaluator",
  });
  const updatedHigh = service.updateSettings({
    requestedLevel: "high",
    actorLabel: "Sprint evaluator",
  });
  const invalid = service.updateSettings({ requestedLevel: "maximum" });

  assert.deepEqual(service.getSettings(), service.getSettings());
  assert.deepEqual(
    service.updateSettings({ requestedLevel: "medium" }),
    service.updateSettings({ requestedLevel: "medium" }),
  );
  assert.equal(settings.success, true);
  assert.equal(settings.data?.state, "success");
  assert.equal(settings.data?.currentLevel, "medium");
  assert.equal(settings.data?.levels.length, 3);
  assert.equal(settings.data?.levels[0].level, "low");
  assert.equal(settings.data?.levels[1].level, "medium");
  assert.equal(settings.data?.levels[2].level, "high");
  assert.equal(settings.data?.levels[2].autonomousExecutionAllowed, false);
  assert.equal(settings.data?.levels[2].scheduledLiveAgentJobsAllowed, false);
  assert.equal(
    settings.data?.provenance.autonomousExecutionPolicyEvaluated,
    false,
  );
  assert.equal(
    settings.data?.provenance.scheduledLiveAgentJobRegistered,
    false,
  );
  assert.equal(settings.data?.provenance.externalNetworkRequested, false);
  assert.equal(settings.data?.provenance.databaseWriteExecuted, false);
  assert.equal(settings.data?.provenance.aiProviderRequested, false);
  assert.equal(settings.data?.provenance.calendarProviderRequested, false);
  assert.equal(settings.data?.provenance.emailProviderRequested, false);
  assert.equal(settings.data?.provenance.notificationProviderRequested, false);
  assert.equal(settings.data?.provenance.deviceRequested, false);
  assert.equal(empty.success, true);
  assert.equal(empty.data?.state, "empty");
  assert.equal(empty.data?.levels.length, 0);
  assert.equal(pending.success, true);
  assert.equal(pending.data?.state, "pending");
  assert.equal(failure.success, false);
  assert.equal(failure.error?.code, "AGENT_AUTONOMY_SETTINGS_MOCK_FAILED");
  assert.equal(failure.error?.appCode, "SERVICE_UNAVAILABLE");
  assert.equal(updatedLow.success, true);
  assert.equal(updatedLow.data?.currentLevel, "low");
  assert.match(
    updatedLow.data?.confirmationSummary ?? "",
    /all external actions stay blocked/i,
  );
  assert.equal(updatedLow.data?.externalSideEffectExecuted, false);
  assert.equal(updatedLow.data?.autonomousExecutionStarted, false);
  assert.equal(updatedLow.data?.scheduledLiveAgentJobRegistered, false);
  assert.equal(updatedLow.data?.provenance.externalNetworkRequested, false);
  assert.equal(updatedLow.data?.provenance.databaseWriteExecuted, false);
  assert.equal(updatedHigh.success, true);
  assert.equal(updatedHigh.data?.requestedLevel, "high");
  assert.match(
    updatedHigh.data?.confirmationSummary ?? "",
    /explicit confirmation/i,
  );
  assert.equal(invalid.success, false);
  assert.equal(invalid.error?.code, "AGENT_AUTONOMY_SETTINGS_INVALID_LEVEL");

  for (const filePath of [
    "features/agent/settings-contract.ts",
    "features/agent/mock-settings-service.ts",
    "app/api/agent/settings/route.ts",
    "features/agent/agent-autonomy-settings-mock/debug-view.tsx",
  ]) {
    const source = readFileSync(join(projectRoot, filePath), "utf8");

    assert.doesNotMatch(source, /\bfetch\s*\(/);
    assert.doesNotMatch(source, /Supabase|createClient|OAuth/i);
    assert.doesNotMatch(source, /XMLHttpRequest|WebSocket|EventSource/);
    assert.doesNotMatch(source, /navigator|mediaDevices|localStorage|indexedDB/);
    assert.doesNotMatch(source, /from ["']node:net["']|from ["']node:http/);
    assert.doesNotMatch(source, /openai|anthropic/i);
  }
});

test("agent autonomy settings API route returns stable envelopes with empty and failure paths", async () => {
  const route = await importProjectModule<{
    GET: (request: Request) => Promise<Response>;
    PUT: (request: Request) => Promise<Response>;
  }>("app/api/agent/settings/route.ts");
  const contract = await importProjectModule<{
    mockAgentAutonomySettingsFixture: unknown;
    mockEmptyAgentAutonomySettingsFixture: unknown;
    mockUpdatedHighAgentAutonomySettingsFixture: unknown;
  }>("features/agent/settings-contract.ts");

  const getResponse = await route.GET(
    new Request("https://orbit.local/api/agent/settings"),
  );
  const emptyResponse = await route.GET(
    new Request("https://orbit.local/api/agent/settings?scenario=empty"),
  );
  const putResponse = await route.PUT(
    new Request("https://orbit.local/api/agent/settings", {
      body: JSON.stringify({
        actorLabel: "Sprint evaluator",
        requestedLevel: "high",
      }),
      method: "PUT",
    }),
  );
  const failureResponse = await route.PUT(
    new Request("https://orbit.local/api/agent/settings?scenario=failure", {
      body: JSON.stringify({ requestedLevel: "high" }),
      method: "PUT",
    }),
  );

  assert.equal(getResponse.status, 200);
  assert.equal(getResponse.headers.get("cache-control"), "no-store");
  assert.equal(getResponse.headers.get("x-orbit-feature-mode"), "mock");
  assert.deepEqual(await getResponse.json(), {
    success: true,
    data: agentSettingsFixtures.mockAgentAutonomySettingsFixture,
  });

  assert.equal(emptyResponse.status, 200);
  assert.deepEqual(await emptyResponse.json(), {
    success: true,
    data: agentSettingsFixtures.mockEmptyAgentAutonomySettingsFixture,
  });

  assert.equal(putResponse.status, 200);
  assert.deepEqual(await putResponse.json(), {
    success: true,
    data: agentSettingsFixtures.mockUpdatedHighAgentAutonomySettingsFixture,
  });

  assert.equal(failureResponse.status, 503);
  assert.deepEqual(await failureResponse.json(), {
    success: false,
    error: {
      code: "SERVICE_UNAVAILABLE",
      message:
        "The mock agent autonomy settings boundary is pinned to a controlled failure scenario.",
      context: {
        agentAutonomySettingsErrorCode: "AGENT_AUTONOMY_SETTINGS_MOCK_FAILED",
        boundary: "developer-admin",
        mode: "mock",
        privacy: "no-relationship-data",
        provenance:
          "Mock agent autonomy settings failure came from deterministic fixture rules.",
        service: "agent-autonomy-settings-mock",
      },
    },
  });
});

test("agent autonomy settings debug route renders all states and live replacement handoff", async () => {
  const debugView = await importProjectModule<{
    AGENT_AUTONOMY_SETTINGS_MOCK_SLUG: string;
    AgentAutonomySettingsMockDemo: React.ComponentType;
  }>("features/agent/agent-autonomy-settings-mock/debug-view.tsx");
  const html = renderToStaticMarkup(
    React.createElement(debugView.AgentAutonomySettingsMockDemo),
  );
  const pageSource = readFileSync(
    join(projectRoot, "app/dev/capabilities/[slug]/page.tsx"),
    "utf8",
  );
  const liveDocPath =
    "features/agent/agent-autonomy-settings-mock/LIVE_IMPLEMENTATION.md";
  const liveDoc = readFileSync(join(projectRoot, liveDocPath), "utf8");

  assert.equal(
    debugView.AGENT_AUTONOMY_SETTINGS_MOCK_SLUG,
    "agent-autonomy-settings-mock",
  );
  assert.match(pageSource, /AGENT_AUTONOMY_SETTINGS_MOCK_SLUG/);
  assert.match(pageSource, /AgentAutonomySettingsMockDemo/);

  assert.match(html, /href="#agent-autonomy-settings-scenario-controls"/);
  assert.match(html, /id="agent-autonomy-settings-scenario-controls"/);
  assert.match(html, /<h1>Agent autonomy settings mock<\/h1>/);
  assert.match(html, /Agent autonomy settings mock/);
  assert.match(html, /aria-label="Agent autonomy settings operator checkpoint"/);
  assert.match(html, /Low autonomy/);
  assert.match(html, /Medium autonomy/);
  assert.match(html, /High autonomy/);
  assert.match(html, /drafts and staged recommendations only/);
  assert.match(html, /Protected relationship workflows/);
  assert.match(html, /Participant-facing follow-up/);
  assert.match(html, /Relationship reminder timing/);
  assert.match(html, /Relationship data updates/);
  assert.match(html, /relationship evidence and context labels/i);
  assert.match(html, /confirmation required before external action true/);
  assert.match(html, /autonomous execution false/);
  assert.match(html, /scheduled live jobs false/);
  assert.match(html, /external network false/);
  assert.match(html, /database writes false/);
  assert.match(html, /AI provider false/);
  assert.match(html, /email false/);
  assert.match(html, /calendar false/);
  assert.match(html, /notification provider false/);
  assert.match(html, /device false/);
  assert.match(html, /Success state/);
  assert.match(html, /Empty state/);
  assert.match(html, /Pending state/);
  assert.match(html, /Failure state/);
  assert.match(html, /AGENT_AUTONOMY_SETTINGS_MOCK_FAILED/);
  assert.match(html, /GET \/api\/agent\/settings/);
  assert.match(html, /PUT \/api\/agent\/settings/);
  assert.match(html, /GET \/api\/agent\/settings\?scenario=empty/);
  assert.match(html, /PUT \/api\/agent\/settings\?scenario=failure/);
  assert.match(
    html,
    /aria-label="Agent autonomy settings scenario exercise controls"/,
  );
  assert.match(html, /href="\/api\/agent\/settings\?scenario=empty"/);
  assert.match(html, /action="\/api\/agent\/settings"/);
  assert.match(html, /action="\/api\/agent\/settings\?scenario=failure"/);
  assert.match(html, new RegExp(liveDocPath));
  assert.match(html, /ORBIT_AGENT_AUTONOMY_SETTINGS_PROVIDER/);
  assert.match(html, /agent-autonomy-settings-workbench/);
  assert.match(
    html,
    /\.agent-autonomy-settings-workbench\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)/,
  );

  assert.match(
    liveDoc,
    /features\/agent\/agent-autonomy-settings-mock\/live-service\.ts/,
  );
  assert.match(
    liveDoc,
    /features\/agent\/agent-autonomy-settings-mock\/service-factory\.ts/,
  );
  assert.match(
    liveDoc,
    /features\/agent\/agent-autonomy-settings-mock\/providers\//,
  );
  assert.match(liveDoc, /ORBIT_AGENT_AUTONOMY_SETTINGS_PROVIDER/);
  assert.match(liveDoc, /ORBIT_AGENT_AUTONOMY_DATABASE_URL/);
  assert.match(liveDoc, /ORBIT_AGENT_AUTONOMY_JOB_QUEUE_URL/);
  assert.match(liveDoc, /ORBIT_AGENT_AUTONOMY_AI_PROVIDER/);
  assert.match(liveDoc, /calendar permission/i);
  assert.match(liveDoc, /email permission/i);
  assert.match(liveDoc, /notification permission/i);
  assert.match(liveDoc, /explicit confirmation/i);
  assert.match(liveDoc, /participant-facing follow-up/i);
  assert.match(liveDoc, /relationship reminder/i);
  assert.match(liveDoc, /relationship data workflow/i);
  assert.match(liveDoc, /privacy/i);
  assert.match(liveDoc, /provenance/i);
  assert.match(liveDoc, /low, medium, and high autonomy levels/i);
  assert.match(liveDoc, /empty/i);
  assert.match(liveDoc, /pending/i);
  assert.match(liveDoc, /controlled failure/i);
  assert.match(liveDoc, /replacement tests/i);
});
