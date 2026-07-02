/**
 * Dashboard 聚合 mock 的契约测试。
 *
 * 锁住 dashboard summary、dormant/high-value/follow-up 聚合和 debug-view 输出。
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as dashboardFixtures from "../../features/dashboard/fixtures";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

async function importProjectModule<TModule>(
  pathFromRoot: string,
): Promise<TModule> {
  const absolutePath = join(projectRoot, pathFromRoot);

  assert.equal(
    existsSync(absolutePath),
    true,
    `${pathFromRoot} must exist for the dashboard aggregate mock sprint`,
  );

  return (await import(pathToFileURL(absolutePath).href)) as TModule;
}

test("dashboard aggregate contract exports typed fixtures service and errors", async () => {
  const contract = await importProjectModule<{
    DASHBOARD_AGGREGATE_ERROR_CODES: readonly string[];
    DASHBOARD_AGGREGATE_ERROR_DEFINITIONS: Record<
      string,
      { appCode: string; message: string; recovery: string }
    >;
    DASHBOARD_AGGREGATE_FIXTURE_SOURCE: string;
    mockDashboardAggregateFixture: {
      state: string;
      relationshipAssetTotals: {
        contacts: number;
        connections: number;
        evidenceBackedRelationships: number;
      };
      newContacts: {
        count: number;
        windowLabel: string;
        contacts: readonly Array<{ contactId: string; sourceLabel: string }>;
      };
      highValueCount: number;
      pendingFollowups: {
        count: number;
        tasks: readonly Array<{ taskId: string; evidenceIds: readonly string[] }>;
      };
      dormantContacts: {
        count: number;
        contacts: readonly Array<{ contactId: string; lastTouchpointDays: number }>;
      };
      recentActivity: readonly Array<{
        activityId: string;
        type: string;
        evidenceIds: readonly string[];
      }>;
      provenance: {
        source: string;
        generationMethod: string;
        liveAnalyticsQueryExecuted: false;
        productionAggregateReadExecuted: false;
        externalNetworkRequested: false;
        databaseReadExecuted: false;
        aiProviderRequested: false;
        calendarProviderRequested: false;
        emailProviderRequested: false;
        notificationProviderRequested: false;
        deviceRequested: false;
      };
    };
    mockDashboardAggregateSummaryFixture: {
      state: string;
      metrics: readonly Array<{ id: string; label: string; value: number }>;
      recentActivity: readonly Array<{ activityId: string }>;
      provenance: { generationMethod: string };
    };
    mockEmptyDashboardAggregateFixture: {
      state: string;
      relationshipAssetTotals: { contacts: number };
      recentActivity: readonly unknown[];
      nextAction: string;
    };
    mockPendingDashboardAggregateFixture: {
      state: string;
      recentActivity: readonly unknown[];
      nextAction: string;
    };
  }>("features/dashboard/contract.ts");
  const serviceInterface = readFileSync(
    join(projectRoot, "features/dashboard/service.ts"),
    "utf8",
  );

  assert.match(serviceInterface, /interface DashboardAggregateService/);
  assert.match(serviceInterface, /getDashboardAggregate/);
  assert.match(serviceInterface, /getDashboardSummary/);
  assert.deepEqual(contract.DASHBOARD_AGGREGATE_ERROR_CODES, [
    "DASHBOARD_AGGREGATE_MOCK_FAILED",
    "DASHBOARD_AGGREGATE_LIVE_FAILED",
    "DASHBOARD_AGGREGATE_LIVE_STORE_UNCONFIGURED",
  ]);
  assert.equal(
    contract.DASHBOARD_AGGREGATE_ERROR_DEFINITIONS
      .DASHBOARD_AGGREGATE_MOCK_FAILED.appCode,
    "SERVICE_UNAVAILABLE",
  );
  assert.match(
    contract.DASHBOARD_AGGREGATE_ERROR_DEFINITIONS
      .DASHBOARD_AGGREGATE_MOCK_FAILED.recovery,
    /dashboard aggregate mock/i,
  );
  assert.equal(
    contract.DASHBOARD_AGGREGATE_ERROR_DEFINITIONS
      .DASHBOARD_AGGREGATE_LIVE_FAILED.appCode,
    "SERVICE_UNAVAILABLE",
  );
  assert.equal(
    contract.DASHBOARD_AGGREGATE_ERROR_DEFINITIONS
      .DASHBOARD_AGGREGATE_LIVE_STORE_UNCONFIGURED.appCode,
    "SERVICE_UNAVAILABLE",
  );
  assert.equal(
    dashboardFixtures.DASHBOARD_AGGREGATE_FIXTURE_SOURCE,
    "fixture:features/dashboard/fixtures.ts",
  );

  assert.equal(dashboardFixtures.mockDashboardAggregateFixture.state, "success");
  assert.equal(dashboardFixtures.mockDashboardAggregateFixture.relationshipAssetTotals.contacts, 42);
  assert.equal(
    dashboardFixtures.mockDashboardAggregateFixture.relationshipAssetTotals
      .evidenceBackedRelationships,
    31,
  );
  assert.equal(dashboardFixtures.mockDashboardAggregateFixture.newContacts.count, 6);
  assert.equal(dashboardFixtures.mockDashboardAggregateFixture.highValueCount, 5);
  assert.equal(dashboardFixtures.mockDashboardAggregateFixture.pendingFollowups.count, 7);
  assert.equal(dashboardFixtures.mockDashboardAggregateFixture.dormantContacts.count, 4);
  assert.equal(dashboardFixtures.mockDashboardAggregateFixture.recentActivity.length, 4);
  assert.equal(
    dashboardFixtures.mockDashboardAggregateFixture.provenance.source,
    dashboardFixtures.DASHBOARD_AGGREGATE_FIXTURE_SOURCE,
  );
  assert.equal(
    dashboardFixtures.mockDashboardAggregateFixture.provenance.generationMethod,
    "fixture",
  );
  assert.equal(
    dashboardFixtures.mockDashboardAggregateFixture.provenance.liveAnalyticsQueryExecuted,
    false,
  );
  assert.equal(
    dashboardFixtures.mockDashboardAggregateFixture.provenance
      .productionAggregateReadExecuted,
    false,
  );
  assert.equal(
    dashboardFixtures.mockDashboardAggregateFixture.provenance.externalNetworkRequested,
    false,
  );
  assert.equal(
    dashboardFixtures.mockDashboardAggregateFixture.provenance.databaseReadExecuted,
    false,
  );
  assert.equal(
    dashboardFixtures.mockDashboardAggregateFixture.provenance.aiProviderRequested,
    false,
  );
  assert.equal(
    dashboardFixtures.mockDashboardAggregateFixture.provenance.calendarProviderRequested,
    false,
  );
  assert.equal(
    dashboardFixtures.mockDashboardAggregateFixture.provenance.emailProviderRequested,
    false,
  );
  assert.equal(
    dashboardFixtures.mockDashboardAggregateFixture.provenance
      .notificationProviderRequested,
    false,
  );
  assert.equal(
    dashboardFixtures.mockDashboardAggregateFixture.provenance.deviceRequested,
    false,
  );
  assert.deepEqual(
    dashboardFixtures.mockDashboardAggregateFixture.recentActivity.map(
      (activity) => activity.type,
    ),
    ["new_contact", "high_value", "followup_due", "dormant"],
  );

  assert.equal(dashboardFixtures.mockDashboardAggregateSummaryFixture.state, "success");
  assert.deepEqual(
    dashboardFixtures.mockDashboardAggregateSummaryFixture.metrics.map((metric) => metric.id),
    [
      "relationship-assets",
      "new-contacts",
      "high-value",
      "pending-followups",
      "dormant-contacts",
    ],
  );
  assert.equal(
    dashboardFixtures.mockDashboardAggregateSummaryFixture.provenance.generationMethod,
    "rule-based-summary",
  );
  assert.equal(dashboardFixtures.mockEmptyDashboardAggregateFixture.state, "empty");
  assert.equal(
    dashboardFixtures.mockEmptyDashboardAggregateFixture.relationshipAssetTotals.contacts,
    0,
  );
  assert.match(
    dashboardFixtures.mockEmptyDashboardAggregateFixture.nextAction,
    /Add a sourced contact/i,
  );
  assert.equal(dashboardFixtures.mockPendingDashboardAggregateFixture.state, "pending");
});

test("mock dashboard aggregate service is deterministic and provider-free", async () => {
  const serviceModule = await importProjectModule<{
    createMockDashboardAggregateService: () => {
      getDashboardAggregate: (input?: {
        scenario?: string | null;
        activityLimit?: number | null;
      }) => {
        success: boolean;
        data?: {
          state: string;
          recentActivity: readonly Array<{ activityId: string }>;
          provenance: {
            liveAnalyticsQueryExecuted: false;
            productionAggregateReadExecuted: false;
            externalNetworkRequested: false;
            databaseReadExecuted: false;
          };
        };
        error?: { code: string; appCode: string };
      };
      getDashboardSummary: (input?: { scenario?: string | null }) => {
        success: boolean;
        data?: {
          state: string;
          metrics: readonly Array<{ id: string; value: number }>;
          provenance: { generationMethod: string };
        };
        error?: { code: string; appCode: string };
      };
    };
  }>("features/dashboard/mock-service.ts");

  const service = serviceModule.createMockDashboardAggregateService();
  const success = service.getDashboardAggregate();
  const limited = service.getDashboardAggregate({ activityLimit: 2 });
  const summary = service.getDashboardSummary();
  const empty = service.getDashboardAggregate({ scenario: "empty" });
  const pending = service.getDashboardAggregate({ scenario: "pending" });
  const failure = service.getDashboardAggregate({ scenario: "failure" });

  assert.deepEqual(
    service.getDashboardAggregate(),
    service.getDashboardAggregate(),
  );
  assert.equal(success.success, true);
  assert.equal(success.data?.state, "success");
  assert.equal(success.data?.recentActivity.length, 4);
  assert.equal(limited.success, true);
  assert.equal(limited.data?.recentActivity.length, 2);
  assert.equal(
    success.data?.provenance.liveAnalyticsQueryExecuted,
    false,
  );
  assert.equal(
    success.data?.provenance.productionAggregateReadExecuted,
    false,
  );
  assert.equal(success.data?.provenance.externalNetworkRequested, false);
  assert.equal(success.data?.provenance.databaseReadExecuted, false);
  assert.equal(summary.success, true);
  assert.equal(summary.data?.state, "success");
  assert.equal(summary.data?.metrics.length, 5);
  assert.equal(summary.data?.provenance.generationMethod, "rule-based-summary");
  assert.equal(empty.success, true);
  assert.equal(empty.data?.state, "empty");
  assert.equal(pending.success, true);
  assert.equal(pending.data?.state, "pending");
  assert.equal(failure.success, false);
  assert.equal(failure.error?.code, "DASHBOARD_AGGREGATE_MOCK_FAILED");
  assert.equal(failure.error?.appCode, "SERVICE_UNAVAILABLE");

  for (const filePath of [
    "features/dashboard/contract.ts",
    "features/dashboard/mock-service.ts",
    "app/api/dashboard/route.ts",
    "app/api/dashboard/summary/route.ts",
    "features/dashboard/dashboard-aggregate-mock/debug-view.tsx",
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

test("dashboard aggregate API routes return stable envelopes with empty pending and failure paths", async () => {
  const dashboardRoute = await importProjectModule<{
    GET: (request: Request) => Promise<Response>;
  }>("app/api/dashboard/route.ts");
  const summaryRoute = await importProjectModule<{
    GET: (request: Request) => Promise<Response>;
  }>("app/api/dashboard/summary/route.ts");
  const contract = await importProjectModule<{
    mockDashboardAggregateFixture: unknown;
    mockDashboardAggregateSummaryFixture: unknown;
    mockEmptyDashboardAggregateFixture: unknown;
    mockPendingDashboardAggregateFixture: unknown;
  }>("features/dashboard/contract.ts");

  const dashboardResponse = await dashboardRoute.GET(
    new Request("https://orbit.local/api/dashboard"),
  );
  const summaryResponse = await summaryRoute.GET(
    new Request("https://orbit.local/api/dashboard/summary"),
  );
  const emptyResponse = await dashboardRoute.GET(
    new Request("https://orbit.local/api/dashboard?scenario=empty"),
  );
  const pendingResponse = await dashboardRoute.GET(
    new Request("https://orbit.local/api/dashboard?scenario=pending"),
  );
  const failureResponse = await dashboardRoute.GET(
    new Request("https://orbit.local/api/dashboard?scenario=failure"),
  );
  const summaryFailureResponse = await summaryRoute.GET(
    new Request("https://orbit.local/api/dashboard/summary?scenario=failure"),
  );

  assert.equal(dashboardResponse.status, 200);
  assert.equal(dashboardResponse.headers.get("cache-control"), "no-store");
  assert.equal(dashboardResponse.headers.get("x-orbit-feature-mode"), "mock");
  assert.deepEqual(await dashboardResponse.json(), {
    success: true,
    data: dashboardFixtures.mockDashboardAggregateFixture,
  });

  assert.equal(summaryResponse.status, 200);
  assert.deepEqual(await summaryResponse.json(), {
    success: true,
    data: dashboardFixtures.mockDashboardAggregateSummaryFixture,
  });

  assert.equal(emptyResponse.status, 200);
  assert.deepEqual(await emptyResponse.json(), {
    success: true,
    data: dashboardFixtures.mockEmptyDashboardAggregateFixture,
  });

  assert.equal(pendingResponse.status, 200);
  assert.deepEqual(await pendingResponse.json(), {
    success: true,
    data: dashboardFixtures.mockPendingDashboardAggregateFixture,
  });

  assert.equal(failureResponse.status, 503);
  assert.deepEqual(await failureResponse.json(), {
    success: false,
    error: {
      code: "SERVICE_UNAVAILABLE",
      message:
        "The mock dashboard aggregate boundary is pinned to a controlled failure scenario.",
      context: {
        boundary: "developer-admin",
        dashboardAggregateErrorCode: "DASHBOARD_AGGREGATE_MOCK_FAILED",
        mode: "mock",
        privacy: "no-relationship-data",
        provenance:
          "Mock dashboard aggregate failure came from deterministic fixture rules.",
        service: "dashboard-aggregate-mock",
      },
    },
  });
  assert.equal(summaryFailureResponse.status, 503);
});

test("dashboard aggregate debug route renders all states and live replacement handoff", async () => {
  const debugView = await importProjectModule<{
    DASHBOARD_AGGREGATE_MOCK_SLUG: string;
    DashboardAggregateMockDemo: React.ComponentType;
  }>("features/dashboard/dashboard-aggregate-mock/debug-view.tsx");
  const html = renderToStaticMarkup(
    React.createElement(debugView.DashboardAggregateMockDemo),
  );
  const pageSource = readFileSync(
    join(projectRoot, "app/dev/capabilities/[slug]/page.tsx"),
    "utf8",
  );
  const liveDocPath =
    "features/dashboard/dashboard-aggregate-mock/LIVE_IMPLEMENTATION.md";
  const liveDoc = readFileSync(join(projectRoot, liveDocPath), "utf8");

  assert.equal(
    debugView.DASHBOARD_AGGREGATE_MOCK_SLUG,
    "dashboard-aggregate-mock",
  );
  assert.match(pageSource, /DASHBOARD_AGGREGATE_MOCK_SLUG/);
  assert.match(pageSource, /DashboardAggregateMockDemo/);

  assert.match(html, /Dashboard aggregate mock/);
  assert.match(html, /aria-label="Dashboard aggregate operator checkpoint"/);
  assert.match(html, /Relationship asset totals/);
  assert.match(html, /New contacts/);
  assert.match(html, /High-value relationships/);
  assert.match(html, /Pending followups/);
  assert.match(html, /Dormant contacts/);
  assert.match(html, /Recent activity/);
  assert.match(html, /live analytics queries false/);
  assert.match(html, /production materialized aggregates false/);
  assert.match(html, /database writes false/);
  assert.match(html, /Success state/);
  assert.match(html, /Empty state/);
  assert.match(html, /Pending state/);
  assert.match(html, /Failure state/);
  assert.match(html, /DASHBOARD_AGGREGATE_MOCK_FAILED/);
  assert.match(html, /notification provider requested false/);
  assert.match(html, /device requested false/);
  assert.match(html, /GET \/api\/dashboard/);
  assert.match(html, /GET \/api\/dashboard\/summary/);
  assert.match(html, /GET \/api\/dashboard\?scenario=empty/);
  assert.match(html, /GET \/api\/dashboard\?scenario=pending/);
  assert.match(html, new RegExp(liveDocPath));
  assert.match(html, /ORBIT_DASHBOARD_AGGREGATE_PROVIDER/);
  assert.match(html, /dashboard-aggregate-workbench/);
  assert.match(
    html,
    /\.dashboard-aggregate-workbench\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)/,
  );

  assert.match(
    liveDoc,
    /features\/dashboard\/dashboard-aggregate-mock\/live-service\.ts/,
  );
  assert.match(
    liveDoc,
    /features\/dashboard\/dashboard-aggregate-mock\/providers\//,
  );
  assert.match(liveDoc, /ORBIT_DASHBOARD_AGGREGATE_PROVIDER/);
  assert.match(liveDoc, /analytics query/i);
  assert.match(liveDoc, /materialized aggregate/i);
  assert.match(liveDoc, /calendar permission/i);
  assert.match(liveDoc, /email permission/i);
  assert.match(liveDoc, /privacy/i);
  assert.match(liveDoc, /provenance/i);
  assert.match(
    liveDoc,
    /relationship asset totals, new contacts, high-value count, pending followups, dormant contacts, and recent activity/i,
  );
  assert.match(liveDoc, /empty/i);
  assert.match(liveDoc, /pending/i);
  assert.match(liveDoc, /controlled failure/i);
  assert.match(liveDoc, /replacement tests/i);
});
