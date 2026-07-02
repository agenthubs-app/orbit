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

test("live contact detail reads generated contact graph and previews tag status updates", async () => {
  const workspaceId = "workspace:contact-detail-live";
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();

  await seedGeneratedRelationshipFixturesIntoLiveStore({
    now: () => "2026-07-02T02:00:00.000Z",
    store,
    workspaceId,
  });

  const provider = createStorageContactGraphProvider({
    sourceLabel: "Contact detail memory live storage",
    store,
    workspaceId,
  });
  const service = createLiveContactDetailTagStatusService({
    now: () => "2026-07-02T02:05:00.000Z",
    provider,
  });

  const detail = await service.getContactDetail({ contactId: "contact_078" });

  assert.equal(detail.success, true);
  assert.equal(detail.data.contact?.id, "contact_078");
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
    addTags: ["topic:venture-ecosystem"],
    contactId: "contact_078",
    lastInteraction: {
      channel: "manual_note",
      occurredAt: "2026-07-02T02:10:00.000Z",
      summary: "Operator reviewed live contact detail after the event.",
    },
    note: {
      authorLabel: "Orbit operator",
      body: "Previewed a live contact detail status update without writing Contacts.",
    },
    status: "active",
  });

  assert.equal(updated.success, true);
  assert.equal(updated.data.contact?.id, "contact_078");
  assert.equal(updated.data.contact?.status, "active");
  assert.ok(updated.data.contact?.tags.includes("topic:venture-ecosystem"));
  assert.match(
    updated.data.contact?.notes.at(-1)?.body ?? "",
    /Previewed a live contact detail status update/,
  );
  assert.equal(
    updated.data.contact?.lastInteraction.summary,
    "Operator reviewed live contact detail after the event.",
  );
  assert.equal(
    updated.data.provenance.generationMethod,
    "live-store-preview-update",
  );
  assert.equal(updated.data.provenance.databaseReadExecuted, true);
  assert.equal(updated.data.provenance.databaseWriteExecuted, false);
  assert.equal(updated.data.provenance.productionAuditLogWriteExecuted, false);
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
    contactId: selectedContact.id,
  });

  assert.equal(detail.success, true);
  assert.equal(detail.data.contact?.id, selectedContact.id);

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
