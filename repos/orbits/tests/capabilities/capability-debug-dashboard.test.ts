/**
 * Capability debug dashboard 的契约测试。
 *
 * 验证 dashboard fixture、service scenario、debug-view 和 dev API probe 元数据。
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
    `${pathFromRoot} must exist for the capability debug dashboard sprint`,
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

test("capability debug dashboard exports typed contract fixtures service and errors", async () => {
  const contract = await importProjectModule<{
    CAPABILITY_DEBUG_DASHBOARD_SLUG: string;
    CAPABILITY_DEBUG_DASHBOARD_ERROR_CODES: readonly string[];
    CAPABILITY_DEBUG_DASHBOARD_ERROR_DEFINITIONS: Record<
      string,
      { appCode: string; message: string; recovery: string }
    >;
  }>("app/dev/capabilities/capability-debug-dashboard/contract.ts");
  const fixtures = await importProjectModule<{
    CAPABILITY_DEBUG_DASHBOARD_FIXTURE_SOURCE: string;
    capabilityDebugDashboardFixture: {
      state: string;
      capabilityLinks: readonly Array<{
        id: string;
        href: string;
        serviceStatus: string;
      }>;
      scenarioLinks: readonly Array<{
        id: string;
        state: string;
        href: string;
        activationTarget: {
          method: string;
          path: string;
          expectStatus: number;
          envelope: string;
        };
      }>;
      apiProbes: readonly Array<{
        name: string;
        method: string;
        path: string;
        expectStatus: number;
      }>;
      resetControls: readonly Array<{
        id: string;
        method: string;
        path: string;
      }>;
      provenance: {
        source: string;
        generationMethod: string;
        productionAdminToolsReplaced: true;
        externalObservabilityReplaced: true;
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
    capabilityDebugDashboardEmptyFixture: {
      state: string;
      capabilityLinks: readonly unknown[];
      scenarioLinks: readonly unknown[];
      apiProbes: readonly unknown[];
      resetControls: readonly unknown[];
      nextAction: string;
    };
    capabilityDebugDashboardPendingFixture: {
      state: string;
      pendingReason: string;
      nextAction: string;
    };
  }>("app/dev/capabilities/capability-debug-dashboard/fixtures.ts");
  const serviceSource = readFileSync(
    join(projectRoot, "app/dev/capabilities/capability-debug-dashboard/service.ts"),
    "utf8",
  );
  const fixtureSource = readFileSync(
    join(projectRoot, "app/dev/capabilities/capability-debug-dashboard/fixtures.ts"),
    "utf8",
  );
  const errorSource = readFileSync(
    join(projectRoot, "app/dev/capabilities/capability-debug-dashboard/error-codes.ts"),
    "utf8",
  );

  assert.match(serviceSource, /interface CapabilityDebugDashboardService/);
  assert.match(serviceSource, /getDashboard/);
  assert.match(fixtureSource, /capabilityDebugDashboardFixture/);
  assert.match(errorSource, /CAPABILITY_DEBUG_DASHBOARD_ERROR_DEFINITIONS/);
  assert.equal(contract.CAPABILITY_DEBUG_DASHBOARD_SLUG, "capability-debug-dashboard");
  assert.equal(
    fixtures.CAPABILITY_DEBUG_DASHBOARD_FIXTURE_SOURCE,
    "fixture:app/dev/capabilities/capability-debug-dashboard/fixtures.ts",
  );
  assert.deepEqual(contract.CAPABILITY_DEBUG_DASHBOARD_ERROR_CODES, [
    "CAPABILITY_DEBUG_DASHBOARD_MOCK_FAILED",
  ]);
  assert.equal(
    contract.CAPABILITY_DEBUG_DASHBOARD_ERROR_DEFINITIONS
      .CAPABILITY_DEBUG_DASHBOARD_MOCK_FAILED.appCode,
    "SERVICE_UNAVAILABLE",
  );
  assert.match(
    contract.CAPABILITY_DEBUG_DASHBOARD_ERROR_DEFINITIONS
      .CAPABILITY_DEBUG_DASHBOARD_MOCK_FAILED.recovery,
    /capability debug dashboard/i,
  );
  assert.equal(fixtures.capabilityDebugDashboardFixture.state, "success");
  assert.equal(
    fixtures.capabilityDebugDashboardFixture.provenance.source,
    fixtures.CAPABILITY_DEBUG_DASHBOARD_FIXTURE_SOURCE,
  );
  assert.equal(
    fixtures.capabilityDebugDashboardFixture.provenance.generationMethod,
    "fixture",
  );
  assert.equal(
    fixtures.capabilityDebugDashboardFixture.provenance.productionAdminToolsReplaced,
    true,
  );
  assert.equal(
    fixtures.capabilityDebugDashboardFixture.provenance.externalObservabilityReplaced,
    true,
  );
  assert.equal(
    fixtures.capabilityDebugDashboardFixture.provenance.externalNetworkRequested,
    false,
  );
  assert.equal(
    fixtures.capabilityDebugDashboardFixture.provenance.databaseReadExecuted,
    false,
  );
  assert.equal(
    fixtures.capabilityDebugDashboardFixture.provenance.databaseWriteExecuted,
    false,
  );
  assert.equal(
    fixtures.capabilityDebugDashboardFixture.provenance.aiProviderRequested,
    false,
  );
  assert.equal(
    fixtures.capabilityDebugDashboardFixture.provenance.calendarProviderRequested,
    false,
  );
  assert.equal(
    fixtures.capabilityDebugDashboardFixture.provenance.emailProviderRequested,
    false,
  );
  assert.equal(
    fixtures.capabilityDebugDashboardFixture.provenance.notificationProviderRequested,
    false,
  );
  assert.equal(
    fixtures.capabilityDebugDashboardFixture.provenance.deviceRequested,
    false,
  );
  assert.ok(fixtures.capabilityDebugDashboardFixture.capabilityLinks.length >= 11);
  assert.ok(
    fixtures.capabilityDebugDashboardFixture.capabilityLinks.every((link) =>
      link.href.startsWith("/dev/capabilities"),
    ),
  );
  assert.deepEqual(
    fixtures.capabilityDebugDashboardFixture.apiProbes.map((probe) => probe.path),
    ["/api/app/bootstrap", "/api/mock/scenarios", "/api/audit/provenance"],
  );
  assert.deepEqual(
    fixtures.capabilityDebugDashboardFixture.apiProbes.map(
      (probe) => `${probe.method} ${probe.expectStatus}`,
    ),
    ["GET 200", "GET 200", "GET 200"],
  );
  assert.deepEqual(
    fixtures.capabilityDebugDashboardFixture.scenarioLinks.map(
      (scenario) => scenario.state,
    ),
    ["success", "pending", "success", "success", "empty", "failure"],
  );
  assert.deepEqual(
    fixtures.capabilityDebugDashboardFixture.scenarioLinks.map(
      (scenario) => scenario.activationTarget.path,
    ),
    [
      "/api/mock/scenarios/new-user-demo/activate",
      "/api/mock/scenarios/active-event-demo/activate",
      "/api/mock/scenarios/post-event-demo/activate",
      "/api/mock/scenarios/dormant-network-demo/activate",
      "/api/mock/scenarios/empty-account-demo/activate",
      "/api/mock/scenarios/error-demo/activate",
    ],
  );
  assert.deepEqual(
    fixtures.capabilityDebugDashboardFixture.scenarioLinks.map((scenario) => [
      scenario.activationTarget.method,
      scenario.activationTarget.expectStatus,
      scenario.activationTarget.envelope,
    ]),
    [
      ["POST", 200, "success"],
      ["POST", 200, "success"],
      ["POST", 200, "success"],
      ["POST", 200, "success"],
      ["POST", 200, "success"],
      ["POST", 503, "failure"],
    ],
  );
  assert.deepEqual(
    fixtures.capabilityDebugDashboardFixture.resetControls.map(
      (control) => control.path,
    ),
    ["/api/mock/reset", "/api/mock/reset?scenario=empty-account-demo"],
  );
  assert.equal(fixtures.capabilityDebugDashboardEmptyFixture.state, "empty");
  assert.equal(
    fixtures.capabilityDebugDashboardEmptyFixture.capabilityLinks.length,
    0,
  );
  assert.match(
    fixtures.capabilityDebugDashboardEmptyFixture.nextAction,
    /restore capability registrations/i,
  );
  assert.equal(fixtures.capabilityDebugDashboardPendingFixture.state, "pending");
  assert.match(
    fixtures.capabilityDebugDashboardPendingFixture.pendingReason,
    /local capability probe refresh/i,
  );
});

test("mock capability debug dashboard service is deterministic and provider-free", async () => {
  const serviceModule = await importProjectModule<{
    createMockCapabilityDebugDashboardService: () => {
      getDashboard: (input?: { scenario?: string | null }) => {
        success: boolean;
        data?: {
          state: string;
          capabilityLinks: readonly Array<{ id: string }>;
          apiProbes: readonly Array<{ path: string }>;
          provenance: {
            productionAdminToolsReplaced: true;
            externalObservabilityReplaced: true;
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
  }>("app/dev/capabilities/capability-debug-dashboard/mock-service.ts");

  const service = serviceModule.createMockCapabilityDebugDashboardService();
  const success = service.getDashboard();
  const empty = service.getDashboard({ scenario: "empty" });
  const pending = service.getDashboard({ scenario: "pending" });
  const failure = service.getDashboard({ scenario: "failure" });

  assert.deepEqual(service.getDashboard(), service.getDashboard());
  assert.equal(success.success, true);
  assert.equal(success.data?.state, "success");
  assert.ok((success.data?.capabilityLinks.length ?? 0) >= 11);
  assert.deepEqual(
    success.data?.apiProbes.map((probe) => probe.path),
    ["/api/app/bootstrap", "/api/mock/scenarios", "/api/audit/provenance"],
  );
  assert.equal(success.data?.provenance.productionAdminToolsReplaced, true);
  assert.equal(success.data?.provenance.externalObservabilityReplaced, true);
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
  assert.equal(failure.error?.code, "CAPABILITY_DEBUG_DASHBOARD_MOCK_FAILED");
  assert.equal(failure.error?.appCode, "SERVICE_UNAVAILABLE");

  for (const filePath of [
    "app/dev/capabilities/capability-debug-dashboard/contract.ts",
    "app/dev/capabilities/capability-debug-dashboard/error-codes.ts",
    "app/dev/capabilities/capability-debug-dashboard/fixtures.ts",
    "app/dev/capabilities/capability-debug-dashboard/service.ts",
    "app/dev/capabilities/capability-debug-dashboard/mock-service.ts",
    "app/dev/capabilities/debug-dashboard.tsx",
  ]) {
    const source = readFileSync(join(projectRoot, filePath), "utf8");

    for (const forbiddenPattern of providerFreeSourcePatterns) {
      assert.doesNotMatch(source, forbiddenPattern);
    }
  }
});

test("declared capability debug dashboard API probes return envelopes with empty and failure evidence", async () => {
  const bootstrapRoute = await importProjectModule<{
    GET: (request: Request) => Promise<Response>;
  }>("app/api/app/bootstrap/route.ts");
  const scenarioRoute = await importProjectModule<{
    GET: () => Promise<Response>;
  }>("app/api/mock/scenarios/route.ts");
  const auditRoute = await importProjectModule<{
    GET: (request: Request) => Promise<Response>;
  }>("app/api/audit/provenance/route.ts");

  const bootstrapResponse = await bootstrapRoute.GET(
    new Request("https://orbit.local/api/app/bootstrap"),
  );
  const scenarioResponse = await scenarioRoute.GET();
  const auditResponse = await auditRoute.GET(
    new Request("https://orbit.local/api/audit/provenance"),
  );
  const emptyBootstrapResponse = await bootstrapRoute.GET(
    new Request("https://orbit.local/api/app/bootstrap?scenario=empty"),
  );
  const failureAuditResponse = await auditRoute.GET(
    new Request("https://orbit.local/api/audit/provenance?scenario=failure"),
  );

  const bootstrapEnvelope = await bootstrapResponse.json();
  const scenarioEnvelope = await scenarioResponse.json();
  const auditEnvelope = await auditResponse.json();
  const emptyBootstrapEnvelope = await emptyBootstrapResponse.json();
  const failureAuditEnvelope = await failureAuditResponse.json();

  assert.equal(bootstrapResponse.status, 200);
  assert.equal(bootstrapEnvelope.success, true);
  assert.equal(bootstrapEnvelope.data.state, "success");
  assert.equal(scenarioResponse.status, 200);
  assert.equal(scenarioEnvelope.success, true);
  assert.equal(scenarioEnvelope.data.activeScenarioId, "active-event-demo");
  assert.equal(auditResponse.status, 200);
  assert.equal(auditEnvelope.success, true);
  assert.equal(auditEnvelope.data.state, "success");

  assert.equal(emptyBootstrapResponse.status, 200);
  assert.equal(emptyBootstrapEnvelope.success, true);
  assert.equal(emptyBootstrapEnvelope.data.state, "empty");

  assert.equal(failureAuditResponse.status, 503);
  assert.deepEqual(failureAuditEnvelope, {
    success: false,
    error: {
      code: "SERVICE_UNAVAILABLE",
      message:
        "The mock source consistency and provenance audit boundary is pinned to a controlled failure scenario.",
      context: {
        boundary: "developer-admin",
        mode: "mock",
        privacy: "no-relationship-data",
        provenance:
          "Mock source consistency provenance audit failure came from deterministic fixture rules.",
        service: "source-consistency-and-provenance-audit",
        sourceConsistencyProvenanceAuditErrorCode:
          "SOURCE_CONSISTENCY_PROVENANCE_AUDIT_MOCK_FAILED",
      },
    },
  });
});

test("capability debug dashboard dev route renders mock states probes and live handoff", async () => {
  const debugDashboard = await importProjectModule<{
    CAPABILITY_DEBUG_DASHBOARD_SLUG: string;
    CapabilityDebugDashboardDemo: React.ComponentType;
  }>("app/dev/capabilities/debug-dashboard.tsx");
  const html = renderToStaticMarkup(
    React.createElement(debugDashboard.CapabilityDebugDashboardDemo),
  );
  const pageSource = readFileSync(
    join(projectRoot, "app/dev/capabilities/[slug]/page.tsx"),
    "utf8",
  );
  const liveDocPath =
    "app/dev/capabilities/capability-debug-dashboard/LIVE_IMPLEMENTATION.md";
  const liveDoc = readFileSync(join(projectRoot, liveDocPath), "utf8");

  assert.equal(
    debugDashboard.CAPABILITY_DEBUG_DASHBOARD_SLUG,
    "capability-debug-dashboard",
  );
  assert.match(pageSource, /CAPABILITY_DEBUG_DASHBOARD_SLUG/);
  assert.match(pageSource, /CapabilityDebugDashboardDemo/);

  assert.match(html, /Capability debug dashboard/);
  assert.match(html, /aria-label="Capability debug dashboard operator checkpoint"/);
  assert.match(html, /Registered mock capabilities/);
  assert.match(html, /Scenario controls/);
  assert.match(html, /API probes/);
  assert.match(html, /Reset controls/);
  assert.match(html, /Success state/);
  assert.match(html, /Empty state/);
  assert.match(html, /Pending state/);
  assert.match(html, /Failure state/);
  assert.match(html, /CAPABILITY_DEBUG_DASHBOARD_MOCK_FAILED/);
  assert.match(html, /production admin tools replaced true/);
  assert.match(html, /external observability replaced true/);
  assert.match(html, /external network requested false/);
  assert.match(html, /database writes false/);
  assert.match(html, /AI provider requested false/);
  assert.match(html, /notification provider requested false/);
  assert.match(html, /device requested false/);
  assert.match(html, /GET \/api\/app\/bootstrap/);
  assert.match(html, /GET \/api\/mock\/scenarios/);
  assert.match(html, /GET \/api\/audit\/provenance/);
  assert.match(html, /GET \/api\/app\/bootstrap\?scenario=empty/);
  assert.match(html, /GET \/api\/audit\/provenance\?scenario=failure/);
  assert.match(html, /Activation target/);
  assert.match(html, /POST \/api\/mock\/scenarios\/active-event-demo\/activate/);
  assert.match(html, /POST \/api\/mock\/scenarios\/error-demo\/activate/);
  assert.match(html, /expects 503 failure envelope/);
  assert.match(html, /POST \/api\/mock\/reset/);
  assert.match(html, /POST \/api\/mock\/reset\?scenario=empty-account-demo/);
  assert.match(html, /href="\/dev\/capabilities#account-profile"/);
  assert.match(
    html,
    /href="\/dev\/capabilities\/app-bootstrap-mock-aggregator"/,
  );
  assert.match(
    html,
    /href="\/dev\/capabilities\/mock-data-mutation-reset-and-scenario-switcher"/,
  );
  assert.match(
    html,
    /href="\/dev\/capabilities\/source-consistency-and-provenance-audit"/,
  );
  assert.match(html, new RegExp(liveDocPath));
  assert.match(html, /ORBIT_CAPABILITY_DEBUG_DASHBOARD_PROVIDER/);
  assert.match(html, /capability-debug-dashboard-workbench/);
  assert.match(
    html,
    /\.capability-debug-dashboard-workbench\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)/,
  );

  assert.match(liveDoc, /Live service and provider files/i);
  assert.match(liveDoc, /Switch mechanism/i);
  assert.match(liveDoc, /Required env vars and permissions/i);
  assert.match(liveDoc, /Privacy and provenance constraints/i);
  assert.match(liveDoc, /Replacement tests/i);
  assert.match(
    liveDoc,
    /app\/dev\/capabilities\/capability-debug-dashboard\/live-service\.ts/,
  );
  assert.match(
    liveDoc,
    /app\/dev\/capabilities\/capability-debug-dashboard\/providers\//,
  );
  assert.match(liveDoc, /ORBIT_CAPABILITY_DEBUG_DASHBOARD_PROVIDER/);
  assert.match(liveDoc, /ORBIT_ADMIN_OBSERVABILITY_ENDPOINT/);
  assert.match(liveDoc, /admin read permission/i);
  assert.match(liveDoc, /observability read permission/i);
  assert.match(liveDoc, /privacy/i);
  assert.match(liveDoc, /provenance/i);
  assert.match(liveDoc, /success/i);
  assert.match(liveDoc, /empty/i);
  assert.match(liveDoc, /pending/i);
  assert.match(liveDoc, /controlled failure/i);
});
