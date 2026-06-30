/**
 * 外部动作沙盒 mock 的契约测试。
 *
 * 覆盖发消息、日历、通知 no-op 结果和审计记录，确保不执行真实外部动作。
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as agentExternalActionFixtures from "../../features/agent/external-action-fixtures";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

async function importProjectModule<TModule>(
  pathFromRoot: string,
): Promise<TModule> {
  const absolutePath = join(projectRoot, pathFromRoot);

  assert.equal(
    existsSync(absolutePath),
    true,
    `${pathFromRoot} must exist for the external action sandbox mock sprint`,
  );

  return (await import(pathToFileURL(absolutePath).href)) as TModule;
}

test("external action sandbox contract exports no-op fixtures errors and service interface", async () => {
  const contract = await importProjectModule<{
    EXTERNAL_ACTION_SANDBOX_ACTION_TYPES: readonly string[];
    EXTERNAL_ACTION_SANDBOX_ERROR_CODES: readonly string[];
    EXTERNAL_ACTION_SANDBOX_ERROR_DEFINITIONS: Record<
      string,
      { appCode: string; message: string; recovery: string }
    >;
    EXTERNAL_ACTION_SANDBOX_FIXTURE_SOURCE: string;
    mockExternalActionSandboxFixture: {
      state: string;
      actions: readonly Array<{
        actionId: string;
        actionType: string;
        label: string;
        targetLabel: string;
        relationshipContext: {
          contactLabel: string;
          eventLabel: string;
          connectionOrigin: string;
          followupRationale: string;
          sourceContextIds: readonly string[];
        };
        noOp: true;
        confirmationRequired: true;
        evidenceIds: readonly string[];
        provenance: {
          source: string;
          generationMethod: string;
          externalSideEffectExecuted: false;
          externalNetworkRequested: false;
          databaseReadExecuted: false;
          databaseWriteExecuted: false;
          aiProviderRequested: false;
          messageProviderRequested: false;
          calendarProviderRequested: false;
          emailProviderRequested: false;
          notificationProviderRequested: false;
          pushProviderRequested: false;
          deviceRequested: false;
        };
      }>;
      auditRecords: readonly Array<{
        auditId: string;
        actionType: string;
        relationshipContext: {
          contactLabel: string;
          eventLabel: string;
          connectionOrigin: string;
          followupRationale: string;
          sourceContextIds: readonly string[];
        };
        noOp: true;
        sideEffectExecuted: false;
        productionAuditPersisted: false;
        evidenceIds: readonly string[];
      }>;
      provenance: {
        source: string;
        generationMethod: string;
        externalSideEffectExecuted: false;
        externalNetworkRequested: false;
        databaseReadExecuted: false;
        databaseWriteExecuted: false;
        aiProviderRequested: false;
        messageProviderRequested: false;
        calendarProviderRequested: false;
        emailProviderRequested: false;
        notificationProviderRequested: false;
        pushProviderRequested: false;
        deviceRequested: false;
      };
    };
    mockSendMessageNoOpFixture: {
      state: string;
      actionType: string;
      noOp: true;
      relationshipContext: {
        contactLabel: string;
        eventLabel: string;
        connectionOrigin: string;
        followupRationale: string;
        sourceContextIds: readonly string[];
      };
      auditRecord: { actionType: string; sideEffectExecuted: false };
    };
    mockCreateCalendarEventNoOpFixture: {
      actionType: string;
      noOp: true;
      auditRecord: { actionType: string; sideEffectExecuted: false };
    };
    mockNotificationDeliveryNoOpFixture: {
      actionType: string;
      noOp: true;
      auditRecord: { actionType: string; sideEffectExecuted: false };
    };
    mockEmptyExternalActionAuditFixture: {
      state: string;
      auditRecords: readonly unknown[];
      nextAction: string;
    };
    mockPendingExternalActionSandboxFixture: {
      state: string;
      nextAction: string;
    };
  }>("features/agent/external-action-contract.ts");
  const contractSource = readFileSync(
    join(projectRoot, "features/agent/external-action-contract.ts"),
    "utf8",
  );

  assert.match(contractSource, /interface ExternalActionSandboxService/);
  assert.match(contractSource, /sendMessage/);
  assert.match(contractSource, /createCalendarEvent/);
  assert.match(contractSource, /deliverNotification/);
  assert.match(contractSource, /listAuditRecords/);
  assert.deepEqual(contract.EXTERNAL_ACTION_SANDBOX_ACTION_TYPES, [
    "send_message",
    "create_calendar_event",
    "deliver_notification",
  ]);
  assert.deepEqual(contract.EXTERNAL_ACTION_SANDBOX_ERROR_CODES, [
    "EXTERNAL_ACTION_SANDBOX_ACTION_ID_REQUIRED",
    "EXTERNAL_ACTION_SANDBOX_ACTION_NOT_FOUND",
    "EXTERNAL_ACTION_SANDBOX_EMPTY",
    "EXTERNAL_ACTION_SANDBOX_PENDING",
    "EXTERNAL_ACTION_SANDBOX_MOCK_FAILED",
  ]);
  assert.equal(
    contract.EXTERNAL_ACTION_SANDBOX_ERROR_DEFINITIONS
      .EXTERNAL_ACTION_SANDBOX_MOCK_FAILED.appCode,
    "SERVICE_UNAVAILABLE",
  );
  assert.match(
    contract.EXTERNAL_ACTION_SANDBOX_ERROR_DEFINITIONS
      .EXTERNAL_ACTION_SANDBOX_EMPTY.recovery,
    /audit record|source-backed/i,
  );
  assert.equal(
    agentExternalActionFixtures.EXTERNAL_ACTION_SANDBOX_FIXTURE_SOURCE,
    "fixture:features/agent/external-action-fixtures.ts",
  );
  assert.equal(agentExternalActionFixtures.mockExternalActionSandboxFixture.state, "success");
  assert.equal(
    agentExternalActionFixtures.mockExternalActionSandboxFixture.provenance.source,
    agentExternalActionFixtures.EXTERNAL_ACTION_SANDBOX_FIXTURE_SOURCE,
  );
  assert.deepEqual(
    agentExternalActionFixtures.mockExternalActionSandboxFixture.actions.map(
      (action) => action.actionType,
    ),
    ["send_message", "create_calendar_event", "deliver_notification"],
  );
  assert.equal(
    agentExternalActionFixtures.mockExternalActionSandboxFixture.actions[0].actionId,
    "sandbox-message-demo-1",
  );
  assert.equal(
    agentExternalActionFixtures.mockExternalActionSandboxFixture.actions[0].noOp,
    true,
  );
  assert.equal(
    agentExternalActionFixtures.mockExternalActionSandboxFixture.actions[0].confirmationRequired,
    true,
  );
  assert.equal(
    agentExternalActionFixtures.mockExternalActionSandboxFixture.actions[0].relationshipContext
      .contactLabel,
    "Maya Chen",
  );
  assert.equal(
    agentExternalActionFixtures.mockExternalActionSandboxFixture.actions[0].relationshipContext
      .eventLabel,
    "Tokyo Climate Operators Salon",
  );
  assert.match(
    agentExternalActionFixtures.mockExternalActionSandboxFixture.actions[0].relationshipContext
      .connectionOrigin,
    /pilot reliability/i,
  );
  assert.deepEqual(
    agentExternalActionFixtures.mockExternalActionSandboxFixture.actions[0].relationshipContext
      .sourceContextIds,
    [
      "relationship:maya-chen:pilot-reliability",
      "event:tokyo-climate-operators-salon",
    ],
  );
  assert.equal(
    agentExternalActionFixtures.mockExternalActionSandboxFixture.actions[0].provenance
      .externalSideEffectExecuted,
    false,
  );
  assert.equal(
    agentExternalActionFixtures.mockExternalActionSandboxFixture.provenance.externalNetworkRequested,
    false,
  );
  assert.equal(
    agentExternalActionFixtures.mockExternalActionSandboxFixture.provenance.databaseWriteExecuted,
    false,
  );
  assert.equal(
    agentExternalActionFixtures.mockExternalActionSandboxFixture.provenance.aiProviderRequested,
    false,
  );
  assert.equal(
    agentExternalActionFixtures.mockExternalActionSandboxFixture.provenance.messageProviderRequested,
    false,
  );
  assert.equal(
    agentExternalActionFixtures.mockExternalActionSandboxFixture.provenance.calendarProviderRequested,
    false,
  );
  assert.equal(
    agentExternalActionFixtures.mockExternalActionSandboxFixture.provenance.emailProviderRequested,
    false,
  );
  assert.equal(
    agentExternalActionFixtures.mockExternalActionSandboxFixture.provenance.notificationProviderRequested,
    false,
  );
  assert.equal(
    agentExternalActionFixtures.mockExternalActionSandboxFixture.provenance.pushProviderRequested,
    false,
  );
  assert.equal(
    agentExternalActionFixtures.mockExternalActionSandboxFixture.auditRecords.length,
    3,
  );
  assert.deepEqual(
    agentExternalActionFixtures.mockExternalActionSandboxFixture.auditRecords.map(
      (record) => record.actionType,
    ),
    ["send_message", "create_calendar_event", "deliver_notification"],
  );
  assert.equal(
    agentExternalActionFixtures.mockExternalActionSandboxFixture.auditRecords[0]
      .sideEffectExecuted,
    false,
  );
  assert.equal(
    agentExternalActionFixtures.mockExternalActionSandboxFixture.auditRecords[0]
      .productionAuditPersisted,
    false,
  );
  assert.deepEqual(
    agentExternalActionFixtures.mockExternalActionSandboxFixture.auditRecords[0]
      .relationshipContext,
    agentExternalActionFixtures.mockExternalActionSandboxFixture.actions[0].relationshipContext,
  );
  assert.equal(agentExternalActionFixtures.mockSendMessageNoOpFixture.state, "success");
  assert.equal(agentExternalActionFixtures.mockSendMessageNoOpFixture.actionType, "send_message");
  assert.equal(
    agentExternalActionFixtures.mockSendMessageNoOpFixture.relationshipContext.followupRationale,
    "Send the reliability memo while the pilot-scope question is still fresh.",
  );
  assert.equal(
    agentExternalActionFixtures.mockSendMessageNoOpFixture.auditRecord.sideEffectExecuted,
    false,
  );
  assert.equal(
    agentExternalActionFixtures.mockCreateCalendarEventNoOpFixture.actionType,
    "create_calendar_event",
  );
  assert.equal(
    agentExternalActionFixtures.mockNotificationDeliveryNoOpFixture.actionType,
    "deliver_notification",
  );
  assert.equal(agentExternalActionFixtures.mockEmptyExternalActionAuditFixture.state, "empty");
  assert.match(
    agentExternalActionFixtures.mockEmptyExternalActionAuditFixture.nextAction,
    /audit record|confirmed action/i,
  );
  assert.equal(agentExternalActionFixtures.mockPendingExternalActionSandboxFixture.state, "pending");
});

test("mock external action sandbox service is deterministic provider-free and side-effect-free", async () => {
  const serviceModule = await importProjectModule<{
    createMockExternalActionSandboxService: () => {
      sendMessage: (input?: {
        actionId?: string | null;
        scenario?: string | null;
        actorLabel?: string | null;
      }) => {
        success: boolean;
        data?: {
          state: string;
          actionType: string;
          actionId: string;
          actorLabel: string;
          noOp: true;
          externalSideEffectExecuted: false;
          providerRequestIssued: false;
          auditRecord: {
            actionType: string;
            noOp: true;
            sideEffectExecuted: false;
            productionAuditPersisted: false;
            relationshipContext: {
              contactLabel: string;
              eventLabel: string;
              connectionOrigin: string;
              followupRationale: string;
              sourceContextIds: readonly string[];
            };
          };
          relationshipContext: {
            contactLabel: string;
            eventLabel: string;
            connectionOrigin: string;
            followupRationale: string;
            sourceContextIds: readonly string[];
          };
          provenance: {
            generationMethod: string;
            externalSideEffectExecuted: false;
            externalNetworkRequested: false;
            databaseWriteExecuted: false;
            aiProviderRequested: false;
            messageProviderRequested: false;
            calendarProviderRequested: false;
            emailProviderRequested: false;
            notificationProviderRequested: false;
            pushProviderRequested: false;
            deviceRequested: false;
          };
        };
        error?: { code: string; appCode: string };
      };
      createCalendarEvent: (input?: { scenario?: string | null }) => {
        success: boolean;
        data?: { actionType: string; noOp: true; providerRequestIssued: false };
      };
      deliverNotification: (input?: { scenario?: string | null }) => {
        success: boolean;
        data?: { actionType: string; noOp: true; providerRequestIssued: false };
      };
      listAuditRecords: (input?: { scenario?: string | null }) => {
        success: boolean;
        data?: {
          state: string;
          auditRecords: readonly Array<{
            actionType: string;
            noOp: true;
            sideEffectExecuted: false;
            productionAuditPersisted: false;
          }>;
        };
        error?: { code: string; appCode: string };
      };
    };
  }>("features/agent/mock-external-action-sandbox.ts");

  const service = serviceModule.createMockExternalActionSandboxService();
  const message = service.sendMessage({ actorLabel: "Sprint evaluator" });
  const calendar = service.createCalendarEvent();
  const notification = service.deliverNotification();
  const audit = service.listAuditRecords();
  const empty = service.listAuditRecords({ scenario: "empty" });
  const pending = service.listAuditRecords({ scenario: "pending" });
  const failure = service.sendMessage({ scenario: "failure" });
  const missingAction = service.sendMessage({ actionId: "missing-action" });

  assert.deepEqual(service.sendMessage(), service.sendMessage());
  assert.deepEqual(service.listAuditRecords(), service.listAuditRecords());
  assert.equal(message.success, true);
  assert.equal(message.data?.state, "success");
  assert.equal(message.data?.actionType, "send_message");
  assert.equal(message.data?.actionId, "sandbox-message-demo-1");
  assert.equal(message.data?.actorLabel, "Sprint evaluator");
  assert.equal(message.data?.noOp, true);
  assert.equal(message.data?.externalSideEffectExecuted, false);
  assert.equal(message.data?.providerRequestIssued, false);
  assert.equal(message.data?.auditRecord.actionType, "send_message");
  assert.equal(message.data?.auditRecord.noOp, true);
  assert.equal(message.data?.auditRecord.sideEffectExecuted, false);
  assert.equal(message.data?.auditRecord.productionAuditPersisted, false);
  assert.equal(message.data?.relationshipContext.contactLabel, "Maya Chen");
  assert.equal(
    message.data?.relationshipContext.eventLabel,
    "Tokyo Climate Operators Salon",
  );
  assert.deepEqual(
    message.data?.auditRecord.relationshipContext,
    message.data?.relationshipContext,
  );
  assert.equal(
    message.data?.provenance.generationMethod,
    "rule-based-no-op",
  );
  assert.equal(message.data?.provenance.externalNetworkRequested, false);
  assert.equal(message.data?.provenance.databaseWriteExecuted, false);
  assert.equal(message.data?.provenance.aiProviderRequested, false);
  assert.equal(message.data?.provenance.messageProviderRequested, false);
  assert.equal(message.data?.provenance.calendarProviderRequested, false);
  assert.equal(message.data?.provenance.emailProviderRequested, false);
  assert.equal(message.data?.provenance.notificationProviderRequested, false);
  assert.equal(message.data?.provenance.pushProviderRequested, false);
  assert.equal(message.data?.provenance.deviceRequested, false);
  assert.equal(calendar.success, true);
  assert.equal(calendar.data?.actionType, "create_calendar_event");
  assert.equal(calendar.data?.noOp, true);
  assert.equal(calendar.data?.providerRequestIssued, false);
  assert.equal(notification.success, true);
  assert.equal(notification.data?.actionType, "deliver_notification");
  assert.equal(notification.data?.noOp, true);
  assert.equal(notification.data?.providerRequestIssued, false);
  assert.equal(audit.success, true);
  assert.equal(audit.data?.state, "success");
  assert.equal(audit.data?.auditRecords.length, 3);
  assert.equal(audit.data?.auditRecords[0].sideEffectExecuted, false);
  assert.equal(audit.data?.auditRecords[0].productionAuditPersisted, false);
  assert.equal(empty.success, true);
  assert.equal(empty.data?.state, "empty");
  assert.equal(empty.data?.auditRecords.length, 0);
  assert.equal(pending.success, true);
  assert.equal(pending.data?.state, "pending");
  assert.equal(failure.success, false);
  assert.equal(failure.error?.code, "EXTERNAL_ACTION_SANDBOX_MOCK_FAILED");
  assert.equal(failure.error?.appCode, "SERVICE_UNAVAILABLE");
  assert.equal(missingAction.success, false);
  assert.equal(
    missingAction.error?.code,
    "EXTERNAL_ACTION_SANDBOX_ACTION_NOT_FOUND",
  );

  for (const filePath of [
    "features/agent/external-action-contract.ts",
    "features/agent/mock-external-action-sandbox.ts",
    "app/api/sandbox/external-actions/send-message/route.ts",
    "app/api/sandbox/external-actions/audit/route.ts",
    "features/agent/external-action-sandbox-mock/debug-view.tsx",
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

test("external action sandbox API routes return stable envelopes with empty and failure paths", async () => {
  const sendRoute = await importProjectModule<{
    POST: (request: Request) => Promise<Response>;
  }>("app/api/sandbox/external-actions/send-message/route.ts");
  const auditRoute = await importProjectModule<{
    GET: (request: Request) => Promise<Response>;
  }>("app/api/sandbox/external-actions/audit/route.ts");
  const fixtures = await importProjectModule<{
    mockSendMessageNoOpFixture: unknown;
    mockExternalActionSandboxFixture: unknown;
    mockEmptyExternalActionAuditFixture: unknown;
  }>("features/agent/external-action-fixtures.ts");

  const sendResponse = await sendRoute.POST(
    new Request("https://orbit.local/api/sandbox/external-actions/send-message", {
      method: "POST",
    }),
  );
  const auditResponse = await auditRoute.GET(
    new Request("https://orbit.local/api/sandbox/external-actions/audit"),
  );
  const emptyResponse = await auditRoute.GET(
    new Request(
      "https://orbit.local/api/sandbox/external-actions/audit?scenario=empty",
    ),
  );
  const failureResponse = await sendRoute.POST(
    new Request(
      "https://orbit.local/api/sandbox/external-actions/send-message?scenario=failure",
      { method: "POST" },
    ),
  );

  assert.equal(sendResponse.status, 200);
  assert.equal(sendResponse.headers.get("cache-control"), "no-store");
  assert.equal(sendResponse.headers.get("x-orbit-feature-mode"), "mock");
  assert.deepEqual(await sendResponse.json(), {
    success: true,
    data: fixtures.mockSendMessageNoOpFixture,
  });

  assert.equal(auditResponse.status, 200);
  assert.deepEqual(await auditResponse.json(), {
    success: true,
    data: fixtures.mockExternalActionSandboxFixture,
  });

  assert.equal(emptyResponse.status, 200);
  assert.deepEqual(await emptyResponse.json(), {
    success: true,
    data: fixtures.mockEmptyExternalActionAuditFixture,
  });

  assert.equal(failureResponse.status, 503);
  assert.deepEqual(await failureResponse.json(), {
    success: false,
    error: {
      code: "SERVICE_UNAVAILABLE",
      message:
        "The mock external action sandbox boundary is pinned to a controlled failure scenario.",
      context: {
        boundary: "developer-admin",
        externalActionSandboxErrorCode:
          "EXTERNAL_ACTION_SANDBOX_MOCK_FAILED",
        mode: "mock",
        privacy: "no-relationship-data",
        provenance:
          "Mock external action sandbox failure came from deterministic fixture rules.",
        service: "external-action-sandbox-mock",
      },
    },
  });
});

test("external action sandbox debug route renders all states and live replacement handoff", async () => {
  const debugView = await importProjectModule<{
    EXTERNAL_ACTION_SANDBOX_MOCK_SLUG: string;
    ExternalActionSandboxMockDemo: React.ComponentType;
  }>("features/agent/external-action-sandbox-mock/debug-view.tsx");
  const html = renderToStaticMarkup(
    React.createElement(debugView.ExternalActionSandboxMockDemo),
  );
  const pageSource = readFileSync(
    join(projectRoot, "app/dev/capabilities/[slug]/page.tsx"),
    "utf8",
  );
  const liveDocPath =
    "features/agent/external-action-sandbox-mock/LIVE_IMPLEMENTATION.md";
  const liveDoc = readFileSync(join(projectRoot, liveDocPath), "utf8");

  assert.equal(
    debugView.EXTERNAL_ACTION_SANDBOX_MOCK_SLUG,
    "external-action-sandbox-mock",
  );
  assert.match(pageSource, /EXTERNAL_ACTION_SANDBOX_MOCK_SLUG/);
  assert.match(pageSource, /ExternalActionSandboxMockDemo/);

  assert.match(html, /href="#external-action-sandbox-scenario-controls"/);
  assert.match(html, /id="external-action-sandbox-scenario-controls"/);
  assert.match(html, /<h1>External action sandbox mock<\/h1>/);
  assert.match(html, /External action sandbox mock/);
  assert.match(
    html,
    /aria-label="External action sandbox operator checkpoint"/,
  );
  assert.match(html, /No-op send message/);
  assert.match(html, /No-op create calendar event/);
  assert.match(html, /No-op notification delivery/);
  assert.match(html, /Side-effect audit records/);
  assert.match(html, /message provider false/);
  assert.match(html, /calendar provider false/);
  assert.match(html, /email provider false/);
  assert.match(html, /notification provider false/);
  assert.match(html, /push delivery false/);
  assert.match(html, /external network false/);
  assert.match(html, /database writes false/);
  assert.match(html, /device false/);
  assert.match(html, /Success state/);
  assert.match(html, /Empty state/);
  assert.match(html, /Pending state/);
  assert.match(html, /Failure state/);
  assert.match(html, /EXTERNAL_ACTION_SANDBOX_MOCK_FAILED/);
  assert.match(html, /Maya Chen/);
  assert.match(html, /Tokyo Climate Operators Salon/);
  assert.match(html, /pilot reliability/);
  assert.match(html, /Send the reliability memo/);
  assert.match(html, /relationship:maya-chen:pilot-reliability/);
  assert.match(html, /evidence:external-action:message:maya-chen/);
  assert.match(
    html,
    /POST \/api\/sandbox\/external-actions\/send-message/,
  );
  assert.match(html, /GET \/api\/sandbox\/external-actions\/audit/);
  assert.match(
    html,
    /GET \/api\/sandbox\/external-actions\/audit\?scenario=empty/,
  );
  assert.match(
    html,
    /POST \/api\/sandbox\/external-actions\/send-message\?scenario=failure/,
  );
  assert.match(
    html,
    /aria-label="External action sandbox scenario exercise controls"/,
  );
  assert.match(
    html,
    /href="\/api\/sandbox\/external-actions\/audit\?scenario=empty"/,
  );
  assert.match(
    html,
    /action="\/api\/sandbox\/external-actions\/send-message"/,
  );
  assert.match(
    html,
    /action="\/api\/sandbox\/external-actions\/send-message\?scenario=failure"/,
  );
  assert.match(html, new RegExp(liveDocPath));
  assert.match(html, /ORBIT_EXTERNAL_ACTION_SANDBOX_PROVIDER/);
  assert.match(html, /external-action-sandbox-workbench/);
  assert.match(
    html,
    /\.external-action-sandbox-workbench\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)/,
  );

  assert.match(
    liveDoc,
    /features\/agent\/external-action-sandbox-mock\/live-service\.ts/,
  );
  assert.match(
    liveDoc,
    /features\/agent\/external-action-sandbox-mock\/service-factory\.ts/,
  );
  assert.match(
    liveDoc,
    /features\/agent\/external-action-sandbox-mock\/providers\//,
  );
  assert.match(liveDoc, /ORBIT_EXTERNAL_ACTION_SANDBOX_PROVIDER/);
  assert.match(liveDoc, /ORBIT_EXTERNAL_ACTION_DATABASE_URL/);
  assert.match(liveDoc, /ORBIT_EXTERNAL_ACTION_MESSAGE_PROVIDER/);
  assert.match(liveDoc, /ORBIT_EXTERNAL_ACTION_CALENDAR_PROVIDER/);
  assert.match(liveDoc, /ORBIT_EXTERNAL_ACTION_NOTIFICATION_PROVIDER/);
  assert.match(liveDoc, /message send permission/i);
  assert.match(liveDoc, /calendar write permission/i);
  assert.match(liveDoc, /notification delivery permission/i);
  assert.match(liveDoc, /explicit confirmation/i);
  assert.match(liveDoc, /privacy/i);
  assert.match(liveDoc, /provenance/i);
  assert.match(
    liveDoc,
    /no-op send message, no-op create calendar event, no-op notification delivery, and side-effect audit records/i,
  );
  assert.match(liveDoc, /empty/i);
  assert.match(liveDoc, /pending/i);
  assert.match(liveDoc, /controlled failure/i);
  assert.match(liveDoc, /replacement tests/i);
});
