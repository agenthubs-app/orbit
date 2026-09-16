import assert from "node:assert/strict";
import test from "node:test";

import { createLiveContactsListSearchAndFilterService } from "../../features/contacts/live-service";
import { createLiveContactDetailTagStatusService } from "../../features/contacts/live-detail-service";
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
import { contactsPayloadViewModel } from "../../app/(app)/app/contacts/compose-app-contacts-from-previously-approved-mock-first-capabilities/contacts-route-view-model";
import { contactsRouteToOrbitContactsViewModel } from "../../app/(app)/app/contacts/compose-app-contacts-from-previously-approved-mock-first-capabilities/contacts-view-model-adapter";

test("initialized relationship readers follow canonical transitions, not stale contact or private detail status", async () => {
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  const workspaceId = "test:canonical-contact-stage";
  const actorId = "owner:one";
  const base = { source: { type: "event_import", id: "event:qa" }, evidenceIds: ["evidence:qa"], createdAt: "2026-09-17T00:00:00Z", updatedAt: "2026-09-17T00:00:00Z" };
  for (const marker of ["ready", "pending", undefined]) {
    const id = `contact:${marker ?? "legacy"}`;
    for (const [collectionName, payload] of [
      ["contacts", { ...base, id, displayName: id, stage: "needs_follow_up", lifecycleInitialization: marker }],
      ["connections", { ...base, id: `connection:${id}`, contactId: id, accountId: actorId, stage: "active", lifecycleInitialization: marker, summary: "Accepted event connection", valueTypes: [], activeGoal: "Explicit test goal" }],
    ] as const) {
      await store.upsertRecord({ ...activeRecord({ collectionName, payload, workspaceId, searchText: id, targetType: collectionName === "contacts" ? "contact" : "connection" }), userId: actorId });
    }
  }
  const provider = createStorageContactGraphProvider({ store, workspaceId });
  await provider.upsertContactDetailState?.({ actorId, contactId: "contact:ready", status: "nurture", tags: ["保留标签"], notes: [], updatedAt: base.updatedAt });
  const list = await createLiveContactsListSearchAndFilterService({ provider }).listContacts({ actorId });
  assert.equal(list.success, true);
  assert.equal(list.data.contacts.find(c => c.id === "contact:ready")?.status, "active");
  assert.equal(list.data.contacts.find(c => c.id === "contact:legacy")?.status, "needs_follow_up");
  assert.equal(list.data.contacts.find(c => c.id === "contact:pending")?.lifecycleInitialization, "pending");
  const detail = await createLiveContactDetailTagStatusService({ provider }).getContactDetail({ actorId, contactId: "contact:ready" });
  assert.equal(detail.success, true);
  assert.equal(detail.data.contact.status, "active");
  assert.deepEqual(detail.data.contact.tags, ["保留标签"]);
  assert.equal((detail.data.contact as unknown as Record<string, unknown>).lifecycleInitialization, "ready");
  const pendingDetail = await createLiveContactDetailTagStatusService({ provider }).getContactDetail({ actorId, contactId: "contact:pending" });
  assert.equal(pendingDetail.success, true);
  assert.equal((pendingDetail.data.contact as unknown as Record<string, unknown>).lifecycleInitialization, "pending");
  assert.equal((await provider.readContactGraphForContact?.("contact:ready", "owner:other"))?.contacts.length, 0);
});

