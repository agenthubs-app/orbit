/**
 * 关系价值评分 mock 的契约测试。
 *
 * 锁住评分 payload、recompute 行为、API envelope 和 debug-view。
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as analysisValueFixtures from "../../features/analysis/value-fixtures";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

async function importProjectModule<TModule>(
  pathFromRoot: string,
): Promise<TModule> {
  const absolutePath = join(projectRoot, pathFromRoot);

  assert.equal(
    existsSync(absolutePath),
    true,
    `${pathFromRoot} must exist for the relationship value scoring mock sprint`,
  );

  return (await import(pathToFileURL(absolutePath).href)) as TModule;
}

test("relationship value contract exposes typed scores rationale fixtures service and errors", async () => {
  const contract = await importProjectModule<
    typeof import("../../features/analysis/value-contract")
  >("features/analysis/value-contract.ts");
  const serviceModule = await importProjectModule<
    typeof import("../../features/analysis/mock-value-service")
  >("features/analysis/mock-value-service.ts");

  const service = serviceModule.createMockRelationshipValueScoringService();
  const success = service.getRelationshipValue({
    connectionId: "demo-connection-1",
  });
  const empty = service.getRelationshipValue({
    connectionId: "demo-connection-1",
    scenario: "empty",
  });
  const pending = service.getRelationshipValue({
    connectionId: "demo-connection-1",
    scenario: "pending",
  });
  const failure = service.getRelationshipValue({
    connectionId: "demo-connection-1",
    scenario: "failure",
  });
  const missing = service.getRelationshipValue({
    connectionId: "missing-connection",
  });
  const recomputed = service.recomputeRelationshipValue({
    connectionId: "demo-connection-1",
    evidenceIds: [
      "evidence:connection-storage-pilot",
      "evidence:connection-follow-up",
    ],
  });

  assert.deepEqual(contract.RELATIONSHIP_VALUE_TYPES, [
    "strategic_intro",
    "event_follow_up",
    "community_bridge",
    "low_context",
  ]);
  assert.deepEqual(contract.RELATIONSHIP_VALUE_PRIORITY_BANDS, [
    "critical",
    "high",
    "medium",
    "low",
  ]);
  assert.deepEqual(contract.RELATIONSHIP_VALUE_ERROR_CODES, [
    "RELATIONSHIP_VALUE_NOT_FOUND",
    "RELATIONSHIP_VALUE_RECOMPUTE_INVALID_BODY",
    "RELATIONSHIP_VALUE_RECOMPUTE_PENDING",
    "RELATIONSHIP_VALUE_SERVICE_MOCK_FAILED",
  ]);
  assert.equal(
    contract.RELATIONSHIP_VALUE_ERROR_DEFINITIONS
      .RELATIONSHIP_VALUE_SERVICE_MOCK_FAILED.appCode,
    "SERVICE_UNAVAILABLE",
  );
  assert.equal(
    analysisValueFixtures.RELATIONSHIP_VALUE_FIXTURE_SOURCE,
    "fixture:features/analysis/value-fixtures.ts",
  );

  assert.equal(success.success, true);
  assert.equal(success.data.state, "success");
  assert.equal(success.data.assessment?.relationshipValueType, "strategic_intro");
  assert.equal(success.data.assessment?.priorityScore.value, 93);
  assert.equal(success.data.assessment?.priorityScore.band, "critical");
  assert.match(
    success.data.assessment?.rationale.summary ?? "",
    /storage pilot operator intro/,
  );
  assert.equal(
    success.data.assessment?.suggestedNextAction.label,
    "Send the storage pilot operator introduction",
  );
  assert.equal(success.data.provenance.generationMethod, "fixture");
  assert.deepEqual(success.data.provenance.evidenceIds, [
    "evidence:connection-climate-dinner",
    "evidence:connection-storage-pilot",
    "evidence:connection-email-context",
    "evidence:connection-follow-up",
  ]);
  assert.equal(success.data.provenance.externalNetworkRequested, false);
  assert.equal(success.data.provenance.aiProviderRequested, false);
  assert.equal(success.data.provenance.calendarProviderRequested, false);
  assert.equal(success.data.provenance.emailProviderRequested, false);
  assert.equal(success.data.provenance.notificationDelivered, false);

  assert.equal(empty.success, true);
  assert.equal(empty.data.state, "empty");
  assert.equal(empty.data.assessment, null);
  assert.equal(
    empty.data.nextAction,
    "Select a mock connection with evidence before scoring relationship value.",
  );

  assert.equal(pending.success, true);
  assert.equal(pending.data.state, "pending");
  assert.equal(pending.data.assessment, null);
  assert.match(pending.data.summary, /waiting for local fixture review/);

  assert.equal(failure.success, false);
  assert.equal(
    failure.error.code,
    "RELATIONSHIP_VALUE_SERVICE_MOCK_FAILED",
  );
  assert.equal(failure.error.appCode, "SERVICE_UNAVAILABLE");
  assert.equal(missing.success, false);
  assert.equal(missing.error.code, "RELATIONSHIP_VALUE_NOT_FOUND");

  assert.equal(recomputed.success, true);
  assert.equal(recomputed.data.state, "success");
  assert.equal(recomputed.data.assessment?.priorityScore.value, 88);
  assert.equal(
    recomputed.data.assessment?.priorityScore.calculation,
    "deterministic fixture rule: base 72 + evidence 10 + action urgency 6",
  );
  assert.equal(recomputed.data.provenance.generationMethod, "rule-based");
  assert.equal(recomputed.data.provenance.databaseReadExecuted, false);
  assert.equal(recomputed.data.provenance.databaseWriteExecuted, false);

  assert.deepEqual(
    analysisValueFixtures.mockRelationshipValueScoringFixture,
    success.data,
  );
  assert.deepEqual(
    analysisValueFixtures.mockRecomputedRelationshipValueFixture,
    recomputed.data,
  );
});

test("mock relationship value scoring is deterministic and has no external provider calls", async () => {
  const serviceModule = await importProjectModule<
    typeof import("../../features/analysis/mock-value-service")
  >("features/analysis/mock-value-service.ts");
  const service = serviceModule.createMockRelationshipValueScoringService();
  const recomputeInput = {
    connectionId: "demo-connection-1",
    evidenceIds: [
      "evidence:connection-storage-pilot",
      "evidence:connection-follow-up",
    ],
  };

  assert.deepEqual(
    service.getRelationshipValue({ connectionId: "demo-connection-1" }),
    service.getRelationshipValue({ connectionId: "demo-connection-1" }),
  );
  assert.deepEqual(
    service.recomputeRelationshipValue(recomputeInput),
    service.recomputeRelationshipValue(recomputeInput),
  );
  assert.deepEqual(
    service.getRelationshipValue({
      connectionId: "demo-connection-1",
      scenario: "unknown-scenario",
    }),
    service.getRelationshipValue({ connectionId: "demo-connection-1" }),
  );

  for (const filePath of [
    "features/analysis/value-contract.ts",
    "features/analysis/mock-value-service.ts",
    "app/api/analysis/relationship-value/[id]/route.ts",
    "app/api/analysis/relationship-value/recompute/route.ts",
    "features/analysis/relationship-value-scoring-mock/debug-view.tsx",
  ]) {
    const source = readFileSync(join(projectRoot, filePath), "utf8");

    assert.doesNotMatch(source, /\bfetch\s*\(/);
    assert.doesNotMatch(source, /Supabase|createClient|OAuth/i);
    assert.doesNotMatch(source, /XMLHttpRequest|WebSocket|EventSource/);
    assert.doesNotMatch(source, /navigator|mediaDevices|localStorage|indexedDB/);
    assert.doesNotMatch(source, /from ["']node:net["']|from ["']node:http/);
    assert.doesNotMatch(
      source,
      /calendar provider|email provider|notification provider|database provider/i,
    );
    assert.doesNotMatch(source, /openai|anthropic|ai provider/i);
  }
});

test("relationship value scoring API routes return stable envelopes with empty pending and failure paths", async () => {
  const detailRoute = await importProjectModule<{
    GET: (
      request: Request,
      context: { params: Promise<{ id: string }> },
    ) => Promise<Response>;
  }>("app/api/analysis/relationship-value/[id]/route.ts");
  const recomputeRoute = await importProjectModule<{
    POST: (request: Request) => Promise<Response>;
  }>("app/api/analysis/relationship-value/recompute/route.ts");
  const contract = await importProjectModule<
    typeof import("../../features/analysis/value-contract")
  >("features/analysis/value-contract.ts");

  const routeContext = { params: Promise.resolve({ id: "demo-connection-1" }) };
  const detailResponse = await detailRoute.GET(
    new Request(
      "https://orbit.local/api/analysis/relationship-value/demo-connection-1",
    ),
    routeContext,
  );
  const emptyResponse = await detailRoute.GET(
    new Request(
      "https://orbit.local/api/analysis/relationship-value/demo-connection-1?scenario=empty",
    ),
    routeContext,
  );
  const pendingResponse = await detailRoute.GET(
    new Request(
      "https://orbit.local/api/analysis/relationship-value/demo-connection-1?scenario=pending",
    ),
    routeContext,
  );
  const failureResponse = await detailRoute.GET(
    new Request(
      "https://orbit.local/api/analysis/relationship-value/demo-connection-1?scenario=failure",
    ),
    routeContext,
  );
  const missingResponse = await detailRoute.GET(
    new Request(
      "https://orbit.local/api/analysis/relationship-value/missing-connection",
    ),
    { params: Promise.resolve({ id: "missing-connection" }) },
  );
  const recomputeResponse = await recomputeRoute.POST(
    new Request(
      "https://orbit.local/api/analysis/relationship-value/recompute",
      {
        body: JSON.stringify({
          connectionId: "demo-connection-1",
          evidenceIds: [
            "evidence:connection-storage-pilot",
            "evidence:connection-follow-up",
          ],
        }),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      },
    ),
  );
  const defaultRecomputeResponse = await recomputeRoute.POST(
    new Request(
      "https://orbit.local/api/analysis/relationship-value/recompute",
      {
        method: "POST",
      },
    ),
  );
  const formRecomputeResponse = await recomputeRoute.POST(
    new Request(
      "https://orbit.local/api/analysis/relationship-value/recompute",
      {
        body: new URLSearchParams(),
        headers: {
          "content-type": "application/x-www-form-urlencoded",
        },
        method: "POST",
      },
    ),
  );
  const malformedResponse = await recomputeRoute.POST(
    new Request(
      "https://orbit.local/api/analysis/relationship-value/recompute",
      {
        body: "{",
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      },
    ),
  );
  const pendingRecomputeResponse = await recomputeRoute.POST(
    new Request(
      "https://orbit.local/api/analysis/relationship-value/recompute?scenario=pending",
      {
        body: JSON.stringify({ connectionId: "demo-connection-1" }),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      },
    ),
  );

  assert.equal(detailResponse.status, 200);
  assert.equal(detailResponse.headers.get("cache-control"), "no-store");
  assert.equal(detailResponse.headers.get("x-orbit-feature-mode"), "mock");
  assert.deepEqual(await detailResponse.json(), {
    success: true,
    data: analysisValueFixtures.mockRelationshipValueScoringFixture,
  });

  assert.equal(emptyResponse.status, 200);
  assert.deepEqual(await emptyResponse.json(), {
    success: true,
    data: analysisValueFixtures.mockEmptyRelationshipValueScoringFixture,
  });

  assert.equal(pendingResponse.status, 200);
  assert.deepEqual(await pendingResponse.json(), {
    success: true,
    data: analysisValueFixtures.mockPendingRelationshipValueScoringFixture,
  });

  assert.equal(failureResponse.status, 503);
  assert.deepEqual(await failureResponse.json(), {
    success: false,
    error: {
      code: "SERVICE_UNAVAILABLE",
      message:
        "The mock relationship value scoring boundary is pinned to a controlled failure scenario.",
      context: {
        boundary: "developer-admin",
        mode: "mock",
        privacy: "no-relationship-data",
        provenance:
          "Mock relationship value scoring failure came from deterministic fixture rules.",
        relationshipValueErrorCode:
          "RELATIONSHIP_VALUE_SERVICE_MOCK_FAILED",
        service: "relationship-value-scoring-mock",
      },
    },
  });

  assert.equal(missingResponse.status, 404);
  assert.deepEqual(await missingResponse.json(), {
    success: false,
    error: {
      code: "NOT_FOUND",
      message:
        "That mock connection is not available for relationship value scoring.",
      context: {
        boundary: "developer-admin",
        mode: "mock",
        privacy: "no-relationship-data",
        provenance:
          "Mock relationship value scoring failure came from deterministic fixture rules.",
        relationshipValueErrorCode: "RELATIONSHIP_VALUE_NOT_FOUND",
        service: "relationship-value-scoring-mock",
      },
    },
  });

  assert.equal(recomputeResponse.status, 200);
  assert.deepEqual(await recomputeResponse.json(), {
    success: true,
    data: analysisValueFixtures.mockRecomputedRelationshipValueFixture,
  });

  assert.equal(defaultRecomputeResponse.status, 200);
  assert.deepEqual(await defaultRecomputeResponse.json(), {
    success: true,
    data: analysisValueFixtures.mockRecomputedRelationshipValueFixture,
  });

  assert.equal(formRecomputeResponse.status, 200);
  assert.deepEqual(await formRecomputeResponse.json(), {
    success: true,
    data: analysisValueFixtures.mockRecomputedRelationshipValueFixture,
  });

  assert.equal(malformedResponse.status, 400);
  assert.deepEqual(await malformedResponse.json(), {
    success: false,
    error: {
      code: "VALIDATION_ERROR",
      message:
        "The mock relationship value recompute request body must be valid JSON.",
      context: {
        boundary: "developer-admin",
        mode: "mock",
        privacy: "no-relationship-data",
        provenance:
          "Mock relationship value scoring failure came from deterministic fixture rules.",
        relationshipValueErrorCode:
          "RELATIONSHIP_VALUE_RECOMPUTE_INVALID_BODY",
        service: "relationship-value-scoring-mock",
      },
    },
  });

  assert.equal(pendingRecomputeResponse.status, 409);
  assert.deepEqual(await pendingRecomputeResponse.json(), {
    success: false,
    error: {
      code: "CONFLICT",
      message:
        "The mock relationship value recompute is waiting for fixture review.",
      context: {
        boundary: "developer-admin",
        mode: "mock",
        privacy: "no-relationship-data",
        provenance:
          "Mock relationship value scoring failure came from deterministic fixture rules.",
        relationshipValueErrorCode: "RELATIONSHIP_VALUE_RECOMPUTE_PENDING",
        service: "relationship-value-scoring-mock",
      },
    },
  });
});

test("relationship value scoring debug route renders all states and the live replacement handoff", async () => {
  const debugView = await importProjectModule<
    typeof import("../../features/analysis/relationship-value-scoring-mock/debug-view")
  >("features/analysis/relationship-value-scoring-mock/debug-view.tsx");
  const html = renderToStaticMarkup(
    React.createElement(debugView.RelationshipValueScoringMockDemo),
  );
  const pageSource = readFileSync(
    join(projectRoot, "app/dev/capabilities/[slug]/page.tsx"),
    "utf8",
  );
  const liveDocPath =
    "features/analysis/relationship-value-scoring-mock/LIVE_IMPLEMENTATION.md";
  const liveDoc = readFileSync(join(projectRoot, liveDocPath), "utf8");

  assert.equal(
    debugView.RELATIONSHIP_VALUE_SCORING_MOCK_SLUG,
    "relationship-value-scoring-mock",
  );
  assert.match(pageSource, /RELATIONSHIP_VALUE_SCORING_MOCK_SLUG/);
  assert.match(pageSource, /RelationshipValueScoringMockDemo/);

  assert.match(html, /Relationship value scoring mock/);
  assert.match(html, /aria-label="Relationship value operator checkpoint"/);
  assert.match(html, /Relationship value type/);
  assert.match(html, /Priority score/);
  assert.match(html, /Rationale/);
  assert.match(html, /Suggested next action/);
  assert.match(html, /storage pilot operator introduction/);
  assert.match(html, /database reads false; database writes false/);
  assert.match(html, /Success state/);
  assert.match(html, /Empty state/);
  assert.match(html, /Pending state/);
  assert.match(html, /Failure state/);
  assert.match(html, /RELATIONSHIP_VALUE_SERVICE_MOCK_FAILED/);
  assert.match(html, /GET \/api\/analysis\/relationship-value\/demo-connection-1/);
  assert.match(html, /POST \/api\/analysis\/relationship-value\/recompute/);
  assert.match(html, /Run recompute success probe/);
  assert.match(html, /Bare POST defaults to deterministic recompute output/);
  assert.match(
    html,
    /GET \/api\/analysis\/relationship-value\/demo-connection-1\?scenario=empty/,
  );
  assert.match(
    html,
    /GET \/api\/analysis\/relationship-value\/demo-connection-1\?scenario=pending/,
  );
  assert.match(html, new RegExp(liveDocPath));
  assert.match(html, /ORBIT_RELATIONSHIP_VALUE_PROVIDER/);
  assert.match(html, /relationship-value-workbench/);
  assert.match(html, /invalid recompute bodies/);
  assert.match(
    html,
    /\.relationship-value-workbench\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)/,
  );

  assert.match(
    liveDoc,
    /features\/analysis\/relationship-value-scoring-mock\/live-service\.ts/,
  );
  assert.match(
    liveDoc,
    /features\/analysis\/relationship-value-scoring-mock\/providers\//,
  );
  assert.match(liveDoc, /ORBIT_RELATIONSHIP_VALUE_PROVIDER/);
  assert.match(liveDoc, /ranking model/);
  assert.match(liveDoc, /calendar permission/);
  assert.match(liveDoc, /email permission/);
  assert.match(liveDoc, /privacy/);
  assert.match(liveDoc, /provenance/);
  assert.match(liveDoc, /relationship value type, priority score, rationale, and suggested next action/);
  assert.match(liveDoc, /no-body recompute probe/i);
  assert.match(liveDoc, /replacement tests/i);
});
