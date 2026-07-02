/**
 * 联系人列表搜索筛选 mock 的契约测试。
 *
 * 验证 query/filter 组合、unsupported filter、API route 和 debug-view。
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
    `${pathFromRoot} must exist for the contacts list search and filter mock sprint`,
  );

  return (await import(pathToFileURL(absolutePath).href)) as TModule;
}

test("contacts list search and filter contract exposes typed filters fixtures and errors", async () => {
  const contract = await importProjectModule<
    typeof import("../../features/contacts/contract")
  >("features/contacts/contract.ts");
  const fixtures = await importProjectModule<
    typeof import("../../features/contacts/fixtures")
  >("features/contacts/fixtures.ts");
  const serviceModule = await importProjectModule<
    typeof import("../../features/contacts/mock-service")
  >("features/contacts/mock-service.ts");

  const service = serviceModule.createMockContactsListSearchAndFilterService();
  const success = await service.listContacts();
  const textSearch = await service.searchContacts({ query: "venture ecosystem" });
  const tagFiltered = await service.searchContacts({
    tagFilters: ["topic:storage-pilots"],
  });
  const sourceFiltered = await service.searchContacts({
    sourceFilters: ["manual"],
  });
  const valueFiltered = await service.searchContacts({
    valueFilters: ["referral_path"],
  });
  const statusFiltered = await service.searchContacts({
    statusFilters: ["needs_follow_up"],
  });
  const empty = await service.searchContacts({ scenario: "empty" });
  const pending = await service.searchContacts({ scenario: "pending" });
  const failure = await service.searchContacts({ scenario: "failure" });
  const unsupported = await service.searchContacts({
    sourceFilters: ["linkedin"],
  });

  assert.deepEqual(contract.CONTACTS_LIST_SEARCH_FILTER_ERROR_CODES, [
    "CONTACTS_FILTER_NOT_SUPPORTED",
    "CONTACTS_SEARCH_PENDING",
    "CONTACTS_LIST_SEARCH_FILTER_MOCK_FAILED",
    "CONTACTS_LIVE_STORE_UNCONFIGURED",
  ]);
  assert.equal(
    contract.CONTACTS_LIST_SEARCH_FILTER_ERROR_DEFINITIONS
      .CONTACTS_FILTER_NOT_SUPPORTED.appCode,
    "VALIDATION_ERROR",
  );
  assert.deepEqual(contract.CONTACT_SOURCE_FILTERS, [
    "manual",
    "business_card_ocr",
    "qr_scan",
    "event_import",
    "external_contacts",
    "email_signal",
    "calendar_signal",
    "referral",
  ]);
  assert.deepEqual(contract.CONTACT_VALUE_FILTERS, [
    "strategic_fit",
    "commercial_opportunity",
    "knowledge_exchange",
    "referral_path",
    "community_context",
  ]);
  assert.deepEqual(contract.CONTACT_STATUS_FILTERS, [
    "active",
    "needs_follow_up",
    "nurture",
    "archived",
  ]);

  assert.equal(success.success, true);
  assert.equal(success.data.state, "success");
  assert.equal(success.data.contacts.length, 4);
  assert.deepEqual(
    success.data.contacts.map((contact) => contact.displayName),
    ["Kenji Watanabe", "Hana Sato", "Omar Rahman", "Mina Tan"],
  );
  assert.equal(
    success.data.contacts[0]?.relationshipContext,
    "Met at the climate founders dinner and discussed storage pilot operators.",
  );
  assert.equal(
    success.data.contacts[0]?.profileSnippet,
    "Founder at Aster Grid working on storage pilot partnerships.",
  );
  assert.equal(success.data.contacts[0]?.source.type, "manual");
  assert.deepEqual(success.data.contacts[0]?.tags, [
    "event:climate-founders-dinner",
    "topic:storage-pilots",
    "priority:warm-follow-up",
  ]);
  assert.deepEqual(success.data.contacts[0]?.value.valueTypes, [
    "commercial_opportunity",
    "referral_path",
  ]);
  assert.equal(success.data.contacts[0]?.status, "needs_follow_up");
  assert.equal(success.data.contacts[0]?.databaseQueryExecuted, false);
  assert.equal(success.data.contacts[0]?.searchIndexReadExecuted, false);
  assert.deepEqual(success.data.provenance.evidenceIds, [
    "evidence:contacts-list-kenji",
    "evidence:contacts-list-hana",
    "evidence:contacts-list-omar",
    "evidence:contacts-list-mina",
  ]);
  assert.equal(
    success.data.provenance.source,
    fixtures.CONTACTS_LIST_SEARCH_FILTER_FIXTURE_SOURCE,
  );
  assert.equal(success.data.provenance.searchIndexReadExecuted, false);
  assert.equal(success.data.provenance.databaseQueryExecuted, false);
  assert.equal(success.data.provenance.externalNetworkRequested, false);
  assert.equal(success.data.provenance.aiProviderRequested, false);
  assert.equal(success.data.availableFilters.tags.length, 8);
  assert.equal(success.data.availableFilters.sources.length, 8);
  assert.equal(success.data.availableFilters.values.length, 5);
  assert.equal(success.data.availableFilters.statuses.length, 4);

  assert.equal(textSearch.success, true);
  assert.deepEqual(
    textSearch.data.contacts.map((contact) => contact.displayName),
    ["Omar Rahman"],
  );
  assert.equal(
    textSearch.data.provenance.generationMethod,
    "rule-based-contacts-list-search-filter",
  );

  assert.equal(tagFiltered.success, true);
  assert.deepEqual(
    tagFiltered.data.contacts.map((contact) => contact.displayName),
    ["Kenji Watanabe", "Mina Tan"],
  );
  assert.equal(sourceFiltered.success, true);
  assert.deepEqual(
    sourceFiltered.data.contacts.map((contact) => contact.displayName),
    ["Kenji Watanabe"],
  );
  assert.equal(valueFiltered.success, true);
  assert.deepEqual(
    valueFiltered.data.contacts.map((contact) => contact.displayName),
    ["Kenji Watanabe", "Omar Rahman"],
  );
  assert.equal(statusFiltered.success, true);
  assert.deepEqual(
    statusFiltered.data.contacts.map((contact) => contact.displayName),
    ["Kenji Watanabe"],
  );

  assert.equal(empty.success, true);
  assert.equal(empty.data.state, "empty");
  assert.equal(empty.data.contacts.length, 0);
  assert.equal(
    empty.data.nextAction,
    "Clear the local search and filters, or add a mock contact fixture before reviewing the list.",
  );

  assert.equal(pending.success, true);
  assert.equal(pending.data.state, "pending");
  assert.equal(pending.data.contacts.length, 0);

  assert.equal(failure.success, false);
  assert.equal(failure.error.code, "CONTACTS_LIST_SEARCH_FILTER_MOCK_FAILED");
  assert.equal(failure.error.appCode, "SERVICE_UNAVAILABLE");

  assert.equal(unsupported.success, false);
  assert.equal(unsupported.error.code, "CONTACTS_FILTER_NOT_SUPPORTED");

  assert.deepEqual(fixtures.mockContactsListFixture, success.data);
});

test("mock contacts list search and filter service is deterministic with no external provider calls", async () => {
  const serviceModule = await importProjectModule<
    typeof import("../../features/contacts/mock-service")
  >("features/contacts/mock-service.ts");
  const service = serviceModule.createMockContactsListSearchAndFilterService();
  const filterInput = {
    query: "storage",
    sourceFilters: ["manual"],
    statusFilters: ["needs_follow_up"],
    tagFilters: ["topic:storage-pilots"],
    valueFilters: ["commercial_opportunity"],
  };

  assert.deepEqual(await service.listContacts(), await service.listContacts());
  assert.deepEqual(await service.searchContacts(), await service.searchContacts());
  assert.deepEqual(
    await service.searchContacts({ scenario: "unknown-scenario" }),
    await service.searchContacts(),
  );
  assert.deepEqual(
    await service.searchContacts(filterInput),
    await service.searchContacts(filterInput),
  );

  const filtered = await service.searchContacts(filterInput);

  assert.equal(filtered.success, true);
  assert.equal(filtered.data.contacts.length, 1);
  assert.equal(filtered.data.contacts[0]?.displayName, "Kenji Watanabe");
  assert.equal(
    filtered.data.provenance.generationMethod,
    "rule-based-contacts-list-search-filter",
  );

  for (const filePath of [
    "features/contacts/contract.ts",
    "features/contacts/fixtures.ts",
    "features/contacts/service.ts",
    "features/contacts/mock-service.ts",
    "app/api/contacts/route.ts",
    "app/api/contacts/search/route.ts",
    "features/contacts/contacts-list-search-and-filter-mock/debug-view.tsx",
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

test("contacts list search and filter API routes return stable envelopes with empty and failure paths", async () => {
  const listRoute = await importProjectModule<{
    GET: (request: Request) => Promise<Response>;
  }>("app/api/contacts/route.ts");
  const searchRoute = await importProjectModule<{
    POST: (request: Request) => Promise<Response>;
  }>("app/api/contacts/search/route.ts");
  const fixtures = await importProjectModule<
    typeof import("../../features/contacts/fixtures")
  >("features/contacts/fixtures.ts");

  const listResponse = await listRoute.GET(
    new Request("https://orbit.local/api/contacts"),
  );
  const filteredListResponse = await listRoute.GET(
    new Request(
      "https://orbit.local/api/contacts?tag=topic:storage-pilots&source=manual&status=needs_follow_up",
    ),
  );
  const searchResponse = await searchRoute.POST(
    new Request("https://orbit.local/api/contacts/search", {
      body: JSON.stringify({ query: "venture ecosystem" }),
      headers: {
        "content-type": "application/json",
      },
      method: "POST",
    }),
  );
  const formSearchResponse = await searchRoute.POST(
    new Request("https://orbit.local/api/contacts/search", {
      body: new URLSearchParams({
        query: "storage",
        tag: "topic:storage-pilots",
        value: "commercial_opportunity",
      }),
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      method: "POST",
    }),
  );
  const emptyResponse = await listRoute.GET(
    new Request("https://orbit.local/api/contacts?scenario=empty"),
  );
  const failureResponse = await searchRoute.POST(
    new Request(
      "https://orbit.local/api/contacts/search?scenario=failure",
      {
        method: "POST",
      },
    ),
  );
  const unsupportedResponse = await listRoute.GET(
    new Request("https://orbit.local/api/contacts?source=linkedin"),
  );

  assert.equal(listResponse.status, 200);
  assert.equal(listResponse.headers.get("cache-control"), "no-store");
  assert.equal(listResponse.headers.get("x-orbit-feature-mode"), "mock");
  assert.deepEqual(await listResponse.json(), {
    success: true,
    data: fixtures.mockContactsListFixture,
  });

  assert.equal(filteredListResponse.status, 200);
  assert.deepEqual(await filteredListResponse.json(), {
    success: true,
    data: fixtures.mockFilteredContactsListFixture,
  });

  assert.equal(searchResponse.status, 200);
  assert.deepEqual(await searchResponse.json(), {
    success: true,
    data: fixtures.mockVentureSearchContactsListFixture,
  });

  assert.equal(formSearchResponse.status, 200);
  assert.deepEqual(await formSearchResponse.json(), {
    success: true,
    data: fixtures.mockStorageSearchContactsListFixture,
  });

  assert.equal(emptyResponse.status, 200);
  assert.deepEqual(await emptyResponse.json(), {
    success: true,
    data: fixtures.mockEmptyContactsListFixture,
  });

  assert.equal(failureResponse.status, 503);
  assert.deepEqual(await failureResponse.json(), {
    success: false,
    error: {
      code: "SERVICE_UNAVAILABLE",
      message:
        "The mock contacts list search and filter boundary is pinned to a controlled failure scenario.",
      context: {
        boundary: "developer-admin",
        contactsListSearchFilterErrorCode:
          "CONTACTS_LIST_SEARCH_FILTER_MOCK_FAILED",
        mode: "mock",
        privacy: "no-relationship-data",
        provenance:
          "Mock contacts list search and filter failure came from deterministic fixture rules.",
        service: "contacts-list-search-and-filter-mock",
      },
    },
  });

  assert.equal(unsupportedResponse.status, 400);
  assert.deepEqual(await unsupportedResponse.json(), {
    success: false,
    error: {
      code: "VALIDATION_ERROR",
      message:
        "That mock contacts list search or filter value is not supported by this sprint boundary.",
      context: {
        boundary: "developer-admin",
        contactsListSearchFilterErrorCode: "CONTACTS_FILTER_NOT_SUPPORTED",
        mode: "mock",
        privacy: "no-relationship-data",
        provenance:
          "Mock contacts list search and filter failure came from deterministic fixture rules.",
        service: "contacts-list-search-and-filter-mock",
      },
    },
  });
});

test("contacts list search and filter debug route renders all states and the live replacement handoff", async () => {
  const debugView = await importProjectModule<
    typeof import("../../features/contacts/contacts-list-search-and-filter-mock/debug-view")
  >("features/contacts/contacts-list-search-and-filter-mock/debug-view.tsx");
  const html = renderToStaticMarkup(
    React.createElement(debugView.ContactsListSearchAndFilterMockDemo),
  );
  const pageSource = readFileSync(
    join(projectRoot, "app/dev/capabilities/[slug]/page.tsx"),
    "utf8",
  );
  const liveDocPath =
    "features/contacts/contacts-list-search-and-filter-mock/LIVE_IMPLEMENTATION.md";
  const liveDoc = readFileSync(join(projectRoot, liveDocPath), "utf8");

  assert.equal(
    debugView.CONTACTS_LIST_SEARCH_AND_FILTER_MOCK_SLUG,
    "contacts-list-search-and-filter-mock",
  );
  assert.match(pageSource, /CONTACTS_LIST_SEARCH_AND_FILTER_MOCK_SLUG/);
  assert.match(pageSource, /ContactsListSearchAndFilterMockDemo/);

  assert.match(html, /Contacts list search and filter mock/);
  assert.match(html, /aria-label="Contacts list operator checkpoint"/);
  assert.match(html, /Search and filters are fixture-backed/);
  assert.match(html, /Contacts represented/);
  assert.match(html, /Mock execution/);
  assert.match(html, /search index false; database queries false/);
  assert.match(html, /aria-label="Contact row evidence for Kenji Watanabe"/);
  assert.match(html, />Contact row evidence for Kenji Watanabe</);
  assert.match(html, /Source: Manual note/);
  assert.match(html, /Evidence: evidence:contacts-list-kenji/);
  assert.match(html, /Value score: 91/);
  assert.match(html, /Status: needs_follow_up/);
  assert.match(html, /Next action: Send Kenji the storage pilot operator intro by Friday\./);
  assert.match(html, /Success state/);
  assert.match(html, /Empty state/);
  assert.match(html, /Pending state/);
  assert.match(html, /Failure state/);
  assert.match(html, /Kenji Watanabe/);
  assert.match(html, /Hana Sato/);
  assert.match(html, /Omar Rahman/);
  assert.match(html, /Mina Tan/);
  assert.match(html, /topic:storage-pilots/);
  assert.match(html, /referral_path/);
  assert.match(html, /CONTACTS_LIST_SEARCH_FILTER_MOCK_FAILED/);
  assert.match(html, /GET \/api\/contacts/);
  assert.match(html, /POST \/api\/contacts\/search/);
  assert.match(html, /GET \/api\/contacts\?scenario=empty/);
  assert.match(html, /POST \/api\/contacts\/search\?scenario=failure/);
  assert.match(html, new RegExp(liveDocPath));
  assert.match(html, /ORBIT_CONTACTS_PROVIDER/);
  assert.match(html, /contacts-list-search-filter-workbench/);
  assert.match(
    html,
    /\.contacts-list-search-filter-workbench\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)/,
  );

  assert.match(
    liveDoc,
    /features\/contacts\/contacts-list-search-and-filter-mock\/live-service\.ts/,
  );
  assert.match(
    liveDoc,
    /features\/contacts\/contacts-list-search-and-filter-mock\/providers\//,
  );
  assert.match(liveDoc, /ORBIT_CONTACTS_PROVIDER/);
  assert.match(liveDoc, /search indexing service/);
  assert.match(liveDoc, /database queries/);
  assert.match(liveDoc, /privacy/);
  assert.match(liveDoc, /provenance/);
  assert.match(liveDoc, /replacement tests/);
});
