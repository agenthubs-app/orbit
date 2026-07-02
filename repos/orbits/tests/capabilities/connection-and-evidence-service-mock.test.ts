/**
 * 连接与证据服务 mock 的契约测试。
 *
 * 覆盖 connection 详情、证据时间线、add evidence 和 API envelope 行为。
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
    `${pathFromRoot} must exist for the connection and evidence service mock sprint`,
  );

  return (await import(pathToFileURL(absolutePath).href)) as TModule;
}

test("connection and evidence contract exposes records timelines source links fixtures service and errors", async () => {
  const contract = await importProjectModule<
    typeof import("../../features/connections/contract")
  >("features/connections/contract.ts");
  const fixtures = await importProjectModule<
    typeof import("../../features/connections/fixtures")
  >("features/connections/fixtures.ts");
  const serviceModule = await importProjectModule<
    typeof import("../../features/connections/mock-service")
  >("features/connections/mock-service.ts");

  const service = serviceModule.createMockConnectionEvidenceService();
  const list = service.listConnections();
  const detail = service.getConnection({ connectionId: "demo-connection-1" });
  const added = service.addEvidence({
    connectionId: "demo-connection-1",
    contribution: "follow_up_signal",
    occurredAt: "2026-06-25T19:20:00.000Z",
    sourceLabel: "Operator follow-up note",
    sourceType: "manual",
    title: "Operator confirmed warm introduction path",
    excerpt:
      "Kenji wants the storage pilot operator intro before the partner review call.",
  });
  const empty = service.listConnections({ scenario: "empty" });
  const pending = service.getConnection({
    connectionId: "demo-connection-1",
    scenario: "pending",
  });
  const failure = service.getConnection({
    connectionId: "demo-connection-1",
    scenario: "failure",
  });
  const unsupportedSource = service.addEvidence({
    connectionId: "demo-connection-1",
    sourceType: "business_card_ocr",
  });
  const pendingAdd = service.addEvidence({
    connectionId: "demo-connection-1",
    scenario: "pending",
  });
  const invalidBody = service.invalidAddEvidenceBody();
  const missing = service.getConnection({ connectionId: "missing-connection" });

  assert.deepEqual(contract.CONNECTION_EVIDENCE_SERVICE_ERROR_CODES, [
    "CONNECTION_NOT_FOUND",
    "CONNECTION_EVIDENCE_INVALID_BODY",
    "CONNECTION_EVIDENCE_SOURCE_NOT_SUPPORTED",
    "CONNECTION_EVIDENCE_ADD_PENDING",
    "CONNECTION_EVIDENCE_SERVICE_MOCK_FAILED",
    "CONNECTION_LIVE_STORE_UNCONFIGURED",
  ]);
  assert.equal(
    contract.CONNECTION_EVIDENCE_SERVICE_ERROR_DEFINITIONS
      .CONNECTION_NOT_FOUND.appCode,
    "NOT_FOUND",
  );
  assert.equal(
    contract.CONNECTION_EVIDENCE_SERVICE_ERROR_DEFINITIONS
      .CONNECTION_EVIDENCE_SOURCE_NOT_SUPPORTED.appCode,
    "VALIDATION_ERROR",
  );
  assert.deepEqual(contract.CONNECTION_EVIDENCE_SOURCE_TYPES, [
    "manual",
    "event_import",
    "email_signal",
    "calendar_signal",
    "referral",
    "chat_summary",
    "agent_action",
  ]);
  assert.deepEqual(contract.CONNECTION_EVIDENCE_CONTRIBUTIONS, [
    "origin",
    "context",
    "follow_up_signal",
    "introduced_by",
    "user_note",
  ]);
  assert.equal(
    fixtures.CONNECTION_EVIDENCE_SERVICE_FIXTURE_SOURCE,
    "fixture:features/connections/fixtures.ts",
  );

  assert.equal(list.success, true);
  assert.equal(list.data.state, "success");
  assert.equal(list.data.connections.length, 2);
  assert.deepEqual(
    list.data.connections.map((connection) => connection.displayName),
    ["Kenji Watanabe", "Hana Sato"],
  );
  assert.equal(list.data.connections[0]?.id, "demo-connection-1");
  assert.equal(list.data.connections[0]?.relationshipStage, "needs_follow_up");
  assert.equal(list.data.connections[0]?.sourceLinks.length, 3);
  assert.equal(list.data.connections[0]?.evidenceTimeline.length, 4);
  assert.equal(
    list.data.connections[0]?.evidenceTimeline[0]?.sourceLink.evidenceId,
    "evidence:connection-climate-dinner",
  );
  assert.equal(list.data.connections[0]?.databaseReadExecuted, false);
  assert.equal(list.data.connections[0]?.databaseWriteExecuted, false);
  assert.equal(list.data.connections[0]?.externalNetworkRequested, false);
  assert.equal(list.data.provenance.databaseReadExecuted, false);
  assert.equal(list.data.provenance.databaseWriteExecuted, false);
  assert.equal(list.data.provenance.externalNetworkRequested, false);
  assert.equal(list.data.provenance.aiProviderRequested, false);
  assert.deepEqual(list.data.provenance.evidenceIds, [
    "evidence:connection-climate-dinner",
    "evidence:connection-storage-pilot",
    "evidence:connection-email-context",
    "evidence:connection-follow-up",
    "evidence:connection-hana-referral",
  ]);

  assert.equal(detail.success, true);
  assert.equal(detail.data.state, "success");
  assert.equal(detail.data.connection?.displayName, "Kenji Watanabe");
  assert.equal(detail.data.evidenceTimeline.length, 4);
  assert.equal(detail.data.sourceLinks.length, 3);
  assert.equal(
    detail.data.connection?.connectionReason,
    "Kenji asked for a storage pilot operator introduction after the climate founders dinner.",
  );
  assert.equal(
    detail.data.provenance.generationMethod,
    "fixture",
  );

  assert.equal(added.success, true);
  assert.equal(added.data.state, "success");
  assert.equal(added.data.connection?.evidenceTimeline.length, 5);
  assert.equal(
    added.data.evidenceTimeline[4]?.title,
    "Operator confirmed warm introduction path",
  );
  assert.equal(
    added.data.addEvidenceSummary,
    "Mock evidence evidence:connection-added-manual-note was attached to Kenji Watanabe without a database write.",
  );
  assert.equal(
    added.data.provenance.generationMethod,
    "rule-based-connection-evidence",
  );
  assert.equal(added.data.provenance.databaseWriteExecuted, false);

  assert.equal(empty.success, true);
  assert.equal(empty.data.state, "empty");
  assert.equal(empty.data.connections.length, 0);
  assert.equal(
    empty.data.nextAction,
    "Add or select a mock connection before reviewing evidence.",
  );

  assert.equal(pending.success, true);
  assert.equal(pending.data.state, "pending");
  assert.equal(pending.data.connection, null);

  assert.equal(failure.success, false);
  assert.equal(failure.error.code, "CONNECTION_EVIDENCE_SERVICE_MOCK_FAILED");
  assert.equal(failure.error.appCode, "SERVICE_UNAVAILABLE");
  assert.equal(unsupportedSource.success, false);
  assert.equal(
    unsupportedSource.error.code,
    "CONNECTION_EVIDENCE_SOURCE_NOT_SUPPORTED",
  );
  assert.equal(pendingAdd.success, false);
  assert.equal(pendingAdd.error.code, "CONNECTION_EVIDENCE_ADD_PENDING");
  assert.equal(invalidBody.success, false);
  assert.equal(invalidBody.error.code, "CONNECTION_EVIDENCE_INVALID_BODY");
  assert.equal(missing.success, false);
  assert.equal(missing.error.code, "CONNECTION_NOT_FOUND");

  assert.deepEqual(fixtures.mockConnectionsListFixture, list.data);
  assert.deepEqual(fixtures.mockConnectionDetailFixture, detail.data);
  assert.deepEqual(fixtures.mockAddedConnectionEvidenceFixture, added.data);
});

test("mock connection evidence service is deterministic with no external provider calls", async () => {
  const serviceModule = await importProjectModule<
    typeof import("../../features/connections/mock-service")
  >("features/connections/mock-service.ts");
  const service = serviceModule.createMockConnectionEvidenceService();
  const addInput = {
    connectionId: "demo-connection-1",
    contribution: "follow_up_signal",
    sourceLabel: "Operator follow-up note",
    sourceType: "manual",
    title: "Operator confirmed warm introduction path",
    excerpt:
      "Kenji wants the storage pilot operator intro before the partner review call.",
  };

  assert.deepEqual(service.listConnections(), service.listConnections());
  assert.deepEqual(
    service.getConnection({ connectionId: "demo-connection-1" }),
    service.getConnection({ connectionId: "demo-connection-1" }),
  );
  assert.deepEqual(service.addEvidence(addInput), service.addEvidence(addInput));
  assert.deepEqual(
    service.listConnections({ scenario: "unknown-scenario" }),
    service.listConnections(),
  );

  const added = service.addEvidence(addInput);

  assert.equal(added.success, true);
  assert.equal(added.data.connection?.databaseWriteExecuted, false);
  assert.equal(added.data.provenance.databaseWriteExecuted, false);
  assert.equal(added.data.provenance.externalNetworkRequested, false);

  for (const filePath of [
    "features/connections/contract.ts",
    "features/connections/fixtures.ts",
    "features/connections/service.ts",
    "features/connections/mock-service.ts",
    "app/api/connections/route.ts",
    "app/api/connections/[id]/route.ts",
    "app/api/connections/[id]/evidence/route.ts",
    "features/connections/connection-and-evidence-service-mock/debug-view.tsx",
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

test("connection evidence API routes return stable envelopes with empty pending and failure paths", async () => {
  const listRoute = await importProjectModule<{
    GET: (request: Request) => Promise<Response>;
  }>("app/api/connections/route.ts");
  const detailRoute = await importProjectModule<{
    GET: (
      request: Request,
      context: { params: Promise<{ id: string }> },
    ) => Promise<Response>;
  }>("app/api/connections/[id]/route.ts");
  const evidenceRoute = await importProjectModule<{
    POST: (
      request: Request,
      context: { params: Promise<{ id: string }> },
    ) => Promise<Response>;
  }>("app/api/connections/[id]/evidence/route.ts");
  const fixtures = await importProjectModule<
    typeof import("../../features/connections/fixtures")
  >("features/connections/fixtures.ts");

  const routeContext = { params: Promise.resolve({ id: "demo-connection-1" }) };
  const listResponse = await listRoute.GET(
    new Request("https://orbit.local/api/connections"),
  );
  const emptyResponse = await listRoute.GET(
    new Request("https://orbit.local/api/connections?scenario=empty"),
  );
  const listFailureResponse = await listRoute.GET(
    new Request("https://orbit.local/api/connections?scenario=failure"),
  );
  const detailResponse = await detailRoute.GET(
    new Request("https://orbit.local/api/connections/demo-connection-1"),
    routeContext,
  );
  const pendingDetailResponse = await detailRoute.GET(
    new Request(
      "https://orbit.local/api/connections/demo-connection-1?scenario=pending",
    ),
    routeContext,
  );
  const missingDetailResponse = await detailRoute.GET(
    new Request("https://orbit.local/api/connections/missing-connection"),
    { params: Promise.resolve({ id: "missing-connection" }) },
  );
  const addEvidenceResponse = await evidenceRoute.POST(
    new Request(
      "https://orbit.local/api/connections/demo-connection-1/evidence",
      {
        body: JSON.stringify({
          contribution: "follow_up_signal",
          occurredAt: "2026-06-25T19:20:00.000Z",
          sourceLabel: "Operator follow-up note",
          sourceType: "manual",
          title: "Operator confirmed warm introduction path",
          excerpt:
            "Kenji wants the storage pilot operator intro before the partner review call.",
        }),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      },
    ),
    routeContext,
  );
  const pendingAddEvidenceResponse = await evidenceRoute.POST(
    new Request(
      "https://orbit.local/api/connections/demo-connection-1/evidence?scenario=pending",
      {
        body: JSON.stringify({ sourceType: "manual" }),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      },
    ),
    routeContext,
  );
  const invalidSourceResponse = await evidenceRoute.POST(
    new Request(
      "https://orbit.local/api/connections/demo-connection-1/evidence",
      {
        body: JSON.stringify({ sourceType: "business_card_ocr" }),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      },
    ),
    routeContext,
  );
  const malformedResponse = await evidenceRoute.POST(
    new Request(
      "https://orbit.local/api/connections/demo-connection-1/evidence",
      {
        body: "{",
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      },
    ),
    routeContext,
  );

  assert.equal(listResponse.status, 200);
  assert.equal(listResponse.headers.get("cache-control"), "no-store");
  assert.equal(listResponse.headers.get("x-orbit-feature-mode"), "mock");
  assert.deepEqual(await listResponse.json(), {
    success: true,
    data: fixtures.mockConnectionsListFixture,
  });

  assert.equal(emptyResponse.status, 200);
  assert.deepEqual(await emptyResponse.json(), {
    success: true,
    data: fixtures.mockEmptyConnectionsListFixture,
  });

  assert.equal(listFailureResponse.status, 503);
  assert.deepEqual(await listFailureResponse.json(), {
    success: false,
    error: {
      code: "SERVICE_UNAVAILABLE",
      message:
        "The mock connection and evidence boundary is pinned to a controlled failure scenario.",
      context: {
        boundary: "developer-admin",
        connectionEvidenceErrorCode: "CONNECTION_EVIDENCE_SERVICE_MOCK_FAILED",
        mode: "mock",
        privacy: "no-relationship-data",
        provenance:
          "Mock connection evidence failure came from deterministic fixture rules.",
        service: "connection-and-evidence-service-mock",
      },
    },
  });

  assert.equal(detailResponse.status, 200);
  assert.deepEqual(await detailResponse.json(), {
    success: true,
    data: fixtures.mockConnectionDetailFixture,
  });

  assert.equal(pendingDetailResponse.status, 200);
  assert.deepEqual(await pendingDetailResponse.json(), {
    success: true,
    data: fixtures.mockPendingConnectionDetailFixture,
  });

  assert.equal(missingDetailResponse.status, 404);
  assert.deepEqual(await missingDetailResponse.json(), {
    success: false,
    error: {
      code: "NOT_FOUND",
      message: "That mock connection is not available in this sprint boundary.",
      context: {
        boundary: "developer-admin",
        connectionEvidenceErrorCode: "CONNECTION_NOT_FOUND",
        mode: "mock",
        privacy: "no-relationship-data",
        provenance:
          "Mock connection evidence failure came from deterministic fixture rules.",
        service: "connection-and-evidence-service-mock",
      },
    },
  });

  assert.equal(addEvidenceResponse.status, 201);
  assert.deepEqual(await addEvidenceResponse.json(), {
    success: true,
    data: fixtures.mockAddedConnectionEvidenceFixture,
  });

  assert.equal(pendingAddEvidenceResponse.status, 409);
  assert.deepEqual(await pendingAddEvidenceResponse.json(), {
    success: false,
    error: {
      code: "CONFLICT",
      message:
        "The mock evidence add request is waiting for fixture review.",
      context: {
        boundary: "developer-admin",
        connectionEvidenceErrorCode: "CONNECTION_EVIDENCE_ADD_PENDING",
        mode: "mock",
        privacy: "no-relationship-data",
        provenance:
          "Mock connection evidence failure came from deterministic fixture rules.",
        service: "connection-and-evidence-service-mock",
      },
    },
  });

  assert.equal(invalidSourceResponse.status, 400);
  assert.deepEqual(await invalidSourceResponse.json(), {
    success: false,
    error: {
      code: "VALIDATION_ERROR",
      message:
        "That mock evidence source link is not supported by this sprint boundary.",
      context: {
        boundary: "developer-admin",
        connectionEvidenceErrorCode:
          "CONNECTION_EVIDENCE_SOURCE_NOT_SUPPORTED",
        mode: "mock",
        privacy: "no-relationship-data",
        provenance:
          "Mock connection evidence failure came from deterministic fixture rules.",
        service: "connection-and-evidence-service-mock",
      },
    },
  });

  assert.equal(malformedResponse.status, 400);
  assert.deepEqual(await malformedResponse.json(), {
    success: false,
    error: {
      code: "VALIDATION_ERROR",
      message: "The mock add-evidence request body must be valid JSON.",
      context: {
        boundary: "developer-admin",
        connectionEvidenceErrorCode: "CONNECTION_EVIDENCE_INVALID_BODY",
        mode: "mock",
        privacy: "no-relationship-data",
        provenance:
          "Mock connection evidence failure came from deterministic fixture rules.",
        service: "connection-and-evidence-service-mock",
      },
    },
  });
});

test("connection evidence debug route renders all states and the live replacement handoff", async () => {
  const debugView = await importProjectModule<
    typeof import("../../features/connections/connection-and-evidence-service-mock/debug-view")
  >("features/connections/connection-and-evidence-service-mock/debug-view.tsx");
  const html = renderToStaticMarkup(
    React.createElement(debugView.ConnectionEvidenceServiceMockDemo),
  );
  const pageSource = readFileSync(
    join(projectRoot, "app/dev/capabilities/[slug]/page.tsx"),
    "utf8",
  );
  const liveDocPath =
    "features/connections/connection-and-evidence-service-mock/LIVE_IMPLEMENTATION.md";
  const liveDoc = readFileSync(join(projectRoot, liveDocPath), "utf8");

  assert.equal(
    debugView.CONNECTION_EVIDENCE_SERVICE_MOCK_SLUG,
    "connection-and-evidence-service-mock",
  );
  assert.match(pageSource, /CONNECTION_EVIDENCE_SERVICE_MOCK_SLUG/);
  assert.match(pageSource, /ConnectionEvidenceServiceMockDemo/);

  assert.match(html, /Connection and evidence service mock/);
  assert.match(html, /aria-label="Connection evidence operator checkpoint"/);
  assert.match(html, /Connection represented/);
  assert.match(html, /Evidence timeline/);
  assert.match(html, /Source links/);
  assert.match(html, /database reads false; database writes false/);
  assert.match(html, /aria-label="Evidence timeline for Kenji Watanabe"/);
  assert.match(html, />Evidence timeline for Kenji Watanabe</);
  assert.match(html, /Source: Climate founders dinner/);
  assert.match(html, /Evidence: evidence:connection-climate-dinner/);
  assert.match(html, /Success state/);
  assert.match(html, /Empty state/);
  assert.match(html, /Pending state/);
  assert.match(html, /Failure state/);
  assert.match(html, /Kenji Watanabe/);
  assert.match(html, /Operator confirmed warm introduction path/);
  assert.match(html, /CONNECTION_EVIDENCE_SERVICE_MOCK_FAILED/);
  assert.match(html, /GET \/api\/connections/);
  assert.match(html, /GET \/api\/connections\/demo-connection-1/);
  assert.match(html, /POST \/api\/connections\/demo-connection-1\/evidence/);
  assert.match(html, /GET \/api\/connections\?scenario=empty/);
  assert.match(html, /GET \/api\/connections\/demo-connection-1\?scenario=pending/);
  assert.match(html, new RegExp(liveDocPath));
  assert.match(html, /ORBIT_CONNECTION_EVIDENCE_PROVIDER/);
  assert.match(html, /connection-evidence-workbench/);
  assert.match(html, /malformed add-evidence bodies/);
  assert.match(
    html,
    /\.connection-evidence-workbench\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)/,
  );

  assert.match(
    liveDoc,
    /features\/connections\/connection-and-evidence-service-mock\/live-service\.ts/,
  );
  assert.match(
    liveDoc,
    /features\/connections\/connection-and-evidence-service-mock\/providers\//,
  );
  assert.match(liveDoc, /ORBIT_CONNECTION_EVIDENCE_PROVIDER/);
  assert.match(liveDoc, /connection persistence service/);
  assert.match(liveDoc, /evidence store/);
  assert.match(liveDoc, /privacy/);
  assert.match(liveDoc, /provenance/);
  assert.match(liveDoc, /add-evidence success and controlled failure response previews/);
  assert.match(liveDoc, /replacement tests/i);
});

test("connection evidence debug route exposes deterministic add evidence response previews", async () => {
  const debugView = await importProjectModule<
    typeof import("../../features/connections/connection-and-evidence-service-mock/debug-view")
  >("features/connections/connection-and-evidence-service-mock/debug-view.tsx");
  const html = renderToStaticMarkup(
    React.createElement(debugView.ConnectionEvidenceServiceMockDemo),
  );

  assert.match(
    html,
    /aria-label="Deterministic add-evidence response previews"/,
  );
  assert.match(html, /Add-evidence success envelope/);
  assert.match(html, /status 201/);
  assert.match(html, /Mock evidence evidence:connection-added-manual-note/);
  assert.match(html, /Add-evidence controlled failure envelope/);
  assert.match(html, /status 409/);
  assert.match(html, /CONNECTION_EVIDENCE_ADD_PENDING/);
  assert.match(html, /connectionEvidenceErrorCode/);
});
