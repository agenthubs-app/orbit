import assert from "node:assert/strict";
import test from "node:test";

import { createLiveSourceConsistencyProvenanceAuditService } from "../../features/audit/live-provenance-audit-service";
import { createStorageSourceConsistencyProvenanceAuditProvider } from "../../features/audit/storage/source-consistency-provenance-audit-live-record-provider";
import {
  createSourceConsistencyProvenanceAuditService,
  resolveSourceConsistencyProvenanceAuditService,
} from "../../features/audit/service-factory";
import { defaultMockFixtures } from "../../shared/mock/fixtures";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";
import { seedGeneratedRelationshipFixturesIntoLiveStore } from "../../shared/storage/seed-generated-fixtures";

test("live source consistency provenance audit reads seeded live records without audit writes", async () => {
  const workspaceId = "workspace:source-consistency-live-store-test";
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();

  await seedGeneratedRelationshipFixturesIntoLiveStore({
    store,
    workspaceId,
  });

  const service = createLiveSourceConsistencyProvenanceAuditService({
    provider: createStorageSourceConsistencyProvenanceAuditProvider({
      sourceLabel: "Source consistency memory live storage",
      store,
      workspaceId,
    }),
  });

  const snapshot = await service.getAuditSnapshot();
  const run = await service.runAudit();

  assert.equal(snapshot.success, true);
  assert.equal(run.success, true);

  if (!snapshot.success || !run.success) {
    return;
  }

  assert.equal(snapshot.data.state, "success");
  assert.equal(snapshot.data.activeFindingCount, 0);
  assert.equal(snapshot.data.findings.length, 0);
  assert.equal(snapshot.data.auditedCollections.length, 7);
  assert.equal(
    snapshot.data.provenance.source,
    `live-record-store:source-consistency-provenance-audit:${workspaceId}`,
  );
  assert.equal(
    snapshot.data.provenance.sourceLabel,
    "Source consistency memory live storage",
  );
  assert.equal(
    snapshot.data.provenance.privacy,
    "live-source-consistency-provenance-audit",
  );
  assert.equal(snapshot.data.provenance.generationMethod, "live-store-query");
  assert.equal(snapshot.data.provenance.databaseReadExecuted, true);
  assert.equal(snapshot.data.provenance.databaseWriteExecuted, false);
  assert.equal(
    snapshot.data.provenance.productionAuditStorageWriteExecuted,
    false,
  );
  assert.equal(snapshot.data.provenance.complianceReportingExecuted, false);
  assert.equal(snapshot.data.provenance.externalNetworkRequested, false);
  assert.equal(snapshot.data.provenance.aiProviderRequested, false);

  const contactCollection = snapshot.data.auditedCollections.find(
    (collection) => collection.entityKind === "contact",
  );
  const recommendationCollection = snapshot.data.auditedCollections.find(
    (collection) => collection.entityKind === "recommendation",
  );
  const chatSummaryCollection = snapshot.data.auditedCollections.find(
    (collection) => collection.entityKind === "chat_summary",
  );

  assert.equal(contactCollection?.auditedCount, defaultMockFixtures.contacts.length);
  assert.equal(
    recommendationCollection?.auditedCount,
    defaultMockFixtures.matchRecommendations.length,
  );
  assert.equal(
    chatSummaryCollection?.auditedCount,
    defaultMockFixtures.conversations.length,
  );
  assert.equal(contactCollection?.sourceConsistent, true);
  assert.equal(contactCollection?.provenanceComplete, true);
  assert.equal(
    contactCollection?.sourceRefs[0]?.generatedBy,
    "live-store-query",
  );

  assert.equal(run.data.state, "success");
  assert.equal(run.data.activeFindingCount, 0);
  assert.deepEqual(run.data.generatedFindingIds, []);
  assert.equal(
    run.data.evaluatedRecordCount,
    snapshot.data.auditedCollections.reduce(
      (total, collection) => total + collection.auditedCount,
      0,
    ),
  );
  assert.equal(run.data.complianceReportPersisted, false);
  assert.equal(run.data.productionAuditStorageWritten, false);
  assert.equal(run.data.provenance.generationMethod, "live-audit-run");
  assert.equal(run.data.provenance.databaseReadExecuted, true);
  assert.equal(run.data.provenance.databaseWriteExecuted, false);
});

test("source consistency provenance audit factory registers live mode and fails closed without database config", async () => {
  const previousDatabaseUrl = process.env.ORBIT_DATABASE_URL;
  const previousEventDatabaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;
  const previousLiveDatabaseUrl = process.env.ORBIT_LIVE_DATABASE_URL;

  try {
    delete process.env.ORBIT_DATABASE_URL;
    delete process.env.ORBIT_EVENT_DATABASE_URL;
    delete process.env.ORBIT_LIVE_DATABASE_URL;

    const resolution = resolveSourceConsistencyProvenanceAuditService("live");
    const service = createSourceConsistencyProvenanceAuditService("live");
    const result = await service.getAuditSnapshot();

    assert.equal(resolution.success, true);
    assert.equal(result.success, false);

    if (!result.success) {
      assert.equal(
        result.error.code,
        "SOURCE_CONSISTENCY_PROVENANCE_AUDIT_LIVE_STORE_UNCONFIGURED",
      );
      assert.equal(result.error.provenance.databaseReadExecuted, false);
      assert.equal(result.error.provenance.databaseWriteExecuted, false);
    }
  } finally {
    if (previousDatabaseUrl === undefined) {
      delete process.env.ORBIT_DATABASE_URL;
    } else {
      process.env.ORBIT_DATABASE_URL = previousDatabaseUrl;
    }

    if (previousEventDatabaseUrl === undefined) {
      delete process.env.ORBIT_EVENT_DATABASE_URL;
    } else {
      process.env.ORBIT_EVENT_DATABASE_URL = previousEventDatabaseUrl;
    }

    if (previousLiveDatabaseUrl === undefined) {
      delete process.env.ORBIT_LIVE_DATABASE_URL;
    } else {
      process.env.ORBIT_LIVE_DATABASE_URL = previousLiveDatabaseUrl;
    }
  }
});
