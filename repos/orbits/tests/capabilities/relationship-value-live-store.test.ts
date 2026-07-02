import assert from "node:assert/strict";
import test from "node:test";

import { createLiveRelationshipValueScoringService } from "../../features/analysis/live-value-service";
import { createStorageRelationshipValueProvider } from "../../features/analysis/storage/relationship-value-live-record-provider";
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
    provider: "relationship-value-live-store-test",
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

test("live relationship value scoring reads generated graph and recomputes without writes", async () => {
  const workspaceId = "workspace:relationship-value-live";
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();

  await seedGeneratedRelationshipFixturesIntoLiveStore({
    now: () => "2026-07-02T06:00:00.000Z",
    store,
    workspaceId,
  });

  const originalConnection = store.getRecord({
    collectionName: "connections",
    recordId: "connection_0007",
    workspaceId,
  });
  const provider = createStorageRelationshipValueProvider({
    sourceLabel: "Relationship value memory live storage",
    store,
    workspaceId,
  });
  const service = createLiveRelationshipValueScoringService({
    now: () => "2026-07-02T06:05:00.000Z",
    provider,
  });

  const value = await service.getRelationshipValue({
    connectionId: "connection_0007",
  });

  assert.equal(value.success, true);
  assert.equal(value.data.state, "success");
  assert.equal(value.data.assessment?.connectionId, "connection_0007");
  assert.equal(value.data.assessment?.contactId, "contact_078");
  assert.equal(value.data.assessment?.contactDisplayName, "曾伟");
  assert.equal(value.data.assessment?.relationshipValueType, "community_bridge");
  assert.equal(value.data.assessment?.priorityScore.value, 62);
  assert.equal(value.data.assessment?.priorityScore.band, "medium");
  assert.match(
    value.data.assessment?.rationale.summary ?? "",
    /duplicate contact cleanup and provenance review/,
  );
  assert.equal(
    value.data.assessment?.suggestedNextAction.label,
    "Follow up about privacy-safe contact provenance audit",
  );
  assert.deepEqual(value.data.assessment?.sourceEvidenceIds, [
    "evidence:connection:0007",
    "evidence:contact:078",
  ]);
  assert.equal(
    value.data.provenance.source,
    `live-record-store:relationship-value:${workspaceId}`,
  );
  assert.equal(
    value.data.provenance.sourceLabel,
    "Relationship value memory live storage",
  );
  assert.equal(value.data.provenance.generationMethod, "rule-based");
  assert.equal(value.data.provenance.databaseReadExecuted, true);
  assert.equal(value.data.provenance.databaseWriteExecuted, false);
  assert.equal(value.data.provenance.aiProviderRequested, false);

  const recomputed = await service.recomputeRelationshipValue({
    connectionId: "connection_0007",
    evidenceIds: ["evidence:connection:0007"],
  });

  assert.equal(recomputed.success, true);
  assert.equal(recomputed.data.assessment?.priorityScore.value, 57);
  assert.deepEqual(recomputed.data.provenance.evidenceIds, [
    "evidence:connection:0007",
  ]);
  assert.equal(
    recomputed.data.nextAction,
    "Use the selected evidence before acting on the suggested follow-up.",
  );

  const missing = await service.getRelationshipValue({
    connectionId: "missing-connection",
  });

  assert.equal(missing.success, false);
  assert.equal(missing.error.code, "RELATIONSHIP_VALUE_NOT_FOUND");

  const storedConnection = store.getRecord({
    collectionName: "connections",
    recordId: "connection_0007",
    workspaceId,
  });

  assert.deepEqual(storedConnection?.payload, originalConnection?.payload);
});

test("live relationship value scoring reads only records for the selected connection", async () => {
  const workspaceId = "workspace:relationship-value-focused";
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
    id: "source:focused-value",
    label: "Focused value test",
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
    accountId: "account-focused-value",
    contactId: selectedContact.id,
    stage: "active",
    valueTypes: ["strategic_fit"],
    summary: "Selected relationship value context",
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
    summary: "Unrelated relationship value context",
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
    createdBy: "relationship-value-live-store-test",
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

  const provider = createStorageRelationshipValueProvider({
    sourceLabel: "Relationship value focused storage",
    store,
    workspaceId,
  });
  const service = createLiveRelationshipValueScoringService({
    now: () => "2026-07-02T10:05:00.000Z",
    provider,
  });

  const value = await service.getRelationshipValue({
    connectionId: selectedConnection.id,
  });

  assert.equal(value.success, true);
  assert.equal(value.data.assessment?.connectionId, selectedConnection.id);

  const connectionQuery = listQueries.find(
    (query) => query.collectionName === "connections",
  );
  const contactQuery = listQueries.find(
    (query) => query.collectionName === "contacts",
  );
  const evidenceQuery = listQueries.find(
    (query) => query.collectionName === "evidence",
  );

  assert.ok(connectionQuery);
  assert.deepEqual(connectionQuery.recordIds, [selectedConnection.id]);
  assert.ok(contactQuery);
  assert.deepEqual(contactQuery.recordIds, [selectedContact.id]);
  assert.ok(evidenceQuery);
  assert.deepEqual([...(evidenceQuery.recordIds ?? [])].sort(), [
    "evidence:selected-connection",
    "evidence:selected-contact",
  ]);
});
