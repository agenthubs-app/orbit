import assert from "node:assert/strict";
import test from "node:test";

import { createLiveContactsListSearchAndFilterService } from "../../features/contacts/live-service";
import { createStorageContactGraphProvider } from "../../features/contacts/storage/contact-live-record-provider";
import {
  createContactsListSearchAndFilterService,
  resolveContactsListSearchAndFilterService,
} from "../../features/contacts/service-factory";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";
import { seedGeneratedRelationshipFixturesIntoLiveStore } from "../../shared/storage/seed-generated-fixtures";
import { defaultMockFixtures } from "../../shared/mock/fixtures";

test("live contacts service reads generated contacts from shared live storage", async () => {
  const workspaceId = "workspace:contacts-live-store-test";
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();

  await seedGeneratedRelationshipFixturesIntoLiveStore({
    now: () => "2026-07-01T16:00:00.000Z",
    store,
    workspaceId,
  });

  const provider = createStorageContactGraphProvider({
    sourceLabel: "Contacts memory live storage",
    store,
    workspaceId,
  });
  const service = createLiveContactsListSearchAndFilterService({
    provider,
  });

  const listResult = await service.listContacts();

  assert.equal(listResult.success, true);
  assert.equal(listResult.data.contacts.length, defaultMockFixtures.contacts.length);
  assert.equal(listResult.data.provenance.source, `live-record-store:contacts:${workspaceId}`);
  assert.equal(listResult.data.provenance.sourceLabel, "Contacts memory live storage");
  assert.equal(listResult.data.provenance.generationMethod, "live-store-query");
  assert.equal(listResult.data.provenance.databaseQueryExecuted, true);
  assert.equal(listResult.data.provenance.searchIndexReadExecuted, false);
  assert.equal(listResult.data.provenance.privacy, "live-contacts-list-search-filter");

  const sato = listResult.data.contacts.find(
    (contact) => contact.id === "contact_001",
  );

  assert.ok(sato);
  assert.equal(sato.displayName, "佐藤 健一");
  assert.equal(sato.organization, "North Star Foods");
  assert.equal(sato.source.type, "qr_scan");
  assert.deepEqual(sato.evidence.map((evidence) => evidence.evidenceId), [
    "evidence:contact:001",
  ]);
  assert.equal(sato.databaseQueryExecuted, true);
  assert.equal(sato.searchIndexReadExecuted, false);
  assert.ok(sato.value.valueTypes.includes("knowledge_exchange"));
  assert.match(sato.relationshipContext, /佐藤 健一 matches/);

  const searchResult = await service.searchContacts({
    query: "North Star Foods",
    sourceFilters: ["qr_scan"],
    valueFilters: ["knowledge_exchange"],
  });

  assert.equal(searchResult.success, true);
  assert.deepEqual(
    searchResult.data.contacts.map((contact) => contact.id),
    ["contact_001"],
  );
});

test("contacts factory registers live mode and fails closed without live database config", async () => {
  const previousDatabaseUrl = process.env.ORBIT_DATABASE_URL;
  const previousEventDatabaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;
  const previousLiveDatabaseUrl = process.env.ORBIT_LIVE_DATABASE_URL;

  try {
    delete process.env.ORBIT_DATABASE_URL;
    delete process.env.ORBIT_EVENT_DATABASE_URL;
    delete process.env.ORBIT_LIVE_DATABASE_URL;

    const liveResolution = resolveContactsListSearchAndFilterService("live");
    const liveService = createContactsListSearchAndFilterService("live");
    const result = await liveService.listContacts();

    assert.equal(liveResolution.success, true);
    assert.equal(result.success, false);

    if (!result.success) {
      assert.equal(result.error.code, "CONTACTS_LIVE_STORE_UNCONFIGURED");
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
