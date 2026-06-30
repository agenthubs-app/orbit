/**
 * 自然语言关系搜索 mock 的契约测试。
 *
 * 锁住 query/filter 结果、搜索建议和不访问真实索引的边界。
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
    `${pathFromRoot} must exist for the relationship natural search mock sprint`,
  );

  return (await import(pathToFileURL(absolutePath).href)) as TModule;
}

test("relationship natural search contract exposes typed filters fixtures service and errors", async () => {
  const contract = await importProjectModule<
    typeof import("../../features/search/contract")
  >("features/search/contract.ts");
  const fixtures = await importProjectModule<
    typeof import("../../features/search/fixtures")
  >("features/search/fixtures.ts");
  const serviceModule = await importProjectModule<
    typeof import("../../features/search/mock-service")
  >("features/search/mock-service.ts");

  const service = serviceModule.createMockRelationshipNaturalSearchService();
  const success = service.queryRelationships();
  const intentFiltered = service.queryRelationships({
    businessIntent: "find_warm_intro",
  });
  const industryFiltered = service.queryRelationships({
    industryFilters: ["climate"],
  });
  const sourceFiltered = service.queryRelationships({
    sourceFilters: ["event_import"],
  });
  const valueFiltered = service.queryRelationships({
    valueTypeFilters: ["strategic_intro"],
  });
  const followUpFiltered = service.queryRelationships({
    followUpStatusFilters: ["needs_follow_up"],
  });
  const textSearch = service.queryRelationships({
    query: "pilot operator intro",
  });
  const empty = service.queryRelationships({ scenario: "empty" });
  const pending = service.queryRelationships({ scenario: "pending" });
  const failure = service.queryRelationships({ scenario: "failure" });
  const unsupported = service.queryRelationships({
    industryFilters: ["space-mining"],
  });
  const suggestions = service.getSearchSuggestions();

  assert.deepEqual(contract.RELATIONSHIP_NATURAL_SEARCH_BUSINESS_INTENTS, [
    "find_warm_intro",
    "explore_partnership",
    "recover_event_follow_up",
    "source_customer_reference",
  ]);
  assert.deepEqual(contract.RELATIONSHIP_NATURAL_SEARCH_INDUSTRIES, [
    "climate",
    "enterprise_saas",
    "fintech",
    "healthcare",
    "mobility",
  ]);
  assert.deepEqual(contract.RELATIONSHIP_NATURAL_SEARCH_SOURCE_TYPES, [
    "manual",
    "event_import",
    "email_signal",
    "calendar_signal",
    "external_contacts",
    "referral",
  ]);
  assert.deepEqual(contract.RELATIONSHIP_NATURAL_SEARCH_VALUE_TYPES, [
    "commercial_opportunity",
    "strategic_intro",
    "knowledge_exchange",
    "referral_path",
    "community_context",
  ]);
  assert.deepEqual(contract.RELATIONSHIP_NATURAL_SEARCH_FOLLOW_UP_STATUSES, [
    "needs_follow_up",
    "active",
    "waiting_on_them",
    "dormant",
  ]);
  assert.deepEqual(contract.RELATIONSHIP_NATURAL_SEARCH_ERROR_CODES, [
    "RELATIONSHIP_NATURAL_SEARCH_FILTER_NOT_SUPPORTED",
    "RELATIONSHIP_NATURAL_SEARCH_INVALID_BODY",
    "RELATIONSHIP_NATURAL_SEARCH_PENDING",
    "RELATIONSHIP_NATURAL_SEARCH_MOCK_FAILED",
  ]);
  assert.equal(
    contract.RELATIONSHIP_NATURAL_SEARCH_ERROR_DEFINITIONS
      .RELATIONSHIP_NATURAL_SEARCH_MOCK_FAILED.appCode,
    "SERVICE_UNAVAILABLE",
  );
  assert.equal(
    contract.RELATIONSHIP_NATURAL_SEARCH_FIXTURE_SOURCE,
    "fixture:features/search/fixtures.ts",
  );

  assert.equal(success.success, true);
  assert.equal(success.data.state, "success");
  assert.equal(success.data.results.length, 4);
  assert.deepEqual(
    success.data.results.map((result) => result.displayName),
    ["Kenji Watanabe", "Omar Rahman", "Hana Sato", "Mina Tan"],
  );
  assert.equal(success.data.results[0]?.industry, "climate");
  assert.deepEqual(success.data.results[0]?.matchedBusinessIntents, [
    "find_warm_intro",
    "source_customer_reference",
  ]);
  assert.equal(success.data.results[0]?.source.type, "manual");
  assert.deepEqual(success.data.results[0]?.value.valueTypes, [
    "commercial_opportunity",
    "strategic_intro",
  ]);
  assert.equal(success.data.results[0]?.followUpStatus, "needs_follow_up");
  assert.equal(success.data.results[0]?.semanticSearchExecuted, false);
  assert.equal(success.data.results[0]?.embeddingGenerated, false);
  assert.equal(success.data.results[0]?.crossProviderIndexQueried, false);
  assert.deepEqual(success.data.provenance.evidenceIds, [
    "evidence:relationship-search-kenji",
    "evidence:relationship-search-omar",
    "evidence:relationship-search-hana",
    "evidence:relationship-search-mina",
  ]);
  assert.equal(
    success.data.provenance.source,
    contract.RELATIONSHIP_NATURAL_SEARCH_FIXTURE_SOURCE,
  );
  assert.equal(success.data.provenance.semanticSearchExecuted, false);
  assert.equal(success.data.provenance.embeddingsGenerated, false);
  assert.equal(success.data.provenance.crossProviderIndexQueried, false);
  assert.equal(success.data.provenance.databaseQueryExecuted, false);
  assert.equal(success.data.provenance.externalNetworkRequested, false);
  assert.equal(success.data.provenance.aiProviderRequested, false);
  assert.equal(success.data.availableFilters.businessIntents.length, 4);
  assert.equal(success.data.availableFilters.industries.length, 5);
  assert.equal(success.data.availableFilters.sources.length, 6);
  assert.equal(success.data.availableFilters.valueTypes.length, 5);
  assert.equal(success.data.availableFilters.followUpStatuses.length, 4);

  assert.equal(textSearch.success, true);
  assert.deepEqual(
    textSearch.data.results.map((result) => result.displayName),
    ["Kenji Watanabe"],
  );
  assert.equal(
    textSearch.data.provenance.generationMethod,
    "rule-based-relationship-natural-search",
  );

  assert.equal(intentFiltered.success, true);
  assert.deepEqual(
    intentFiltered.data.results.map((result) => result.displayName),
    ["Kenji Watanabe", "Omar Rahman"],
  );
  assert.equal(industryFiltered.success, true);
  assert.deepEqual(
    industryFiltered.data.results.map((result) => result.displayName),
    ["Kenji Watanabe", "Hana Sato", "Mina Tan"],
  );
  assert.equal(sourceFiltered.success, true);
  assert.deepEqual(
    sourceFiltered.data.results.map((result) => result.displayName),
    ["Mina Tan"],
  );
  assert.equal(valueFiltered.success, true);
  assert.deepEqual(
    valueFiltered.data.results.map((result) => result.displayName),
    ["Kenji Watanabe", "Omar Rahman"],
  );
  assert.equal(followUpFiltered.success, true);
  assert.deepEqual(
    followUpFiltered.data.results.map((result) => result.displayName),
    ["Kenji Watanabe", "Mina Tan"],
  );

  assert.equal(empty.success, true);
  assert.equal(empty.data.state, "empty");
  assert.equal(empty.data.results.length, 0);
  assert.equal(
    empty.data.nextAction,
    "Clear the natural language query or choose a supported mock filter before searching relationships again.",
  );

  assert.equal(pending.success, true);
  assert.equal(pending.data.state, "pending");
  assert.equal(pending.data.results.length, 0);
  assert.notEqual(pending.data.summary, empty.data.summary);
  assert.notEqual(pending.data.nextAction, empty.data.nextAction);
  assert.match(pending.data.summary, /Fixture review pending/);
  assert.match(pending.data.nextAction, /Keep the pending state visible/);

  assert.equal(failure.success, false);
  assert.equal(
    failure.error.code,
    "RELATIONSHIP_NATURAL_SEARCH_MOCK_FAILED",
  );
  assert.equal(failure.error.appCode, "SERVICE_UNAVAILABLE");

  assert.equal(unsupported.success, false);
  assert.equal(
    unsupported.error.code,
    "RELATIONSHIP_NATURAL_SEARCH_FILTER_NOT_SUPPORTED",
  );

  assert.equal(suggestions.success, true);
  assert.equal(suggestions.data.state, "success");
  assert.deepEqual(suggestions.data.suggestions.map((item) => item.query), [
    "Who can introduce me to climate pilot operators?",
    "Which investors need an event follow-up this week?",
    "Find fintech partners with referral value",
  ]);

  assert.deepEqual(
    fixtures.mockRelationshipNaturalSearchFixture,
    success.data,
  );
  assert.deepEqual(
    fixtures.mockRelationshipNaturalSearchSuggestionsFixture,
    suggestions.data,
  );
});

test("mock relationship natural search is deterministic and has no external provider calls", async () => {
  const serviceModule = await importProjectModule<
    typeof import("../../features/search/mock-service")
  >("features/search/mock-service.ts");
  const service = serviceModule.createMockRelationshipNaturalSearchService();
  const queryInput = {
    query: "climate pilot",
    businessIntent: "find_warm_intro",
    industryFilters: ["climate"],
    followUpStatusFilters: ["needs_follow_up"],
    sourceFilters: ["manual", "event_import"],
    valueTypeFilters: ["strategic_intro"],
  };

  assert.deepEqual(service.queryRelationships(), service.queryRelationships());
  assert.deepEqual(
    service.queryRelationships({ scenario: "unknown-scenario" }),
    service.queryRelationships(),
  );
  assert.deepEqual(
    service.queryRelationships(queryInput),
    service.queryRelationships(queryInput),
  );
  assert.deepEqual(
    service.getSearchSuggestions(),
    service.getSearchSuggestions(),
  );

  const filtered = service.queryRelationships(queryInput);

  assert.equal(filtered.success, true);
  assert.equal(filtered.data.results.length, 1);
  assert.equal(filtered.data.results[0]?.displayName, "Kenji Watanabe");
  assert.equal(
    filtered.data.provenance.generationMethod,
    "rule-based-relationship-natural-search",
  );

  for (const filePath of [
    "features/search/contract.ts",
    "features/search/fixtures.ts",
    "features/search/service.ts",
    "features/search/mock-service.ts",
    "app/api/search/relationships/route.ts",
    "app/api/search/suggestions/route.ts",
    "features/search/relationship-natural-search-mock/debug-view.tsx",
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
    assert.doesNotMatch(
      source,
      /embedding provider|semantic search provider|vector database|pinecone|weaviate|qdrant/i,
    );
  }
});

test("relationship natural search API routes return stable envelopes with empty and failure paths", async () => {
  const relationshipsRoute = await importProjectModule<{
    POST: (request: Request) => Promise<Response>;
  }>("app/api/search/relationships/route.ts");
  const suggestionsRoute = await importProjectModule<{
    GET: (request: Request) => Promise<Response>;
  }>("app/api/search/suggestions/route.ts");
  const fixtures = await importProjectModule<
    typeof import("../../features/search/fixtures")
  >("features/search/fixtures.ts");

  const relationshipsResponse = await relationshipsRoute.POST(
    new Request("https://orbit.local/api/search/relationships", {
      body: JSON.stringify({
        query: "pilot operator intro",
        businessIntent: "find_warm_intro",
        industry: "climate",
        source: "manual",
        valueType: "strategic_intro",
        followUpStatus: "needs_follow_up",
      }),
      headers: {
        "content-type": "application/json",
      },
      method: "POST",
    }),
  );
  const formRelationshipsResponse = await relationshipsRoute.POST(
    new Request("https://orbit.local/api/search/relationships", {
      body: new URLSearchParams({
        query: "fintech referral",
        industry: "fintech",
        valueType: "referral_path",
      }),
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      method: "POST",
    }),
  );
  const emptyResponse = await relationshipsRoute.POST(
    new Request(
      "https://orbit.local/api/search/relationships?scenario=empty",
      {
        method: "POST",
      },
    ),
  );
  const failureResponse = await relationshipsRoute.POST(
    new Request(
      "https://orbit.local/api/search/relationships?scenario=failure",
      {
        method: "POST",
      },
    ),
  );
  const unsupportedResponse = await relationshipsRoute.POST(
    new Request("https://orbit.local/api/search/relationships", {
      body: JSON.stringify({ industry: "space-mining" }),
      headers: {
        "content-type": "application/json",
      },
      method: "POST",
    }),
  );
  const malformedResponse = await relationshipsRoute.POST(
    new Request("https://orbit.local/api/search/relationships", {
      body: "{",
      headers: {
        "content-type": "application/json",
      },
      method: "POST",
    }),
  );
  const suggestionsResponse = await suggestionsRoute.GET(
    new Request("https://orbit.local/api/search/suggestions"),
  );
  const emptySuggestionsResponse = await suggestionsRoute.GET(
    new Request("https://orbit.local/api/search/suggestions?scenario=empty"),
  );

  assert.equal(relationshipsResponse.status, 200);
  assert.equal(relationshipsResponse.headers.get("cache-control"), "no-store");
  assert.equal(relationshipsResponse.headers.get("x-orbit-feature-mode"), "mock");
  assert.deepEqual(await relationshipsResponse.json(), {
    success: true,
    data: fixtures.mockPilotOperatorSearchFixture,
  });

  assert.equal(formRelationshipsResponse.status, 200);
  assert.deepEqual(await formRelationshipsResponse.json(), {
    success: true,
    data: fixtures.mockFintechReferralSearchFixture,
  });

  assert.equal(emptyResponse.status, 200);
  assert.deepEqual(await emptyResponse.json(), {
    success: true,
    data: fixtures.mockEmptyRelationshipNaturalSearchFixture,
  });

  assert.equal(failureResponse.status, 503);
  assert.deepEqual(await failureResponse.json(), {
    success: false,
    error: {
      code: "SERVICE_UNAVAILABLE",
      context: {
        boundary: "developer-admin",
        mode: "mock",
        privacy: "no-relationship-data",
        provenance:
          "Mock relationship natural search failure came from deterministic fixture rules.",
        relationshipNaturalSearchErrorCode:
          "RELATIONSHIP_NATURAL_SEARCH_MOCK_FAILED",
        service: "relationship-natural-search-mock",
      },
      message:
        "The mock relationship natural search boundary is pinned to a controlled failure scenario.",
    },
  });

  assert.equal(unsupportedResponse.status, 400);
  assert.equal((await unsupportedResponse.json()).success, false);

  assert.equal(malformedResponse.status, 400);
  assert.deepEqual(await malformedResponse.json(), {
    success: false,
    error: {
      code: "VALIDATION_ERROR",
      context: {
        boundary: "developer-admin",
        mode: "mock",
        privacy: "no-relationship-data",
        provenance:
          "Mock relationship natural search failure came from deterministic fixture rules.",
        relationshipNaturalSearchErrorCode:
          "RELATIONSHIP_NATURAL_SEARCH_INVALID_BODY",
        service: "relationship-natural-search-mock",
      },
      message:
        "The mock relationship natural search request body must be valid JSON or form data.",
    },
  });

  assert.equal(suggestionsResponse.status, 200);
  assert.deepEqual(await suggestionsResponse.json(), {
    success: true,
    data: fixtures.mockRelationshipNaturalSearchSuggestionsFixture,
  });

  assert.equal(emptySuggestionsResponse.status, 200);
  assert.deepEqual(await emptySuggestionsResponse.json(), {
    success: true,
    data: fixtures.mockEmptyRelationshipNaturalSearchSuggestionsFixture,
  });
});

test("relationship natural search debug route renders all states and the live replacement handoff", async () => {
  const debugModule = await importProjectModule<{
    RelationshipNaturalSearchMockDemo: React.ComponentType;
    RELATIONSHIP_NATURAL_SEARCH_MOCK_SLUG: string;
  }>("features/search/relationship-natural-search-mock/debug-view.tsx");
  const pageSource = readFileSync(
    join(projectRoot, "app/dev/capabilities/[slug]/page.tsx"),
    "utf8",
  );

  assert.equal(
    debugModule.RELATIONSHIP_NATURAL_SEARCH_MOCK_SLUG,
    "relationship-natural-search-mock",
  );

  const directMarkup = renderToStaticMarkup(
    React.createElement(debugModule.RelationshipNaturalSearchMockDemo),
  );
  const liveDocPath =
    "features/search/relationship-natural-search-mock/LIVE_IMPLEMENTATION.md";
  const liveDoc = readFileSync(join(projectRoot, liveDocPath), "utf8");

  assert.match(pageSource, /RELATIONSHIP_NATURAL_SEARCH_MOCK_SLUG/);
  assert.match(pageSource, /RelationshipNaturalSearchMockDemo/);

  assert.match(directMarkup, /Relationship natural search mock/);
  assert.match(directMarkup, /Success state/);
  assert.match(directMarkup, /Empty state/);
  assert.match(directMarkup, /Pending state/);
  assert.match(directMarkup, /Pending state diagnosis/);
  assert.match(directMarkup, /Fixture review pending/);
  assert.match(directMarkup, /Failure state/);
  assert.match(directMarkup, /POST \/api\/search\/relationships/);
  assert.match(directMarkup, /GET \/api\/search\/suggestions/);
  assert.match(directMarkup, /semantic search executed: false/i);
  assert.match(directMarkup, /embeddings generated: false/i);
  assert.match(directMarkup, /cross-provider index queried: false/i);
  assert.match(
    directMarkup,
    /features\/search\/relationship-natural-search-mock\/LIVE_IMPLEMENTATION.md/,
  );

  for (const expected of [
    "Live service/provider files",
    "ORBIT_RELATIONSHIP_SEARCH_PROVIDER",
    "ORBIT_RELATIONSHIP_SEARCH_INDEX_URL",
    "Privacy and provenance constraints",
    "Replacement tests",
    "semantic search",
    "embeddings",
    "cross-provider indexing",
  ]) {
    assert.match(liveDoc, new RegExp(expected));
  }
});