test("stored pending exchange survives live list and Web mapping without entering canonical status filters", async () => {
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  const workspaceId = "test:pending-list";
  const actorId = "owner:one";
  const rows = [
    { id: "pending-captured", stage: "captured", lifecycleInitialization: "pending" },
    { id: "pending-active", stage: "active", lifecycleInitialization: "pending" },
    { id: "pending-nurture", stage: "nurture", lifecycleInitialization: "pending" },
    { id: "ordinary-active", stage: "active" },
    { id: "ordinary-captured", stage: "captured" },
    { id: "ready-active", stage: "active", lifecycleInitialization: "ready" },
    { id: "other-owner", stage: "captured", lifecycleInitialization: "pending" },
  ];
  for (const row of rows) {
    await store.upsertRecord({ ...activeRecord({ collectionName: "contacts", targetType: "contact", workspaceId, searchText: row.id,
      payload: { ...row, displayName: row.id, source: { type: "event_import", id: "event:qa" }, evidenceIds: ["evidence:qa"], createdAt: "2026-09-17T00:00:00Z", updatedAt: "2026-09-17T00:00:00Z" } }), userId: row.id === "other-owner" ? "owner:other" : actorId });
  }
  const provider = createStorageContactGraphProvider({ store, workspaceId });
  const service = createLiveContactsListSearchAndFilterService({ provider });
  const result = await service.listContacts({ actorId });
  assert.equal(result.success, true);
  assert.equal(result.data.contacts.length, 6);
  assert.equal(result.data.contacts.find(contact => contact.id === "pending-captured")?.lifecycleInitialization, "pending");
  const counts = Object.fromEntries(result.data.availableFilters.statuses.map(status => [status.value, status.count]));
  assert.deepEqual(counts, { active: 2, needs_follow_up: 1, nurture: 0, archived: 0 });
  for (const status of ["active", "needs_follow_up", "nurture", "archived"] as const) {
    const filtered = await service.listContacts({ actorId, statusFilters: [status] });
    assert.equal(filtered.success, true);
    if (filtered.success) assert.ok(filtered.data.contacts.every(contact => !contact.id.startsWith("pending-")));
  }
  const payload = contactsPayloadViewModel({ payload: result.data, reviewActionRequested: false });
  const web = contactsRouteToOrbitContactsViewModel({ state: "success", payload });
  assert.equal(web.connections.filter(contact => contact.pipelineStatus === "pending_initialization").length, 3);
  assert.equal(web.connections.filter(contact => contact.pipelineStatus === "in_progress").length, 2);
  assert.equal(web.connections.find(contact => contact.id === "ordinary-captured")?.pipelineStatus, "to_contact");
  assert.equal(payload.ledger.needsAttention, 1);
});

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
  const actorId = "account_orbit_generated";
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
  await provider.upsertContactDetailState?.({
    actorId,
    contactId: "contact_001",
    notes: [],
    status: "active",
    tags: ["日本市场", "仅用于自定义标签检索"],
    updatedAt: "2026-07-01T16:05:00.000Z",
  });

  const listResult = await service.listContacts({ actorId });

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
  assert.equal(sato.displayName, defaultMockFixtures.contacts[0]?.displayName);
  assert.equal(sato.organization, defaultMockFixtures.contacts[0]?.organization);
  assert.equal(sato.source.type, "qr_scan");
  assert.deepEqual(sato.evidence.map((evidence) => evidence.evidenceId), [
    "evidence:contact:001",
  ]);
  assert.equal(sato.databaseQueryExecuted, true);
  assert.equal(sato.searchIndexReadExecuted, false);
  assert.ok(sato.value.valueTypes.includes("referral_path"));
  assert.deepEqual(sato.tags, ["日本市场", "仅用于自定义标签检索"]);
  assert.match(sato.relationshipContext, new RegExp(sato.displayName));
  assert.match(
    sato.relationshipContext,
    new RegExp(defaultMockFixtures.contacts[0]?.organization ?? ""),
  );

  const searchResult = await service.searchContacts({
    actorId,
    query: defaultMockFixtures.contacts[0]?.organization,
    sourceFilters: ["qr_scan"],
    valueFilters: ["referral_path"],
  });

  assert.equal(searchResult.success, true);
  assert.deepEqual(
    searchResult.data.contacts.map((contact) => contact.id),
    ["contact_001"],
  );

  const customTagSearch = await service.searchContacts({
    actorId,
    query: "仅用于自定义标签检索",
  });
  assert.equal(customTagSearch.success, true);
  assert.deepEqual(
    customTagSearch.data.contacts.map((contact) => contact.id),
    ["contact_001"],
  );

  const customTagFilter = await service.listContacts({
    actorId,
    tagFilters: ["仅用于自定义标签检索"],
  });
  assert.equal(customTagFilter.success, true);
  assert.deepEqual(
    customTagFilter.data.contacts.map((contact) => contact.id),
    ["contact_001"],
  );
  assert.ok(
    customTagFilter.data.availableFilters.tags.some(
      (tag) => tag.value === "仅用于自定义标签检索" && tag.count === 1,
    ),
  );
});

test("live contacts search reads only evidence needed for listed contacts", async () => {
  const actorId = "account-focused-list";
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
    actorId,
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

test("live contacts service requires an actor and hides another actor's graph", async () => {
  const workspaceId = "workspace:contacts-actor-boundary";
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  await seedGeneratedRelationshipFixturesIntoLiveStore({ store, workspaceId });
  const service = createLiveContactsListSearchAndFilterService({
    provider: createStorageContactGraphProvider({ store, workspaceId }),
  });

  const missingActor = await service.listContacts();
  const otherActor = await service.listContacts({ actorId: "account:other" });

  assert.equal(missingActor.success, false);
  assert.equal(missingActor.error.code, "CONTACTS_ACTOR_REQUIRED");
  assert.equal(otherActor.success, true);
  assert.deepEqual(otherActor.data.contacts, []);
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
