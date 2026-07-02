import assert from "node:assert/strict";
import test from "node:test";

import { createLiveConnectionEvidenceService } from "../../features/connections/live-service";
import { createStorageConnectionEvidenceProvider } from "../../features/connections/storage/connection-live-record-provider";
import {
  createConnectionEvidenceService,
  resolveConnectionEvidenceService,
} from "../../features/connections/service-factory";
import { defaultMockFixtures } from "../../shared/mock/fixtures";
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
    provider: "connection-live-store-test",
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

test("live connection evidence service reads generated relationship graph from shared live storage", async () => {
  const workspaceId = "workspace:connection-live-store-test";
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();

  await seedGeneratedRelationshipFixturesIntoLiveStore({
    now: () => "2026-07-01T17:00:00.000Z",
    store,
    workspaceId,
  });

  const provider = createStorageConnectionEvidenceProvider({
    sourceLabel: "Connections memory live storage",
    store,
    workspaceId,
  });
  const service = createLiveConnectionEvidenceService({
    provider,
  });

  const listResult = await service.listConnections();

  assert.equal(listResult.success, true);
  assert.equal(listResult.data.connections.length, defaultMockFixtures.connections.length);
  assert.equal(listResult.data.provenance.source, `live-record-store:connections:${workspaceId}`);
  assert.equal(listResult.data.provenance.sourceLabel, "Connections memory live storage");
  assert.equal(listResult.data.provenance.generationMethod, "live-store-query");
  assert.equal(listResult.data.provenance.databaseReadExecuted, true);
  assert.equal(listResult.data.provenance.databaseWriteExecuted, false);
  assert.equal(listResult.data.provenance.privacy, "live-connection-evidence");

  const connection = listResult.data.connections.find(
    (item) => item.id === "connection_0012",
  );

  assert.ok(connection);
  assert.equal(connection.contactId, "contact_001");
  assert.equal(connection.displayName, "佐藤 健一");
  assert.equal(connection.relationshipStage, "needs_follow_up");
  assert.equal(connection.databaseReadExecuted, true);
  assert.equal(connection.databaseWriteExecuted, false);
  assert.ok(connection.evidenceTimeline.length > 0);

  const detailResult = await service.getConnection({
    connectionId: "connection_0012",
  });

  assert.equal(detailResult.success, true);
  assert.equal(detailResult.data.connection?.id, "connection_0012");
  assert.equal(detailResult.data.connection?.displayName, "佐藤 健一");
  assert.equal(detailResult.data.evidenceTimeline[0]?.evidenceId, "evidence:connection:0012");

  const missingResult = await service.getConnection({
    connectionId: "missing-connection",
  });

  assert.equal(missingResult.success, false);

  if (!missingResult.success) {
    assert.equal(missingResult.error.code, "CONNECTION_NOT_FOUND");
    assert.equal(missingResult.error.provenance.generationMethod, "live-store-query");
  }
});

test("live connection detail reads only records for the selected connection", async () => {
  const workspaceId = "workspace:connection-focused-detail";
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
    id: "source:focused-connection",
    label: "Focused connection test",
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
    accountId: "account-focused-connection",
    contactId: selectedContact.id,
    stage: "active",
    valueTypes: ["strategic_fit"],
    summary: "Selected connection context",
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
    summary: "Unrelated connection context",
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
    createdBy: "connection-live-store-test",
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

  const provider = createStorageConnectionEvidenceProvider({
    sourceLabel: "Connection focused storage",
    store,
    workspaceId,
  });
  const service = createLiveConnectionEvidenceService({
    provider,
  });

  const detail = await service.getConnection({
    connectionId: selectedConnection.id,
  });

  assert.equal(detail.success, true);
  assert.equal(detail.data.connection?.id, selectedConnection.id);

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

test("connection factory registers live mode and fails closed without live database config", async () => {
  const previousDatabaseUrl = process.env.ORBIT_DATABASE_URL;
  const previousEventDatabaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;
  const previousLiveDatabaseUrl = process.env.ORBIT_LIVE_DATABASE_URL;

  try {
    delete process.env.ORBIT_DATABASE_URL;
    delete process.env.ORBIT_EVENT_DATABASE_URL;
    delete process.env.ORBIT_LIVE_DATABASE_URL;

    const liveResolution = resolveConnectionEvidenceService("live");
    const liveService = createConnectionEvidenceService("live");
    const result = await liveService.listConnections();

    assert.equal(liveResolution.success, true);
    assert.equal(result.success, false);

    if (!result.success) {
      assert.equal(result.error.code, "CONNECTION_LIVE_STORE_UNCONFIGURED");
      assert.equal(result.error.provenance.databaseReadExecuted, false);
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
