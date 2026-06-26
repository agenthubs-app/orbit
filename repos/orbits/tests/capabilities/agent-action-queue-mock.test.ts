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
    `${pathFromRoot} must exist for the agent action queue mock sprint`,
  );

  return (await import(pathToFileURL(absolutePath).href)) as TModule;
}

test("agent action queue contract exports typed categories fixtures errors and service interface", async () => {
  const contract = await importProjectModule<{
    AGENT_ACTION_QUEUE_ACTION_TYPES: readonly string[];
    AGENT_ACTION_QUEUE_ERROR_CODES: readonly string[];
    AGENT_ACTION_QUEUE_ERROR_DEFINITIONS: Record<
      string,
      { appCode: string; message: string; recovery: string }
    >;
    AGENT_ACTION_QUEUE_FIXTURE_SOURCE: string;
  }>("features/agent/contract.ts");
  const fixtures = await importProjectModule<{
    mockAgentActionQueueFixture: {
      state: string;
      actions: readonly Array<{
        actionId: string;
        actionType: string;
        title: string;
        recommendedAction: string;
        evidenceIds: readonly string[];
        sourceRefs: readonly Array<{
          type: string;
          label: string;
          providerRecordId: string;
          generatedBy: string;
        }>;
        provenance: {
          source: string;
          generationMethod: string;
          autonomousExecutionStarted: false;
          externalSideEffectExecuted: false;
          externalNetworkRequested: false;
          liveDatabaseReadExecuted: false;
          liveDatabaseWriteExecuted: false;
          aiProviderRequested: false;
          calendarProviderRequested: false;
          emailProviderRequested: false;
          notificationProviderRequested: false;
          deviceRequested: false;
        };
      }>;
      provenance: {
        source: string;
        generationMethod: string;
        autonomousExecutionStarted: false;
        externalSideEffectExecuted: false;
        externalNetworkRequested: false;
        liveDatabaseReadExecuted: false;
        liveDatabaseWriteExecuted: false;
        aiProviderRequested: false;
        calendarProviderRequested: false;
        emailProviderRequested: false;
        notificationProviderRequested: false;
        deviceRequested: false;
      };
    };
    mockEmptyAgentActionQueueFixture: {
      state: string;
      actions: readonly unknown[];
      nextAction: string;
    };
    mockPendingAgentActionQueueFixture: {
      state: string;
      actions: readonly unknown[];
      nextAction: string;
    };
  }>("features/agent/fixtures.ts");
  const serviceSource = readFileSync(
    join(projectRoot, "features/agent/service.ts"),
    "utf8",
  );

  assert.match(serviceSource, /interface AgentActionQueueService/);
  assert.match(serviceSource, /listActions/);
  assert.match(serviceSource, /acceptAction/);
  assert.match(serviceSource, /dismissAction/);
  assert.deepEqual(contract.AGENT_ACTION_QUEUE_ACTION_TYPES, [
    "event_reminder",
    "post_event_followup",
    "dormant_activation",
    "message_draft_suggestion",
    "appointment_suggestion",
  ]);
  assert.deepEqual(contract.AGENT_ACTION_QUEUE_ERROR_CODES, [
    "AGENT_ACTION_QUEUE_ACTION_ID_REQUIRED",
    "AGENT_ACTION_QUEUE_ACTION_NOT_FOUND",
    "AGENT_ACTION_QUEUE_EMPTY",
    "AGENT_ACTION_QUEUE_PENDING",
    "AGENT_ACTION_QUEUE_MOCK_FAILED",
  ]);
  assert.equal(
    contract.AGENT_ACTION_QUEUE_ERROR_DEFINITIONS.AGENT_ACTION_QUEUE_MOCK_FAILED
      .appCode,
    "SERVICE_UNAVAILABLE",
  );
  assert.match(
    contract.AGENT_ACTION_QUEUE_ERROR_DEFINITIONS.AGENT_ACTION_QUEUE_EMPTY
      .recovery,
    /relationship context|event evidence|source/i,
  );
  assert.equal(fixtures.mockAgentActionQueueFixture.state, "success");
  assert.equal(
    fixtures.mockAgentActionQueueFixture.provenance.source,
    contract.AGENT_ACTION_QUEUE_FIXTURE_SOURCE,
  );
  assert.deepEqual(
    fixtures.mockAgentActionQueueFixture.actions.map(
      (action) => action.actionType,
    ),
    [
      "event_reminder",
      "post_event_followup",
      "dormant_activation",
      "message_draft_suggestion",
      "appointment_suggestion",
    ],
  );
  assert.equal(
    fixtures.mockAgentActionQueueFixture.actions[0].actionId,
    "demo-action-1",
  );
  assert.equal(
    fixtures.mockAgentActionQueueFixture.actions[0].sourceRefs[0].generatedBy,
    "mock-agent-action-rules",
  );
  assert.equal(
    fixtures.mockAgentActionQueueFixture.actions[0].provenance
      .autonomousExecutionStarted,
    false,
  );
  assert.equal(
    fixtures.mockAgentActionQueueFixture.actions[0].provenance
      .externalSideEffectExecuted,
    false,
  );
  assert.equal(
    fixtures.mockAgentActionQueueFixture.provenance.externalNetworkRequested,
    false,
  );
  assert.equal(
    fixtures.mockAgentActionQueueFixture.provenance.liveDatabaseWriteExecuted,
    false,
  );
  assert.equal(
    fixtures.mockAgentActionQueueFixture.provenance.aiProviderRequested,
    false,
  );
  assert.equal(
    fixtures.mockAgentActionQueueFixture.provenance.calendarProviderRequested,
    false,
  );
  assert.equal(
    fixtures.mockAgentActionQueueFixture.provenance.emailProviderRequested,
    false,
  );
  assert.equal(
    fixtures.mockAgentActionQueueFixture.provenance.notificationProviderRequested,
    false,
  );
  assert.equal(
    fixtures.mockAgentActionQueueFixture.provenance.deviceRequested,
    false,
  );
  assert.equal(fixtures.mockEmptyAgentActionQueueFixture.state, "empty");
  assert.match(
    fixtures.mockEmptyAgentActionQueueFixture.nextAction,
    /relationship context|event evidence|source/i,
  );
  assert.equal(fixtures.mockPendingAgentActionQueueFixture.state, "pending");
});

