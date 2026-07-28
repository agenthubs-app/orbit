import assert from "node:assert/strict";
import test from "node:test";

import { createLiveRelationshipStageAndProfileService } from "../../features/connections/live-profile-service";
import { createStorageConnectionEvidenceProvider } from "../../features/connections/storage/connection-live-record-provider";
import { defaultMockFixtures } from "../../shared/mock/fixtures";
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
  const fixtureConnection = defaultMockFixtures.connections[0];
  const fixtureContact = defaultMockFixtures.contacts.find(
    (contact) => contact.id === fixtureConnection?.contactId,
  );

  assert.ok(fixtureConnection);
  assert.ok(fixtureContact);

  const stage = await service.updateStage({
    connectionId: fixtureConnection.id,
    relationshipStage: "active",
  });

  assert.equal(stage.success, true);
  assert.equal(stage.data.profile?.connectionId, fixtureConnection.id);
  assert.equal(stage.data.profile?.contactId, fixtureContact.id);
  assert.equal(stage.data.profile?.displayName, fixtureContact.displayName);
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
    connectionId: fixtureConnection.id,
    context:
      `${fixtureContact.displayName}可以协助 Orbit 验证注重隐私的联系人证据复核流程。`,
    mutualValue: {
      contactReceives: "一套可以实际评估的证据复核流程。",
      orbitUserReceives: "联系人清理与审计设计方面的真实业务反馈。",
      valueTypes: ["knowledge_exchange", "community_context"],
    },
    nextAction: {
      dueAt: "2026-07-05T09:00:00.000Z",
      label: "发送证据复核流程提纲",
      rationale: "趁现有业务上下文清晰时完成一次具体跟进。",
    },
    relationshipType: "community_bridge",
  });

  assert.equal(profile.success, true);
  assert.equal(profile.data.profile?.relationshipType, "community_bridge");
  assert.equal(
    profile.data.profile?.relationshipStage,
    fixtureConnection.stage,
  );
  assert.equal(
    profile.data.profile?.context,
    `${fixtureContact.displayName}可以协助 Orbit 验证注重隐私的联系人证据复核流程。`,
  );
  assert.deepEqual(profile.data.profile?.mutualValue.valueTypes, [
    "knowledge_exchange",
    "community_context",
  ]);
  assert.equal(
    profile.data.profile?.nextAction.label,
    "发送证据复核流程提纲",
  );
  assert.equal(
    profile.data.provenance.generationMethod,
    "live-store-profile-preview",
  );
  assert.equal(profile.data.provenance.databaseReadExecuted, true);
  assert.equal(profile.data.provenance.databaseWriteExecuted, false);
  assert.equal(profile.data.provenance.productionAuditLogWriteExecuted, false);
});
