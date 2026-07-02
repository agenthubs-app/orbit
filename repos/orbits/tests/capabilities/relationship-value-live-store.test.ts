import assert from "node:assert/strict";
import test from "node:test";

import { createLiveRelationshipValueScoringService } from "../../features/analysis/live-value-service";
import { createStorageRelationshipValueProvider } from "../../features/analysis/storage/relationship-value-live-record-provider";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";
import { seedGeneratedRelationshipFixturesIntoLiveStore } from "../../shared/storage/seed-generated-fixtures";

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
