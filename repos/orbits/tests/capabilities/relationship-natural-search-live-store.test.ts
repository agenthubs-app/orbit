import assert from "node:assert/strict";
import test from "node:test";

import {
  createActorScopedLiveRelationshipNaturalSearchService,
  createLiveRelationshipNaturalSearchService,
} from "../../features/search/live-service";
import {
  createRelationshipNaturalSearchService,
  resolveRelationshipNaturalSearchService,
} from "../../features/search/service-factory";
import { createStorageConnectionEvidenceProvider } from "../../features/connections/storage/connection-live-record-provider";
import { createStorageContactGraphProvider } from "../../features/contacts/storage/contact-live-record-provider";
import { defaultMockFixtures } from "../../shared/mock/fixtures";
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

  const expectedContact = defaultMockFixtures.contacts.find(
    (contact) => contact.id === "contact_012",
  );
  assert.ok(expectedContact);

  const result = await service.queryRelationships({
    followUpStatusFilters: ["needs_follow_up"],
    industryFilters: ["enterprise_saas"],
    query: "中国 SaaS 销售进入日本市场的顾问",
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

  const matchingAdvisor = result.data.results.find(
    (item) => item.contactId === "contact_012",
  );

  assert.ok(matchingAdvisor);
  assert.equal(matchingAdvisor.contactId, "contact_012");
  assert.equal(matchingAdvisor.displayName, expectedContact.displayName);
  assert.equal(matchingAdvisor.organization, expectedContact.organization);
  assert.equal(matchingAdvisor.industry, "enterprise_saas");
  assert.equal(matchingAdvisor.followUpStatus, "needs_follow_up");
  assert.deepEqual(matchingAdvisor.value.valueTypes, [
    "knowledge_exchange",
    "community_context",
  ]);
  assert.equal(matchingAdvisor.source.type, "manual");
  assert.match(matchingAdvisor.source.evidenceId, /^evidence:connection:/);
  assert.equal(matchingAdvisor.databaseQueryExecuted, true);
  assert.equal(matchingAdvisor.semanticSearchExecuted, false);
  assert.ok(
    matchingAdvisor.relationshipContext.includes(expectedContact.displayName),
  );
  assert.match(matchingAdvisor.relationshipContext, /中国\s*SaaS/);
  assert.match(
    matchingAdvisor.evidence[0]?.excerpt ?? "",
    new RegExp(expectedContact.displayName),
  );
  assert.match(matchingAdvisor.evidence[0]?.excerpt ?? "", /中国\s*SaaS/);

  const chineseNameResult = await service.queryRelationships({
    query: defaultMockFixtures.contacts[0]?.displayName,
  });
  const chineseContextResult = await service.queryRelationships({
    query: "日本市场顾问",
  });
  const chineseNonsenseResult = await service.queryRelationships({
    query: "火星量子医疗不存在",
  });

  assert.equal(chineseNameResult.success, true);
  assert.deepEqual(
    chineseNameResult.data.results.map((item) => item.contactId),
    ["contact_001"],
  );
  assert.equal(chineseContextResult.success, true);
  assert.ok(
    chineseContextResult.data.results.length > 0,
    "Chinese relationship context must be searchable",
  );
  assert.equal(chineseNonsenseResult.success, true);
  assert.deepEqual(
    chineseNonsenseResult.data.results,
    [],
    "A non-empty unmatched Chinese query must never degrade into an unfiltered list",
  );
});

test("actor-scoped relationship search never returns another actor's graph", async () => {
  const workspaceId = "workspace:relationship-search-actor-boundary";
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  await seedGeneratedRelationshipFixturesIntoLiveStore({ store, workspaceId });
  const provider = createStorageContactGraphProvider({ store, workspaceId });
  const ownerService = createActorScopedLiveRelationshipNaturalSearchService({
    actorId: "account_orbit_generated",
    provider,
  });
  const otherService = createActorScopedLiveRelationshipNaturalSearchService({
    actorId: "account:other",
    provider,
  });

  const ownerResult = await ownerService.queryRelationships({});
  const otherResult = await otherService.queryRelationships({});
  const ownerSuggestions = await ownerService.getSearchSuggestions({});
  const otherSuggestions = await otherService.getSearchSuggestions({});

  assert.equal(ownerResult.success, true);
  assert.ok(ownerResult.data.results.length > 0);
  assert.equal(ownerSuggestions.success, true);
  assert.ok(ownerSuggestions.data.suggestions.length > 0);
  assert.equal(otherResult.success, true);
  assert.deepEqual(otherResult.data.results, []);
  assert.equal(otherSuggestions.success, true);
  assert.deepEqual(otherSuggestions.data.suggestions, []);
  assert.equal(otherSuggestions.data.state, "empty");
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
