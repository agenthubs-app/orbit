/**
 * 机会提醒分析 mock 的契约测试。
 *
 * 锁住高优先级机会、沉睡关系、recompute 结果和 debug-view。
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as dashboardOpportunityFixtures from "../../features/dashboard/opportunity-fixtures";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

async function importProjectModule<TModule>(
  pathFromRoot: string,
): Promise<TModule> {
  const absolutePath = join(projectRoot, pathFromRoot);

  assert.equal(
    existsSync(absolutePath),
    true,
    `${pathFromRoot} must exist for the opportunity reminder analytics mock sprint`,
  );

  return (await import(pathToFileURL(absolutePath).href)) as TModule;
}

test("opportunity reminder analytics contract exports typed fixtures service and errors", async () => {
  const contract = await importProjectModule<{
    OPPORTUNITY_REMINDER_ANALYTICS_ERROR_CODES: readonly string[];
    OPPORTUNITY_REMINDER_ANALYTICS_ERROR_DEFINITIONS: Record<
      string,
      { appCode: string; message: string; recovery: string }
    >;
    OPPORTUNITY_REMINDER_ANALYTICS_FIXTURE_SOURCE: string;
    mockOpportunityReminderAnalyticsFixture: {
      state: string;
      highPriorityOpportunities: readonly Array<{
        opportunityId: string;
        priority: string;
        priorityScore: number;
        suggestedAction: string;
        reason: string;
        evidenceIds: readonly string[];
      }>;
      dormantHighValueContacts: readonly Array<{
        contactId: string;
        contactName: string;
        lastTouchpointDays: number;
        valueScore: number;
        suggestedAction: string;
      }>;
      currentGoalMatches: readonly Array<{
        goalId: string;
        label: string;
        coverageScore: number;
        matchedOpportunityIds: readonly string[];
      }>;
      suggestedContactReasons: readonly Array<{
        reasonId: string;
        contactId: string;
        reasonType: string;
        reason: string;
      }>;
      provenance: {
        source: string;
        generationMethod: string;
        predictiveScoringExecuted: false;
        backgroundOpportunityMiningExecuted: false;
        liveAnalyticsJobExecuted: false;
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
    mockOpportunityReminderRecomputeFixture: {
      state: string;
      evaluatedContacts: number;
      generatedOpportunityCount: number;
      changedOpportunityIds: readonly string[];
      provenance: { generationMethod: string };
    };
    mockEmptyOpportunityReminderAnalyticsFixture: {
      state: string;
      highPriorityOpportunities: readonly unknown[];
      dormantHighValueContacts: readonly unknown[];
      currentGoalMatches: readonly unknown[];
      suggestedContactReasons: readonly unknown[];
      nextAction: string;
    };
    mockPendingOpportunityReminderAnalyticsFixture: {
      state: string;
      highPriorityOpportunities: readonly unknown[];
      nextAction: string;
    };
  }>("features/dashboard/opportunity-contract.ts");
  const contractSource = readFileSync(
    join(projectRoot, "features/dashboard/opportunity-contract.ts"),
    "utf8",
  );

  assert.match(contractSource, /interface OpportunityReminderAnalyticsService/);
  assert.match(contractSource, /getOpportunityReminderAnalytics/);
  assert.match(contractSource, /recomputeOpportunityReminderAnalytics/);
  assert.deepEqual(contract.OPPORTUNITY_REMINDER_ANALYTICS_ERROR_CODES, [
    "OPPORTUNITY_REMINDER_ANALYTICS_MOCK_FAILED",
  ]);
  assert.equal(
    contract.OPPORTUNITY_REMINDER_ANALYTICS_ERROR_DEFINITIONS
      .OPPORTUNITY_REMINDER_ANALYTICS_MOCK_FAILED.appCode,
    "SERVICE_UNAVAILABLE",
  );
  assert.match(
    contract.OPPORTUNITY_REMINDER_ANALYTICS_ERROR_DEFINITIONS
      .OPPORTUNITY_REMINDER_ANALYTICS_MOCK_FAILED.recovery,
    /opportunity reminder analytics mock/i,
  );
  assert.equal(
    dashboardOpportunityFixtures.OPPORTUNITY_REMINDER_ANALYTICS_FIXTURE_SOURCE,
    "fixture:features/dashboard/opportunity-fixtures.ts",
  );

  assert.equal(dashboardOpportunityFixtures.mockOpportunityReminderAnalyticsFixture.state, "success");
  assert.deepEqual(
    dashboardOpportunityFixtures.mockOpportunityReminderAnalyticsFixture.highPriorityOpportunities.map(
      (opportunity) => opportunity.priority,
    ),
    ["high", "high", "medium"],
  );
  assert.deepEqual(
    dashboardOpportunityFixtures.mockOpportunityReminderAnalyticsFixture.currentGoalMatches.map(
      (match) => match.label,
    ),
    [
      "Close two climate infrastructure pilots",
      "Build investor access for the bridge round",
    ],
  );
  assert.deepEqual(
    dashboardOpportunityFixtures.mockOpportunityReminderAnalyticsFixture.suggestedContactReasons.map(
      (reason) => reason.reasonType,
    ),
    ["goal_match", "dormancy", "event_context", "referral_path"],
  );
  assert.equal(
    dashboardOpportunityFixtures.mockOpportunityReminderAnalyticsFixture.provenance.source,
    dashboardOpportunityFixtures.OPPORTUNITY_REMINDER_ANALYTICS_FIXTURE_SOURCE,
  );
  assert.equal(
    dashboardOpportunityFixtures.mockOpportunityReminderAnalyticsFixture.provenance.generationMethod,
    "fixture",
  );
  assert.equal(
    dashboardOpportunityFixtures.mockOpportunityReminderAnalyticsFixture.provenance
      .predictiveScoringExecuted,
    false,
  );
  assert.equal(
    dashboardOpportunityFixtures.mockOpportunityReminderAnalyticsFixture.provenance
      .backgroundOpportunityMiningExecuted,
    false,
  );
  assert.equal(
    dashboardOpportunityFixtures.mockOpportunityReminderAnalyticsFixture.provenance
      .liveAnalyticsJobExecuted,
    false,
  );
  assert.equal(
    dashboardOpportunityFixtures.mockOpportunityReminderAnalyticsFixture.provenance
      .externalNetworkRequested,
    false,
  );
  assert.equal(
    dashboardOpportunityFixtures.mockOpportunityReminderAnalyticsFixture.provenance
      .databaseReadExecuted,
    false,
  );
  assert.equal(
    dashboardOpportunityFixtures.mockOpportunityReminderAnalyticsFixture.provenance
      .databaseWriteExecuted,
    false,
  );
  assert.equal(
    dashboardOpportunityFixtures.mockOpportunityReminderAnalyticsFixture.provenance
      .aiProviderRequested,
    false,
  );
  assert.equal(
    dashboardOpportunityFixtures.mockOpportunityReminderAnalyticsFixture.provenance
      .calendarProviderRequested,
    false,
  );
  assert.equal(
    dashboardOpportunityFixtures.mockOpportunityReminderAnalyticsFixture.provenance
      .emailProviderRequested,
    false,
  );
  assert.equal(
    dashboardOpportunityFixtures.mockOpportunityReminderAnalyticsFixture.provenance
      .notificationProviderRequested,
    false,
  );
  assert.equal(
    dashboardOpportunityFixtures.mockOpportunityReminderAnalyticsFixture.provenance.deviceRequested,
    false,
  );
  assert.equal(
    dashboardOpportunityFixtures.mockOpportunityReminderAnalyticsFixture.highPriorityOpportunities
      .length,
    3,
  );
  assert.equal(
    dashboardOpportunityFixtures.mockOpportunityReminderAnalyticsFixture.dormantHighValueContacts
      .length,
    2,
  );
  assert.equal(
    dashboardOpportunityFixtures.mockOpportunityReminderAnalyticsFixture.currentGoalMatches.length,
    2,
  );
  assert.equal(
    dashboardOpportunityFixtures.mockOpportunityReminderAnalyticsFixture.suggestedContactReasons
      .length,
    4,
  );
  assert.equal(dashboardOpportunityFixtures.mockOpportunityReminderRecomputeFixture.state, "success");
  assert.equal(
    dashboardOpportunityFixtures.mockOpportunityReminderRecomputeFixture.generatedOpportunityCount,
    3,
  );
  assert.equal(
    dashboardOpportunityFixtures.mockOpportunityReminderRecomputeFixture.provenance.generationMethod,
    "rule-based-recompute",
  );
  assert.equal(dashboardOpportunityFixtures.mockEmptyOpportunityReminderAnalyticsFixture.state, "empty");
  assert.equal(
    dashboardOpportunityFixtures.mockEmptyOpportunityReminderAnalyticsFixture
      .highPriorityOpportunities.length,
    0,
  );
  assert.match(
    dashboardOpportunityFixtures.mockEmptyOpportunityReminderAnalyticsFixture.nextAction,
    /Add evidence-backed contacts/i,
  );
  assert.equal(
    dashboardOpportunityFixtures.mockPendingOpportunityReminderAnalyticsFixture.state,
    "pending",
  );
});

test("mock opportunity reminder analytics service is deterministic and provider-free", async () => {
  const serviceModule = await importProjectModule<{
    createMockOpportunityReminderAnalyticsService: () => {
      getOpportunityReminderAnalytics: (input?: { scenario?: string | null }) => {
        success: boolean;
        data?: {
          state: string;
          highPriorityOpportunities: readonly unknown[];
          provenance: {
            predictiveScoringExecuted: false;
            backgroundOpportunityMiningExecuted: false;
            liveAnalyticsJobExecuted: false;
            externalNetworkRequested: false;
            databaseReadExecuted: false;
          };
        };
        error?: { code: string; appCode: string };
      };
      recomputeOpportunityReminderAnalytics: (input?: {
        scenario?: string | null;
      }) => {
        success: boolean;
        data?: {
          state: string;
          generatedOpportunityCount: number;
          provenance: { generationMethod: string };
        };
        error?: { code: string; appCode: string };
      };
    };
  }>("features/dashboard/mock-opportunity-service.ts");

  const service = serviceModule.createMockOpportunityReminderAnalyticsService();
  const success = service.getOpportunityReminderAnalytics();
  const recompute = service.recomputeOpportunityReminderAnalytics();
  const empty = service.getOpportunityReminderAnalytics({ scenario: "empty" });
  const pending = service.recomputeOpportunityReminderAnalytics({
    scenario: "pending",
  });
  const failure = service.getOpportunityReminderAnalytics({
    scenario: "failure",
  });

  assert.deepEqual(
    service.getOpportunityReminderAnalytics(),
    service.getOpportunityReminderAnalytics(),
  );
  assert.deepEqual(
    service.recomputeOpportunityReminderAnalytics(),
    service.recomputeOpportunityReminderAnalytics(),
  );
  assert.equal(success.success, true);
  assert.equal(success.data?.state, "success");
  assert.equal(success.data?.highPriorityOpportunities.length, 3);
  assert.equal(success.data?.provenance.predictiveScoringExecuted, false);
  assert.equal(
    success.data?.provenance.backgroundOpportunityMiningExecuted,
    false,
  );
  assert.equal(success.data?.provenance.liveAnalyticsJobExecuted, false);
  assert.equal(success.data?.provenance.externalNetworkRequested, false);
  assert.equal(success.data?.provenance.databaseReadExecuted, false);
  assert.equal(recompute.success, true);
  assert.equal(recompute.data?.state, "success");
  assert.equal(recompute.data?.generatedOpportunityCount, 3);
  assert.equal(
    recompute.data?.provenance.generationMethod,
    "rule-based-recompute",
  );
  assert.equal(empty.success, true);
  assert.equal(empty.data?.state, "empty");
  assert.equal(pending.success, true);
  assert.equal(pending.data?.state, "pending");
  assert.equal(failure.success, false);
  assert.equal(
    failure.error?.code,
    "OPPORTUNITY_REMINDER_ANALYTICS_MOCK_FAILED",
  );
  assert.equal(failure.error?.appCode, "SERVICE_UNAVAILABLE");

  for (const filePath of [
    "features/dashboard/opportunity-contract.ts",
    "features/dashboard/mock-opportunity-service.ts",
    "app/api/dashboard/opportunities/route.ts",
    "app/api/dashboard/opportunities/recompute/route.ts",
    "features/dashboard/opportunity-reminder-analytics-mock/debug-view.tsx",
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

test("opportunity reminder analytics API routes return stable envelopes with empty pending and failure paths", async () => {
  const opportunitiesRoute = await importProjectModule<{
    GET: (request: Request) => Promise<Response>;
  }>("app/api/dashboard/opportunities/route.ts");
  const recomputeRoute = await importProjectModule<{
    POST: (request: Request) => Promise<Response>;
  }>("app/api/dashboard/opportunities/recompute/route.ts");
  const contract = await importProjectModule<{
    mockOpportunityReminderAnalyticsFixture: unknown;
    mockOpportunityReminderRecomputeFixture: unknown;
    mockEmptyOpportunityReminderAnalyticsFixture: unknown;
    mockPendingOpportunityReminderRecomputeFixture: unknown;
  }>("features/dashboard/opportunity-contract.ts");

  const opportunitiesResponse = await opportunitiesRoute.GET(
    new Request("https://orbit.local/api/dashboard/opportunities"),
  );
  const recomputeResponse = await recomputeRoute.POST(
    new Request("https://orbit.local/api/dashboard/opportunities/recompute", {
      method: "POST",
    }),
  );
  const emptyResponse = await opportunitiesRoute.GET(
    new Request("https://orbit.local/api/dashboard/opportunities?scenario=empty"),
  );
  const pendingResponse = await recomputeRoute.POST(
    new Request(
      "https://orbit.local/api/dashboard/opportunities/recompute?scenario=pending",
      { method: "POST" },
    ),
  );
  const failureResponse = await recomputeRoute.POST(
    new Request(
      "https://orbit.local/api/dashboard/opportunities/recompute?scenario=failure",
      { method: "POST" },
    ),
  );

  assert.equal(opportunitiesResponse.status, 200);
  assert.equal(opportunitiesResponse.headers.get("cache-control"), "no-store");
  assert.equal(opportunitiesResponse.headers.get("x-orbit-feature-mode"), "mock");
  assert.deepEqual(await opportunitiesResponse.json(), {
    success: true,
    data: dashboardOpportunityFixtures.mockOpportunityReminderAnalyticsFixture,
  });

  assert.equal(recomputeResponse.status, 200);
  assert.deepEqual(await recomputeResponse.json(), {
    success: true,
    data: dashboardOpportunityFixtures.mockOpportunityReminderRecomputeFixture,
  });

  assert.equal(emptyResponse.status, 200);
  assert.deepEqual(await emptyResponse.json(), {
    success: true,
    data: dashboardOpportunityFixtures.mockEmptyOpportunityReminderAnalyticsFixture,
  });

  assert.equal(pendingResponse.status, 200);
  assert.deepEqual(await pendingResponse.json(), {
    success: true,
    data: dashboardOpportunityFixtures.mockPendingOpportunityReminderRecomputeFixture,
  });

  assert.equal(failureResponse.status, 503);
  assert.deepEqual(await failureResponse.json(), {
    success: false,
    error: {
      code: "SERVICE_UNAVAILABLE",
      message:
        "The mock opportunity reminder analytics boundary is pinned to a controlled failure scenario.",
      context: {
        boundary: "developer-admin",
        mode: "mock",
        opportunityReminderAnalyticsErrorCode:
          "OPPORTUNITY_REMINDER_ANALYTICS_MOCK_FAILED",
        privacy: "no-relationship-data",
        provenance:
          "Mock opportunity reminder analytics failure came from deterministic fixture rules.",
        service: "opportunity-reminder-analytics-mock",
      },
    },
  });
});

test("opportunity reminder analytics debug route renders all states and live replacement handoff", async () => {
  const debugView = await importProjectModule<{
    OPPORTUNITY_REMINDER_ANALYTICS_MOCK_SLUG: string;
    OpportunityReminderAnalyticsMockDemo: React.ComponentType;
  }>(
    "features/dashboard/opportunity-reminder-analytics-mock/debug-view.tsx",
  );
  const html = renderToStaticMarkup(
    React.createElement(debugView.OpportunityReminderAnalyticsMockDemo),
  );
  const pageSource = readFileSync(
    join(projectRoot, "app/dev/capabilities/[slug]/page.tsx"),
    "utf8",
  );
  const liveDocPath =
    "features/dashboard/opportunity-reminder-analytics-mock/LIVE_IMPLEMENTATION.md";
  const liveDoc = readFileSync(join(projectRoot, liveDocPath), "utf8");

  assert.equal(
    debugView.OPPORTUNITY_REMINDER_ANALYTICS_MOCK_SLUG,
    "opportunity-reminder-analytics-mock",
  );
  assert.match(pageSource, /OPPORTUNITY_REMINDER_ANALYTICS_MOCK_SLUG/);
  assert.match(pageSource, /OpportunityReminderAnalyticsMockDemo/);

  assert.match(html, /Opportunity reminder analytics mock/);
  assert.match(
    html,
    /aria-label="Opportunity reminder analytics operator checkpoint"/,
  );
  assert.match(html, /High-priority opportunities/);
  assert.match(html, /Dormant high-value contacts/);
  assert.match(html, /Current goal matching/);
  assert.match(html, /Suggested contact reasons/);
  assert.match(html, /predictive scoring false/);
  assert.match(html, /background opportunity mining false/);
  assert.match(html, /live analytics jobs false/);
  assert.match(html, /database writes false/);
  assert.match(html, /email false/);
  assert.match(html, /calendar false/);
  assert.match(html, /notification provider requested false/);
  assert.match(html, /device requested false/);
  assert.match(html, /Success state/);
  assert.match(html, /Empty state/);
  assert.match(html, /Pending state/);
  assert.match(html, /Failure state/);
  assert.match(html, /OPPORTUNITY_REMINDER_ANALYTICS_MOCK_FAILED/);
  assert.match(html, /Climate infrastructure pilot expansion/);
  assert.match(html, /Close two climate infrastructure pilots/);
  assert.match(html, /evidence:opportunity:maya:pilot-expansion/);
  assert.match(html, /GET \/api\/dashboard\/opportunities/);
  assert.match(html, /POST \/api\/dashboard\/opportunities\/recompute/);
  assert.match(
    html,
    /GET \/api\/dashboard\/opportunities\?scenario=empty/,
  );
  assert.match(
    html,
    /POST \/api\/dashboard\/opportunities\/recompute\?scenario=pending/,
  );
  assert.match(
    html,
    /aria-label="Opportunity reminder analytics scenario exercise controls"/,
  );
  assert.match(
    html,
    /href="\/api\/dashboard\/opportunities\?scenario=empty"/,
  );
  assert.match(
    html,
    /action="\/api\/dashboard\/opportunities\/recompute\?scenario=pending"/,
  );
  assert.match(
    html,
    /action="\/api\/dashboard\/opportunities\/recompute\?scenario=failure"/,
  );
  assert.match(html, new RegExp(liveDocPath));
  assert.match(html, /ORBIT_OPPORTUNITY_REMINDER_ANALYTICS_PROVIDER/);
  assert.match(html, /opportunity-reminder-analytics-workbench/);
  assert.match(
    html,
    /\.opportunity-reminder-analytics-workbench\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)/,
  );

  assert.match(
    liveDoc,
    /features\/dashboard\/opportunity-reminder-analytics-mock\/live-service\.ts/,
  );
  assert.match(
    liveDoc,
    /features\/dashboard\/opportunity-reminder-analytics-mock\/service-factory\.ts/,
  );
  assert.match(
    liveDoc,
    /features\/dashboard\/opportunity-reminder-analytics-mock\/providers\//,
  );
  assert.match(liveDoc, /ORBIT_OPPORTUNITY_REMINDER_ANALYTICS_PROVIDER/);
  assert.match(liveDoc, /ORBIT_RELATIONSHIP_ANALYTICS_DATABASE_URL/);
  assert.match(liveDoc, /ORBIT_GOAL_CONTEXT_SOURCE/);
  assert.match(liveDoc, /email read permission/i);
  assert.match(liveDoc, /calendar read permission/i);
  assert.match(liveDoc, /predictive scoring/i);
  assert.match(liveDoc, /background opportunity mining/i);
  assert.match(liveDoc, /privacy/i);
  assert.match(liveDoc, /provenance/i);
  assert.match(
    liveDoc,
    /high-priority opportunities, dormant high-value contacts, current-goal matching, and suggested contact reasons/i,
  );
  assert.match(liveDoc, /empty/i);
  assert.match(liveDoc, /pending/i);
  assert.match(liveDoc, /controlled failure/i);
  assert.match(liveDoc, /replacement tests/i);
});
