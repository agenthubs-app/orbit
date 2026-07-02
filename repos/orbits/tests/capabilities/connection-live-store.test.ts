import assert from "node:assert/strict";
import test from "node:test";

import { createLiveConnectionEvidenceService } from "../../features/connections/live-service";
import { createStorageConnectionEvidenceProvider } from "../../features/connections/storage/connection-live-record-provider";
import {
  createConnectionEvidenceService,
  resolveConnectionEvidenceService,
} from "../../features/connections/service-factory";
import { defaultMockFixtures } from "../../shared/mock/fixtures";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";
import { seedGeneratedRelationshipFixturesIntoLiveStore } from "../../shared/storage/seed-generated-fixtures";

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