test("mock agent action queue service is deterministic provider-free and side-effect-free", async () => {
  const serviceModule = await importProjectModule<{
    createMockAgentActionQueueService: () => {
      listActions: (input?: { scenario?: string | null }) => {
        success: boolean;
        data?: {
          state: string;
          actions: readonly Array<{
            actionId: string;
            actionType: string;
            externalSideEffectExecuted: false;
            provenance: {
              autonomousExecutionStarted: false;
              externalNetworkRequested: false;
              liveDatabaseWriteExecuted: false;
              aiProviderRequested: false;
              calendarProviderRequested: false;
              emailProviderRequested: false;
              notificationProviderRequested: false;
              deviceRequested: false;
            };
          }>;
        };
        error?: { code: string; appCode: string };
      };
      acceptAction: (input: {
        actionId?: string | null;
        scenario?: string | null;
        actorLabel?: string | null;
      }) => {
        success: boolean;
        data?: {
          state: string;
          actionId: string;
          decision: string;
          externalSideEffectExecuted: false;
          confirmationRequired: true;
          provenance: {
            generationMethod: string;
            autonomousExecutionStarted: false;
            externalSideEffectExecuted: false;
            externalNetworkRequested: false;
          };
        };
        error?: { code: string; appCode: string };
      };
      dismissAction: (input: {
        actionId?: string | null;
        scenario?: string | null;
        actorLabel?: string | null;
      }) => {
        success: boolean;
        data?: {
          state: string;
          actionId: string;
          decision: string;
          externalSideEffectExecuted: false;
          confirmationRequired: false;
        };
        error?: { code: string; appCode: string };
      };
    };
  }>("features/agent/mock-service.ts");

  const service = serviceModule.createMockAgentActionQueueService();
  const list = service.listActions();
  const accepted = service.acceptAction({
    actionId: "demo-action-1",
    actorLabel: "Sprint evaluator",
  });
  const dismissed = service.dismissAction({ actionId: "demo-action-1" });
  const empty = service.listActions({ scenario: "empty" });
  const pending = service.listActions({ scenario: "pending" });
  const failure = service.acceptAction({
    actionId: "demo-action-1",
    scenario: "failure",
  });
  const missingId = service.acceptAction({});
  const missingAction = service.dismissAction({ actionId: "missing-action" });

  assert.deepEqual(service.listActions(), service.listActions());
  assert.deepEqual(
    service.acceptAction({ actionId: "demo-action-1" }),
    service.acceptAction({ actionId: "demo-action-1" }),
  );
  assert.equal(list.success, true);
  assert.equal(list.data?.state, "success");
  assert.equal(list.data?.actions.length, 5);
  assert.equal(list.data?.actions[0].externalSideEffectExecuted, false);
  assert.equal(
    list.data?.actions[0].provenance.autonomousExecutionStarted,
    false,
  );
  assert.equal(list.data?.actions[0].provenance.externalNetworkRequested, false);
  assert.equal(list.data?.actions[0].provenance.liveDatabaseWriteExecuted, false);
  assert.equal(list.data?.actions[0].provenance.aiProviderRequested, false);
  assert.equal(list.data?.actions[0].provenance.calendarProviderRequested, false);
  assert.equal(list.data?.actions[0].provenance.emailProviderRequested, false);
  assert.equal(
    list.data?.actions[0].provenance.notificationProviderRequested,
    false,
  );
  assert.equal(list.data?.actions[0].provenance.deviceRequested, false);
  assert.equal(accepted.success, true);
  assert.equal(accepted.data?.actionId, "demo-action-1");
  assert.equal(accepted.data?.decision, "accepted");
  assert.equal(accepted.data?.confirmationRequired, true);
  assert.equal(accepted.data?.externalSideEffectExecuted, false);
  assert.equal(
    accepted.data?.provenance.generationMethod,
    "rule-based-user-decision",
  );
  assert.equal(accepted.data?.provenance.externalNetworkRequested, false);
  assert.equal(dismissed.success, true);
  assert.equal(dismissed.data?.decision, "dismissed");
  assert.equal(dismissed.data?.confirmationRequired, false);
  assert.equal(dismissed.data?.externalSideEffectExecuted, false);
  assert.equal(empty.success, true);
  assert.equal(empty.data?.state, "empty");
  assert.equal(empty.data?.actions.length, 0);
  assert.equal(pending.success, true);
  assert.equal(pending.data?.state, "pending");
  assert.equal(failure.success, false);
  assert.equal(failure.error?.code, "AGENT_ACTION_QUEUE_MOCK_FAILED");
  assert.equal(failure.error?.appCode, "SERVICE_UNAVAILABLE");
  assert.equal(missingId.success, false);
  assert.equal(
    missingId.error?.code,
    "AGENT_ACTION_QUEUE_ACTION_ID_REQUIRED",
  );
  assert.equal(missingAction.success, false);
  assert.equal(
    missingAction.error?.code,
    "AGENT_ACTION_QUEUE_ACTION_NOT_FOUND",
  );

  for (const filePath of [
    "features/agent/contract.ts",
    "features/agent/fixtures.ts",
    "features/agent/service.ts",
    "features/agent/mock-service.ts",
    "app/api/agent/actions/route.ts",
    "app/api/agent/actions/[id]/accept/route.ts",
    "app/api/agent/actions/[id]/dismiss/route.ts",
    "features/agent/agent-action-queue-mock/debug-view.tsx",
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

test("agent action queue API routes return stable envelopes with empty and failure paths", async () => {
  const listRoute = await importProjectModule<{
    GET: (request: Request) => Promise<Response>;
  }>("app/api/agent/actions/route.ts");
  const acceptRoute = await importProjectModule<{
    POST: (
      request: Request,
      context: { params: Promise<{ id: string }> },
    ) => Promise<Response>;
  }>("app/api/agent/actions/[id]/accept/route.ts");
  const dismissRoute = await importProjectModule<{
    POST: (
      request: Request,
      context: { params: Promise<{ id: string }> },
    ) => Promise<Response>;
  }>("app/api/agent/actions/[id]/dismiss/route.ts");
  const fixtures = await importProjectModule<{
    mockAgentActionQueueFixture: unknown;
    mockEmptyAgentActionQueueFixture: unknown;
    mockAcceptedAgentActionFixture: unknown;
    mockDismissedAgentActionFixture: unknown;
  }>("features/agent/fixtures.ts");

  const listResponse = await listRoute.GET(
    new Request("https://orbit.local/api/agent/actions"),
  );
  const emptyResponse = await listRoute.GET(
    new Request("https://orbit.local/api/agent/actions?scenario=empty"),
  );
  const acceptResponse = await acceptRoute.POST(
    new Request("https://orbit.local/api/agent/actions/demo-action-1/accept", {
      method: "POST",
    }),
    { params: Promise.resolve({ id: "demo-action-1" }) },
  );
  const dismissResponse = await dismissRoute.POST(
    new Request("https://orbit.local/api/agent/actions/demo-action-1/dismiss", {
      method: "POST",
    }),
    { params: Promise.resolve({ id: "demo-action-1" }) },
  );
  const failureResponse = await acceptRoute.POST(
    new Request(
      "https://orbit.local/api/agent/actions/demo-action-1/accept?scenario=failure",
      { method: "POST" },
    ),
    { params: Promise.resolve({ id: "demo-action-1" }) },
  );

  assert.equal(listResponse.status, 200);
  assert.equal(listResponse.headers.get("cache-control"), "no-store");
  assert.equal(listResponse.headers.get("x-orbit-feature-mode"), "mock");
  assert.deepEqual(await listResponse.json(), {
    success: true,
    data: fixtures.mockAgentActionQueueFixture,
  });

  assert.equal(emptyResponse.status, 200);
  assert.deepEqual(await emptyResponse.json(), {
    success: true,
    data: fixtures.mockEmptyAgentActionQueueFixture,
  });

  assert.equal(acceptResponse.status, 200);
  assert.deepEqual(await acceptResponse.json(), {
    success: true,
    data: fixtures.mockAcceptedAgentActionFixture,
  });

  assert.equal(dismissResponse.status, 200);
  assert.deepEqual(await dismissResponse.json(), {
    success: true,
    data: fixtures.mockDismissedAgentActionFixture,
  });

  assert.equal(failureResponse.status, 503);
  assert.deepEqual(await failureResponse.json(), {
    success: false,
    error: {
      code: "SERVICE_UNAVAILABLE",
      message:
        "The mock agent action queue boundary is pinned to a controlled failure scenario.",
      context: {
        agentActionQueueErrorCode: "AGENT_ACTION_QUEUE_MOCK_FAILED",
        boundary: "developer-admin",
        mode: "mock",
        privacy: "no-relationship-data",
        provenance:
          "Mock agent action queue failure came from deterministic fixture rules.",
        service: "agent-action-queue-mock",
      },
    },
  });
});

test("agent action queue debug route renders all states and live replacement handoff", async () => {
  const debugView = await importProjectModule<{
    AGENT_ACTION_QUEUE_MOCK_SLUG: string;
    AgentActionQueueMockDemo: React.ComponentType;
  }>("features/agent/agent-action-queue-mock/debug-view.tsx");
  const html = renderToStaticMarkup(
    React.createElement(debugView.AgentActionQueueMockDemo),
  );
  const pageSource = readFileSync(
    join(projectRoot, "app/dev/capabilities/[slug]/page.tsx"),
    "utf8",
  );
  const liveDocPath =
    "features/agent/agent-action-queue-mock/LIVE_IMPLEMENTATION.md";
  const liveDoc = readFileSync(join(projectRoot, liveDocPath), "utf8");

  assert.equal(
    debugView.AGENT_ACTION_QUEUE_MOCK_SLUG,
    "agent-action-queue-mock",
  );
  assert.match(pageSource, /AGENT_ACTION_QUEUE_MOCK_SLUG/);
  assert.match(pageSource, /AgentActionQueueMockDemo/);

  assert.match(html, /href="#agent-action-queue-scenario-controls"/);
  assert.match(html, /id="agent-action-queue-scenario-controls"/);
  assert.match(html, /<h1>Agent action queue mock<\/h1>/);
  assert.match(html, /Agent action queue mock/);
  assert.match(html, /aria-label="Agent action queue operator checkpoint"/);
  assert.match(html, /Event reminders/);
  assert.match(html, /Post-event followups/);
  assert.match(html, /Dormant activation/);
  assert.match(html, /Message draft suggestions/);
  assert.match(html, /Appointment suggestions/);
  assert.match(html, /autonomous execution false/);
  assert.match(html, /external side effects false/);
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
  assert.match(html, /AGENT_ACTION_QUEUE_MOCK_FAILED/);
  assert.match(html, /Prepare for Climate Operator Breakfast/);
  assert.match(html, /Maya Chen/);
  assert.match(html, /evidence:agent:event-reminder:climate-breakfast/);
  assert.match(html, /GET \/api\/agent\/actions/);
  assert.match(html, /POST \/api\/agent\/actions\/demo-action-1\/accept/);
  assert.match(html, /POST \/api\/agent\/actions\/demo-action-1\/dismiss/);
  assert.match(html, /GET \/api\/agent\/actions\?scenario=empty/);
  assert.match(
    html,
    /POST \/api\/agent\/actions\/demo-action-1\/accept\?scenario=failure/,
  );
  assert.match(
    html,
    /aria-label="Agent action queue scenario exercise controls"/,
  );
  assert.match(html, /href="\/api\/agent\/actions\?scenario=empty"/);
  assert.match(
    html,
    /action="\/api\/agent\/actions\/demo-action-1\/accept"/,
  );
  assert.match(
    html,
    /action="\/api\/agent\/actions\/demo-action-1\/dismiss"/,
  );
  assert.match(
    html,
    /action="\/api\/agent\/actions\/demo-action-1\/accept\?scenario=failure"/,
  );
  assert.match(html, new RegExp(liveDocPath));
  assert.match(html, /ORBIT_AGENT_ACTION_QUEUE_PROVIDER/);
  assert.match(html, /agent-action-queue-workbench/);
  assert.match(
    html,
    /\.agent-action-queue-workbench\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)/,
  );

  assert.match(
    liveDoc,
    /features\/agent\/agent-action-queue-mock\/live-service\.ts/,
  );
  assert.match(
    liveDoc,
    /features\/agent\/agent-action-queue-mock\/service-factory\.ts/,
  );
  assert.match(liveDoc, /features\/agent\/agent-action-queue-mock\/providers\//);
  assert.match(liveDoc, /ORBIT_AGENT_ACTION_QUEUE_PROVIDER/);
  assert.match(liveDoc, /ORBIT_AGENT_ACTION_DATABASE_URL/);
  assert.match(liveDoc, /ORBIT_AGENT_ACTION_AI_PROVIDER/);
  assert.match(liveDoc, /calendar read permission/i);
  assert.match(liveDoc, /email read permission/i);
  assert.match(liveDoc, /notification permission/i);
  assert.match(liveDoc, /explicit confirmation/i);
  assert.match(liveDoc, /privacy/i);
  assert.match(liveDoc, /provenance/i);
  assert.match(
    liveDoc,
    /event reminders, post-event followups, dormant activation, message draft suggestions, and appointment suggestions/i,
  );
  assert.match(liveDoc, /empty/i);
  assert.match(liveDoc, /pending/i);
  assert.match(liveDoc, /controlled failure/i);
  assert.match(liveDoc, /replacement tests/i);
});
