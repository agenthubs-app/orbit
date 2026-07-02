import assert from "node:assert/strict";
import test from "node:test";

import { createLiveRelationshipStageAndProfileService } from "../../features/connections/live-profile-service";
import { createStorageConnectionEvidenceProvider } from "../../features/connections/storage/connection-live-record-provider";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";
import { seedGeneratedRelationshipFixturesIntoLiveStore } from "../../shared/storage/seed-generated-fixtures";

test("live relationship stage and profile reads generated connection graph and previews updates", async () => {
  const workspaceId = "workspace:relationship-stage-profile-live";
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();

  await seedGeneratedRelationshipFixturesIntoLiveStore({
    now: () => "2026-07-02T03:00:00.000Z",
    store,
    workspaceId,
  });

  const provider = createStorageConnectionEvidenceProvider({
    sourceLabel: "Relationship profile memory live storage",
    store,
    workspaceId,
  });
  const service = createLiveRelationshipStageAndProfileService({
    now: () => "2026-07-02T03:05:00.000Z",
    provider,
  });

  const stage = await service.updateStage({
    connectionId: "connection_0007",
    relationshipStage: "active",
  });

  assert.equal(stage.success, true);
  assert.equal(stage.data.profile?.connectionId, "connection_0007");
  assert.equal(stage.data.profile?.contactId, "contact_078");
  assert.equal(stage.data.profile?.displayName, "曾伟");
  assert.equal(stage.data.profile?.relationshipStage, "active");
  assert.equal(stage.data.profile?.databaseReadExecuted, true);
  assert.equal(stage.data.profile?.databaseWriteExecuted, false);
  assert.equal(stage.data.profile?.productionAuditLogWriteExecuted, false);
  assert.equal(
    stage.data.provenance.source,
    `live-record-store:connections:${workspaceId}`,
  );
  assert.equal(
    stage.data.provenance.sourceLabel,
    "Relationship profile memory live storage",
  );
  assert.equal(
    stage.data.provenance.generationMethod,
    "live-store-stage-preview",
  );
  assert.equal(stage.data.provenance.databaseReadExecuted, true);
  assert.equal(stage.data.provenance.databaseWriteExecuted, false);
  assert.equal(stage.data.provenance.aiProviderRequested, false);
  assert.equal(stage.data.provenance.externalNetworkRequested, false);

  const profile = await service.updateProfile({
    connectionId: "connection_0007",
    context:
      "曾伟 can help Orbit test privacy-safe contact provenance workflows with legal and accounting operators.",
    mutualValue: {
      contactReceives: "A concrete provenance review workflow to evaluate.",
      orbitUserReceives: "A domain expert for contact cleanup and audit design.",
      valueTypes: ["knowledge_exchange", "community_context"],
    },
    nextAction: {
      dueAt: "2026-07-05T09:00:00.000Z",
      label: "Send provenance workflow outline",
      rationale: "Follow up while the legal/accounting context is fresh.",
    },
    relationshipType: "community_bridge",
  });

  assert.equal(profile.success, true);
  assert.equal(profile.data.profile?.relationshipType, "community_bridge");
  assert.equal(profile.data.profile?.relationshipStage, "needs_follow_up");
  assert.equal(
    profile.data.profile?.context,
    "曾伟 can help Orbit test privacy-safe contact provenance workflows with legal and accounting operators.",
  );
  assert.deepEqual(profile.data.profile?.mutualValue.valueTypes, [
    "knowledge_exchange",
    "community_context",
  ]);
  assert.equal(
    profile.data.profile?.nextAction.label,
    "Send provenance workflow outline",
  );
  assert.equal(
    profile.data.provenance.generationMethod,
    "live-store-profile-preview",
  );
  assert.equal(profile.data.provenance.databaseReadExecuted, true);
  assert.equal(profile.data.provenance.databaseWriteExecuted, false);
  assert.equal(profile.data.provenance.productionAuditLogWriteExecuted, false);
});
