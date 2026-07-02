import assert from "node:assert/strict";
import test from "node:test";

import { createLiveRelationshipNaturalSearchService } from "../../features/search/live-service";
import {
  createRelationshipNaturalSearchService,
  resolveRelationshipNaturalSearchService,
} from "../../features/search/service-factory";
import { createStorageConnectionEvidenceProvider } from "../../features/connections/storage/connection-live-record-provider";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";
import { seedGeneratedRelationshipFixturesIntoLiveStore } from "../../shared/storage/seed-generated-fixtures";

test("live relationship natural search reads generated relationship graph from shared live storage", async () => {
  const workspaceId = "workspace:relationship-search-live-store-test";
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();

  await seedGeneratedRelationshipFixturesIntoLiveStore({
    now: () => "2026-07-01T18:00:00.000Z",
    store,
    workspaceId,
  });

  const provider = createStorageConnectionEvidenceProvider({
    sourceLabel: "Relationship search memory live storage",
    store,
    workspaceId,
  });
  const service = createLiveRelationshipNaturalSearchService({
    provider,
  });

  const result = await service.queryRelationships({
    followUpStatusFilters: ["needs_follow_up"],
    industryFilters: ["enterprise_saas"],
    query: "Japan market entry advisor China SaaS sales",
    sourceFilters: ["manual"],
    valueTypeFilters: ["knowledge_exchange"],
  });

  assert.equal(result.success, true);
  assert.equal(result.data.provenance.source, `live-record-store:relationship-search:${workspaceId}`);
  assert.equal(result.data.provenance.sourceLabel, "Relationship search memory live storage");
  assert.equal(result.data.provenance.privacy, "live-relationship-natural-search");
  assert.equal(result.data.provenance.generationMethod, "live-store-query");
  assert.equal(result.data.provenance.databaseQueryExecuted, true);
  assert.equal(result.data.provenance.databaseWriteExecuted, false);
  assert.equal(result.data.provenance.semanticSearchExecuted, false);
  assert.equal(result.data.provenance.aiProviderRequested, false);

  const sato = result.data.results.find(
    (item) => item.id === "relationship-search-result:connection_0012",
  );

  assert.ok(sato);
  assert.equal(sato.contactId, "contact_001");
  assert.equal(sato.displayName, "佐藤 健一");
  assert.equal(sato.organization, "North Star Foods");
  assert.equal(sato.industry, "enterprise_saas");
  assert.equal(sato.followUpStatus, "needs_follow_up");
  assert.deepEqual(sato.value.valueTypes, [
    "knowledge_exchange",
    "community_context",
  ]);
  assert.equal(sato.source.type, "manual");
  assert.equal(sato.source.evidenceId, "evidence:connection:0012");
  assert.equal(sato.databaseQueryExecuted, true);
  assert.equal(sato.semanticSearchExecuted, false);
  assert.match(sato.relationshipContext, /Japan market entry advisor/);
  assert.match(sato.evidence[0]?.excerpt ?? "", /Relationship context for 佐藤 健一/);
});

test("relationship natural search factory registers live mode and fails closed without live database config", async () => {
  const previousDatabaseUrl = process.env.ORBIT_DATABASE_URL;
  const previousEventDatabaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;
  const previousLiveDatabaseUrl = process.env.ORBIT_LIVE_DATABASE_URL;

  try {
    delete process.env.ORBIT_DATABASE_URL;
    delete process.env.ORBIT_EVENT_DATABASE_URL;
    delete process.env.ORBIT_LIVE_DATABASE_URL;

    const liveResolution = resolveRelationshipNaturalSearchService("live");
    const liveService = createRelationshipNaturalSearchService("live");
    const result = await liveService.queryRelationships({
      query: "Japan market entry advisor",
    });

    assert.equal(liveResolution.success, true);
    assert.equal(result.success, false);

    if (!result.success) {
      assert.equal(
        result.error.code,
        "RELATIONSHIP_NATURAL_SEARCH_LIVE_STORE_UNCONFIGURED",
      );
      assert.equal(result.error.provenance.databaseQueryExecuted, false);
      assert.equal(result.error.provenance.generationMethod, "live-store-query");
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
