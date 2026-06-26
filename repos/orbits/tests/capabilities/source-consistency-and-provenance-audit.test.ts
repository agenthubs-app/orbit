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
    `${pathFromRoot} must exist for the source consistency and provenance audit sprint`,
  );

  return (await import(pathToFileURL(absolutePath).href)) as TModule;
}

test("source consistency provenance audit contract exports typed fixtures service and errors", async () => {
  const contract = await importProjectModule<{
    SOURCE_CONSISTENCY_PROVENANCE_AUDIT_ENTITY_KINDS: readonly string[];
    SOURCE_CONSISTENCY_PROVENANCE_AUDIT_ERROR_CODES: readonly string[];
    SOURCE_CONSISTENCY_PROVENANCE_AUDIT_ERROR_DEFINITIONS: Record<
      string,
      { appCode: string; message: string; recovery: string }
    >;
    SOURCE_CONSISTENCY_PROVENANCE_AUDIT_FIXTURE_SOURCE: string;
    mockSourceConsistencyProvenanceAuditFixture: {
      state: string;
      auditedCollections: readonly Array<{
        entityKind: string;
        auditedCount: number;
        inconsistentCount: number;
        sourceConsistent: boolean;
        provenanceComplete: boolean;
        evidenceIds: readonly string[];
      }>;
      findings: readonly Array<{
        findingId: string;
        entityKind: string;
        severity: string;
        ruleId: string;
        sourceConsistent: boolean;
        provenanceComplete: boolean;
        evidenceIds: readonly string[];
      }>;
      activeFindingCount: number;
      provenance: {
        source: string;
        generationMethod: string;
        complianceReportingExecuted: false;
        productionAuditStorageWriteExecuted: false;
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
    mockSourceConsistencyProvenanceAuditRunFixture: {
      state: string;
      runId: string;
      scannedEntityKinds: readonly string[];
      generatedFindingIds: readonly string[];
      activeFindingCount: number;
      complianceReportPersisted: false;
      productionAuditStorageWritten: false;
      provenance: { generationMethod: string };
    };
    mockEmptySourceConsistencyProvenanceAuditFixture: {
      state: string;
      auditedCollections: readonly unknown[];
      findings: readonly unknown[];
      nextAction: string;
    };
    mockPendingSourceConsistencyProvenanceAuditFixture: {
      state: string;
      auditedCollections: readonly unknown[];
      findings: readonly unknown[];
      nextAction: string;
    };
  }>("features/audit/provenance-contract.ts");
  const contractSource = readFileSync(
    join(projectRoot, "features/audit/provenance-contract.ts"),
    "utf8",
  );

  assert.match(contractSource, /interface SourceConsistencyProvenanceAuditService/);
  assert.match(contractSource, /getAuditSnapshot/);
  assert.match(contractSource, /runAudit/);
  assert.deepEqual(
    contract.SOURCE_CONSISTENCY_PROVENANCE_AUDIT_ENTITY_KINDS,
    [
      "contact",
      "connection",
      "evidence",
      "recommendation",
      "task",
      "chat_summary",
      "agent_action",
    ],
  );
  assert.deepEqual(contract.SOURCE_CONSISTENCY_PROVENANCE_AUDIT_ERROR_CODES, [
    "SOURCE_CONSISTENCY_PROVENANCE_AUDIT_MOCK_FAILED",
  ]);
  assert.equal(
    contract.SOURCE_CONSISTENCY_PROVENANCE_AUDIT_ERROR_DEFINITIONS
      .SOURCE_CONSISTENCY_PROVENANCE_AUDIT_MOCK_FAILED.appCode,
    "SERVICE_UNAVAILABLE",
  );
  assert.match(
    contract.SOURCE_CONSISTENCY_PROVENANCE_AUDIT_ERROR_DEFINITIONS
      .SOURCE_CONSISTENCY_PROVENANCE_AUDIT_MOCK_FAILED.recovery,
    /source consistency and provenance audit mock/i,
  );
  assert.equal(
    contract.SOURCE_CONSISTENCY_PROVENANCE_AUDIT_FIXTURE_SOURCE,
    "fixture:features/audit/provenance-contract.ts",
  );

  assert.equal(
    contract.mockSourceConsistencyProvenanceAuditFixture.state,
    "success",
  );
  assert.deepEqual(
    contract.mockSourceConsistencyProvenanceAuditFixture.auditedCollections.map(
      (collection) => collection.entityKind,
    ),
    contract.SOURCE_CONSISTENCY_PROVENANCE_AUDIT_ENTITY_KINDS,
  );
  assert.equal(contract.mockSourceConsistencyProvenanceAuditFixture.activeFindingCount, 0);
  assert.deepEqual(contract.mockSourceConsistencyProvenanceAuditFixture.findings, []);
  for (const collection of contract.mockSourceConsistencyProvenanceAuditFixture
    .auditedCollections) {
    assert.equal(collection.inconsistentCount, 0, collection.entityKind);
    assert.equal(collection.sourceConsistent, true, collection.entityKind);
    assert.equal(collection.provenanceComplete, true, collection.entityKind);
  }
  assert.equal(
    contract.mockSourceConsistencyProvenanceAuditFixture.provenance.source,
    contract.SOURCE_CONSISTENCY_PROVENANCE_AUDIT_FIXTURE_SOURCE,
  );
  assert.equal(
    contract.mockSourceConsistencyProvenanceAuditFixture.provenance
      .generationMethod,
    "fixture",
  );
  assert.equal(
    contract.mockSourceConsistencyProvenanceAuditFixture.provenance
      .complianceReportingExecuted,
    false,
  );
  assert.equal(
    contract.mockSourceConsistencyProvenanceAuditFixture.provenance
      .productionAuditStorageWriteExecuted,
    false,
  );
  assert.equal(
    contract.mockSourceConsistencyProvenanceAuditFixture.provenance
      .externalNetworkRequested,
    false,
  );
  assert.equal(
    contract.mockSourceConsistencyProvenanceAuditFixture.provenance
      .databaseReadExecuted,
    false,
  );
  assert.equal(
    contract.mockSourceConsistencyProvenanceAuditFixture.provenance
      .databaseWriteExecuted,
    false,
  );
  assert.equal(
    contract.mockSourceConsistencyProvenanceAuditFixture.provenance
      .aiProviderRequested,
    false,
  );
  assert.equal(
    contract.mockSourceConsistencyProvenanceAuditFixture.provenance
      .calendarProviderRequested,
    false,
  );
  assert.equal(
    contract.mockSourceConsistencyProvenanceAuditFixture.provenance
      .emailProviderRequested,
    false,
  );
  assert.equal(
    contract.mockSourceConsistencyProvenanceAuditFixture.provenance
      .notificationProviderRequested,
    false,
  );
  assert.equal(
    contract.mockSourceConsistencyProvenanceAuditFixture.provenance
      .deviceRequested,
    false,
  );
  assert.equal(
    contract.mockSourceConsistencyProvenanceAuditRunFixture.state,
    "success",
  );
  assert.equal(
    contract.mockSourceConsistencyProvenanceAuditRunFixture
      .complianceReportPersisted,
    false,
  );
  assert.equal(
    contract.mockSourceConsistencyProvenanceAuditRunFixture.activeFindingCount,
    0,
  );
  assert.deepEqual(
    contract.mockSourceConsistencyProvenanceAuditRunFixture.generatedFindingIds,
    [],
  );
  assert.equal(
    contract.mockSourceConsistencyProvenanceAuditRunFixture
      .productionAuditStorageWritten,
    false,
  );
  assert.equal(
    contract.mockSourceConsistencyProvenanceAuditRunFixture.provenance
      .generationMethod,
    "rule-based-audit-run",
  );
  assert.equal(
    contract.mockEmptySourceConsistencyProvenanceAuditFixture.state,
    "empty",
  );
  assert.equal(
    contract.mockEmptySourceConsistencyProvenanceAuditFixture
      .auditedCollections.length,
    0,
  );
  assert.match(
    contract.mockEmptySourceConsistencyProvenanceAuditFixture.nextAction,
    /Add source-backed Orbit records/i,
  );
  assert.equal(
    contract.mockPendingSourceConsistencyProvenanceAuditFixture.state,
    "pending",
  );
});

test("mock source consistency provenance audit service is deterministic and provider-free", async () => {
  const serviceModule = await importProjectModule<{
    createMockSourceConsistencyProvenanceAuditService: () => {
      getAuditSnapshot: (input?: { scenario?: string | null }) => {
        success: boolean;
        data?: {
          state: string;
          auditedCollections: readonly unknown[];
          findings: readonly unknown[];
          provenance: {
            complianceReportingExecuted: false;
            productionAuditStorageWriteExecuted: false;
            externalNetworkRequested: false;
            databaseReadExecuted: false;
            databaseWriteExecuted: false;
            aiProviderRequested: false;
          };
        };
        error?: { code: string; appCode: string };
      };
      runAudit: (input?: { scenario?: string | null }) => {
        success: boolean;
        data?: {
          state: string;
          generatedFindingIds: readonly string[];
          activeFindingCount: number;
          complianceReportPersisted: false;
          productionAuditStorageWritten: false;
          provenance: { generationMethod: string };
        };
        error?: { code: string; appCode: string };
      };
    };
  }>("features/audit/mock-provenance-audit-service.ts");

  const service = serviceModule.createMockSourceConsistencyProvenanceAuditService();
  const success = service.getAuditSnapshot();
  const run = service.runAudit();
  const empty = service.getAuditSnapshot({ scenario: "empty" });
  const pending = service.runAudit({ scenario: "pending" });
  const failure = service.getAuditSnapshot({ scenario: "failure" });

  assert.deepEqual(service.getAuditSnapshot(), service.getAuditSnapshot());
  assert.deepEqual(service.runAudit(), service.runAudit());
  assert.equal(success.success, true);
  assert.equal(success.data?.state, "success");
  assert.equal(success.data?.auditedCollections.length, 7);
  assert.equal(success.data?.activeFindingCount, 0);
  assert.equal(success.data?.findings.length, 0);
  assert.equal(
    success.data?.provenance.complianceReportingExecuted,
    false,
  );
  assert.equal(
    success.data?.provenance.productionAuditStorageWriteExecuted,
    false,
  );
  assert.equal(success.data?.provenance.externalNetworkRequested, false);
  assert.equal(success.data?.provenance.databaseReadExecuted, false);
  assert.equal(success.data?.provenance.databaseWriteExecuted, false);
  assert.equal(success.data?.provenance.aiProviderRequested, false);
  assert.equal(run.success, true);
  assert.equal(run.data?.state, "success");
  assert.equal(run.data?.activeFindingCount, 0);
  assert.deepEqual(run.data?.generatedFindingIds, []);
  assert.equal(run.data?.complianceReportPersisted, false);
  assert.equal(run.data?.productionAuditStorageWritten, false);
  assert.equal(run.data?.provenance.generationMethod, "rule-based-audit-run");
  assert.equal(empty.success, true);
  assert.equal(empty.data?.state, "empty");
  assert.equal(pending.success, true);
  assert.equal(pending.data?.state, "pending");
  assert.equal(failure.success, false);
  assert.equal(
    failure.error?.code,
    "SOURCE_CONSISTENCY_PROVENANCE_AUDIT_MOCK_FAILED",
  );
  assert.equal(failure.error?.appCode, "SERVICE_UNAVAILABLE");

  for (const filePath of [
    "features/audit/provenance-contract.ts",
    "features/audit/mock-provenance-audit-service.ts",
    "app/api/audit/provenance/route.ts",
    "app/api/audit/provenance/run/route.ts",
    "features/audit/source-consistency-and-provenance-audit/debug-view.tsx",
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

test("source consistency provenance audit API routes return stable envelopes with empty pending and failure paths", async () => {
  const auditRoute = await importProjectModule<{
    GET: (request: Request) => Promise<Response>;
  }>("app/api/audit/provenance/route.ts");
  const runRoute = await importProjectModule<{
    POST: (request: Request) => Promise<Response>;
  }>("app/api/audit/provenance/run/route.ts");
  const contract = await importProjectModule<{
    mockSourceConsistencyProvenanceAuditFixture: unknown;
    mockSourceConsistencyProvenanceAuditRunFixture: unknown;
    mockEmptySourceConsistencyProvenanceAuditFixture: unknown;
    mockPendingSourceConsistencyProvenanceAuditRunFixture: unknown;
  }>("features/audit/provenance-contract.ts");

  const auditResponse = await auditRoute.GET(
    new Request("https://orbit.local/api/audit/provenance"),
  );
  const runResponse = await runRoute.POST(
    new Request("https://orbit.local/api/audit/provenance/run", {
      method: "POST",
    }),
  );
  const emptyResponse = await auditRoute.GET(
    new Request("https://orbit.local/api/audit/provenance?scenario=empty"),
  );
  const pendingResponse = await runRoute.POST(
    new Request(
      "https://orbit.local/api/audit/provenance/run?scenario=pending",
      { method: "POST" },
    ),
  );
  const failureResponse = await runRoute.POST(
    new Request(
      "https://orbit.local/api/audit/provenance/run?scenario=failure",
      { method: "POST" },
    ),
  );

  assert.equal(auditResponse.status, 200);
  assert.equal(auditResponse.headers.get("cache-control"), "no-store");
  assert.equal(auditResponse.headers.get("x-orbit-feature-mode"), "mock");
  assert.deepEqual(await auditResponse.json(), {
    success: true,
    data: contract.mockSourceConsistencyProvenanceAuditFixture,
  });

  assert.equal(runResponse.status, 200);
  assert.deepEqual(await runResponse.json(), {
    success: true,
    data: contract.mockSourceConsistencyProvenanceAuditRunFixture,
  });

  assert.equal(emptyResponse.status, 200);
  assert.deepEqual(await emptyResponse.json(), {
    success: true,
    data: contract.mockEmptySourceConsistencyProvenanceAuditFixture,
  });

  assert.equal(pendingResponse.status, 200);
  assert.deepEqual(await pendingResponse.json(), {
    success: true,
    data: contract.mockPendingSourceConsistencyProvenanceAuditRunFixture,
  });

  assert.equal(failureResponse.status, 503);
  assert.deepEqual(await failureResponse.json(), {
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

test("source consistency provenance audit debug route renders all states and live replacement handoff", async () => {
  const debugView = await importProjectModule<{
    SOURCE_CONSISTENCY_PROVENANCE_AUDIT_SLUG: string;
    SourceConsistencyProvenanceAuditDemo: React.ComponentType;
  }>(
    "features/audit/source-consistency-and-provenance-audit/debug-view.tsx",
  );
  const html = renderToStaticMarkup(
    React.createElement(debugView.SourceConsistencyProvenanceAuditDemo),
  );
  const pageSource = readFileSync(
    join(projectRoot, "app/dev/capabilities/[slug]/page.tsx"),
    "utf8",
  );
  const liveDocPath =
    "features/audit/source-consistency-and-provenance-audit/LIVE_IMPLEMENTATION.md";
  const liveDoc = readFileSync(join(projectRoot, liveDocPath), "utf8");

  assert.equal(
    debugView.SOURCE_CONSISTENCY_PROVENANCE_AUDIT_SLUG,
    "source-consistency-and-provenance-audit",
  );
  assert.match(pageSource, /SOURCE_CONSISTENCY_PROVENANCE_AUDIT_SLUG/);
  assert.match(pageSource, /SourceConsistencyProvenanceAuditDemo/);

  assert.match(html, /Source consistency and provenance audit/);
  assert.match(
    html,
    /aria-label="Source consistency provenance audit operator checkpoint"/,
  );
  assert.match(html, /Audit result: completed with zero active findings\./);
  assert.match(html, /Audited collections/);
  assert.match(html, /Audit findings/);
  assert.match(html, /contact/);
  assert.match(html, /connection/);
  assert.match(html, /evidence/);
  assert.match(html, /recommendation/);
  assert.match(html, /task/);
  assert.match(html, /chat_summary/);
  assert.match(html, /agent_action/);
  assert.match(html, /compliance reporting false/);
  assert.match(html, /production audit storage false/);
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
  assert.match(html, /SOURCE_CONSISTENCY_PROVENANCE_AUDIT_MOCK_FAILED/);
  assert.match(html, /No active provenance findings remain in the mock MVP loop/);
  assert.doesNotMatch(html, /Recommendation references a source bundle/);
  assert.doesNotMatch(html, /Task source timestamp is older than the linked evidence/);
  assert.doesNotMatch(html, /Agent action is waiting for confirmation provenance/);
  assert.match(html, /GET \/api\/audit\/provenance/);
  assert.match(html, /POST \/api\/audit\/provenance\/run/);
  assert.match(html, /GET \/api\/audit\/provenance\?scenario=empty/);
  assert.match(
    html,
    /POST \/api\/audit\/provenance\/run\?scenario=pending/,
  );
  assert.match(
    html,
    /aria-label="Source consistency provenance audit scenario exercise controls"/,
  );
  assert.match(html, /href="\/api\/audit\/provenance\?scenario=empty"/);
  assert.match(
    html,
    /action="\/api\/audit\/provenance\/run\?scenario=pending"/,
  );
  assert.match(
    html,
    /action="\/api\/audit\/provenance\/run\?scenario=failure"/,
  );
  assert.match(html, new RegExp(liveDocPath));
  assert.match(html, /ORBIT_SOURCE_PROVENANCE_AUDIT_PROVIDER/);
  assert.match(html, /source-consistency-provenance-audit-workbench/);
  assert.match(
    html,
    /\.source-consistency-provenance-audit-workbench\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)/,
  );

  assert.match(
    liveDoc,
    /features\/audit\/source-consistency-and-provenance-audit\/live-service\.ts/,
  );
  assert.match(
    liveDoc,
    /features\/audit\/source-consistency-and-provenance-audit\/service-factory\.ts/,
  );
  assert.match(
    liveDoc,
    /features\/audit\/source-consistency-and-provenance-audit\/providers\//,
  );
  assert.match(liveDoc, /ORBIT_SOURCE_PROVENANCE_AUDIT_PROVIDER/);
  assert.match(liveDoc, /ORBIT_AUDIT_DATABASE_URL/);
  assert.match(liveDoc, /ORBIT_COMPLIANCE_REPORTING_ENDPOINT/);
  assert.match(liveDoc, /database read permission/i);
  assert.match(liveDoc, /compliance reporting permission/i);
  assert.match(liveDoc, /contacts, connections, evidence, recommendations, tasks, chat summaries, and agent actions/i);
  assert.match(liveDoc, /privacy/i);
  assert.match(liveDoc, /provenance/i);
  assert.match(liveDoc, /empty/i);
  assert.match(liveDoc, /pending/i);
  assert.match(liveDoc, /controlled failure/i);
  assert.match(liveDoc, /replacement tests/i);
});
