import assert from "node:assert/strict";
import test from "node:test";

import { createLiveContactDetailTagStatusService } from "../../features/contacts/live-detail-service";
import { createStorageContactGraphProvider } from "../../features/contacts/storage/contact-live-record-provider";
import {
  createMemoryLiveRecordStore,
  type LiveRecord,
  type LiveRecordListQuery,
} from "../../shared/storage/live-record-store";
import { seedGeneratedRelationshipFixturesIntoLiveStore } from "../../shared/storage/seed-generated-fixtures";

function activeRecord(input: {
  collectionName: string;
  payload: Record<string, unknown> & { id: string };
  searchText: string;
  targetType: string;
  userId?: string;
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
    userId: input.userId,
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
    provider: "contact-detail-live-store-test",
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

test("live contact detail persists actor-scoped tag status note and interaction updates", async () => {
  const actorId = "actor:contact-detail-live";
  const workspaceId = "workspace:contact-detail-live";
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();

  await seedGeneratedRelationshipFixturesIntoLiveStore({
    now: () => "2026-07-02T02:00:00.000Z",
    store,
    workspaceId,
  });
  for (const collectionName of ["contacts", "connections", "evidence"]) {
    const records = await store.listRecords({ limit: "unbounded", collectionName, workspaceId });
    for (const record of records) {
      await store.upsertRecord({
        ...record,
        userId: actorId,
        payload: { ...record.payload, accountId: actorId },
      });
    }
  }
  for (const record of await store.listRecords({ limit: "unbounded", collectionName: "connections", workspaceId })) {
    if (record.payload.contactId === "contact_078") {
      await store.deleteRecord({ collectionName: "connections", deletedAt: "2026-07-02T02:01:00.000Z", recordId: record.recordId, workspaceId });
    }
  }

  const provider = createStorageContactGraphProvider({
    sourceLabel: "Contact detail memory live storage",
    store,
    workspaceId,
  });
  const service = createLiveContactDetailTagStatusService({
    now: () => "2026-07-02T02:05:00.000Z",
    provider,
  });

  const detail = await service.getContactDetail({
    actorId,
    contactId: "contact_078",
  });

  assert.equal(detail.success, true);
  assert.equal(detail.data.contact?.id, "contact_078");
  assert.equal(detail.data.contact?.contentLanguage, "zh");
  assert.ok(detail.data.contact?.displayName);
  assert.equal(detail.data.contact?.databaseReadExecuted, true);
  assert.equal(detail.data.contact?.databaseWriteExecuted, false);
  assert.equal(detail.data.contact?.tagWriteExecuted, false);
  assert.equal(detail.data.contact?.statusWriteExecuted, false);
  assert.equal(detail.data.contact?.productionAuditLogWriteExecuted, false);
  assert.equal(
    detail.data.provenance.source,
    `live-record-store:contacts:${workspaceId}`,
  );
  assert.equal(
    detail.data.provenance.sourceLabel,
    "Contact detail memory live storage",
  );
  assert.equal(detail.data.provenance.generationMethod, "live-store-query");
  assert.equal(detail.data.provenance.databaseReadExecuted, true);
  assert.equal(detail.data.provenance.databaseWriteExecuted, false);
  assert.equal(detail.data.provenance.aiProviderRequested, false);
  assert.equal(detail.data.provenance.externalNetworkRequested, false);

  const updated = await service.updateContactDetail({
    actorId,
    addTags: ["topic:venture-ecosystem", "日本市场"],
    contactId: "contact_078",
    lastInteraction: {
      channel: "manual_note",
      occurredAt: "2026-07-02T02:10:00.000Z",
      summary: "Operator reviewed live contact detail after the event.",
    },
    note: {
      authorLabel: "Orbit operator",
      body: "Persisted a live contact detail status update.",
    },
    primaryIndustryId: "technology_internet",
    status: "active",
  });

  assert.equal(updated.success, true);
  assert.equal(updated.data.contact?.id, "contact_078");
  assert.equal(updated.data.contact?.status, "active");
  assert.ok(updated.data.contact?.tags.includes("topic:venture-ecosystem"));
  const updatedTags: readonly string[] = updated.data.contact?.tags ?? [];
  assert.ok(updatedTags.includes("日本市场"));
  assert.equal(updated.data.contact?.primaryIndustryId, "technology_internet");
  assert.equal(updated.data.contact?.primaryIndustryLabel, "科技与互联网");
  assert.match(
    updated.data.contact?.notes.at(-1)?.body ?? "",
    /Persisted a live contact detail status update/,
  );
  assert.equal(
    updated.data.contact?.lastInteraction.summary,
    "Operator reviewed live contact detail after the event.",
  );
  assert.equal(
    updated.data.provenance.generationMethod,
    "live-store-update",
  );
  assert.equal(updated.data.provenance.databaseReadExecuted, true);
  assert.equal(updated.data.provenance.databaseWriteExecuted, true);
  assert.equal(updated.data.provenance.productionAuditLogWriteExecuted, false);
  assert.equal(updated.data.contact?.databaseWriteExecuted, true);
  assert.equal(updated.data.contact?.tagWriteExecuted, true);
  assert.equal(updated.data.contact?.statusWriteExecuted, true);
  assert.equal(updated.data.contact?.noteWriteExecuted, true);

  const refreshed = await service.getContactDetail({
    actorId,
    contactId: "contact_078",
  });
  assert.equal(refreshed.success, true);
  assert.equal(refreshed.data.provenance.generationMethod, "live-store-query");
  assert.equal(refreshed.data.provenance.databaseWriteExecuted, false);
  assert.ok(
    refreshed.data.contact?.tags.includes("topic:venture-ecosystem"),
  );
  const refreshedTags: readonly string[] = refreshed.data.contact?.tags ?? [];
  assert.ok(refreshedTags.includes("日本市场"));
  assert.equal(refreshed.data.contact?.primaryIndustryId, "technology_internet");
  assert.equal(
    refreshed.data.contact?.notes.filter((note) =>
      note.body.includes("Persisted a live contact detail status update"),
    ).length,
    1,
  );
  assert.equal(
    refreshed.data.contact?.lastInteraction.summary,
    "Operator reviewed live contact detail after the event.",
  );

  const replayed = await service.updateContactDetail({
    actorId,
    addTags: ["topic:venture-ecosystem"],
    contactId: "contact_078",
    lastInteraction: {
      channel: "manual_note",
      occurredAt: "2026-07-02T02:10:00.000Z",
      summary: "Operator reviewed live contact detail after the event.",
    },
    note: {
      authorLabel: "Orbit operator",
      body: "Persisted a live contact detail status update.",
    },
    status: "active",
  });
  assert.equal(replayed.success, true);
  const replayReadback = await service.getContactDetail({
    actorId,
    contactId: "contact_078",
  });
  assert.equal(replayReadback.success, true);
  assert.equal(
    replayReadback.data.contact?.notes.filter((note) =>
      note.body.includes("Persisted a live contact detail status update"),
    ).length,
    1,
  );

  const rejected = await service.updateContactDetail({
    actorId,
    contactId: "contact_078",
    primaryIndustryId: "made_up_industry",
  });
  assert.equal(rejected.success, false);
  if (!rejected.success) {
    assert.equal(rejected.error.code, "CONTACT_DETAIL_INDUSTRY_NOT_SUPPORTED");
  }

  const cleared = await service.updateContactDetail({
    actorId,
    contactId: "contact_078",
    primaryIndustryId: null,
  });
  assert.equal(cleared.success, true);
  assert.equal(cleared.data.contact?.primaryIndustryId, undefined);

  const isolated = await service.updateContactDetail({
    actorId: "actor:contact-detail-isolation",
    contactId: "contact_078",
    primaryIndustryId: "finance_investment",
  });
  assert.equal(isolated.success, false);
  if (!isolated.success) {
    assert.equal(isolated.error.code, "CONTACT_DETAIL_NOT_FOUND");
  }

  assert.equal(
    await provider.readContactDetailState?.(
      "contact_078",
      "actor:contact-detail-isolation",
    ),
    null,
  );
});

test("canonical connection stages are authoritative even without markers and reject detail status writes", async () => {
  const actorId = "actor:canonical-contact-detail";
  const workspaceId = "workspace:canonical-contact-detail";
  const contactId = "contact:legacy-canonical";
  const source = { type: "manual", id: "source:canonical-contact-detail" };
  const base = {
    createdAt: "2026-09-17T00:00:00Z",
    evidenceIds: ["evidence:canonical-contact-detail"],
    source,
    updatedAt: "2026-09-17T01:00:00Z",
  };
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  await store.upsertRecord({
    ...activeRecord({
      collectionName: "contacts",
      payload: {
        ...base,
        displayName: "Legacy canonical contact",
        id: contactId,
        stage: "needs_follow_up",
      },
      searchText: "Legacy canonical contact",
      targetType: "contact",
      workspaceId,
    }),
    userId: actorId,
  });
  await store.upsertRecord({
    ...activeRecord({
      collectionName: "connections",
      payload: {
        ...base,
        accountId: actorId,
        contactId,
        id: "connection:legacy-canonical",
        version: 1,
        stage: "active",
        summary: "Canonical relationship without a lifecycle marker",
        valueTypes: [],
      },
      searchText: "Canonical relationship without a lifecycle marker",
      targetType: "connection",
      workspaceId,
    }),
    userId: actorId,
  });
  const provider = createStorageContactGraphProvider({ store, workspaceId });
  await provider.upsertContactDetailState?.({
    actorId,
    contactId,
    notes: [],
    status: "nurture",
    tags: ["legacy-detail-state"],
    updatedAt: "2026-09-17T00:30:00Z",
  });
  const service = createLiveContactDetailTagStatusService({
    now: () => "2026-09-17T02:00:00Z",
    provider,
  });

  const before = await service.getContactDetail({ actorId, contactId });
  assert.equal(before.success, true);
  if (!before.success || !before.data.contact) throw new Error("Missing canonical contact");
  assert.equal(before.data.contact.status, "active");
  assert.equal(before.data.contact.updatedAt, base.updatedAt);

  const rejected = await service.updateContactDetail({
    actorId,
    contactId,
    status: "archived",
  });
  assert.equal(rejected.success, false);
  if (!rejected.success) {
    assert.equal(rejected.error.code, "CONTACT_DETAIL_CANONICAL_STATUS_LIFECYCLE_ONLY");
    assert.equal(rejected.error.provenance.databaseReadExecuted, true);
    assert.equal(rejected.error.provenance.databaseWriteExecuted, false);
  }
  assert.equal(
    (await provider.readContactDetailState?.(contactId, actorId))?.status,
    "nurture",
  );
  const after = await service.getContactDetail({ actorId, contactId });
  assert.equal(after.success, true);
  if (!after.success || !after.data.contact) throw new Error("Missing canonical readback");
  assert.equal(after.data.contact.status, "active");

  const legacyContactId = "contact:ordinary-legacy";
  await store.upsertRecord({
    ...activeRecord({
      collectionName: "contacts",
      payload: {
        ...base,
        displayName: "Ordinary legacy contact",
        id: legacyContactId,
        stage: "captured",
      },
      searchText: "Ordinary legacy contact",
      targetType: "contact",
      workspaceId,
    }),
    userId: actorId,
  });
  await provider.upsertContactDetailState?.({
    actorId,
    contactId: legacyContactId,
    notes: [],
    status: "needs_follow_up",
    tags: [],
    updatedAt: "2026-09-17T00:30:00Z",
  });
  const legacyUpdate = await service.updateContactDetail({
    actorId,
    contactId: legacyContactId,
    status: "archived",
  });
  assert.equal(legacyUpdate.success, true);
  if (!legacyUpdate.success || !legacyUpdate.data.contact) throw new Error("Missing legacy contact update");
  assert.equal(legacyUpdate.data.contact.status, "archived");
  assert.equal(
    (await provider.readContactDetailState?.(legacyContactId, actorId))?.status,
    "archived",
  );
});

test("pending and ready lifecycle markers block status bypass but retain private field updates", async () => {
  const actorId = "actor:contact-detail-lifecycle-markers";
  const workspaceId = "workspace:contact-detail-lifecycle-markers";
  const source = { type: "manual", id: "source:contact-detail-lifecycle-markers" };
  const base = {
    createdAt: "2026-09-17T00:00:00Z",
    evidenceIds: ["evidence:contact-detail-lifecycle-markers"],
    source,
    updatedAt: "2026-09-17T01:00:00Z",
  };
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  const pendingContactId = "contact:pending-marker";
  const readyContactId = "contact:ready-marker";
  for (const row of [
    {
      contactId: pendingContactId,
      contactStage: "captured",
      connectionStage: "captured",
      marker: "pending",
    },
    {
      contactId: readyContactId,
      contactStage: "active",
      connectionStage: "active",
      marker: "ready",
    },
  ] as const) {
    await store.upsertRecord({
      ...activeRecord({
        collectionName: "contacts",
        payload: {
          ...base,
          displayName: row.contactId,
          id: row.contactId,
          lifecycleInitialization: row.marker,
          stage: row.contactStage,
        },
        searchText: row.contactId,
        targetType: "contact",
        workspaceId,
      }),
      userId: actorId,
    });
    await store.upsertRecord({
      ...activeRecord({
        collectionName: "connections",
        payload: {
          ...base,
          accountId: actorId,
          contactId: row.contactId,
          id: `connection:${row.contactId}`,
          lifecycleInitialization: row.marker,
          stage: row.connectionStage,
          summary: `${row.marker} relationship candidate`,
          valueTypes: [],
        },
        searchText: row.contactId,
        targetType: "connection",
        workspaceId,
      }),
      userId: actorId,
    });
  }
  const provider = createStorageContactGraphProvider({ store, workspaceId });
  await provider.upsertContactDetailState?.({
    actorId,
    contactId: pendingContactId,
    notes: [],
    status: "archived",
    tags: [],
    updatedAt: "2026-09-17T01:30:00Z",
  });
  await provider.upsertContactDetailState?.({
    actorId,
    contactId: readyContactId,
    notes: [],
    status: "nurture",
    tags: [],
    updatedAt: "2026-09-17T01:30:00Z",
  });
  const service = createLiveContactDetailTagStatusService({
    now: () => "2026-09-17T02:00:00Z",
    provider,
  });

  const pendingRead = await service.getContactDetail({
    actorId,
    contactId: pendingContactId,
  });
  assert.equal(pendingRead.success, true);
  if (!pendingRead.success || !pendingRead.data.contact) {
    throw new Error("Missing pending contact detail");
  }
  assert.equal(pendingRead.data.contact.status, "needs_follow_up");

  const pendingStatus = await service.updateContactDetail({
    actorId,
    contactId: pendingContactId,
    status: "active",
  });
  assert.equal(pendingStatus.success, false);
  if (!pendingStatus.success) {
    assert.equal(
      pendingStatus.error.code,
      "CONTACT_DETAIL_CANONICAL_STATUS_LIFECYCLE_ONLY",
    );
  }
  assert.equal(
    (await provider.readContactDetailState?.(pendingContactId, actorId))?.status,
    "archived",
  );

  const pendingPrivateUpdate = await service.updateContactDetail({
    actorId,
    addTags: ["priority:warm-follow-up"],
    contactId: pendingContactId,
    note: { authorLabel: "Orbit operator", body: "Private pending note" },
  });
  assert.equal(pendingPrivateUpdate.success, true);
  assert.equal(
    (await provider.readContactDetailState?.(pendingContactId, actorId))?.status,
    "archived",
  );
  const pendingState = await provider.readContactDetailState?.(
    pendingContactId,
    actorId,
  );
  assert.ok(pendingState?.tags.includes("priority:warm-follow-up"));
  assert.ok(pendingState?.notes.some((note) => note.body === "Private pending note"));

  const readyRead = await service.getContactDetail({
    actorId,
    contactId: readyContactId,
  });
  assert.equal(readyRead.success, true);
  if (!readyRead.success || !readyRead.data.contact) {
    throw new Error("Missing ready contact detail");
  }
  assert.equal(readyRead.data.contact.status, "active");
  const readyStatus = await service.updateContactDetail({
    actorId,
    contactId: readyContactId,
    status: "archived",
  });
  assert.equal(readyStatus.success, false);
  if (!readyStatus.success) {
    assert.equal(
      readyStatus.error.code,
      "CONTACT_DETAIL_CANONICAL_STATUS_LIFECYCLE_ONLY",
    );
  }
  assert.equal(
    (await provider.readContactDetailState?.(readyContactId, actorId))?.status,
    "nurture",
  );
});

test("duplicate owned connection candidates fail closed instead of selecting first or last", async () => {
  const actorId = "actor:contact-detail-duplicate";
  const workspaceId = "workspace:contact-detail-duplicate";
  const contactId = "contact:duplicate-candidate";
  const source = { type: "manual", id: "source:contact-detail-duplicate" };
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  await store.upsertRecord({
    ...activeRecord({
      collectionName: "contacts",
      payload: {
        createdAt: "2026-09-17T00:00:00Z",
        displayName: "Duplicate candidate",
        evidenceIds: ["evidence:contact-detail-duplicate"],
        id: contactId,
        source,
        stage: "captured",
        updatedAt: "2026-09-17T01:00:00Z",
      },
      searchText: "Duplicate candidate",
      targetType: "contact",
      workspaceId,
    }),
    userId: actorId,
  });
  for (const [id, stage] of [
    ["connection:duplicate:first", "active"],
    ["connection:duplicate:last", "nurture"],
  ] as const) {
    await store.upsertRecord({
      ...activeRecord({
        collectionName: "connections",
        payload: {
          accountId: actorId,
          contactId,
          createdAt: "2026-09-17T00:00:00Z",
          evidenceIds: ["evidence:contact-detail-duplicate"],
          id,
          source,
          stage,
          summary: `Duplicate ${stage} relationship candidate`,
          version: 1,
          updatedAt: "2026-09-17T01:00:00Z",
          valueTypes: [],
        },
        searchText: id,
        targetType: "connection",
        workspaceId,
      }),
      userId: actorId,
    });
  }
  const provider = createStorageContactGraphProvider({ store, workspaceId });
  await provider.upsertContactDetailState?.({
    actorId,
    contactId,
    notes: [],
    status: "nurture",
    tags: [],
    updatedAt: "2026-09-17T01:30:00Z",
  });
  const service = createLiveContactDetailTagStatusService({ provider });

  const read = await service.getContactDetail({ actorId, contactId });
  assert.equal(read.success, false);
  if (!read.success) {
    assert.equal(read.error.code, "CONTACT_DETAIL_AMBIGUOUS_CONNECTION");
    assert.equal(read.error.provenance.databaseReadExecuted, true);
    assert.equal(read.error.provenance.databaseWriteExecuted, false);
  }
  const update = await service.updateContactDetail({
    actorId,
    contactId,
    status: "archived",
  });
  assert.equal(update.success, false);
  if (!update.success) {
    assert.equal(update.error.code, "CONTACT_DETAIL_AMBIGUOUS_CONNECTION");
  }
  assert.equal(
    (await provider.readContactDetailState?.(contactId, actorId))?.status,
    "nurture",
  );
});

test("live contact detail write failure returns failure and leaves no detail state", async () => {
  const actorId = "actor:contact-detail-write-failure";
  const workspaceId = "workspace:contact-detail-write-failure";
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  await seedGeneratedRelationshipFixturesIntoLiveStore({
    now: () => "2026-07-02T03:00:00.000Z",
    store,
    workspaceId,
  });
  for (const collectionName of ["contacts", "connections", "evidence"]) {
    const records = await store.listRecords({ limit: "unbounded", collectionName, workspaceId });
    for (const record of records) {
      await store.upsertRecord({
        ...record,
        userId: actorId,
        payload: { ...record.payload, accountId: actorId },
      });
    }
  }
  const storageProvider = createStorageContactGraphProvider({
    store,
    workspaceId,
  });
  const service = createLiveContactDetailTagStatusService({
    now: () => "2026-07-02T03:05:00.000Z",
    provider: {
      ...storageProvider,
      async upsertContactDetailState() {
        throw new Error("injected storage failure");
      },
    },
  });

  const failed = await service.updateContactDetail({
    actorId,
    contactId: "contact_078",
    note: "This must not be reported as saved.",
  });

  assert.equal(failed.success, false);
  if (!failed.success) {
    assert.equal(
      failed.error.code,
      "CONTACT_DETAIL_LIVE_STORE_WRITE_FAILED",
    );
    assert.equal(failed.error.provenance.databaseWriteExecuted, false);
  }
  assert.equal(
    await storageProvider.readContactDetailState?.("contact_078", actorId),
    null,
  );
});

test("live contact detail reads only evidence for the selected contact graph", async () => {
  const workspaceId = "workspace:contact-detail-focused";
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
    id: "source:focused-detail",
    label: "Focused detail test",
  };
  const selectedContact = {
    id: "contact-selected",
    displayName: "Selected Person",
    organization: "Selected Org",
    role: "Founder",
    location: "Tokyo",
    profileSnippet: "Selected profile",
    primaryIndustryId: "technology_internet",
    secondaryIndustryId: "technology_internet.enterprise_software",
    publicProfile: {
      bio: "Public biography from the contact profile",
      selfIntroduction: "First-person introduction from the contact",
      industry: "Industrial software",
      primaryIndustryId: "technology_internet",
      secondaryIndustryId: "technology_internet.enterprise_software",
      offering: ["Factory operations expertise"],
      seeking: ["A deployment partner"],
      topics: ["quality systems", "automation"],
      conversationPrompts: ["Which production line should be reviewed first?"],
    },
    stage: "active",
    source,
    evidenceIds: ["evidence:selected-contact"],
    createdAt: "2026-07-02T10:00:00.000Z",
    updatedAt: "2026-07-02T10:00:00.000Z",
  };
  const unrelatedContact = {
    ...selectedContact,
    id: "contact-unrelated",
    displayName: "Unrelated Person",
    organization: "Unrelated Org",
    evidenceIds: ["evidence:unrelated-contact"],
  };
  const selectedConnection = {
    id: "connection-selected",
    accountId: "account-focused-detail",
    contactId: selectedContact.id,
    stage: "active",
    valueTypes: ["strategic_fit"],
    summary: "Selected relationship context",
    relationshipStrength: 70,
    businessRelevanceScore: 80,
    sharedTopics: ["selected"],
    suggestedActions: ["follow up"],
    source,
    evidenceIds: ["evidence:selected-connection"],
    createdAt: "2026-07-02T10:00:00.000Z",
    updatedAt: "2026-07-02T10:00:00.000Z",
  };
  const unrelatedConnection = {
    ...selectedConnection,
    id: "connection-unrelated",
    contactId: unrelatedContact.id,
    summary: "Unrelated relationship context",
    evidenceIds: ["evidence:unrelated-connection"],
  };
  const evidencePayloads = [
    {
      id: "evidence:selected-contact",
      sourceType: "manual",
      sourceId: "source:selected-contact",
      summary: "Selected contact evidence",
    },
    {
      id: "evidence:selected-connection",
      sourceType: "manual",
      sourceId: "source:selected-connection",
      summary: "Selected connection evidence",
    },
    {
      id: "evidence:unrelated-contact",
      sourceType: "manual",
      sourceId: "source:unrelated-contact",
      summary: "Unrelated contact evidence",
    },
    {
      id: "evidence:unrelated-connection",
      sourceType: "manual",
      sourceId: "source:unrelated-connection",
      summary: "Unrelated connection evidence",
    },
  ].map((payload) => ({
    ...payload,
    occurredAt: "2026-07-02T10:00:00.000Z",
    confidence: 0.9,
    createdBy: "contact-detail-live-store-test",
  }));

  for (const payload of [selectedContact, unrelatedContact]) {
    rawStore.upsertRecord(
      activeRecord({
        collectionName: "contacts",
        payload,
        searchText: `${payload.displayName} ${payload.organization}`,
        targetType: "contact",
        userId: selectedConnection.accountId,
        workspaceId,
      }),
    );
  }

  for (const payload of [selectedConnection, unrelatedConnection]) {
    rawStore.upsertRecord(
      activeRecord({
        collectionName: "connections",
        payload,
        searchText: `${payload.summary} ${payload.contactId}`,
        targetType: "connection",
        userId: selectedConnection.accountId,
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
    sourceLabel: "Contact detail focused storage",
    store,
    workspaceId,
  });
  const service = createLiveContactDetailTagStatusService({
    now: () => "2026-07-02T10:05:00.000Z",
    provider,
  });

  const detail = await service.getContactDetail({
    actorId: selectedConnection.accountId,
    contactId: selectedContact.id,
  });

  assert.equal(detail.success, true);
  assert.equal(detail.data.contact?.id, selectedContact.id);
  assert.equal(detail.data.contact?.primaryIndustryId, "technology_internet");
  assert.equal(detail.data.contact?.secondaryIndustryId, "technology_internet.enterprise_software");
  assert.equal(
    detail.data.contact?.publicProfile.bio,
    selectedContact.publicProfile.bio,
  );
  assert.equal(
    detail.data.contact?.publicProfile.selfIntroduction,
    selectedContact.publicProfile.selfIntroduction,
  );
  assert.equal(
    detail.data.contact?.relationshipContext,
    selectedConnection.summary,
  );
  assert.notEqual(
    detail.data.contact?.publicProfile.bio,
    detail.data.contact?.relationshipContext,
  );
  assert.deepEqual(
    detail.data.contact?.notes.map((note) => note.body).sort(),
    ["Selected connection evidence", "Selected contact evidence"],
  );
  assert.equal(
    detail.data.contact?.lastInteraction.summary,
    "Selected contact evidence",
  );

  const contactQuery = listQueries.find(
    (query) => query.collectionName === "contacts",
  );
  const evidenceQuery = listQueries.find(
    (query) => query.collectionName === "evidence",
  );

  assert.ok(contactQuery);
  assert.deepEqual(contactQuery.recordIds, [selectedContact.id]);
  assert.ok(evidenceQuery);
  assert.deepEqual([...(evidenceQuery.recordIds ?? [])].sort(), [
    "evidence:selected-connection",
    "evidence:selected-contact",
  ]);
});

test("live contact detail requires an actor before provider access", async () => {
  let providerRead = false;
  const service = createLiveContactDetailTagStatusService({
    provider: {
      source: "test:contact-detail",
      sourceLabel: "Test contact detail",
      readContactGraph() {
        providerRead = true;
        throw new Error("provider must not run without an actor");
      },
    },
  });

  const result = await service.getContactDetail({ contactId: "contact:any" });

  assert.equal(result.success, false);
  assert.equal(providerRead, false);
  if (!result.success) {
    assert.equal(result.error.code, "CONTACT_DETAIL_ACTOR_REQUIRED");
    assert.equal(result.error.provenance.databaseReadExecuted, false);
  }
});

test("business-card contacts show the capture method as their source, including legacy actor-labelled rows", async () => {
  const actorId = "actor:contact-detail-source";
  const workspaceId = "workspace:contact-detail-source";
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();

  await seedGeneratedRelationshipFixturesIntoLiveStore({
    now: () => "2026-09-02T00:00:00.000Z",
    store,
    workspaceId,
  });
  for (const collectionName of ["contacts", "connections", "evidence"]) {
    const records = await store.listRecords({ limit: "unbounded", collectionName, workspaceId });
    for (const record of records) {
      const isTarget =
        collectionName === "contacts" && record.payload.id === "contact_078";
      await store.upsertRecord({
        ...record,
        userId: actorId,
        payload: {
          ...record.payload,
          accountId: actorId,
          // 存量数据形态：确认者被当成来源写了进去。
          ...(isTarget
            ? {
                source: {
                  id: "sha256:legacy",
                  label: "Business card confirmed by user_ms1n64k3_eh7j0g",
                  type: "business_card_ocr",
                },
              }
            : {}),
        },
      });
    }
  }

  const service = createLiveContactDetailTagStatusService({
    now: () => "2026-09-02T00:05:00.000Z",
    provider: createStorageContactGraphProvider({
      sourceLabel: "Contact detail memory live storage",
      store,
      workspaceId,
    }),
  });

  const detail = await service.getContactDetail({ actorId, contactId: "contact_078" });

  assert.equal(detail.success, true);
  const label = detail.data.contact?.source.label ?? "";
  assert.equal(label, "Business card scan");
  assert.ok(!label.includes("user_ms1n64k3_eh7j0g"));
});
