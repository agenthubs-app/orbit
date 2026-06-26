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
    `${pathFromRoot} must exist for the app bootstrap mock aggregator sprint`,
  );

  return (await import(pathToFileURL(absolutePath).href)) as TModule;
}

test("app bootstrap contract exports typed fixture service and error definitions", async () => {
  const contract = await importProjectModule<{
    APP_BOOTSTRAP_FIXTURE_SOURCE: string;
    APP_BOOTSTRAP_ERROR_CODES: readonly string[];
    APP_BOOTSTRAP_ERROR_DEFINITIONS: Record<
      string,
      { appCode: string; message: string; recovery: string }
    >;
    mockAppBootstrapFixture: {
      state: string;
      account: { accountId: string; workspaceName: string };
      profile: { profileId: string; displayName: string };
      upcomingEvents: readonly Array<{ eventId: string; evidenceIds: readonly string[] }>;
      connectionSummary: { totalContacts: number; evidenceBackedConnections: number };
      pendingTasks: readonly Array<{ taskId: string; evidenceIds: readonly string[] }>;
      topAgentActions: readonly Array<{ actionId: string; confirmationRequired: boolean }>;
      dashboardSummary: { relationshipAssets: number; highValueRelationships: number };
      permissionSummary: { stagedPermissions: readonly string[]; grantedPermissions: readonly string[] };
      notificationSummary: { unreadCount: number; pendingDeliveryCount: number };
      provenance: {
        source: string;
        generationMethod: string;
        serverSidePersonalizationExecuted: false;
        liveDatabaseAggregationExecuted: false;
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
    mockEmptyAppBootstrapFixture: {
      state: string;
      upcomingEvents: readonly unknown[];
      pendingTasks: readonly unknown[];
      topAgentActions: readonly unknown[];
      nextAction: string;
    };
    mockPendingAppBootstrapFixture: {
      state: string;
      pendingTasks: readonly unknown[];
      nextAction: string;
    };
  }>("features/bootstrap/contract.ts");
  const serviceSource = readFileSync(
    join(projectRoot, "features/bootstrap/service.ts"),
    "utf8",
  );

  assert.match(serviceSource, /interface AppBootstrapService/);
  assert.match(serviceSource, /getAppBootstrap/);
  assert.deepEqual(contract.APP_BOOTSTRAP_ERROR_CODES, [
    "APP_BOOTSTRAP_MOCK_FAILED",
  ]);
  assert.equal(
    contract.APP_BOOTSTRAP_ERROR_DEFINITIONS.APP_BOOTSTRAP_MOCK_FAILED.appCode,
    "SERVICE_UNAVAILABLE",
  );
  assert.match(
    contract.APP_BOOTSTRAP_ERROR_DEFINITIONS.APP_BOOTSTRAP_MOCK_FAILED.recovery,
    /app bootstrap mock aggregator/i,
  );
  assert.equal(
    contract.APP_BOOTSTRAP_FIXTURE_SOURCE,
    "fixture:features/bootstrap/contract.ts",
  );
  assert.equal(contract.mockAppBootstrapFixture.state, "success");
  assert.equal(
    contract.mockAppBootstrapFixture.provenance.source,
    contract.APP_BOOTSTRAP_FIXTURE_SOURCE,
  );
  assert.equal(
    contract.mockAppBootstrapFixture.provenance.generationMethod,
    "fixture",
  );
  assert.equal(
    contract.mockAppBootstrapFixture.provenance.serverSidePersonalizationExecuted,
    false,
  );
  assert.equal(
    contract.mockAppBootstrapFixture.provenance.liveDatabaseAggregationExecuted,
    false,
  );
  assert.equal(
    contract.mockAppBootstrapFixture.provenance.externalNetworkRequested,
    false,
  );
  assert.equal(
    contract.mockAppBootstrapFixture.provenance.databaseReadExecuted,
    false,
  );
  assert.equal(
    contract.mockAppBootstrapFixture.provenance.databaseWriteExecuted,
    false,
  );
  assert.equal(
    contract.mockAppBootstrapFixture.provenance.aiProviderRequested,
    false,
  );
  assert.equal(
    contract.mockAppBootstrapFixture.provenance.calendarProviderRequested,
    false,
  );
  assert.equal(
    contract.mockAppBootstrapFixture.provenance.emailProviderRequested,
    false,
  );
  assert.equal(
    contract.mockAppBootstrapFixture.provenance.notificationProviderRequested,
    false,
  );
  assert.equal(contract.mockAppBootstrapFixture.provenance.deviceRequested, false);
  assert.equal(contract.mockAppBootstrapFixture.account.workspaceName, "Orbit Demo");
  assert.equal(contract.mockAppBootstrapFixture.profile.displayName, "Mina Tanaka");
  assert.equal(contract.mockAppBootstrapFixture.upcomingEvents.length, 2);
  assert.equal(contract.mockAppBootstrapFixture.connectionSummary.totalContacts, 42);
  assert.equal(contract.mockAppBootstrapFixture.pendingTasks.length, 3);
  assert.equal(contract.mockAppBootstrapFixture.topAgentActions.length, 3);
  assert.equal(
    contract.mockAppBootstrapFixture.topAgentActions[0].confirmationRequired,
    true,
  );
  assert.equal(contract.mockAppBootstrapFixture.dashboardSummary.relationshipAssets, 42);
  assert.deepEqual(
    contract.mockAppBootstrapFixture.permissionSummary.stagedPermissions,
    ["calendar", "email", "notifications"],
  );
  assert.equal(contract.mockAppBootstrapFixture.notificationSummary.unreadCount, 5);
  assert.equal(contract.mockEmptyAppBootstrapFixture.state, "empty");
  assert.match(contract.mockEmptyAppBootstrapFixture.nextAction, /Add a sourced contact/i);
  assert.equal(contract.mockPendingAppBootstrapFixture.state, "pending");
});

test("mock app bootstrap aggregator is deterministic provider-free and rule-based", async () => {
  const serviceModule = await importProjectModule<{
    createMockAppBootstrapService: () => {
      getAppBootstrap: (input?: { scenario?: string | null; taskLimit?: number | null }) => {
        success: boolean;
        data?: {
          state: string;
          pendingTasks: readonly Array<{ taskId: string }>;
          topAgentActions: readonly Array<{ actionId: string }>;
          provenance: {
            generationMethod: string;
            serverSidePersonalizationExecuted: false;
            liveDatabaseAggregationExecuted: false;
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
        error?: { code: string; appCode: string };
      };
    };
  }>("features/bootstrap/mock-service.ts");

  const service = serviceModule.createMockAppBootstrapService();
  const success = service.getAppBootstrap();
  const limited = service.getAppBootstrap({ taskLimit: 1 });
  const empty = service.getAppBootstrap({ scenario: "empty" });
  const pending = service.getAppBootstrap({ scenario: "pending" });
  const failure = service.getAppBootstrap({ scenario: "failure" });

  assert.deepEqual(service.getAppBootstrap(), service.getAppBootstrap());
  assert.equal(success.success, true);
  assert.equal(success.data?.state, "success");
  assert.equal(success.data?.pendingTasks.length, 3);
  assert.equal(success.data?.topAgentActions.length, 3);
  assert.equal(limited.success, true);
  assert.equal(limited.data?.pendingTasks.length, 1);
  assert.equal(limited.data?.provenance.generationMethod, "rule-based-task-limit");
  assert.equal(
    success.data?.provenance.serverSidePersonalizationExecuted,
    false,
  );
  assert.equal(success.data?.provenance.liveDatabaseAggregationExecuted, false);
  assert.equal(success.data?.provenance.externalNetworkRequested, false);
  assert.equal(success.data?.provenance.databaseReadExecuted, false);
  assert.equal(success.data?.provenance.databaseWriteExecuted, false);
  assert.equal(success.data?.provenance.aiProviderRequested, false);
  assert.equal(success.data?.provenance.calendarProviderRequested, false);
  assert.equal(success.data?.provenance.emailProviderRequested, false);
  assert.equal(success.data?.provenance.notificationProviderRequested, false);
  assert.equal(success.data?.provenance.deviceRequested, false);
  assert.equal(empty.success, true);
  assert.equal(empty.data?.state, "empty");
  assert.equal(pending.success, true);
  assert.equal(pending.data?.state, "pending");
  assert.equal(failure.success, false);
  assert.equal(failure.error?.code, "APP_BOOTSTRAP_MOCK_FAILED");
  assert.equal(failure.error?.appCode, "SERVICE_UNAVAILABLE");

  for (const filePath of [
    "features/bootstrap/contract.ts",
    "features/bootstrap/mock-service.ts",
    "app/api/app/bootstrap/route.ts",
    "features/bootstrap/app-bootstrap-mock-aggregator/debug-view.tsx",
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

test("app bootstrap API route returns stable envelopes with empty pending and failure paths", async () => {
  const route = await importProjectModule<{
    GET: (request: Request) => Promise<Response>;
  }>("app/api/app/bootstrap/route.ts");
  const contract = await importProjectModule<{
    mockAppBootstrapFixture: unknown;
    mockEmptyAppBootstrapFixture: unknown;
    mockPendingAppBootstrapFixture: unknown;
  }>("features/bootstrap/contract.ts");

  const successResponse = await route.GET(
    new Request("https://orbit.local/api/app/bootstrap"),
  );
  const emptyResponse = await route.GET(
    new Request("https://orbit.local/api/app/bootstrap?scenario=empty"),
  );
  const pendingResponse = await route.GET(
    new Request("https://orbit.local/api/app/bootstrap?scenario=pending"),
  );
  const failureResponse = await route.GET(
    new Request("https://orbit.local/api/app/bootstrap?scenario=failure"),
  );

  assert.equal(successResponse.status, 200);
  assert.equal(successResponse.headers.get("cache-control"), "no-store");
  assert.equal(successResponse.headers.get("x-orbit-feature-mode"), "mock");
  assert.deepEqual(await successResponse.json(), {
    success: true,
    data: contract.mockAppBootstrapFixture,
  });

  assert.equal(emptyResponse.status, 200);
  assert.deepEqual(await emptyResponse.json(), {
    success: true,
    data: contract.mockEmptyAppBootstrapFixture,
  });

  assert.equal(pendingResponse.status, 200);
  assert.deepEqual(await pendingResponse.json(), {
    success: true,
    data: contract.mockPendingAppBootstrapFixture,
  });

  assert.equal(failureResponse.status, 503);
  assert.deepEqual(await failureResponse.json(), {
    success: false,
    error: {
      code: "SERVICE_UNAVAILABLE",
      message:
        "The app bootstrap mock aggregator is pinned to a controlled failure scenario.",
      context: {
        appBootstrapErrorCode: "APP_BOOTSTRAP_MOCK_FAILED",
        boundary: "developer-admin",
        mode: "mock",
        privacy: "no-relationship-data",
        provenance:
          "Mock app bootstrap failure came from deterministic fixture rules.",
        service: "app-bootstrap-mock-aggregator",
      },
    },
  });
});

test("app bootstrap debug route renders all states and live replacement handoff", async () => {
  const debugView = await importProjectModule<{
    APP_BOOTSTRAP_MOCK_AGGREGATOR_SLUG: string;
    AppBootstrapMockAggregatorDemo: React.ComponentType;
  }>("features/bootstrap/app-bootstrap-mock-aggregator/debug-view.tsx");
  const html = renderToStaticMarkup(
    React.createElement(debugView.AppBootstrapMockAggregatorDemo),
  );
  const pageSource = readFileSync(
    join(projectRoot, "app/dev/capabilities/[slug]/page.tsx"),
    "utf8",
  );
  const liveDocPath =
    "features/bootstrap/app-bootstrap-mock-aggregator/LIVE_IMPLEMENTATION.md";
  const liveDoc = readFileSync(join(projectRoot, liveDocPath), "utf8");

  assert.equal(
    debugView.APP_BOOTSTRAP_MOCK_AGGREGATOR_SLUG,
    "app-bootstrap-mock-aggregator",
  );
  assert.match(pageSource, /APP_BOOTSTRAP_MOCK_AGGREGATOR_SLUG/);
  assert.match(pageSource, /AppBootstrapMockAggregatorDemo/);

  assert.match(html, /App bootstrap mock aggregator/);
  assert.match(html, /aria-label="App bootstrap operator checkpoint"/);
  assert.match(html, /First-screen account/);
  assert.match(html, /Profile summary/);
  assert.match(html, /Upcoming events/);
  assert.match(html, /Connection summary/);
  assert.match(html, /Pending tasks/);
  assert.match(html, /Top agent actions/);
  assert.match(html, /Dashboard summary/);
  assert.match(html, /Permission summary/);
  assert.match(html, /Notification summary/);
  assert.match(html, /server-side personalization false/);
  assert.match(html, /live database aggregation false/);
  assert.match(html, /database writes false/);
  assert.match(html, /Success state/);
  assert.match(html, /Empty state/);
  assert.match(html, /Pending state/);
  assert.match(html, /Failure state/);
  assert.match(html, /aria-label="App bootstrap state inspectors"/);
  assert.match(html, /Inspect success bootstrap/);
  assert.match(html, /Inspect empty bootstrap/);
  assert.match(html, /Inspect pending bootstrap/);
  assert.match(html, /Inspect failure bootstrap/);
  assert.match(html, /success envelope/);
  assert.match(html, /empty-bootstrap-1/);
  assert.match(html, /pending-bootstrap-1/);
  assert.match(html, /SERVICE_UNAVAILABLE/);
  assert.match(html, /APP_BOOTSTRAP_MOCK_FAILED/);
  assert.match(html, /notification provider requested false/);
  assert.match(html, /device requested false/);
  assert.match(html, /GET \/api\/app\/bootstrap/);
  assert.match(html, /GET \/api\/app\/bootstrap\?scenario=empty/);
  assert.match(html, /GET \/api\/app\/bootstrap\?scenario=pending/);
  assert.match(html, /GET \/api\/app\/bootstrap\?scenario=failure/);
  assert.match(html, new RegExp(liveDocPath));
  assert.match(html, /ORBIT_APP_BOOTSTRAP_PROVIDER/);
  assert.match(html, /app-bootstrap-workbench/);
  assert.match(
    html,
    /\.app-bootstrap-workbench\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)/,
  );

  assert.match(
    liveDoc,
    /features\/bootstrap\/app-bootstrap-mock-aggregator\/live-service\.ts/,
  );
  assert.match(
    liveDoc,
    /features\/bootstrap\/app-bootstrap-mock-aggregator\/providers\//,
  );
  assert.match(liveDoc, /ORBIT_APP_BOOTSTRAP_PROVIDER/);
  assert.match(liveDoc, /server-side personalization/i);
  assert.match(liveDoc, /live database aggregation/i);
  assert.match(liveDoc, /calendar permission/i);
  assert.match(liveDoc, /email permission/i);
  assert.match(liveDoc, /notification permission/i);
  assert.match(liveDoc, /privacy/i);
  assert.match(liveDoc, /provenance/i);
  assert.match(
    liveDoc,
    /first-screen account, profile, upcoming events, connection summary, pending tasks, top agent actions, dashboard summary, permission summary, and notification summary/i,
  );
  assert.match(liveDoc, /empty/i);
  assert.match(liveDoc, /pending/i);
  assert.match(liveDoc, /controlled failure/i);
  assert.match(liveDoc, /replacement tests/i);
});
