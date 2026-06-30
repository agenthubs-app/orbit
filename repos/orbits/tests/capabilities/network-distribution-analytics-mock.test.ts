/**
 * 网络分布分析 mock 的契约测试。
 *
 * 锁住行业/强度/价值类型分布、gap 分析和 debug-view 输出。
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
    `${pathFromRoot} must exist for the network distribution analytics mock sprint`,
  );

  return (await import(pathToFileURL(absolutePath).href)) as TModule;
}

test("network distribution analytics contract exports typed fixtures service and errors", async () => {
  const contract = await importProjectModule<{
    NETWORK_DISTRIBUTION_ANALYTICS_ERROR_CODES: readonly string[];
    NETWORK_DISTRIBUTION_ANALYTICS_ERROR_DEFINITIONS: Record<
      string,
      { appCode: string; message: string; recovery: string }
    >;
    NETWORK_DISTRIBUTION_ANALYTICS_FIXTURE_SOURCE: string;
    mockNetworkDistributionAnalyticsFixture: {
      state: string;
      industryDistribution: readonly Array<{
        bucketId: string;
        label: string;
        contactCount: number;
        percentage: number;
        evidenceIds: readonly string[];
      }>;
      valueTypeDistribution: readonly Array<{
        valueType: string;
        label: string;
        relationshipCount: number;
        evidenceIds: readonly string[];
      }>;
      relationshipStrengthDistribution: readonly Array<{
        strength: string;
        relationshipCount: number;
        percentage: number;
      }>;
      provenance: {
        source: string;
        generationMethod: string;
        graphAlgorithmExecuted: false;
        embeddingSearchExecuted: false;
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
    mockNetworkGapAnalysisFixture: {
      state: string;
      coverageScore: number;
      gaps: readonly Array<{
        gapId: string;
        label: string;
        severity: string;
        currentCount: number;
        targetCount: number;
        recommendedAction: string;
        evidenceIds: readonly string[];
      }>;
      provenance: { generationMethod: string };
    };
    mockEmptyNetworkDistributionAnalyticsFixture: {
      state: string;
      industryDistribution: readonly unknown[];
      valueTypeDistribution: readonly unknown[];
      relationshipStrengthDistribution: readonly unknown[];
      nextAction: string;
    };
    mockPendingNetworkGapAnalysisFixture: {
      state: string;
      gaps: readonly unknown[];
      nextAction: string;
    };
  }>("features/dashboard/distribution-contract.ts");
  const serviceSource = readFileSync(
    join(projectRoot, "features/dashboard/distribution-contract.ts"),
    "utf8",
  );

  assert.match(serviceSource, /interface NetworkDistributionAnalyticsService/);
  assert.match(serviceSource, /getDistributions/);
  assert.match(serviceSource, /getNetworkGaps/);
  assert.deepEqual(contract.NETWORK_DISTRIBUTION_ANALYTICS_ERROR_CODES, [
    "NETWORK_DISTRIBUTION_ANALYTICS_MOCK_FAILED",
  ]);
  assert.equal(
    contract.NETWORK_DISTRIBUTION_ANALYTICS_ERROR_DEFINITIONS
      .NETWORK_DISTRIBUTION_ANALYTICS_MOCK_FAILED.appCode,
    "SERVICE_UNAVAILABLE",
  );
  assert.match(
    contract.NETWORK_DISTRIBUTION_ANALYTICS_ERROR_DEFINITIONS
      .NETWORK_DISTRIBUTION_ANALYTICS_MOCK_FAILED.recovery,
    /network distribution analytics mock/i,
  );
  assert.equal(
    contract.NETWORK_DISTRIBUTION_ANALYTICS_FIXTURE_SOURCE,
    "fixture:features/dashboard/distribution-contract.ts",
  );

  assert.equal(contract.mockNetworkDistributionAnalyticsFixture.state, "success");
  assert.deepEqual(
    contract.mockNetworkDistributionAnalyticsFixture.industryDistribution.map(
      (bucket) => bucket.label,
    ),
    [
      "Climate infrastructure",
      "Industrial operations",
      "Venture capital",
      "Developer platforms",
    ],
  );
  assert.deepEqual(
    contract.mockNetworkDistributionAnalyticsFixture.valueTypeDistribution.map(
      (bucket) => bucket.valueType,
    ),
    [
      "commercial_opportunity",
      "strategic_fit",
      "referral_path",
      "investor_access",
    ],
  );
  assert.deepEqual(
    contract.mockNetworkDistributionAnalyticsFixture.relationshipStrengthDistribution.map(
      (bucket) => bucket.strength,
    ),
    ["strong", "warm", "weak"],
  );
  assert.equal(
    contract.mockNetworkDistributionAnalyticsFixture.provenance.source,
    contract.NETWORK_DISTRIBUTION_ANALYTICS_FIXTURE_SOURCE,
  );
  assert.equal(
    contract.mockNetworkDistributionAnalyticsFixture.provenance.generationMethod,
    "fixture",
  );
  assert.equal(
    contract.mockNetworkDistributionAnalyticsFixture.provenance
      .graphAlgorithmExecuted,
    false,
  );
  assert.equal(
    contract.mockNetworkDistributionAnalyticsFixture.provenance
      .embeddingSearchExecuted,
    false,
  );
  assert.equal(
    contract.mockNetworkDistributionAnalyticsFixture.provenance
      .liveAnalyticsJobExecuted,
    false,
  );
  assert.equal(
    contract.mockNetworkDistributionAnalyticsFixture.provenance
      .externalNetworkRequested,
    false,
  );
  assert.equal(
    contract.mockNetworkDistributionAnalyticsFixture.provenance.databaseReadExecuted,
    false,
  );
  assert.equal(
    contract.mockNetworkDistributionAnalyticsFixture.provenance.databaseWriteExecuted,
    false,
  );
  assert.equal(
    contract.mockNetworkDistributionAnalyticsFixture.provenance.aiProviderRequested,
    false,
  );
  assert.equal(
    contract.mockNetworkDistributionAnalyticsFixture.provenance
      .calendarProviderRequested,
    false,
  );
  assert.equal(
    contract.mockNetworkDistributionAnalyticsFixture.provenance
      .emailProviderRequested,
    false,
  );
  assert.equal(
    contract.mockNetworkDistributionAnalyticsFixture.provenance
      .notificationProviderRequested,
    false,
  );
  assert.equal(
    contract.mockNetworkDistributionAnalyticsFixture.provenance.deviceRequested,
    false,
  );
  assert.equal(contract.mockNetworkGapAnalysisFixture.state, "success");
  assert.equal(contract.mockNetworkGapAnalysisFixture.coverageScore, 68);
  assert.equal(contract.mockNetworkGapAnalysisFixture.gaps.length, 3);
  assert.equal(
    contract.mockNetworkGapAnalysisFixture.provenance.generationMethod,
    "rule-based-gap-analysis",
  );
  assert.equal(contract.mockEmptyNetworkDistributionAnalyticsFixture.state, "empty");
  assert.equal(
    contract.mockEmptyNetworkDistributionAnalyticsFixture.industryDistribution
      .length,
    0,
  );
  assert.match(
    contract.mockEmptyNetworkDistributionAnalyticsFixture.nextAction,
    /Add sourced contacts/i,
  );
  assert.equal(contract.mockPendingNetworkGapAnalysisFixture.state, "pending");
});

test("mock network distribution analytics service is deterministic and provider-free", async () => {
  const serviceModule = await importProjectModule<{
    createMockNetworkDistributionAnalyticsService: () => {
      getDistributions: (input?: { scenario?: string | null }) => {
        success: boolean;
        data?: {
          state: string;
          industryDistribution: readonly unknown[];
          provenance: {
            graphAlgorithmExecuted: false;
            embeddingSearchExecuted: false;
            liveAnalyticsJobExecuted: false;
            externalNetworkRequested: false;
            databaseReadExecuted: false;
          };
        };
        error?: { code: string; appCode: string };
      };
      getNetworkGaps: (input?: { scenario?: string | null }) => {
        success: boolean;
        data?: {
          state: string;
          coverageScore: number;
          gaps: readonly unknown[];
          provenance: { generationMethod: string };
        };
        error?: { code: string; appCode: string };
      };
    };
  }>("features/dashboard/mock-distribution-service.ts");

  const service = serviceModule.createMockNetworkDistributionAnalyticsService();
  const success = service.getDistributions();
  const gaps = service.getNetworkGaps();
  const empty = service.getDistributions({ scenario: "empty" });
  const pending = service.getNetworkGaps({ scenario: "pending" });
  const failure = service.getNetworkGaps({ scenario: "failure" });

  assert.deepEqual(service.getDistributions(), service.getDistributions());
  assert.deepEqual(service.getNetworkGaps(), service.getNetworkGaps());
  assert.equal(success.success, true);
  assert.equal(success.data?.state, "success");
  assert.equal(success.data?.industryDistribution.length, 4);
  assert.equal(success.data?.provenance.graphAlgorithmExecuted, false);
  assert.equal(success.data?.provenance.embeddingSearchExecuted, false);
  assert.equal(success.data?.provenance.liveAnalyticsJobExecuted, false);
  assert.equal(success.data?.provenance.externalNetworkRequested, false);
  assert.equal(success.data?.provenance.databaseReadExecuted, false);
  assert.equal(gaps.success, true);
  assert.equal(gaps.data?.state, "success");
  assert.equal(gaps.data?.coverageScore, 68);
  assert.equal(
    gaps.data?.provenance.generationMethod,
    "rule-based-gap-analysis",
  );
  assert.equal(empty.success, true);
  assert.equal(empty.data?.state, "empty");
  assert.equal(pending.success, true);
  assert.equal(pending.data?.state, "pending");
  assert.equal(failure.success, false);
  assert.equal(
    failure.error?.code,
    "NETWORK_DISTRIBUTION_ANALYTICS_MOCK_FAILED",
  );
  assert.equal(failure.error?.appCode, "SERVICE_UNAVAILABLE");

  for (const filePath of [
    "features/dashboard/distribution-contract.ts",
    "features/dashboard/mock-distribution-service.ts",
    "app/api/dashboard/distributions/route.ts",
    "app/api/dashboard/network-gaps/route.ts",
    "features/dashboard/network-distribution-analytics-mock/debug-view.tsx",
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

test("network distribution analytics API routes return stable envelopes with empty pending and failure paths", async () => {
  const distributionsRoute = await importProjectModule<{
    GET: (request: Request) => Promise<Response>;
  }>("app/api/dashboard/distributions/route.ts");
  const networkGapsRoute = await importProjectModule<{
    GET: (request: Request) => Promise<Response>;
  }>("app/api/dashboard/network-gaps/route.ts");
  const contract = await importProjectModule<{
    mockNetworkDistributionAnalyticsFixture: unknown;
    mockNetworkGapAnalysisFixture: unknown;
    mockEmptyNetworkDistributionAnalyticsFixture: unknown;
    mockPendingNetworkGapAnalysisFixture: unknown;
  }>("features/dashboard/distribution-contract.ts");

  const distributionsResponse = await distributionsRoute.GET(
    new Request("https://orbit.local/api/dashboard/distributions"),
  );
  const gapsResponse = await networkGapsRoute.GET(
    new Request("https://orbit.local/api/dashboard/network-gaps"),
  );
  const emptyResponse = await distributionsRoute.GET(
    new Request("https://orbit.local/api/dashboard/distributions?scenario=empty"),
  );
  const pendingResponse = await networkGapsRoute.GET(
    new Request("https://orbit.local/api/dashboard/network-gaps?scenario=pending"),
  );
  const failureResponse = await networkGapsRoute.GET(
    new Request("https://orbit.local/api/dashboard/network-gaps?scenario=failure"),
  );

  assert.equal(distributionsResponse.status, 200);
  assert.equal(distributionsResponse.headers.get("cache-control"), "no-store");
  assert.equal(distributionsResponse.headers.get("x-orbit-feature-mode"), "mock");
  assert.deepEqual(await distributionsResponse.json(), {
    success: true,
    data: contract.mockNetworkDistributionAnalyticsFixture,
  });

  assert.equal(gapsResponse.status, 200);
  assert.deepEqual(await gapsResponse.json(), {
    success: true,
    data: contract.mockNetworkGapAnalysisFixture,
  });

  assert.equal(emptyResponse.status, 200);
  assert.deepEqual(await emptyResponse.json(), {
    success: true,
    data: contract.mockEmptyNetworkDistributionAnalyticsFixture,
  });

  assert.equal(pendingResponse.status, 200);
  assert.deepEqual(await pendingResponse.json(), {
    success: true,
    data: contract.mockPendingNetworkGapAnalysisFixture,
  });

  assert.equal(failureResponse.status, 503);
  assert.deepEqual(await failureResponse.json(), {
    success: false,
    error: {
      code: "SERVICE_UNAVAILABLE",
      message:
        "The mock network distribution analytics boundary is pinned to a controlled failure scenario.",
      context: {
        boundary: "developer-admin",
        mode: "mock",
        networkDistributionAnalyticsErrorCode:
          "NETWORK_DISTRIBUTION_ANALYTICS_MOCK_FAILED",
        privacy: "no-relationship-data",
        provenance:
          "Mock network distribution analytics failure came from deterministic fixture rules.",
        service: "network-distribution-analytics-mock",
      },
    },
  });
});

test("network distribution analytics debug route renders all states and live replacement handoff", async () => {
  const debugView = await importProjectModule<{
    NETWORK_DISTRIBUTION_ANALYTICS_MOCK_SLUG: string;
    NetworkDistributionAnalyticsMockDemo: React.ComponentType;
  }>(
    "features/dashboard/network-distribution-analytics-mock/debug-view.tsx",
  );
  const html = renderToStaticMarkup(
    React.createElement(debugView.NetworkDistributionAnalyticsMockDemo),
  );
  const pageSource = readFileSync(
    join(projectRoot, "app/dev/capabilities/[slug]/page.tsx"),
    "utf8",
  );
  const liveDocPath =
    "features/dashboard/network-distribution-analytics-mock/LIVE_IMPLEMENTATION.md";
  const liveDoc = readFileSync(join(projectRoot, liveDocPath), "utf8");

  assert.equal(
    debugView.NETWORK_DISTRIBUTION_ANALYTICS_MOCK_SLUG,
    "network-distribution-analytics-mock",
  );
  assert.match(pageSource, /NETWORK_DISTRIBUTION_ANALYTICS_MOCK_SLUG/);
  assert.match(pageSource, /NetworkDistributionAnalyticsMockDemo/);

  assert.match(html, /Network distribution analytics mock/);
  assert.match(
    html,
    /aria-label="Network distribution analytics operator checkpoint"/,
  );
  assert.match(html, /Industry distribution/);
  assert.match(html, /Value type distribution/);
  assert.match(html, /Relationship strength distribution/);
  assert.match(html, /Network gap analysis/);
  assert.match(html, /graph algorithms false/);
  assert.match(html, /embedding search false/);
  assert.match(html, /live analytics jobs false/);
  assert.match(html, /database writes false/);
  assert.match(html, /Success state/);
  assert.match(html, /Empty state/);
  assert.match(html, /Pending state/);
  assert.match(html, /Failure state/);
  assert.match(html, /NETWORK_DISTRIBUTION_ANALYTICS_MOCK_FAILED/);
  assert.match(html, /notification provider requested false/);
  assert.match(html, /device requested false/);
  assert.match(
    html,
    /aria-label="Network distribution analytics source references"/,
  );
  assert.match(html, /Climate dinner attendee roster/);
  assert.match(html, /event_import/);
  assert.match(html, /event:climate-dinner:roster/);
  assert.match(html, /Northstar procurement thread/);
  assert.match(html, /Developer platform chat summary/);
  assert.match(html, /GET \/api\/dashboard\/distributions/);
  assert.match(html, /GET \/api\/dashboard\/network-gaps/);
  assert.match(
    html,
    /GET \/api\/dashboard\/distributions\?scenario=empty/,
  );
  assert.match(
    html,
    /GET \/api\/dashboard\/network-gaps\?scenario=pending/,
  );
  assert.match(html, new RegExp(liveDocPath));
  assert.match(html, /ORBIT_NETWORK_DISTRIBUTION_ANALYTICS_PROVIDER/);
  assert.match(html, /network-distribution-analytics-workbench/);
  assert.match(
    html,
    /\.network-distribution-analytics-workbench\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)/,
  );

  assert.match(
    liveDoc,
    /features\/dashboard\/network-distribution-analytics-mock\/live-service\.ts/,
  );
  assert.match(
    liveDoc,
    /features\/dashboard\/network-distribution-analytics-mock\/service-factory\.ts/,
  );
  assert.match(
    liveDoc,
    /features\/dashboard\/network-distribution-analytics-mock\/providers\//,
  );
  assert.match(liveDoc, /ORBIT_NETWORK_DISTRIBUTION_ANALYTICS_PROVIDER/);
  assert.match(liveDoc, /ORBIT_RELATIONSHIP_ANALYTICS_DATABASE_URL/);
  assert.match(liveDoc, /ORBIT_ANALYTICS_JOB_QUEUE/);
  assert.match(liveDoc, /ORBIT_GRAPH_ANALYTICS_PROJECT_ID/);
  assert.match(liveDoc, /ORBIT_VECTOR_INDEX_NAME/);
  assert.match(liveDoc, /graph algorithm/i);
  assert.match(liveDoc, /embedding/i);
  assert.match(liveDoc, /analytics job/i);
  assert.match(liveDoc, /database/i);
  assert.match(liveDoc, /privacy/i);
  assert.match(liveDoc, /provenance/i);
  assert.match(
    liveDoc,
    /industry distribution, value type distribution, relationship strength distribution, and network gap analysis/i,
  );
  assert.match(liveDoc, /empty/i);
  assert.match(liveDoc, /pending/i);
  assert.match(liveDoc, /controlled failure/i);
  assert.match(liveDoc, /replacement tests/i);
});
