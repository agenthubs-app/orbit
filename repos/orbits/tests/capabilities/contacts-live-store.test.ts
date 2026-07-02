import assert from "node:assert/strict";
import test from "node:test";

import { createLiveContactsListSearchAndFilterService } from "../../features/contacts/live-service";
import { createStorageContactGraphProvider } from "../../features/contacts/storage/contact-live-record-provider";
import {
  createContactsListSearchAndFilterService,
  resolveContactsListSearchAndFilterService,
} from "../../features/contacts/service-factory";
import {
  createMemoryLiveRecordStore,
  type LiveRecord,
  type LiveRecordListQuery,
} from "../../shared/storage/live-record-store";
import { seedGeneratedRelationshipFixturesIntoLiveStore } from "../../shared/storage/seed-generated-fixtures";
import { defaultMockFixtures } from "../../shared/mock/fixtures";

function activeRecord(input: {
  collectionName: string;
  payload: Record<string, unknown> & { id: string };
  searchText: string;
  targetType: string;
  workspaceId: string;
}): LiveRecord<Record<string, unknown>> {
  const now = "2026-07-02T10:00:00.000Z";
  const source = input.payload.source;
  const sourceRecord =
    typeof source === "object" && source !== null
      ? (source as Record<string, unknown>)
      : {};
  const evidenceIds = Array.isArray(input.payload.evidenceIds)
    ? input.payload.evidenceIds.filter(
        (evidenceId): evidenceId is string => typeof evidenceId === "string",
      )
    : [input.payload.id];

  return {
    workspaceId: input.workspaceId,
    collectionName: input.collectionName,
    recordId: input.payload.id,
    sourceType:
      typeof input.payload.sourceType === "string"
        ? input.payload.sourceType
        : typeof sourceRecord.type === "string"
          ? sourceRecord.type
          : "manual",
    sourceId:
      typeof input.payload.sourceId === "string"
        ? input.payload.sourceId
        : typeof sourceRecord.id === "string"
          ? sourceRecord.id
          : `source:${input.payload.id}`,
    sourceLabel:
      typeof sourceRecord.label === "string" ? sourceRecord.label : "Test source",
    provider: "contacts-live-store-test",
    providerRecordId: input.payload.id,
    evidenceIds,
    targetType: input.targetType,
    targetId: input.payload.id,
    occurredAt:
      typeof input.payload.occurredAt === "string" ? input.payload.occurredAt : now,
    createdAt:
      typeof input.payload.createdAt === "string" ? input.payload.createdAt : now,
    updatedAt:
      typeof input.payload.updatedAt === "string" ? input.payload.updatedAt : now,
    lifecycleState: "active",
    searchText: input.searchText,
    payload: input.payload,
  };
}

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

test("live contacts search reads only evidence needed for listed contacts", async () => {
  const workspaceId = "workspace:contacts-live-focused-list";
  const rawStore = createMemoryLiveRecordStore<Record<string, unknown>>();
  const listQueries: LiveRecordListQuery[] = [];
  const store = {
    ...rawStore,
    listRecords(query: LiveRecordListQuery) {
      listQueries.push({
        ...query,
        recordIds: query.recordIds ? [...query.recordIds] : undefined,
      });

      return rawStore.listRecords(query);
    },
  };
  const source = {
    type: "manual",
    id: "source:focused-list",
    label: "Focused list test",
  };
  const visibleContact = {
    id: "contact-visible",
    displayName: "Visible Person",
    organization: "Visible Org",
    role: "Founder",
    location: "Tokyo",
    profileSnippet: "Visible search profile",
    stage: "active",
    source,
    evidenceIds: ["evidence:visible-contact"],
    createdAt: "2026-07-02T10:00:00.000Z",
    updatedAt: "2026-07-02T10:00:00.000Z",
  };
  const hiddenContact = {
    ...visibleContact,
    id: "contact-hidden",
    displayName: "Hidden Person",
    organization: "Hidden Org",
    profileSnippet: "Hidden search profile",
    evidenceIds: ["evidence:hidden-contact"],
  };
  const visibleConnection = {
    id: "connection-visible",
    accountId: "account-focused-list",
    contactId: visibleContact.id,
    stage: "active",
    valueTypes: ["strategic_fit"],
    summary: "Visible relationship context",
    relationshipStrength: 70,
    businessRelevanceScore: 80,
    sharedTopics: ["visible"],
    suggestedActions: ["follow up"],
    source,
    evidenceIds: ["evidence:visible-connection"],
    createdAt: "2026-07-02T10:00:00.000Z",
    updatedAt: "2026-07-02T10:00:00.000Z",
  };
  const hiddenConnection = {
    ...visibleConnection,
    id: "connection-hidden",
    contactId: hiddenContact.id,
    summary: "Hidden relationship context",
    evidenceIds: ["evidence:hidden-connection"],
  };
  const evidencePayloads = [
    {
      id: "evidence:visible-contact",
      sourceType: "manual",
      sourceId: "source:visible-contact",
      summary: "Visible contact evidence",
    },
    {
      id: "evidence:visible-connection",
      sourceType: "manual",
      sourceId: "source:visible-connection",
      summary: "Visible connection evidence",
    },
    {
      id: "evidence:hidden-contact",
      sourceType: "manual",
      sourceId: "source:hidden-contact",
      summary: "Hidden contact evidence",
    },
    {
      id: "evidence:hidden-connection",
      sourceType: "manual",
      sourceId: "source:hidden-connection",
      summary: "Hidden connection evidence",
    },
  ].map((payload) => ({
    ...payload,
    occurredAt: "2026-07-02T10:00:00.000Z",
    confidence: 0.9,
    createdBy: "contacts-live-store-test",
  }));

  for (const payload of [visibleContact, hiddenContact]) {
    rawStore.upsertRecord(
      activeRecord({
        collectionName: "contacts",
        payload,
        searchText: `${payload.displayName} ${payload.organization}`,
        targetType: "contact",
        workspaceId,
      }),
    );
  }

  for (const payload of [visibleConnection, hiddenConnection]) {
    rawStore.upsertRecord(
      activeRecord({
        collectionName: "connections",
        payload,
        searchText: `${payload.summary} ${payload.contactId}`,
        targetType: "connection",
        workspaceId,
      }),
    );
  }

  for (const payload of evidencePayloads) {
    rawStore.upsertRecord(
      activeRecord({
        collectionName: "evidence",
        payload,
        searchText: payload.summary,
        targetType: "evidence",
        workspaceId,
      }),
    );
  }

  const provider = createStorageContactGraphProvider({
    sourceLabel: "Contacts focused list storage",
    store,
    workspaceId,
  });
  const service = createLiveContactsListSearchAndFilterService({
    provider,
  });

  const result = await service.searchContacts({
    query: "Visible Person",
  });

  assert.equal(result.success, true);
  assert.deepEqual(
    result.data.contacts.map((contact) => contact.id),
    [visibleContact.id],
  );

  const evidenceQuery = listQueries.find(
    (query) => query.collectionName === "evidence",
  );

  assert.ok(evidenceQuery);
  assert.deepEqual([...(evidenceQuery.recordIds ?? [])].sort(), [
    "evidence:visible-connection",
    "evidence:visible-contact",
  ]);
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
